"""
Generate a test dataset for ARPvs development.

Creates a realistic folder structure with valid WAV files containing
varied synthesized audio — chords, drums, pads, arpeggios, noise textures,
FM synthesis, and more. Each track sounds distinct so visualizers have
interesting material to react to.

Usage:
    python scripts/generate_test_data.py [output_dir]

Default output: ./test_library/
"""

import math
import os
import random
import struct
import sys
import wave
from pathlib import Path

# --- Configuration ---

OUTPUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("test_library")

SAMPLE_RATE = 44100

# --- Synthesis primitives ---


def sine(t, freq):
    return math.sin(2 * math.pi * freq * t)


def saw(t, freq):
    phase = (t * freq) % 1.0
    return 2.0 * phase - 1.0


def square(t, freq, duty=0.5):
    phase = (t * freq) % 1.0
    return 1.0 if phase < duty else -1.0


def triangle(t, freq):
    phase = (t * freq) % 1.0
    return 4.0 * abs(phase - 0.5) - 1.0


def noise():
    return random.uniform(-1.0, 1.0)


def fade_envelope(i, num_samples, fade_in=0.02, fade_out=0.05):
    """Compute fade envelope value at sample index i."""
    fade_in_samples = int(SAMPLE_RATE * fade_in)
    fade_out_samples = int(SAMPLE_RATE * fade_out)
    if i < fade_in_samples:
        return i / max(1, fade_in_samples)
    elif i > num_samples - fade_out_samples:
        return (num_samples - i) / max(1, fade_out_samples)
    return 1.0


def adsr(i, num_samples, attack=0.01, decay=0.1, sustain=0.7, release=0.15):
    """ADSR envelope."""
    t = i / SAMPLE_RATE
    total_dur = num_samples / SAMPLE_RATE
    release_start = total_dur - release

    if t < attack:
        return t / max(0.001, attack)
    elif t < attack + decay:
        return 1.0 - (1.0 - sustain) * ((t - attack) / max(0.001, decay))
    elif t < release_start:
        return sustain
    else:
        return sustain * max(0, 1.0 - (t - release_start) / max(0.001, release))


# --- Generators (each returns a list of float samples -1..1) ---


def gen_sine_tone(duration, freq):
    """Simple sine wave with fade."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n)
        samples.append(sine(t, freq) * env * 0.8)
    return samples


def gen_chord(duration, freqs, wave_fn=sine):
    """Layered chord with multiple frequencies."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n, fade_in=0.05, fade_out=0.1)
        val = sum(wave_fn(t, f) for f in freqs) / len(freqs)
        samples.append(val * env * 0.7)
    return samples


def gen_pad(duration, base_freq):
    """Lush detuned pad with slow LFO modulation."""
    n = int(SAMPLE_RATE * duration)
    detune = [0, 0.5, 1.0, -0.5, 7.02]
    freqs = [base_freq * (2 ** (d / 1200)) for d in detune]
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n, fade_in=0.3, fade_out=0.5)
        lfo = 0.5 + 0.5 * sine(t, 0.3)
        val = sum(
            sine(t, f) * (0.6 + 0.4 * sine(t, 0.1 + j * 0.05))
            for j, f in enumerate(freqs)
        ) / len(freqs)
        samples.append(val * env * lfo * 0.6)
    return samples


def gen_arpeggio(duration, base_freq, pattern=None):
    """Fast arpeggio with saw wave."""
    n = int(SAMPLE_RATE * duration)
    if pattern is None:
        pattern = [1, 1.25, 1.5, 2.0, 1.5, 1.25]
    note_dur = 0.12
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n)
        note_idx = int(t / note_dur) % len(pattern)
        freq = base_freq * pattern[note_idx]
        note_t = (t % note_dur) / note_dur
        note_env = max(0, 1.0 - note_t * 2.5)
        val = saw(t, freq) * note_env
        samples.append(val * env * 0.5)
    return samples


