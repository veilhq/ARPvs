"""
Filesystem scanner for ARPvs.

Walks the configured scan root, detects albums/projects/tracks,
extracts metadata, and syncs findings to the database.
"""

import hashlib
import json
import struct
import wave
from pathlib import Path


def is_valid_wav_file(filepath: Path) -> bool:
    """Check if a file is a valid WAV audio file (not Ableton settings).

    Validates the WAV header to distinguish actual audio files from
    Ableton Live Clip Settings files that use .wav extension.

    Args:
        filepath: Path to the file to validate.

    Returns:
        True if the file is a valid WAV audio file, False otherwise.
    """
    try:
        with open(filepath, "rb") as f:
            # WAV files start with "RIFF" header
            header = f.read(4)
            if header != b"RIFF":
                return False
            # Skip file size (4 bytes)
            f.read(4)
            # Next 4 bytes should be "WAVE"
            wave_marker = f.read(4)
            if wave_marker != b"WAVE":
                return False
        return True
    except Exception:
        return False


def scan_for_tracks(root_path: str) -> list[Path]:
    """Find all .wav files inside export-versions/ directories or project folders.

    Looks for:
    1. .wav files inside export-versions/ subdirectories (primary)
    2. .wav files directly in project folders (fallback for projects without export-versions/)

    Args:
        root_path: Path to the ABLETON folder.

    Returns:
        List of Path objects pointing to .wav files.
    """
    root = Path(root_path)
    tracks = []
    seen_paths = set()  # Track files we've already added

    # First pass: look for export-versions directories
    for export_dir in root.rglob("export-versions"):
        if not export_dir.is_dir():
            continue
        for wav_file in sorted(export_dir.glob("*.wav")):
            # Validate that the file is actually a WAV audio file
            if is_valid_wav_file(wav_file):
                tracks.append(wav_file)
                seen_paths.add(wav_file.resolve())

    # Second pass: look for .wav files in project folders (one level deep from root)
    # This catches projects that don't have export-versions/ subdirectories
    for item in root.iterdir():
        if not item.is_dir():
            continue
        # Skip if it's the export-versions folder itself
        if item.name == "export-versions":
            continue
        # Look for .wav files directly in this folder
        for wav_file in sorted(item.glob("*.wav")):
            if wav_file.resolve() not in seen_paths and is_valid_wav_file(wav_file):
                tracks.append(wav_file)
                seen_paths.add(wav_file.resolve())

    return tracks


def scan_for_projects(root_path: str) -> list[Path]:
    """Find all Ableton Live Set (.als) files that don't have exports.

    These represent unexported/work-in-progress projects.
    Excludes projects that have corresponding .wav exports in the library.
    Also excludes .als files in backup directories.

    Args:
        root_path: Path to the ABLETON folder.

    Returns:
        List of Path objects pointing to .als files without exports.
    """
    root = Path(root_path)
    projects = []
    
    # First, collect all exported track paths to know which projects have exports
    exported_projects = set()
    for export_dir in root.rglob("export-versions"):
        if export_dir.is_dir():
            wav_files = list(export_dir.glob("*.wav"))
            if wav_files:
                # This project has exports, mark it
                project_dir = export_dir.parent
                exported_projects.add(project_dir.resolve())

    # Now find .als files that don't have exports
    for als_file in root.rglob("*.als"):
        if not als_file.is_file():
            continue
        
        # Skip if this file is in a Backup directory (case-insensitive)
        path_parts_lower = [part.lower() for part in als_file.parts]
        if "backup" in path_parts_lower:
            continue
        
        project_dir = als_file.parent
        
        # Check if this exact project dir has exports
        if project_dir.resolve() in exported_projects:
            continue
        
        projects.append(als_file)

    return sorted(projects)


