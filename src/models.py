"""
Pydantic models for ARPvs API responses.

These define the shape of data returned by the REST API.
They don't touch the database directly — that's database.py's job.
"""

from pydantic import BaseModel
from typing import Optional


class AlbumResponse(BaseModel):
    """An auto-detected album (parent folder containing projects)."""
    id: int
    name: str
    path: str
    project_count: int
    discovered_at: str


class ProjectResponse(BaseModel):
    """An Ableton project directory containing export-versions/."""
    id: int
    album_id: Optional[int]
    album_name: Optional[str]
    name: str
    path: str
    track_count: int
    discovered_at: str


class TrackResponse(BaseModel):
    """A single WAV file from export-versions/."""
    id: int
    project_id: int
    project_name: str
    album_name: Optional[str]
    filename: str
    display_name: Optional[str]
    duration_seconds: float
    file_size_bytes: int
    is_changed: bool
    discovered_at: str
    waveform_peaks: Optional[list[float]] = None


class LibrarySummary(BaseModel):
    """Overview stats for the library."""
    total_tracks: int
    total_projects: int
    total_albums: int
    total_duration_seconds: float
    last_scan_at: Optional[str]
