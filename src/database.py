"""
SQLite database operations for ARPvs.

Handles schema creation, track/project/album CRUD, and scan state.
The database file lives at data/library.db.

Schema ownership:
  - albums + album_tracks — user-created playlists (with cover + per-album rename)
  - projects + tracks + unexported_projects — scanner-owned, rebuilt from disk
  - folder_name on projects is purely display metadata (parent folder label)
  - tags, favorites, play_history — user data, preserved across scans
"""

import sqlite3
from pathlib import Path
from src.config import DATA_DIR

DB_PATH = DATA_DIR / "library.db"


def get_connection() -> sqlite3.Connection:
    """Get a database connection with row factory enabled."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist.

    If a legacy schema is detected (old auto-detected albums with path /
    is_curated / projects.album_id), the scan-related tables are dropped
    so the next scan rebuilds from disk. User-owned data (tags, favorites,
    play_history) is preserved when possible.
    """
    if DB_PATH.exists():
        _drop_legacy_schema_if_needed()

    conn = get_connection()
    conn.executescript(SCHEMA)
    _migrate(conn)
    conn.close()


def _drop_legacy_schema_if_needed() -> None:
    """Wipe scan-related tables when the DB was created under the old
    auto-detected-album schema. Anything else stays put."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        def cols(table: str) -> set[str]:
            return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}

        album_cols = cols("albums")
        project_cols = cols("projects")
        is_legacy = (
            "path" in album_cols
            or "is_curated" in album_cols
            or "display_name_override" in album_cols
            or "album_id" in project_cols
        )
        if not is_legacy:
            return

        print("[ARPvs] Legacy album schema detected — rebuilding scan tables...")
        # Drop children first to respect FKs. User-owned tables that
        # reference tracks (favorites, track_tags, play_history) are
        # dropped too because those FKs won't survive the rebuild.
        for t in (
            "favorites",
            "track_tags",
            "play_history",
            "album_tracks",
            "tracks",
            "projects",
            "albums",
            "unexported_projects",
        ):
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply lightweight schema migrations for existing databases."""
    # Add display_name_override column to tracks if missing
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(tracks)")}
    if "display_name_override" not in cols:
        conn.execute("ALTER TABLE tracks ADD COLUMN display_name_override TEXT")

    # Ensure projects.folder_name exists (added during the album refactor)
    project_cols = {row["name"] for row in conn.execute("PRAGMA table_info(projects)")}
    if "folder_name" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN folder_name TEXT")

    # Drop legacy collections tables if they exist
    conn.execute("DROP TABLE IF EXISTS collection_tracks")
    conn.execute("DROP TABLE IF EXISTS collections")

    conn.commit()


SCHEMA = """
-- User-created albums (playlists). Purely presentation metadata;
-- membership lives in album_tracks.
CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scanner-owned: one row per project folder found on disk.
-- `folder_name` is the parent directory's label (display metadata only).
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    folder_name TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unexported_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    file_size_bytes INTEGER,
    modified_at REAL,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    display_name TEXT,
    display_name_override TEXT,
    file_hash TEXT,
    file_size_bytes INTEGER,
    modified_at REAL,
    duration_seconds REAL,
    waveform_peaks TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_changed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Album membership: one row per (album, track) pair, with explicit order
-- and optional per-album display name override.
CREATE TABLE IF NOT EXISTS album_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    display_name TEXT,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(album_id, track_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE IF NOT EXISTS track_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(track_id, tag_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    played_at TEXT NOT NULL DEFAULT (datetime('now')),
    duration_listened REAL,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_album_tracks_album ON album_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_album_tracks_track ON album_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_track_tags_track ON track_tags(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at);
"""
