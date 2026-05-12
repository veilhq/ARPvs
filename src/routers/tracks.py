"""Track listing, retrieval, and editing.

Tracks are scanner-owned. The `folder_name` field is the parent-folder
label from disk (e.g. "Midnight Sessions") and is shown as the subtitle
in the all-tracks view. It is display-only metadata — the scanner no
longer creates albums from folders.
"""

from fastapi import APIRouter, HTTPException

from src.database import get_connection
from src.routers._helpers import apply_display_name, sibling_version_ids

router = APIRouter(prefix="/api", tags=["tracks"])


_TRACK_SELECT = """
    SELECT t.*,
           p.name as project_name,
           p.folder_name as folder_name
    FROM tracks t
    JOIN projects p ON p.id = t.project_id
"""


@router.get("/tracks")
async def list_tracks():
    """List every track in the library, with project + folder subtitles."""
    conn = get_connection()
    try:
        rows = conn.execute(_TRACK_SELECT + " ORDER BY t.filename").fetchall()
        return [apply_display_name(dict(r)) for r in rows]
    finally:
        conn.close()


@router.get("/tracks/{track_id}")
async def get_track(track_id: int):
    """Get a single track by ID."""
    conn = get_connection()
    try:
        row = conn.execute(_TRACK_SELECT + " WHERE t.id = ?", (track_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        return apply_display_name(dict(row))
    finally:
        conn.close()


@router.patch("/tracks/{track_id}")
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
                ids_to_update = sibling_version_ids(conn, row)

            placeholders = ",".join("?" * len(ids_to_update))
            conn.execute(
                f"UPDATE tracks SET display_name_override = ? WHERE id IN ({placeholders})",
                (new_name, *ids_to_update),
            )
            conn.commit()

            updated = conn.execute(
                _TRACK_SELECT + f" WHERE t.id IN ({placeholders})",
                ids_to_update,
            ).fetchall()
            return {"updated": [apply_display_name(dict(r)) for r in updated]}

        return {"updated": []}
    finally:
        conn.close()
