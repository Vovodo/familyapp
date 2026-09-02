"""Generate loud 16-bit PCM WAVs for in-app playback and Android FCM channels."""
from __future__ import annotations

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100


def clamp(value: float) -> float:
    return max(-1.0, min(1.0, value))


def write_wav(path: str, samples: list[float]) -> None:
    peak = max((abs(s) for s in samples), default=1.0) or 1.0
    gain = 0.92 / peak
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", int(clamp(sample * gain) * 32767)) for sample in samples
        )
        wav_file.writeframes(frames)


def env_exp(t: float, decay: float) -> float:
    return math.exp(-t * decay) if t >= 0 else 0.0


def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)


def generate_heart() -> list[float]:
    duration = 0.7
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n
    chords = [
        (0.00, 523.25),
        (0.07, 659.25),
        (0.14, 783.99),
    ]
    for start, freq in chords:
        for i in range(n):
            t = i / SAMPLE_RATE - start
            if t < 0 or t > 0.28:
                continue
            amp = 0.55 * math.sin(min(1.0, t / 0.03) * math.pi / 2) * env_exp(t, 9)
            samples[i] += amp * (sine(freq, t) + 0.25 * sine(freq * 2, t))
    return samples


def generate_tea() -> list[float]:
    """Spoon stirring tea in a ceramic cup: liquid swirl + metallic clinks."""
    duration = 1.85
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n
    rng = random.Random(42)

    for i in range(n):
        t = i / SAMPLE_RATE
        swirl = 0.12 * (rng.random() * 2 - 1)
        swirl *= 0.45 + 0.55 * math.sin(2 * math.pi * 3.2 * t)
        swirl *= 0.35 + 0.65 * sine(180 + 40 * math.sin(2 * math.pi * 2.4 * t), t)
        fade = min(1.0, t / 0.08) * max(0.0, 1.0 - (t / duration))
        samples[i] += swirl * fade * 0.55

    clink_times = [0.10, 0.28, 0.46, 0.64, 0.82, 1.00, 1.18, 1.36]
    clink_freqs = [2100, 2550, 1980, 2700, 2300, 2850, 2150, 2600]
    for start, base in zip(clink_times, clink_freqs):
        for i in range(n):
            t = i / SAMPLE_RATE - start
            if t < 0 or t > 0.12:
                continue
            ceramic = env_exp(t, 38) * sine(base, t)
            metal = env_exp(t, 55) * sine(base * 1.72, t)
            click = env_exp(t, 90) * sine(base * 2.35, t)
            samples[i] += 0.72 * ceramic + 0.38 * metal + 0.22 * click
    return samples


def generate_car_horn() -> list[float]:
    duration = 0.55
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n

    def beep(start: float, length: float) -> None:
        for i in range(n):
            t = i / SAMPLE_RATE - start
            if t < 0 or t > length:
                continue
            attack = min(1.0, t / 0.018)
            release = min(1.0, (length - t) / 0.03)
            amp = 0.62 * attack * release
            tone = sine(440, t) + 0.7 * sine(554.37, t) + 0.18 * sine(880, t)
            samples[i] += amp * tone

    beep(0.00, 0.14)
    beep(0.20, 0.16)
    return samples


def generate_meal() -> list[float]:
    """Dinner / service bell: three resonant strikes with inharmonic partials."""
    duration = 2.4
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n
    fundamental = 784.0  # G5
    ratios = [1.0, 2.0, 2.76, 3.87, 5.04]
    decays = [4.2, 5.5, 6.8, 8.5, 11.0]
    amps = [0.72, 0.42, 0.28, 0.18, 0.12]
    strikes = [0.00, 0.55, 1.10]

    for start in strikes:
        for i in range(n):
            t = i / SAMPLE_RATE - start
            if t < 0 or t > 1.15:
                continue
            strike = min(1.0, t / 0.004)
            tone = 0.0
            for ratio, decay, amp in zip(ratios, decays, amps):
                tone += amp * env_exp(t, decay) * sine(fundamental * ratio, t)
            samples[i] += 0.85 * strike * tone
    return samples


def generate_poke() -> list[float]:
    duration = 0.32
    n = int(SAMPLE_RATE * duration)
    samples = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 700 - 220 * abs(math.sin(2 * math.pi * 10 * t))
        amp = 0.55 * max(0.0, 1.0 - t / 0.24)
        samples[i] = amp * math.sin(2 * math.pi * freq * t)
    return samples


def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.dirname(script_dir)
    targets = [
        os.path.join(frontend_dir, "public", "sounds"),
        os.path.join(frontend_dir, "android", "app", "src", "main", "res", "raw"),
    ]
    sounds = {
        "heart.wav": generate_heart(),
        "tea.wav": generate_tea(),
        "car_horn.wav": generate_car_horn(),
        "meal.wav": generate_meal(),
        "poke.wav": generate_poke(),
    }
    for folder in targets:
        for name, samples in sounds.items():
            path = os.path.join(folder, name)
            write_wav(path, samples)
            print(f"Wrote {path}")


if __name__ == "__main__":
    main()
