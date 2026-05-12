"""
Scan orchestration for ARPvs.

Walks the configured scan root via scanner.py, then syncs the findings
into the SQLite database. Kept separate from main.py so route modules
can trigger a scan without pulling in the whole app.

The scanner is purely read-only against the filesystem and never creates
albums — those are user-owned playlists. Each project carries a
`folder_name` (its parent folder's label) as display-only metadata.
"""

from pathlib import Path

from src.config import load_config
from src.database import get_connection
from src.scanner import (
    scan_for_tracks,
    scan_for_projects,
    detect_hierarchy,
    get_wav_duration,
    get_file_info,
)


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

            # Upsert project (cached). folder_name is display metadata only.
            project_path = hierarchy["project_path"]
            project_id = project_ids_by_path.get(project_path)
            if project_id is None:
                cur = conn.execute(
                    "INSERT INTO projects (name, path, folder_name) VALUES (?, ?, ?)",
                    (hierarchy["project_name"], project_path, hierarchy["folder_name"]),
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
