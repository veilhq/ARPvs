"""Search + tag listing."""

from fastapi import APIRouter

from src.config import load_config
from src.database import get_connection
from src.routers._helpers import apply_display_name

router = APIRouter(prefix="/api", tags=["search"])

_config = load_config()


@router.get("/search")
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
                   p.name as project_name,
                   p.folder_name as folder_name
            FROM tracks t
            JOIN projects p ON p.id = t.project_id
            WHERE t.filename LIKE ?
               OR t.display_name LIKE ?
               OR t.display_name_override LIKE ?
               OR p.name LIKE ?
               OR p.folder_name LIKE ?
            ORDER BY t.filename
            LIMIT ?
        """, (query, query, query, query, query, limit)).fetchall()
        return [apply_display_name(dict(r)) for r in rows]
    finally:
        conn.close()


@router.get("/tags")
async def list_tags():
    """List all tags."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM tags ORDER BY name").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/track-tags")
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
