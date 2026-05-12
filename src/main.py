"""
FastAPI application for ARPvs.

Serves the static UI and mounts the REST API routers:
  - library   — overview stats + manual scan trigger
  - albums    — auto-detected albums, cover art, curation
  - projects  — exported + unexported project listings
  - tracks    — track listing, metadata, per-track edits
  - streaming — audio streaming with HTTP Range support
  - search    — cross-track search and tag listings
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.config import ensure_data_dir
from src.database import init_db
from src.scan_runner import run_scan
from src.routers import albums, library, projects, search, streaming, tracks

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the app."""
    ensure_data_dir()
    init_db()
    run_scan()
    yield


app = FastAPI(
    title="ARPvs",
    description="Audio Reactive Project Visualization Shell",
    version="0.1.0",
    lifespan=lifespan,
)

# API routers (order within each module defines route precedence)
app.include_router(library.router)
app.include_router(albums.router)
app.include_router(projects.router)
app.include_router(tracks.router)
app.include_router(streaming.router)
app.include_router(search.router)

# Static file serving (must be last — this catches everything else)
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
