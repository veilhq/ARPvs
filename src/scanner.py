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
    """Find all .wav files inside export-versions/ directories.

    Args:
        root_path: Path to the ABLETON folder.

    Returns:
        List of Path objects pointing to .wav files.
    """
    root = Path(root_path)
    tracks = []

    for export_dir in root.rglob("export-versions"):
        if not export_dir.is_dir():
            continue
        for wav_file in sorted(export_dir.glob("*.wav")):
            # Validate that the file is actually a WAV audio file
            # (not Ableton Live Clip Settings or other non-audio files)
            if is_valid_wav_file(wav_file):
                tracks.append(wav_file)

    return tracks


def detect_hierarchy(wav_path: Path, scan_root: str) -> dict:
    """Determine the project and album for a given WAV file.

    Args:
        wav_path: Path to the .wav file (inside export-versions/).
        scan_root: Path to the ABLETON root folder.

    Returns:
        Dict with project_name, project_path, album_name, album_path.
    """
    export_dir = wav_path.parent
    project_dir = export_dir.parent
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
