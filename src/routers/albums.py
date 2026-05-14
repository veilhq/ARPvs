"""
Album endpoints: user-created playlists with presentation metadata.

Albums are plain user-owned objects — no auto-detection, no folder
coupling. Each has a name, optional uploaded cover, and a set of tracks
in a user-defined order (via album_tracks).
"""

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from src.config import DATA_DIR
from src.database import get_connection
from src.routers._helpers import apply_display_name, sibling_version_ids

router = APIRouter(prefix="/api/albums", tags=["albums"])


# --- Create / list / update / delete ---


@router.get("")
async def list_albums():
    """List all user-created albums with track count and total duration."""
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT a.id,
                   a.name,
                   a.description,
                   a.cover_path,
                   a.created_at,
                   a.updated_at,
                   COUNT(at.track_id) as track_count,
                   COALESCE(SUM(t.duration_seconds), 0) as total_duration
            FROM albums a
            LEFT JOIN album_tracks at ON at.album_id = a.id
            LEFT JOIN tracks t ON t.id = at.track_id
            GROUP BY a.id
            ORDER BY a.name COLLATE NOCASE
        """).fetchall()
        albums = []
        for r in rows:
            album = dict(r)
            album["cover_art_url"] = f"/api/albums/{album['id']}/cover"
            albums.append(album)
        return albums
    finally:
        conn.close()


@router.post("")
async def create_album(payload: dict):
    """Create a new album.

    Accepted fields:
      - name (str, required): the album's display name.
      - description (str, optional): album description.
    """
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Album name is required")

    description = (payload.get("description") or "").strip() or None

    conn = get_connection()
    try:
        cur = conn.execute("INSERT INTO albums (name, description) VALUES (?, ?)", (name, description))
        album_id = cur.lastrowid
        conn.commit()
        row = conn.execute("""
            SELECT id, name, description, cover_path, created_at, updated_at
            FROM albums WHERE id = ?
        """, (album_id,)).fetchone()
    finally:
        conn.close()

    album = dict(row)
    album["track_count"] = 0
    album["total_duration"] = 0
    album["cover_art_url"] = f"/api/albums/{album['id']}/cover"
    return album


@router.patch("/{album_id}")
async def update_album(album_id: int, payload: dict):
    """Update editable fields on an album.

    Accepted fields:
      - name (str): the album's display name. Empty/whitespace is rejected.
      - description (str | null): album description. null/empty clears it.
    """
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        if "name" in payload:
            name = (payload.get("name") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Album name cannot be empty")
            conn.execute(
                "UPDATE albums SET name = ?, updated_at = datetime('now') WHERE id = ?",
                (name, album_id),
            )

        if "description" in payload:
            description = (payload.get("description") or "").strip() or None
            conn.execute(
                "UPDATE albums SET description = ?, updated_at = datetime('now') WHERE id = ?",
                (description, album_id),
            )

        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/{album_id}")
async def delete_album(album_id: int):
    """Delete an album. Tracks themselves are untouched."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT cover_path FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        # Clean up the uploaded cover file if present.
        if row["cover_path"]:
            p = Path(row["cover_path"])
            if p.is_file():
                p.unlink(missing_ok=True)

        # album_tracks rows are removed via ON DELETE CASCADE.
        conn.execute("DELETE FROM albums WHERE id = ?", (album_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


# --- Cover art ---


ALLOWED_COVER_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
MAX_COVER_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


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


@router.get("/{album_id}/cover")
async def get_album_cover(album_id: int):
    """Serve album cover art. Uses the uploaded cover if present, else a
    generated SVG placeholder seeded by album id."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT cover_path FROM albums WHERE id = ?",
            (album_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")
    finally:
        conn.close()

    if row["cover_path"]:
        cover = Path(row["cover_path"])
        if cover.is_file():
            return FileResponse(str(cover), media_type=_image_media_type(cover))

    return _placeholder_svg(album_id)


@router.post("/{album_id}/cover")
async def upload_album_cover(album_id: int, file: UploadFile = File(...)):
    """Upload a cover image for an album. Stored under data/cover_art/."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, cover_path FROM albums WHERE id = ?", (album_id,)
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

    # Clean up a prior cover with a different extension
    prior = row["cover_path"]
    if prior and prior != str(dest):
        prior_path = Path(prior)
        if prior_path.is_file():
            prior_path.unlink(missing_ok=True)

    conn = get_connection()
    try:
        conn.execute(
            "UPDATE albums SET cover_path = ?, updated_at = datetime('now') WHERE id = ?",
            (str(dest), album_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "cover_url": f"/api/albums/{album_id}/cover"}


@router.delete("/{album_id}/cover")
async def delete_album_cover(album_id: int):
    """Remove the uploaded cover, reverting to the generated placeholder."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT cover_path FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        if row["cover_path"]:
            p = Path(row["cover_path"])
            if p.is_file():
                p.unlink(missing_ok=True)

        conn.execute(
            "UPDATE albums SET cover_path = NULL, updated_at = datetime('now') WHERE id = ?",
            (album_id,),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


# --- Track membership ---


@router.get("/{album_id}/tracks")
async def list_album_tracks(album_id: int):
    """List the tracks in an album, in the user's chosen order.

    Each track row carries the global display name resolved through
    display_name_override; if the album has a per-album rename in
    album_tracks.display_name, that takes precedence.
    """
    conn = get_connection()
    try:
        album_row = conn.execute(
            "SELECT id FROM albums WHERE id = ?", (album_id,)
        ).fetchone()
        if not album_row:
            raise HTTPException(status_code=404, detail="Album not found")

        rows = conn.execute("""
            SELECT t.*,
                   p.name as project_name,
                   p.folder_name as folder_name,
                   at.sort_order as sort_order,
                   at.display_name as album_display_name
            FROM album_tracks at
            JOIN tracks t ON t.id = at.track_id
            JOIN projects p ON p.id = t.project_id
            WHERE at.album_id = ?
            ORDER BY at.sort_order, t.filename
        """, (album_id,)).fetchall()

        tracks = []
        for r in rows:
            t = apply_display_name(dict(r))
            album_name = t.pop("album_display_name", None)
            if album_name:
                t["display_name"] = album_name
            tracks.append(t)

        return {"tracks": tracks}
    finally:
        conn.close()


@router.put("/{album_id}/tracks")
async def set_album_tracks(album_id: int, payload: dict):
    """Replace the album's track list and ordering.

    Payload:
      - track_ids: list[int] — ordered list of track IDs (may be empty).

    Preserves any per-album display_name values across the replacement
    so renames survive re-ordering or membership changes.
    """
    ids = payload.get("track_ids")
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(status_code=400, detail="track_ids must be a list of integers")

    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Album not found")

        # Validate referenced tracks exist to fail loudly rather than silently dropping.
        if ids:
            placeholders = ",".join("?" * len(ids))
            found = {
                r["id"]
                for r in conn.execute(
                    f"SELECT id FROM tracks WHERE id IN ({placeholders})", ids
                )
            }
            missing = [i for i in ids if i not in found]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown track ids: {missing}",
                )

        # Preserve any per-album display_name overrides across replacement.
        existing = {
            r["track_id"]: r["display_name"]
            for r in conn.execute(
                "SELECT track_id, display_name FROM album_tracks WHERE album_id = ?",
                (album_id,),
            )
        }

        conn.execute("DELETE FROM album_tracks WHERE album_id = ?", (album_id,))
        for order, track_id in enumerate(ids):
            conn.execute(
                "INSERT OR IGNORE INTO album_tracks "
                "(album_id, track_id, sort_order, display_name) VALUES (?, ?, ?, ?)",
                (album_id, track_id, order, existing.get(track_id)),
            )
        conn.execute(
            "UPDATE albums SET updated_at = datetime('now') WHERE id = ?",
            (album_id,),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "count": len(ids)}


@router.patch("/{album_id}/tracks/{track_id}")
async def update_album_track(album_id: int, track_id: int, payload: dict):
    """Rename a track *within* a specific album. Nondestructive and
    scoped to this album only. Writes to album_tracks.display_name.

    Accepted fields:
      - display_name (str | null): per-album label override. null/empty clears.
      - apply_to_versions (bool): also rename sibling versions within this album.
    """
    conn = get_connection()
    try:
        album = conn.execute(
            "SELECT id FROM albums WHERE id = ?", (album_id,)
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
            ids_to_update = sibling_version_ids(conn, track)

        # Only tracks that are actually members of this album can be renamed here.
        scoped_ids = {
            r["track_id"]
            for r in conn.execute(
                "SELECT track_id FROM album_tracks WHERE album_id = ?",
                (album_id,),
            )
        }
        final_ids = [i for i in ids_to_update if i in scoped_ids]
        if not final_ids:
            raise HTTPException(
                status_code=400,
                detail="Track is not a member of this album",
            )

        for tid in final_ids:
            conn.execute(
                "UPDATE album_tracks SET display_name = ? WHERE album_id = ? AND track_id = ?",
                (new_name, album_id, tid),
            )
        conn.execute(
            "UPDATE albums SET updated_at = datetime('now') WHERE id = ?",
            (album_id,),
        )
        conn.commit()

        return {"ok": True, "updated_ids": final_ids}
    finally:
        conn.close()
