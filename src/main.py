"""
FastAPI application for ARPvs.

Serves the static UI and provides REST API endpoints for:
  - Library browsing (albums, projects, tracks)
  - Audio streaming
  - Search
  - Virtual organization (collections, tags, favorites)
"""

import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from pathlib import Path
from contextlib import asynccontextmanager

from src.config import load_config, ensure_data_dir
from src.database import init_db, get_connection
from src.scanner import (
    scan_for_tracks,
    scan_for_projects,
    detect_hierarchy,
    get_wav_duration,
    get_file_info,
)

STATIC_DIR = Path(__file__).parent / "static"

# Module-level config reference, loaded once at import time for use in routes.
_config = load_config()


def run_scan():
    """Scan the configured root and populate the database."""
    config = load_config()
    scan_root = config.get("scan_root", "")
    if not scan_root or not Path(scan_root).is_dir():
        print(f"[ARPvs] WARNING: scan_root not found or not set: {scan_root!r}")
        return 0, 0

    print(f"[ARPvs] Scanning: {scan_root}")
    tracks_found = scan_for_tracks(scan_root)
    unexported_found = scan_for_projects(scan_root)
    print(f"[ARPvs] Found {len(tracks_found)} WAV files and {len(unexported_found)} unexported projects")

    conn = get_connection()
    added_tracks = 0
    added_projects = 0
    try:
        # Preload existing state once — avoids N+1 queries during scan.
        existing_tracks = {
            row["path"]: row["id"]
            for row in conn.execute("SELECT id, path, duration_seconds FROM tracks")
        }
        tracks_needing_duration = {
            row["id"]
            for row in conn.execute(
                "SELECT id FROM tracks WHERE duration_seconds IS NULL OR duration_seconds = 0"
            )
        }
        album_ids_by_path = {
            row["path"]: row["id"]
            for row in conn.execute("SELECT id, path FROM albums")
        }
        project_ids_by_path = {
            row["path"]: row["id"]
            for row in conn.execute("SELECT id, path FROM projects")
        }
        existing_unexported = {
            row["path"] for row in conn.execute("SELECT path FROM unexported_projects")
        }

        # Scan exported tracks
        for wav_path in tracks_found:
            wav_path_str = str(wav_path)
            if wav_path_str in existing_tracks:
                # Backfill duration if it was missing on a previous scan
                track_id = existing_tracks[wav_path_str]
                if track_id in tracks_needing_duration:
                    duration = get_wav_duration(wav_path)
                    if duration > 0:
                        conn.execute(
                            "UPDATE tracks SET duration_seconds = ? WHERE id = ?",
                            (duration, track_id),
                        )
                continue

            hierarchy = detect_hierarchy(wav_path, scan_root)

            # Upsert album (cached)
            album_id = None
            if hierarchy["album_name"]:
                album_path = hierarchy["album_path"]
                album_id = album_ids_by_path.get(album_path)
                if album_id is None:
                    cur = conn.execute(
                        "INSERT INTO albums (name, path) VALUES (?, ?)",
                        (hierarchy["album_name"], album_path),
                    )
                    album_id = cur.lastrowid
                    album_ids_by_path[album_path] = album_id

            # Upsert project (cached)
            project_path = hierarchy["project_path"]
            project_id = project_ids_by_path.get(project_path)
            if project_id is None:
                cur = conn.execute(
                    "INSERT INTO projects (name, path, album_id) VALUES (?, ?, ?)",
                    (hierarchy["project_name"], project_path, album_id),
                )
                project_id = cur.lastrowid
                project_ids_by_path[project_path] = project_id

            # Insert track
            duration = get_wav_duration(wav_path)
            file_info = get_file_info(wav_path)
            display_name = wav_path.stem.replace("_", " ").replace("-", " ").title()

            conn.execute(
                """INSERT INTO tracks
                   (project_id, filename, path, display_name,
                    file_size_bytes, modified_at, duration_seconds)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    project_id,
                    wav_path.name,
                    wav_path_str,
                    display_name,
                    file_info["size_bytes"],
                    file_info["modified_at"],
                    duration,
                ),
            )
            added_tracks += 1

        # Scan unexported projects
        for als_path in unexported_found:
            als_path_str = str(als_path)
            if als_path_str in existing_unexported:
                continue

            file_info = get_file_info(als_path)
            conn.execute(
                """INSERT INTO unexported_projects
                   (name, path, file_size_bytes, modified_at)
                   VALUES (?, ?, ?, ?)""",
                (
                    als_path.stem,
                    als_path_str,
                    file_info["size_bytes"],
                    file_info["modified_at"],
                ),
            )
            added_projects += 1

        conn.commit()
    finally:
        conn.close()

    print(f"[ARPvs] Added {added_tracks} new tracks and {added_projects} unexported projects")
    return added_tracks, added_projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the app."""
    ensure_data_dir()
    init_db()
    run_scan()
    yield


app = FastAPI(
    title="ARPvs",
    description="Audio Reactive Project Visualization Shell",
    version="0.1.0",
    lifespan=lifespan,
)


# --- API Routes ---


@app.post("/api/scan")
async def trigger_scan():
    """Manually trigger a rescan of the configured root."""
    # Run scan in a thread so we don't block the event loop.
    added_tracks, added_projects = await asyncio.to_thread(run_scan)
    return {"added_tracks": added_tracks, "added_projects": added_projects}


@app.get("/api/library")
async def get_library_summary():
    """Get overview stats for the library."""
    conn = get_connection()
    try:
        tracks = conn.execute("SELECT COUNT(*) as c FROM tracks").fetchone()
        projects = conn.execute("SELECT COUNT(*) as c FROM projects").fetchone()
        albums = conn.execute("SELECT COUNT(*) as c FROM albums").fetchone()
        duration = conn.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) as d FROM tracks"
        ).fetchone()
        return {
            "total_tracks": tracks["c"],
            "total_projects": projects["c"],
            "total_albums": albums["c"],
            "total_duration_seconds": duration["d"],
            "last_scan_at": None,  # TODO: track scan timestamps
        }
    finally:
        conn.close()


