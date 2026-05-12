"""
Shared route helpers used by multiple routers.

Kept module-private (underscore prefix) so they're clearly internal.
"""

import re
from pathlib import Path


def apply_display_name(track: dict) -> dict:
    """Move display_name_override → display_name, and preserve the original
    as display_name_default. Resolving this in Python avoids fragile
    duplicate-alias behavior in the SQL SELECT."""
    track["display_name_default"] = track.get("display_name")
    override = track.get("display_name_override")
    if override:
        track["display_name"] = override
    return track


def sibling_version_ids(conn, track_row) -> list[int]:
    """Return the ids of the given track and all sibling versions in the
    same project whose filename shares the same base name (ignoring a
    trailing _v<n> / -v<n> / _final suffix)."""
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
