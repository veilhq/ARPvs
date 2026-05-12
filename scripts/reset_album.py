"""Reset an album back to auto mode — clears album_tracks and sets is_curated=0.

Usage: python scripts/reset_album.py <album_id>
"""
import sqlite3
import sys

if len(sys.argv) != 2:
    print("Usage: python scripts/reset_album.py <album_id>")
    sys.exit(1)

album_id = int(sys.argv[1])
c = sqlite3.connect('data/library.db')
before = c.execute("SELECT COUNT(*) FROM album_tracks WHERE album_id = ?", (album_id,)).fetchone()[0]
c.execute("DELETE FROM album_tracks WHERE album_id = ?", (album_id,))
c.execute("UPDATE albums SET is_curated = 0 WHERE id = ?", (album_id,))
c.commit()
print(f"Album {album_id}: cleared {before} curated rows, set is_curated=0")
