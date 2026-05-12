import sqlite3
c = sqlite3.connect('data/library.db')
c.row_factory = sqlite3.Row

print('=== albums with is_curated ===')
for r in c.execute('SELECT id, name, is_curated FROM albums ORDER BY id'):
    print(dict(r))

print('\n=== album_tracks ===')
for r in c.execute('SELECT album_id, track_id, sort_order, display_name FROM album_tracks ORDER BY album_id, sort_order'):
    print(dict(r))

print('\n=== tracks with display_name_override ===')
for r in c.execute('SELECT id, filename, display_name, display_name_override FROM tracks WHERE display_name_override IS NOT NULL'):
    print(dict(r))

print('\n=== dilation-field tracks ===')
for r in c.execute("SELECT t.id, t.filename, t.display_name, t.display_name_override, p.album_id, p.name as project_name FROM tracks t JOIN projects p ON p.id = t.project_id WHERE t.filename LIKE '%dilation%'"):
    print(dict(r))
