"""
Generate a test dataset for ARPvs development.

Creates a realistic folder structure with valid WAV files containing
short sine wave tones at various frequencies and durations.

Usage:
    python scripts/generate_test_data.py [output_dir]

Default output: ./test_library/
"""

import math
import os
import struct
import sys
import wave
from pathlib import Path

# --- Configuration ---

OUTPUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("test_library")

# Album -> Project -> Tracks (filename, duration_seconds, frequency_hz)
LIBRARY = {
    "Midnight Sessions": {
        "warm-drift": [
            ("warm-drift_v1.wav", 8, 220),
            ("warm-drift_v2.wav", 10, 220),
            ("warm-drift_v3-final.wav", 12, 233),
        ],
        "pulse-echo": [
            ("pulse-echo_v1.wav", 6, 330),
            ("pulse-echo_v2.wav", 9, 349),
        ],
        "glass-horizon": [
            ("glass-horizon_v1.wav", 15, 440),
            ("glass-horizon_v2.wav", 15, 466),
            ("glass-horizon_v3.wav", 14, 440),
            ("glass-horizon_v4-final.wav", 16, 493),
        ],
    },
    "Field Recordings Vol 2": {
        "rain-on-tin": [
            ("rain-on-tin_v1.wav", 20, 180),
            ("rain-on-tin_v2-final.wav", 22, 185),
        ],
        "morning-birds": [
            ("morning-birds_v1.wav", 18, 880),
            ("morning-birds_v2.wav", 25, 932),
        ],
    },
    "Sketches": {
        "idea-001": [
            ("idea-001.wav", 4, 261),
        ],
        "idea-002": [
            ("idea-002_v1.wav", 3, 293),
            ("idea-002_v2.wav", 5, 311),
        ],
        "idea-003": [
            ("idea-003.wav", 7, 349),
        ],
        "idea-004": [
            ("idea-004_v1.wav", 2, 392),
            ("idea-004_v2.wav", 3, 415),
            ("idea-004_v3.wav", 6, 440),
        ],
    },
}

# Standalone projects (no album parent, directly under scan root)
STANDALONE_PROJECTS = {
    "one-off-experiment": [
        ("one-off-experiment_v1.wav", 10, 523),
        ("one-off-experiment_v2.wav", 12, 554),
    ],
    "collab-with-kai": [
        ("collab-with-kai_final.wav", 30, 277),
    ],
}

# Unexported projects (just .als files, no WAV exports)
UNEXPORTED_PROJECTS = [
    "Midnight Sessions/unfinished-thing",
    "wip-beat",
]


def generate_wav(filepath: Path, duration_sec: float, freq_hz: float):
    """Write a valid PCM WAV file with a sine wave tone.

    Generates 16-bit mono audio at 44100 Hz sample rate.
    Includes a gentle fade-in/fade-out to avoid clicks.
    """
    sample_rate = 44100
    num_samples = int(sample_rate * duration_sec)
    fade_samples = min(int(sample_rate * 0.05), num_samples // 4)  # 50ms fade

    filepath.parent.mkdir(parents=True, exist_ok=True)

    with wave.open(str(filepath), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)

        frames = bytearray()
        for i in range(num_samples):
            # Sine wave
            t = i / sample_rate
            value = math.sin(2 * math.pi * freq_hz * t)

            # Apply fade envelope
            if i < fade_samples:
                value *= i / fade_samples
            elif i > num_samples - fade_samples:
                value *= (num_samples - i) / fade_samples

            # Scale to 16-bit range (leave headroom)
            sample = int(value * 28000)
            frames.extend(struct.pack("<h", sample))

        wf.writeframes(bytes(frames))


def create_als_stub(filepath: Path):
    """Create a minimal .als stub file (just enough to be detected)."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    # Ableton .als files are gzipped XML, but for detection purposes
    # we just need the file to exist with the right extension
    filepath.write_bytes(b"\x1f\x8b" + b"\x00" * 20)  # gzip magic + padding


def main():
    print(f"Generating test library in: {OUTPUT_DIR.resolve()}")
    print()

    track_count = 0

    # Generate album-based projects
    for album_name, projects in LIBRARY.items():
        print(f"  Album: {album_name}/")
        for project_name, tracks in projects.items():
            project_dir = OUTPUT_DIR / album_name / f"{project_name} Project"
            export_dir = project_dir / "export-versions"
            print(f"    Project: {project_name}/ ({len(tracks)} tracks)")

            # Create a dummy .als file for realism
            create_als_stub(project_dir / f"{project_name}.als")

            for filename, duration, freq in tracks:
                filepath = export_dir / filename
                generate_wav(filepath, duration, freq)
                track_count += 1

    # Generate standalone projects (no album)
    print()
    print("  Standalone projects:")
    for project_name, tracks in STANDALONE_PROJECTS.items():
        project_dir = OUTPUT_DIR / f"{project_name} Project"
        export_dir = project_dir / "export-versions"
        print(f"    Project: {project_name}/ ({len(tracks)} tracks)")

        create_als_stub(project_dir / f"{project_name}.als")

        for filename, duration, freq in tracks:
            filepath = export_dir / filename
            generate_wav(filepath, duration, freq)
            track_count += 1

    # Generate unexported projects
    print()
    print("  Unexported projects (no WAV exports):")
    for project_path in UNEXPORTED_PROJECTS:
        project_dir = OUTPUT_DIR / f"{project_path} Project"
        project_name = Path(project_path).name
        print(f"    {project_path}/")
        create_als_stub(project_dir / f"{project_name}.als")

    print()
    print(f"Done! Generated {track_count} WAV files.")
    print(f"Set this in your .env:")
    print(f"  SCAN_ROOT={OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
