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
    conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'playlist',
    color TEXT,
    icon TEXT,
    artist_name TEXT,
    description TEXT,
    cover_art_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(collection_id, track_id)
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
CREATE INDEX IF NOT EXISTS idx_collection_tracks_collection ON collection_tracks(collection_id);
CREATE INDEX IF NOT EXISTS idx_track_tags_track ON track_tags(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at);
"""
