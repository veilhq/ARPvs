"""
FastAPI application for ARPvs.

Serves the static UI and provides REST API endpoints for:
  - Library browsing (albums, projects, tracks)
  - Audio streaming
  - Search
  - Virtual organization (collections, tags, favorites)
"""

import asyncio

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from pathlib import Path
from contextlib import asynccontextmanager

from src.config import load_config, ensure_data_dir, DATA_DIR
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
        unexported = conn.execute("SELECT COUNT(*) as c FROM unexported_projects").fetchone()
        duration = conn.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) as d FROM tracks"
        ).fetchone()
        file_size = conn.execute(
            "SELECT COALESCE(SUM(file_size_bytes), 0) as s FROM tracks"
        ).fetchone()
        return {
            "total_tracks": tracks["c"],
            "total_projects": projects["c"],
            "total_albums": albums["c"],
            "total_unexported": unexported["c"],
            "total_duration_seconds": duration["d"],
            "total_file_size_bytes": file_size["s"],
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
            SELECT a.id,
                   COALESCE(a.display_name_override, a.name) as name,
                   a.name as name_default,
                   a.display_name_override,
                   a.cover_override_path,
                   a.is_curated,
                   a.path,
                   a.discovered_at,
                   COUNT(DISTINCT p.id) as project_count,
                   COUNT(t.id) as auto_track_count,
                   COALESCE(SUM(t.duration_seconds), 0) as auto_duration
            FROM albums a
            LEFT JOIN projects p ON p.album_id = a.id
            LEFT JOIN tracks t ON t.project_id = p.id
            GROUP BY a.id
            ORDER BY a.name
        """).fetchall()
        albums = []
        for r in rows:
            album = dict(r)
            is_curated = bool(album["is_curated"])
            if is_curated:
                stats = conn.execute("""
                    SELECT COUNT(*) as c, COALESCE(SUM(t.duration_seconds), 0) as d
                    FROM album_tracks at
                    JOIN tracks t ON t.id = at.track_id
                    WHERE at.album_id = ?
                """, (album["id"],)).fetchone()
                album["track_count"] = stats["c"]
                album["total_duration"] = stats["d"]
            else:
                album["track_count"] = album["auto_track_count"]
                album["total_duration"] = album["auto_duration"]
            album["is_curated"] = is_curated
            album["cover_art_url"] = f"/api/albums/{album['id']}/cover"
            album.pop("auto_track_count", None)
            album.pop("auto_duration", None)
            albums.append(album)
        return albums
    finally:
        conn.close()


@app.get("/api/albums/{album_id}/cover")
async def get_album_cover(album_id: int):
    """Serve album cover art. Prefers user-uploaded override, then looks
    for image files in the album folder, then falls back to a placeholder."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT path, cover_override_path FROM albums WHERE id = ?",
            (album_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")
    finally:
        conn.close()

    # Check user-uploaded override first
    if row["cover_override_path"]:
        override = Path(row["cover_override_path"])
        if override.is_file():
            return FileResponse(str(override), media_type=_image_media_type(override))

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


# --- Album editing (nondestructive overrides) ---


@app.patch("/api/albums/{album_id}")
async def update_album(album_id: int, payload: dict):
    """Update editable fields on an album.

    Accepted fields:
      - display_name (str | null): override the album label. null/empty resets.
    """
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        if "display_name" in payload:
            new_name = payload.get("display_name")
            if new_name is not None:
                new_name = new_name.strip() or None
            conn.execute(
                "UPDATE albums SET display_name_override = ? WHERE id = ?",
                (new_name, album_id),
            )
            conn.commit()

        return {"ok": True}
    finally:
        conn.close()


ALLOWED_COVER_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
MAX_COVER_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


@app.post("/api/albums/{album_id}/cover")
async def upload_album_cover(album_id: int, file: UploadFile = File(...)):
    """Upload a cover image override for an album. Stored under data/cover_art/."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, cover_override_path FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")
    finally:
        conn.close()

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_COVER_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ext or 'unknown'}")

    # Read in chunks with a size limit to avoid unbounded memory use
    cover_dir = DATA_DIR / "cover_art"
    cover_dir.mkdir(parents=True, exist_ok=True)
    dest = cover_dir / f"album_{album_id}{ext}"

    total = 0
    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_COVER_SIZE_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")
            f.write(chunk)

    # Clean up a prior override with a different extension
    prior = row["cover_override_path"]
    if prior and prior != str(dest):
        prior_path = Path(prior)
        if prior_path.is_file():
            prior_path.unlink(missing_ok=True)

    conn = get_connection()
    try:
        conn.execute(
            "UPDATE albums SET cover_override_path = ? WHERE id = ?",
            (str(dest), album_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "cover_url": f"/api/albums/{album_id}/cover"}


@app.delete("/api/albums/{album_id}/cover")
async def delete_album_cover(album_id: int):
    """Remove a user-uploaded cover override, reverting to folder-detected art."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT cover_override_path FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        if row["cover_override_path"]:
            p = Path(row["cover_override_path"])
            if p.is_file():
                p.unlink(missing_ok=True)

        conn.execute(
            "UPDATE albums SET cover_override_path = NULL WHERE id = ?", (album_id,)
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/api/albums/{album_id}/tracks")
async def list_album_tracks(album_id: int):
    """List the tracks for an album.

    If the album is marked curated, return the explicit curated list in
    sort_order. Otherwise, return all tracks under the album's projects
    (auto mode). Always includes an `auto_tracks` list with every
    candidate (for the curation picker), and an ordered `curated_ids`.

    Per-album display_name overrides (from album_tracks.display_name)
    take precedence over the global track display name.
    """
    conn = get_connection()
    try:
        album_row = conn.execute(
            "SELECT id, is_curated FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not album_row:
            raise HTTPException(status_code=404, detail="Album not found")
        is_curated = bool(album_row["is_curated"])

        # Every track under any project of this album — candidates for curation
        auto_rows = conn.execute("""
            SELECT t.*,
                   p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE p.album_id = ?
            ORDER BY t.filename
        """, (album_id,)).fetchall()

        # Per-album name + order map
        at_rows = conn.execute(
            "SELECT track_id, sort_order, display_name FROM album_tracks WHERE album_id = ?",
            (album_id,),
        ).fetchall()
        at_map = {r["track_id"]: {"sort_order": r["sort_order"], "display_name": r["display_name"]} for r in at_rows}
        curated_ids = sorted(
            (r["track_id"] for r in at_rows),
            key=lambda tid: at_map[tid]["sort_order"],
        ) if is_curated else []

        auto_tracks = []
        for r in auto_rows:
            t = _apply_display_name(dict(r))
            if t["id"] in at_map and at_map[t["id"]]["display_name"]:
                t["display_name"] = at_map[t["id"]]["display_name"]
            auto_tracks.append(t)
        auto_by_id = {t["id"]: t for t in auto_tracks}

        if is_curated:
            missing_ids = [tid for tid in curated_ids if tid not in auto_by_id]
            if missing_ids:
                placeholders = ",".join("?" * len(missing_ids))
                extra_rows = conn.execute(f"""
                    SELECT t.*,
                           p.name as project_name, p.album_id as album_id, a.name as album_name
                    FROM tracks t
                    JOIN projects p ON p.id = t.project_id
                    LEFT JOIN albums a ON a.id = p.album_id
                    WHERE t.id IN ({placeholders})
                """, missing_ids).fetchall()
                for r in extra_rows:
                    t = _apply_display_name(dict(r))
                    if t["id"] in at_map and at_map[t["id"]]["display_name"]:
                        t["display_name"] = at_map[t["id"]]["display_name"]
                    auto_by_id[t["id"]] = t

            tracks = [auto_by_id[tid] for tid in curated_ids if tid in auto_by_id]
        else:
            tracks = auto_tracks

        return {
            "is_curated": is_curated,
            "tracks": tracks,
            "auto_tracks": auto_tracks,
            "curated_ids": curated_ids,
        }
    finally:
        conn.close()


@app.put("/api/albums/{album_id}/tracks")
async def set_album_tracks(album_id: int, payload: dict):
    """Replace the curated track list for an album.

    Payload:
      - track_ids: list[int] — ordered list of track IDs. An empty list
        clears curation and reverts to auto mode.

    Flips albums.is_curated to 1 when track_ids is non-empty, 0 otherwise.
    Preserves any per-album display_name values across the replacement.
    """
    ids = payload.get("track_ids")
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(status_code=400, detail="track_ids must be a list of integers")

    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        # Preserve any per-album display_name overrides across re-curation
        existing = {
            r["track_id"]: r["display_name"]
            for r in conn.execute(
                "SELECT track_id, display_name FROM album_tracks WHERE album_id = ?",
                (album_id,),
            )
        }

        conn.execute("DELETE FROM album_tracks WHERE album_id = ?", (album_id,))
        if ids:
            for order, track_id in enumerate(ids):
                conn.execute(
                    "INSERT OR IGNORE INTO album_tracks (album_id, track_id, sort_order, display_name) VALUES (?, ?, ?, ?)",
                    (album_id, track_id, order, existing.get(track_id)),
                )
            conn.execute("UPDATE albums SET is_curated = 1 WHERE id = ?", (album_id,))
        else:
            # Reverting to auto mode — re-seed album_tracks with the preserved
            # per-album display_name values so renames survive the reset.
            auto_ids = [
                r["id"]
                for r in conn.execute(
                    """
                    SELECT t.id FROM tracks t
                    JOIN projects p ON p.id = t.project_id
                    WHERE p.album_id = ?
                    """,
                    (album_id,),
                )
            ]
            for order, tid in enumerate(auto_ids):
                name = existing.get(tid)
                if name is None:
                    continue
                conn.execute(
                    "INSERT INTO album_tracks (album_id, track_id, sort_order, display_name) VALUES (?, ?, ?, ?)",
                    (album_id, tid, order, name),
                )
            conn.execute("UPDATE albums SET is_curated = 0 WHERE id = ?", (album_id,))
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "is_curated": len(ids) > 0, "count": len(ids)}


@app.patch("/api/albums/{album_id}/tracks/{track_id}")
async def update_album_track(album_id: int, track_id: int, payload: dict):
    """Rename a track *within* a specific album — nondestructive and
    scoped. Does not affect the global track display name or other
    albums. Writes to album_tracks.display_name.

    Accepted fields:
      - display_name (str | null): per-album label override. null/empty clears.
      - apply_to_versions (bool): also rename sibling versions within this album.
    """
    conn = get_connection()
    try:
        album = conn.execute(
            "SELECT id, is_curated FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not album:
            raise HTTPException(status_code=404, detail="Album not found")
        track = conn.execute(
            "SELECT id, project_id, filename FROM tracks WHERE id = ?",
            (track_id,),
        ).fetchone()
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        new_name = payload.get("display_name")
        if new_name is not None:
            new_name = new_name.strip() or None

        apply_to_versions = bool(payload.get("apply_to_versions"))
        ids_to_update = [track_id]
        if apply_to_versions and new_name is not None:
            ids_to_update = _sibling_version_ids(conn, track)

        # Scope to tracks that belong to this album
        is_curated = bool(album["is_curated"])
        if is_curated:
            scoped_ids = {
                r["track_id"]
                for r in conn.execute(
                    "SELECT track_id FROM album_tracks WHERE album_id = ?",
                    (album_id,),
                )
            }
        else:
            scoped_ids = {
                r["id"]
                for r in conn.execute(
                    """
                    SELECT t.id FROM tracks t
                    JOIN projects p ON p.id = t.project_id
                    WHERE p.album_id = ?
                    """,
                    (album_id,),
                )
            }

        final_ids = [i for i in ids_to_update if i in scoped_ids] or [track_id]

        # Upsert album_tracks row for each. In auto mode this does not
        # flip is_curated — we only add minimal rows to hold the name.
        for tid in final_ids:
            existing = conn.execute(
                "SELECT id FROM album_tracks WHERE album_id = ? AND track_id = ?",
                (album_id, tid),
            ).fetchone()
            if existing:
                if new_name is None:
                    # If the row was only there to hold a name (auto mode
                    # sentinel), delete it so we don't dirty the table.
                    if not is_curated:
                        conn.execute(
                            "DELETE FROM album_tracks WHERE id = ?",
                            (existing["id"],),
                        )
                    else:
                        conn.execute(
                            "UPDATE album_tracks SET display_name = NULL WHERE id = ?",
                            (existing["id"],),
                        )
                else:
                    conn.execute(
                        "UPDATE album_tracks SET display_name = ? WHERE id = ?",
                        (new_name, existing["id"]),
                    )
            elif new_name is not None:
                conn.execute(
                    "INSERT INTO album_tracks (album_id, track_id, sort_order, display_name) VALUES (?, ?, 0, ?)",
                    (album_id, tid, new_name),
                )
        conn.commit()

        return {"ok": True, "updated_ids": final_ids}
    finally:
        conn.close()


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
            SELECT t.*,
                   p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            ORDER BY t.filename
        """).fetchall()
        return [_apply_display_name(dict(r)) for r in rows]
    finally:
        conn.close()


@app.get("/api/tracks/{track_id}")
async def get_track(track_id: int):
    """Get a single track by ID."""
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT t.*,
                   p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE t.id = ?
        """, (track_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        return _apply_display_name(dict(row))
    finally:
        conn.close()


def _apply_display_name(track: dict) -> dict:
    """Move display_name_override → display_name, and preserve the original
    as display_name_default. Resolving this in Python avoids fragile
    duplicate-alias behavior in the SQL SELECT."""
    track["display_name_default"] = track.get("display_name")
    override = track.get("display_name_override")
    if override:
        track["display_name"] = override
    return track


@app.patch("/api/tracks/{track_id}")
async def update_track(track_id: int, payload: dict):
    """Update editable fields on a track. Nondestructive — never touches
    the file on disk or the scanner-derived `display_name` default.

    Accepted fields in payload:
      - display_name (str | null): override the display label. null/empty resets.
      - apply_to_versions (bool): if true and display_name is provided,
        also rename all sibling versions in the same project whose
        base name matches (ignoring V-suffix).
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, project_id, filename, display_name FROM tracks WHERE id = ?",
            (track_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")

        if "display_name" in payload:
            new_name = payload.get("display_name")
            # Normalize empty string/whitespace to NULL (reset to default)
            if new_name is not None:
                new_name = new_name.strip() or None

            apply_to_versions = bool(payload.get("apply_to_versions"))
            ids_to_update = [track_id]

            if apply_to_versions and new_name is not None:
                ids_to_update = _sibling_version_ids(conn, row)

            placeholders = ",".join("?" * len(ids_to_update))
            conn.execute(
                f"UPDATE tracks SET display_name_override = ? WHERE id IN ({placeholders})",
                (new_name, *ids_to_update),
            )
            conn.commit()

            updated = conn.execute(f"""
                SELECT t.*,
                       p.name as project_name, p.album_id as album_id, a.name as album_name
                FROM tracks t
                JOIN projects p ON p.id = t.project_id
                LEFT JOIN albums a ON a.id = p.album_id
                WHERE t.id IN ({placeholders})
            """, ids_to_update).fetchall()
            return {"updated": [_apply_display_name(dict(r)) for r in updated]}

        return {"updated": []}
    finally:
        conn.close()


def _sibling_version_ids(conn, track_row) -> list[int]:
    """Return the ids of the given track and all sibling versions in the
    same project whose filename shares the same base name (ignoring a
    trailing _v<n> / -v<n> / _final suffix)."""
    import re

    project_id = track_row["project_id"]
    stem = Path(track_row["filename"]).stem
    # Strip trailing version-like suffix from the stem
    base = re.sub(r"[_-]v\d+(?:[_-]?final)?$", "", stem, flags=re.IGNORECASE)
    base = re.sub(r"[_-]final$", "", base, flags=re.IGNORECASE)

    rows = conn.execute(
        "SELECT id, filename FROM tracks WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    ids = []
    for r in rows:
        s = Path(r["filename"]).stem
        s_base = re.sub(r"[_-]v\d+(?:[_-]?final)?$", "", s, flags=re.IGNORECASE)
        s_base = re.sub(r"[_-]final$", "", s_base, flags=re.IGNORECASE)
        if s_base.lower() == base.lower():
            ids.append(r["id"])
    return ids or [track_row["id"]]


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
            SELECT t.*,
                   p.name as project_name, p.album_id as album_id, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE t.filename LIKE ?
               OR t.display_name LIKE ?
               OR t.display_name_override LIKE ?
               OR p.name LIKE ?
            ORDER BY t.filename
            LIMIT ?
        """, (query, query, query, query, limit)).fetchall()
        return [_apply_display_name(dict(r)) for r in rows]
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
