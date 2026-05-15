"""
Configuration loading for ARPvs.

Reads .env from the project root. Falls back to defaults if the file
doesn't exist (first run).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Project root is one level up from src/
PROJECT_ROOT = Path(__file__).parent.parent
ENV_PATH = PROJECT_ROOT / ".env"
DATA_DIR = PROJECT_ROOT / "data"

# Load .env file if it exists
if ENV_PATH.exists():
    print(f"[ARPvs] Loading .env from: {ENV_PATH}")
    load_dotenv(ENV_PATH)
else:
    print(f"[ARPvs] WARNING: .env not found at {ENV_PATH}")

DEFAULTS = {
    "scan_root": "",
    "host": "127.0.0.1",
    "port": 8888,
    "window_width": 1200,
    "window_height": 800,
    "window_min_width": 800,
    "window_min_height": 500,
    "window_title": "ARPvs",
    "search_result_limit": 50,
    "stream_chunk_size": 65536,
}


def load_config() -> dict:
    """Load configuration from environment variables, falling back to defaults."""
    scan_root = os.getenv("SCAN_ROOT", DEFAULTS["scan_root"])
    host = os.getenv("HOST", DEFAULTS["host"])
    port = int(os.getenv("PORT", DEFAULTS["port"]))
    
    config = {
        "scan_root": scan_root,
        "host": host,
        "port": port,
        "search_result_limit": int(os.getenv("SEARCH_LIMIT", DEFAULTS["search_result_limit"])),
        "stream_chunk_size": int(os.getenv("STREAM_CHUNK_SIZE", DEFAULTS["stream_chunk_size"])),
        "window": {
            "width": int(os.getenv("WINDOW_WIDTH", DEFAULTS["window_width"])),
            "height": int(os.getenv("WINDOW_HEIGHT", DEFAULTS["window_height"])),
            "min_width": int(os.getenv("WINDOW_MIN_WIDTH", DEFAULTS["window_min_width"])),
            "min_height": int(os.getenv("WINDOW_MIN_HEIGHT", DEFAULTS["window_min_height"])),
            "title": os.getenv("WINDOW_TITLE", DEFAULTS["window_title"]),
        },
    }
    
    print(f"[ARPvs] Config loaded: SCAN_ROOT={scan_root!r}, PORT={port}")
    return config


def ensure_data_dir():
    """Create the data directory and subdirectories if they don't exist."""
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "cover_art").mkdir(exist_ok=True)