def gen_fm_bass(duration, base_freq):
    """FM synthesis bass with modulation sweep."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = adsr(i, n, attack=0.005, decay=0.2, sustain=0.4, release=0.3)
        mod_depth = 200 * math.exp(-t * 3)
        mod = sine(t, base_freq * 2) * mod_depth
        val = sine(t, base_freq + mod)
        samples.append(val * env * 0.8)
    return samples


def gen_kick_pattern(duration, bpm=120):
    """Four-on-the-floor kick drum pattern."""
    n = int(SAMPLE_RATE * duration)
    beat_samples = int(SAMPLE_RATE * 60 / bpm)
    samples = []
    for i in range(n):
        beat_pos = i % beat_samples
        beat_t = beat_pos / SAMPLE_RATE
        freq = 150 * math.exp(-beat_t * 30) + 45
        kick_env = math.exp(-beat_t * 12)
        val = sine(beat_t, freq) * kick_env
        samples.append(val * 0.9)
    return samples


def gen_hihat_pattern(duration, bpm=120):
    """Eighth-note hi-hat pattern with velocity variation."""
    n = int(SAMPLE_RATE * duration)
    eighth_samples = int(SAMPLE_RATE * 60 / bpm / 2)
    rng = random.Random(42)
    samples = []
    for i in range(n):
        pos = i % eighth_samples
        hit_t = pos / SAMPLE_RATE
        hit_env = math.exp(-hit_t * 80)
        vel = 0.5 + 0.5 * ((i // eighth_samples) % 2 == 0)
        val = noise() * hit_env * vel
        val = val * 0.7 + sine(hit_t, 8000 + rng.uniform(-500, 500)) * hit_env * 0.3
        samples.append(val * 0.4)
    return samples


def gen_drum_loop(duration, bpm=128):
    """Full drum loop: kick + snare + hats."""
    n = int(SAMPLE_RATE * duration)
    beat_samples = int(SAMPLE_RATE * 60 / bpm)
    half_beat = beat_samples // 2
    samples = []
    for i in range(n):
        val = 0.0
        beat_pos = i % beat_samples
        beat_t = beat_pos / SAMPLE_RATE
        beat_num = (i // beat_samples) % 4

        # Kick on 1 and 3
        if beat_num in (0, 2):
            freq = 160 * math.exp(-beat_t * 35) + 40
            val += sine(beat_t, freq) * math.exp(-beat_t * 10) * 0.9

        # Snare on 2 and 4
        if beat_num in (1, 3):
            snare_env = math.exp(-beat_t * 15)
            val += (noise() * 0.6 + sine(beat_t, 200) * 0.4) * snare_env * 0.6

        # Hats on eighths
        eighth_pos = i % half_beat
        hat_t = eighth_pos / SAMPLE_RATE
        hat_env = math.exp(-hat_t * 60)
        val += noise() * hat_env * 0.2

        samples.append(max(-1.0, min(1.0, val)))
    return samples


def gen_noise_texture(duration, filter_freq=2000):
    """Filtered noise texture — ambient/industrial."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    prev = 0.0
    rc = 1.0 / (2 * math.pi * filter_freq)
    dt = 1.0 / SAMPLE_RATE
    alpha = dt / (rc + dt)
    for i in range(n):
        env = fade_envelope(i, n, fade_in=0.5, fade_out=1.0)
        raw = noise()
        prev = prev + alpha * (raw - prev)
        lfo = 0.5 + 0.5 * sine(i / SAMPLE_RATE, 0.15)
        samples.append(prev * env * lfo * 0.7)
    return samples


