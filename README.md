# ARPvs

Audio Reactive Project Visualization Shell — a local-first desktop app that overlays virtual organization on top of an existing Ableton project folder, with audio playback and an Android companion for mobile listening.

## Principles

- **Read-only filesystem** — never moves, renames, or deletes audio files
- **Virtual organization** — projects, playlists, tags, sort order live in SQLite
- **Local-first** — runs on your machine, no cloud services, no accounts
- **Nondestructive** — delete the app's data folder and your music is untouched

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) |
| Database | SQLite |
| Desktop | PyWebView |
| Audio metadata | `wave` stdlib + `mutagen` |
| File watching | `watchdog` |

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

Copy the example config and set your scan root:

```bash
copy .env.example .env
```

Edit `.env` to point `SCAN_ROOT` at your Ableton exports folder.

## Running

```bash
# Desktop app (PyWebView window)
python run.py

# Development mode (browser at localhost:8000)
python run.py --dev
```

## Project Structure

```
arpvs/
├── src/
│   ├── main.py          # FastAPI app + route registration
│   ├── scanner.py       # Filesystem scanner + waveform generation
│   ├── database.py      # SQLite schema + operations
│   ├── models.py        # Pydantic schemas for API responses
│   ├── config.py        # Configuration loading (.env)
│   └── static/          # Frontend (HTML/CSS/JS)
│       ├── index.html
│       ├── css/
│       │   ├── style.css      # Import hub
│       │   ├── base.css       # Variables & resets
│       │   ├── layout.css     # Grid layout
│       │   ├── topbar.css
│       │   ├── sidebar.css
│       │   ├── tracks.css
│       │   ├── albums.css
│       │   ├── player.css
│       │   └── splash.css
│       ├── fonts/
│       │   └── DepartureMono-Regular.otf
│       └── js/
│           ├── main.js        # Entry point
│           ├── api.js         # Backend API wrappers
│           ├── state.js       # Shared state object
│           ├── views.js       # Content rendering
│           ├── player.js      # Audio playback engine
│           ├── nav.js         # Sidebar + search + shortcuts
│           ├── icons.js       # SVG icon registry
│           ├── theme.js       # Accent color + palette engine
│           ├── splash.js      # Splash / screensaver
│           ├── dither-bg.js   # Animated dither canvas
│           └── utils.js       # Helpers (formatTime, etc.)
├── scripts/
│   └── generate_test_data.py  # Creates a test library
├── data/                # Runtime data (created on first run)
│   ├── library.db       # SQLite database
│   └── cover_art/       # User-uploaded cover images
├── run.py               # Entry point
├── .env.example         # Example configuration
├── requirements.txt     # Python dependencies
└── .gitignore
```
