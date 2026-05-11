"""
Configuration loading for ARPvs.

Reads config.json from the project root. Falls back to defaults
if the file doesn't exist (first run).
"""

import json
from pathlib import Path

# Project root is one level up from src/
PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.json"
DATA_DIR = PROJECT_ROOT / "data"

DEFAULTS = {
    "scan_root": "",
    "port": 8000,
    "window": {
        "width": 1200,
        "height": 800,
        "title": "ARPvs",
    },
}


def load_config() -> dict:
    """Load configuration from config.json, merging with defaults."""
    config = DEFAULTS.copy()

    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            user_config = json.load(f)
        # Shallow merge — window is nested so handle it explicitly
        config.update(user_config)
        if "window" in user_config:
            merged_window = DEFAULTS["window"].copy()
            merged_window.update(user_config["window"])
            config["window"] = merged_window

    return config


def ensure_data_dir():
    """Create the data directory and subdirectories if they don't exist."""
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "cover_art").mkdir(exist_ok=True)