def gen_glitch(duration, bpm=140):
    """Glitchy stuttered tones and noise bursts."""
    n = int(SAMPLE_RATE * duration)
    sixteenth = int(SAMPLE_RATE * 60 / bpm / 4)
    samples = []
    for i in range(n):
        step = (i // sixteenth) % 16
        step_pos = i % sixteenth
        step_t = step_pos / SAMPLE_RATE
        rng_step = random.Random(step * 13 + 7)
        val = 0.0
        kind = rng_step.choice(["tone", "noise", "silence", "fm", "tone"])
        if kind == "tone":
            freq = rng_step.choice([110, 220, 330, 440, 660, 880])
            val = square(step_t, freq, duty=rng_step.uniform(0.2, 0.8)) * math.exp(
                -step_t * 20
            )
        elif kind == "noise":
            val = noise() * math.exp(-step_t * 30)
        elif kind == "fm":
            base = rng_step.choice([55, 110, 220])
            mod = sine(step_t, base * 3) * 100 * math.exp(-step_t * 10)
            val = sine(step_t, base + mod) * math.exp(-step_t * 8)
        env = fade_envelope(i, n)
        samples.append(val * env * 0.55)
    return samples


def gen_ambient_drone(duration, base_freq=55):
    """Deep ambient drone with harmonics and slow movement."""
    n = int(SAMPLE_RATE * duration)
    harmonics = [1, 2, 3, 5, 7]
    amps = [1.0, 0.5, 0.3, 0.15, 0.08]
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n, fade_in=1.0, fade_out=2.0)
        val = 0.0
        for h, a in zip(harmonics, amps):
            freq = base_freq * h
            lfo = 1.0 + 0.002 * sine(t, 0.1 * h)
            val += sine(t, freq * lfo) * a
        val /= sum(amps)
        brightness = 0.4 + 0.6 * (0.5 + 0.5 * sine(t, 0.05))
        samples.append(val * env * brightness * 0.6)
    return samples


def gen_pluck_sequence(duration, scale_freqs, bpm=100):
    """Plucked string sequence using Karplus-Strong-ish synthesis."""
    n = int(SAMPLE_RATE * duration)
    note_dur_samples = int(SAMPLE_RATE * 60 / bpm)
    rng = random.Random(23)
    samples = [0.0] * n

    for note_start in range(0, n, note_dur_samples):
        freq = rng.choice(scale_freqs)
        period = int(SAMPLE_RATE / freq)
        if period < 2:
            continue
        buf = [rng.uniform(-1, 1) for _ in range(period)]
        idx = 0
        for i in range(min(note_dur_samples, n - note_start)):
            sample_idx = note_start + i
            val = buf[idx]
            next_idx = (idx + 1) % period
            buf[idx] = 0.498 * (buf[idx] + buf[next_idx])
            idx = next_idx
            decay = math.exp(-i / SAMPLE_RATE * 3)
            samples[sample_idx] += val * decay * 0.6

    peak = max(abs(s) for s in samples) or 1.0
    for i in range(n):
        env = fade_envelope(i, n)
        samples[i] = (samples[i] / peak) * env * 0.75
    return samples


def gen_wobble_bass(duration, base_freq=55, lfo_rate=2.0):
    """Dubstep-style wobble bass."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = fade_envelope(i, n, fade_in=0.02, fade_out=0.1)
        lfo = 0.5 + 0.5 * sine(t, lfo_rate)
        raw = saw(t, base_freq) + saw(t, base_freq * 1.005) * 0.5
        shaped = math.tanh(raw * (1.0 + lfo * 3.0))
        samples.append(shaped * env * lfo * 0.6)
    return samples


def gen_riserset(duration, start_freq=100, end_freq=2000):
    """Rising filtered noise sweep — tension builder."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    prev = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = i / n
        env = fade_envelope(i, n, fade_in=0.1, fade_out=0.02)
        # Sweep filter frequency
        freq = start_freq + (end_freq - start_freq) * (progress ** 2)
        rc = 1.0 / (2 * math.pi * freq)
        dt = 1.0 / SAMPLE_RATE
        alpha = dt / (rc + dt)
        raw = noise() + sine(t, 80) * 0.3
        prev = prev + alpha * (raw - prev)
        # Volume ramps up
        vol = 0.3 + 0.7 * progress
        samples.append(prev * env * vol * 0.7)
    return samples


# --- Library structure ---
# Each track: (filename, duration_sec, generator_function, *args)

