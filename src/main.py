"""
FastAPI application for ARPvs.

Serves the static UI and provides REST API endpoints for:
  - Library browsing (albums, projects, tracks)
  - Audio streaming
  - Search
  - Virtual organization (collections, tags, favorites)
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from contextlib import asynccontextmanager

from src.config import load_config, ensure_data_dir
from src.database import init_db, get_connection

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the app."""
    ensure_data_dir()
    init_db()
    yield


app = FastAPI(
    title="ARPvs",
    description="Audio Reactive Project Visualization Shell",
    version="0.1.0",
    lifespan=lifespan,
)


# --- API Routes ---


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
    """List all detected albums."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT a.*, COUNT(p.id) as project_count
            FROM albums a
            LEFT JOIN projects p ON p.album_id = a.id
            GROUP BY a.id
            ORDER BY a.name
        """).fetchall()
        return [dict(r) for r in rows]
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


@app.get("/api/tracks")
async def list_tracks():
    """List all tracks in the library."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT t.*, p.name as project_name, a.name as album_name
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
            SELECT t.*, p.name as project_name, a.name as album_name
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
async def stream_track(track_id: int):
    """Stream audio for a track."""
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
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    def iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="audio/wav",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_path.stat().st_size),
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
        rows = conn.execute("""
            SELECT t.*, p.name as project_name, a.name as album_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN albums a ON a.id = p.album_id
            WHERE t.filename LIKE ?
               OR t.display_name LIKE ?
               OR p.name LIKE ?
            ORDER BY t.filename
            LIMIT 50
        """, (query, query, query)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# --- Static file serving (must be last) ---

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
