"""Project and unexported-project listings."""

from fastapi import APIRouter

from src.database import get_connection

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/projects")
async def list_projects():
    """List all detected projects with their parent-folder label and track count."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT p.id,
                   p.name,
                   p.path,
                   p.folder_name,
                   p.discovered_at,
                   COUNT(t.id) as track_count
            FROM projects p
            LEFT JOIN tracks t ON t.project_id = p.id
            GROUP BY p.id
            ORDER BY p.name
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/unexported-projects")
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