LIBRARY = {
    "Midnight Sessions": {
        "warm-drift": [
            ("warm-drift_v1.wav", 12, gen_pad, 174.6),
            ("warm-drift_v2.wav", 15, gen_pad, 185.0),
            ("warm-drift_v3-final.wav", 18, gen_pad, 174.6),
        ],
        "pulse-echo": [
            ("pulse-echo_v1.wav", 10, gen_arpeggio, 220, [1, 1.25, 1.5, 2.0]),
            (
                "pulse-echo_v2.wav",
                14,
                gen_arpeggio,
                233,
                [1, 1.333, 1.5, 2.0, 1.5, 1.333],
            ),
        ],
        "glass-horizon": [
            ("glass-horizon_v1.wav", 15, gen_chord, [440, 554, 659]),
            ("glass-horizon_v2.wav", 15, gen_chord, [466, 587, 698]),
            (
                "glass-horizon_v3.wav",
                16,
                gen_pluck_sequence,
                [440, 494, 554, 587, 659, 740, 880],
                90,
            ),
            (
                "glass-horizon_v4-final.wav",
                20,
                gen_pluck_sequence,
                [440, 494, 554, 587, 659, 740, 880],
                110,
            ),
        ],
        "neon-cascade": [
            ("neon-cascade_v1.wav", 10, gen_arpeggio, 330, [1, 1.25, 1.5, 1.875, 2.0]),
            (
                "neon-cascade_v2.wav",
                14,
                gen_arpeggio,
                330,
                [1, 1.2, 1.5, 1.8, 2.0, 2.4],
            ),
            (
                "neon-cascade_v3-final.wav",
                18,
                gen_arpeggio,
                349,
                [1, 1.2, 1.5, 1.8, 2.0, 2.4],
            ),
        ],
    },
    "Field Recordings Vol 2": {
        "rain-on-tin": [
            ("rain-on-tin_v1.wav", 20, gen_noise_texture, 1200),
            ("rain-on-tin_v2-final.wav", 25, gen_noise_texture, 800),
        ],
        "morning-birds": [
            (
                "morning-birds_v1.wav",
                18,
                gen_pluck_sequence,
                [880, 1047, 1175, 1319, 1568],
                140,
            ),
            (
                "morning-birds_v2.wav",
                22,
                gen_pluck_sequence,
                [880, 988, 1175, 1319, 1480, 1760],
                160,
            ),
        ],
    },
    "Sketches": {
        "idea-001": [
            ("idea-001.wav", 6, gen_fm_bass, 55),
        ],
        "idea-002": [
            ("idea-002_v1.wav", 5, gen_wobble_bass, 55, 3.0),
            ("idea-002_v2.wav", 8, gen_wobble_bass, 65, 4.0),
        ],
        "idea-003": [
            ("idea-003.wav", 10, gen_glitch, 140),
        ],
        "idea-004": [
            ("idea-004_v1.wav", 4, gen_drum_loop, 128),
            ("idea-004_v2.wav", 6, gen_drum_loop, 140),
            ("idea-004_v3.wav", 8, gen_drum_loop, 160),
        ],
    },
    "Low End Theory": {
        "sub-pressure": [
            ("sub-pressure_v1.wav", 12, gen_wobble_bass, 40, 1.5),
            ("sub-pressure_v2.wav", 16, gen_wobble_bass, 45, 2.5),
            ("sub-pressure_v3-final.wav", 20, gen_wobble_bass, 40, 3.5),
        ],
        "concrete-floor": [
            ("concrete-floor_v1.wav", 10, gen_kick_pattern, 130),
            ("concrete-floor_v2.wav", 14, gen_drum_loop, 130),
            ("concrete-floor_v3-final.wav", 18, gen_drum_loop, 135),
        ],
        "deep-signal": [
            ("deep-signal_v1.wav", 15, gen_ambient_drone, 36),
            ("deep-signal_v2-final.wav", 25, gen_ambient_drone, 41),
        ],
    },
    "Broken Machines": {
        "circuit-bend": [
            ("circuit-bend_v1.wav", 8, gen_glitch, 160),
            ("circuit-bend_v2.wav", 12, gen_glitch, 175),
            ("circuit-bend_v3-final.wav", 16, gen_glitch, 155),
        ],
        "tape-hiss": [
            ("tape-hiss_v1.wav", 20, gen_noise_texture, 3000),
            ("tape-hiss_v2-final.wav", 30, gen_noise_texture, 4500),
        ],
        "error-code": [
            ("error-code_v1.wav", 6, gen_fm_bass, 82),
            ("error-code_v2.wav", 10, gen_fm_bass, 73),
        ],
    },
    "Tension & Release": {
        "build-up": [
            ("build-up_v1.wav", 15, gen_riserset, 80, 3000),
            ("build-up_v2-final.wav", 20, gen_riserset, 60, 5000),
        ],
        "drop-zone": [
            ("drop-zone_v1.wav", 8, gen_kick_pattern, 150),
            ("drop-zone_v2.wav", 12, gen_drum_loop, 150),
            ("drop-zone_v3-final.wav", 16, gen_drum_loop, 150),
        ],
        "afterglow": [
            ("afterglow_v1.wav", 20, gen_ambient_drone, 65),
            ("afterglow_v2-final.wav", 30, gen_pad, 130.8),
        ],
    },
}

