"""Gera audio/vinheta-dinamica.mp3: a vinheta "Faça Amigos" que avisa que a dinâmica vai começar na TV do salão.

O gancho tem a métrica do nome (Fa-ça a-MI-gos = 5 notas, acento na 4ª), marimba de madeira, brilho final e um
estalinho de bolha de chiclete. Segurança sensorial: ataque suave (>= 8 ms), pico em -6 dBFS, ~5 s.
Precisa de numpy e do ffmpeg no PATH:  python scripts/generate-vinheta.py
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "audio" / "vinheta-dinamica.mp3"
BPM = 126
NOTE = {"C5": 523.25, "E5": 659.25, "G5": 783.99, "C6": 1046.5, "E6": 1318.51, "G6": 1567.98}
# (posição em colcheias, duração em colcheias, nota)
HOOK = [(0, 1, "C5"), (1, 1, "C5"), (2, 1, "E5"), (3, 2, "G5"), (5, 3, "C6"), (8.5, 0.5, "E6"), (9, 0.5, "G6")]


def marimba(f, dur):
    t = np.arange(int(SR * dur)) / SR
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5)
         + 0.38 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 16)
         + 0.10 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 34))
    att = int(SR * 0.008)
    s[:att] *= np.linspace(0, 1, att)
    return s


def pop():
    t = np.arange(int(SR * 0.09)) / SR
    f = 900 * np.exp(-t * 18) + 200
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * 0.35


def render():
    e = 60 / BPM / 2
    buf = np.zeros(int(SR * (max(a * e + d for a, d, _ in HOOK) + 1.2)))
    for at, d, name in HOOK:
        s = marimba(NOTE[name], d + 1.2)
        i = int(SR * at * e)
        buf[i:i + len(s)] += s[:len(buf) - i]
    end = int(SR * (max(a * e for a, _, _ in HOOK) + 0.55))
    p = pop()
    buf[end:end + len(p)] += p
    for delay, g in ((0.16, 0.28), (0.32, 0.14)):  # eco curto, para dar calor
        k = int(SR * delay)
        buf[k:] += buf[:-k] * g
    buf *= 0.5 / np.max(np.abs(buf))
    fade = int(SR * 0.25)
    buf[-fade:] *= np.linspace(1, 0, fade)
    return buf


def main():
    wav = OUT.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((render() * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "96k", str(OUT)], check=True)
    wav.unlink()
    print("ok:", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
