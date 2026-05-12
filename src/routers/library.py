"""Library overview + manual scan trigger."""

import asyncio

from fastapi import APIRouter

from src.database import get_connection
from src.scan_runner import run_scan

router = APIRouter(prefix="/api", tags=["library"])


@router.post("/scan")
async def trigger_scan():
    """Manually trigger a rescan of the configured root."""
    # Run scan in a thread so we don't block the event loop.
    added_tracks, added_projects = await asyncio.to_thread(run_scan)
    return {"added_tracks": added_tracks, "added_projects": added_projects}


@router.get("/library")
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