# Standalone projects (no album parent)
STANDALONE_PROJECTS = {
    "one-off-experiment": [
        ("one-off-experiment_v1.wav", 10, gen_chord, [261, 329, 392]),
        ("one-off-experiment_v2.wav", 14, gen_chord, [261, 329, 392, 523]),
    ],
    "collab-with-kai": [
        (
            "collab-with-kai_final.wav",
            30,
            gen_pluck_sequence,
            [220, 261, 293, 349, 392, 440],
            95,
        ),
    ],
    "late-night-jam": [
        ("late-night-jam_v1.wav", 20, gen_drum_loop, 92),
        ("late-night-jam_v2.wav", 25, gen_drum_loop, 96),
        ("late-night-jam_v3-final.wav", 35, gen_drum_loop, 100),
    ],
}

# Unexported projects (just .als files, no WAV exports)
UNEXPORTED_PROJECTS = [
    "Midnight Sessions/unfinished-thing",
    "wip-beat",
    "Low End Theory/rumble-test",
]


def generate_wav(filepath: Path, samples):
    """Write a list of float samples (-1..1) as a 16-bit mono WAV."""
    filepath.parent.mkdir(parents=True, exist_ok=True)

    with wave.open(str(filepath), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(SAMPLE_RATE)

        frames = bytearray()
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            sample = int(clamped * 30000)
            frames.extend(struct.pack("<h", sample))

        wf.writeframes(bytes(frames))


def create_als_stub(filepath: Path):
    """Create a minimal .als stub file (just enough to be detected)."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(b"\x1f\x8b" + b"\x00" * 20)


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

            create_als_stub(project_dir / f"{project_name}.als")

            for track_def in tracks:
                filename = track_def[0]
                duration = track_def[1]
                gen_fn = track_def[2]
                args = track_def[3:]
                filepath = export_dir / filename
                samples = gen_fn(duration, *args)
                generate_wav(filepath, samples)
                track_count += 1

    # Generate standalone projects
    print()
    print("  Standalone projects:")
    for project_name, tracks in STANDALONE_PROJECTS.items():
        project_dir = OUTPUT_DIR / f"{project_name} Project"
        export_dir = project_dir / "export-versions"
        print(f"    Project: {project_name}/ ({len(tracks)} tracks)")

        create_als_stub(project_dir / f"{project_name}.als")

        for track_def in tracks:
            filename = track_def[0]
            duration = track_def[1]
            gen_fn = track_def[2]
            args = track_def[3:]
            filepath = export_dir / filename
            samples = gen_fn(duration, *args)
            generate_wav(filepath, samples)
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
