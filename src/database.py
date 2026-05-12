"""
SQLite database operations for ARPvs.

Handles schema creation, track/project/album CRUD, and scan state.
The database file lives at data/library.db.
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
    """Create all tables if they don't exist."""
    conn = get_connection()
    conn.executescript(SCHEMA)
    _migrate(conn)
    conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply lightweight schema migrations for existing databases."""
    # Add display_name_override column to tracks if missing
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(tracks)")}
    if "display_name_override" not in cols:
        conn.execute("ALTER TABLE tracks ADD COLUMN display_name_override TEXT")

    # Add display_name_override and cover_override_path to albums if missing
    album_cols = {row["name"] for row in conn.execute("PRAGMA table_info(albums)")}
    if "display_name_override" not in album_cols:
        conn.execute("ALTER TABLE albums ADD COLUMN display_name_override TEXT")
    if "cover_override_path" not in album_cols:
        conn.execute("ALTER TABLE albums ADD COLUMN cover_override_path TEXT")
    if "is_curated" not in album_cols:
        conn.execute("ALTER TABLE albums ADD COLUMN is_curated INTEGER NOT NULL DEFAULT 0")
        # Backfill: any album that already has album_tracks rows is curated
        conn.execute(
            "UPDATE albums SET is_curated = 1 WHERE id IN (SELECT DISTINCT album_id FROM album_tracks)"
        )

    # Add display_name to album_tracks if missing
    at_cols = {row["name"] for row in conn.execute("PRAGMA table_info(album_tracks)")}
    if at_cols and "display_name" not in at_cols:
        conn.execute("ALTER TABLE album_tracks ADD COLUMN display_name TEXT")

    # Drop legacy collections tables if they exist
    conn.execute("DROP TABLE IF EXISTS collection_tracks")
    conn.execute("DROP TABLE IF EXISTS collections")

    conn.commit()


SCHEMA = """
CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    display_name_override TEXT,
    cover_override_path TEXT,
    is_curated INTEGER NOT NULL DEFAULT 0,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
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

-- Virtual organization (Phase 2)

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
CREATE INDEX IF NOT EXISTS idx_projects_album ON projects(album_id);
CREATE INDEX IF NOT EXISTS idx_album_tracks_album ON album_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_track_tags_track ON track_tags(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at);
"""