@app.get("/api/albums")
async def list_albums():
    """List all detected albums with track count and total duration."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT a.*,
                   COUNT(DISTINCT p.id) as project_count,
                   COUNT(t.id) as track_count,
                   COALESCE(SUM(t.duration_seconds), 0) as total_duration
            FROM albums a
            LEFT JOIN projects p ON p.album_id = a.id
            LEFT JOIN tracks t ON t.project_id = p.id
            GROUP BY a.id
            ORDER BY a.name
        """).fetchall()
        albums = []
        for r in rows:
            album = dict(r)
            album["cover_art_url"] = f"/api/albums/{album['id']}/cover"
            albums.append(album)
        return albums
    finally:
        conn.close()


@app.get("/api/albums/{album_id}/cover")
async def get_album_cover(album_id: int):
    """Serve album cover art. Looks for image files in the album folder."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT path FROM albums WHERE id = ?", (album_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")
    finally:
        conn.close()

    album_path = Path(row["path"])
    if album_path.is_dir():
        # Look for common cover art filenames
        image_extensions = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")
        cover_names = ("cover", "artwork", "folder", "front", "album")

        # First pass: look for files with cover-like names
        for f in album_path.iterdir():
            if f.is_file() and f.suffix.lower() in image_extensions:
                if any(name in f.stem.lower() for name in cover_names):
                    return FileResponse(str(f), media_type=_image_media_type(f))

        # Second pass: any image file in the album root
        for f in album_path.iterdir():
            if f.is_file() and f.suffix.lower() in image_extensions:
                return FileResponse(str(f), media_type=_image_media_type(f))

    # No art found — return a generated SVG placeholder
    return _placeholder_svg(album_id)


def _image_media_type(filepath: Path) -> str:
    """Get MIME type for an image file."""
    ext = filepath.suffix.lower()
    types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
    }
    return types.get(ext, "image/jpeg")


def _placeholder_svg(album_id: int):
    """Generate a grayscale SVG placeholder for albums without art."""
    # Use album_id to vary the pattern slightly
    shade1 = 20 + (album_id * 7) % 20
    shade2 = 30 + (album_id * 13) % 25
    shade3 = 15 + (album_id * 11) % 15

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="rgb({shade1},{shade1},{shade1})"/>
  <rect x="60" y="60" width="80" height="80" rx="40" fill="none" stroke="rgb({shade2},{shade2},{shade2})" stroke-width="2"/>
  <circle cx="100" cy="100" r="12" fill="rgb({shade3},{shade3},{shade3})"/>
  <line x1="100" y1="40" x2="100" y2="60" stroke="rgb({shade2},{shade2},{shade2})" stroke-width="1"/>
  <line x1="100" y1="140" x2="100" y2="160" stroke="rgb({shade2},{shade2},{shade2})" stroke-width="1"/>
  <line x1="40" y1="100" x2="60" y2="100" stroke="rgb({shade2},{shade2},{shade2})" stroke-width="1"/>
  <line x1="140" y1="100" x2="160" y2="100" stroke="rgb({shade2},{shade2},{shade2})" stroke-width="1"/>
</svg>'''
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/api/projects")
async def list_projects():
    """List all detected projects."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT p.*, a.name as album_name, COUNT(t.id) as track_count
            FROM projects p
            LEFT JOIN albums a ON a.id = p.album_id
            LEFT JOIN tracks t ON t.project_id = p.id
            GROUP BY p.id
            ORDER BY p.name
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/unexported-projects")
async def list_unexported_projects():
    """List all unexported Ableton Live Set files."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT * FROM unexported_projects
            ORDER BY modified_at DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/tracks")
async def list_tracks():
    """List all tracks in the library."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT t.*, p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            ORDER BY t.filename
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/tracks/{track_id}")
async def get_track(track_id: int):
    """Get a single track by ID."""
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT t.*, p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE t.id = ?
        """, (track_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        return dict(row)
    finally:
        conn.close()


@app.get("/api/stream/{track_id}")
async def stream_track(track_id: int, request: Request):
    """Stream audio for a track with HTTP Range support (for seeking)."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT path FROM tracks WHERE id = ?", (track_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
    finally:
        conn.close()

    file_path = Path(row["path"])
    if not file_path.exists():
        print(f"[ARPvs] WARNING: Audio file not found: {file_path}")
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range") or request.headers.get("Range")
    chunk_size = _config.get("stream_chunk_size", 65536)

    # No Range header — full body
    if not range_header:
        def iter_file():
            with open(file_path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        return StreamingResponse(
            iter_file(),
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )

    # Parse "bytes=start-end"
    try:
        units, _, rng = range_header.partition("=")
        if units.strip().lower() != "bytes":
            raise ValueError
        start_s, _, end_s = rng.strip().partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
        if start < 0 or end >= file_size or start > end:
            raise ValueError
    except ValueError:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    length = end - start + 1

    def iter_range():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        iter_range(),
        status_code=206,
        media_type="audio/wav",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
        },
    )


@app.get("/api/search")
async def search_tracks(q: str = ""):
    """Search tracks by filename, display name, or project name."""
    if not q.strip():
        return []

    conn = get_connection()
    try:
        query = f"%{q}%"
        limit = _config.get("search_result_limit", 50)
        rows = conn.execute("""
            SELECT t.*, p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE t.filename LIKE ?
               OR t.display_name LIKE ?
               OR p.name LIKE ?
            ORDER BY t.filename
            LIMIT ?
        """, (query, query, query, limit)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/tags")
async def list_tags():
    """List all tags."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM tags ORDER BY name").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/track-tags")
async def get_all_track_tags():
    """Get tags for all tracks, returned as {track_id: [{id, name, color}]}."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT tt.track_id, t.id as tag_id, t.name, t.color
            FROM track_tags tt
            JOIN tags t ON t.id = tt.tag_id
            ORDER BY t.name
        """).fetchall()
        result = {}
        for r in rows:
            tid = r["track_id"]
            if tid not in result:
                result[tid] = []
            result[tid].append({
                "id": r["tag_id"],
                "name": r["name"],
                "color": r["color"],
            })
        return result
    finally:
        conn.close()


# --- Static file serving (must be last) ---

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