def detect_hierarchy(wav_path: Path, scan_root: str) -> dict:
    """Determine the project and album for a given WAV file.

    Handles two cases:
    1. WAV in export-versions/ subdirectory: project_dir/export-versions/file.wav
    2. WAV directly in project folder: project_dir/file.wav

    Args:
        wav_path: Path to the .wav file.
        scan_root: Path to the ABLETON root folder.

    Returns:
        Dict with project_name, project_path, album_name, album_path.
    """
    # Determine if this is in export-versions or directly in a project folder
    if wav_path.parent.name == "export-versions":
        # Case 1: export-versions/file.wav
        export_dir = wav_path.parent
        project_dir = export_dir.parent
    else:
        # Case 2: project_dir/file.wav
        project_dir = wav_path.parent

    potential_album = project_dir.parent

    project_name = project_dir.name
    if project_name.endswith(" Project"):
        project_name = project_name[:-8]

    if potential_album.resolve() == Path(scan_root).resolve():
        return {
            "project_name": project_name,
            "project_path": str(project_dir),
            "album_name": None,
            "album_path": None,
        }
    else:
        return {
            "project_name": project_name,
            "project_path": str(project_dir),
            "album_name": potential_album.name,
            "album_path": str(potential_album),
        }


def get_wav_duration(filepath: Path) -> float:
    """Get duration in seconds from a WAV file header.

    Falls back to mutagen if the stdlib wave module can't handle the file
    (e.g. compressed WAV or non-standard headers).
    """
    # Try stdlib first (fastest for standard PCM WAV)
    try:
        with wave.open(str(filepath), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            duration = round(frames / float(rate), 2)
            if duration > 0:
                return duration
    except Exception:
        pass

    # Fallback to mutagen (handles more formats)
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(str(filepath))
        if audio is not None and audio.info is not None:
            return round(audio.info.length, 2)
    except Exception:
        pass

    return 0.0


def hash_file(filepath: Path, chunk_size: int = 8192) -> str:
    """Compute SHA-256 hash of a file's contents."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def generate_waveform_peaks(filepath: Path, num_peaks: int = 800) -> list[float]:
    """Generate simplified waveform data for UI visualization.

    Reads the WAV file and produces a list of normalized peak
    amplitude values (0.0 to 1.0) suitable for drawing a waveform.

    Args:
        filepath: Path to the .wav file.
        num_peaks: Number of data points to generate.

    Returns:
        List of floats representing peak amplitudes.
    """
    try:
        with wave.open(str(filepath), "rb") as wf:
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            n_frames = wf.getnframes()

            if n_frames == 0:
                return [0.0] * num_peaks

            # Read all frames
            raw_data = wf.readframes(n_frames)

        # Determine struct format based on sample width
        if sample_width == 1:
            fmt = f"<{n_frames * n_channels}B"
            max_val = 128.0
            offset = 128  # 8-bit WAV is unsigned
        elif sample_width == 2:
            fmt = f"<{n_frames * n_channels}h"
            max_val = 32768.0
            offset = 0
        elif sample_width == 3:
            # 24-bit: handle manually below
            fmt = None
            max_val = 8388608.0
            offset = 0
        else:
            return [0.0] * num_peaks

        # Unpack samples
        if fmt:
            samples = struct.unpack(fmt, raw_data)
        else:
            # 24-bit unpacking
            samples = []
            for i in range(0, len(raw_data), 3):
                b = raw_data[i : i + 3]
                val = int.from_bytes(b, byteorder="little", signed=True)
                samples.append(val)

        # Mix to mono by averaging channels
        if n_channels > 1:
            mono = []
            for i in range(0, len(samples), n_channels):
                avg = sum(samples[i : i + n_channels]) / n_channels
                mono.append(avg)
            samples = mono

        # Downsample to num_peaks by taking max absolute value per chunk
        chunk_size = max(1, len(samples) // num_peaks)
        peaks = []
        for i in range(0, len(samples), chunk_size):
            chunk = samples[i : i + chunk_size]
            peak = max(abs(s - offset) for s in chunk) / max_val
            peaks.append(min(1.0, peak))

        # Pad or trim to exact num_peaks
        if len(peaks) < num_peaks:
            peaks.extend([0.0] * (num_peaks - len(peaks)))
        return peaks[:num_peaks]

    except Exception:
        return [0.0] * num_peaks


def get_file_info(filepath: Path) -> dict:
    """Get file size and modification time."""
    stat = filepath.stat()
    return {
        "size_bytes": stat.st_size,
        "modified_at": stat.st_mtime,
    }
