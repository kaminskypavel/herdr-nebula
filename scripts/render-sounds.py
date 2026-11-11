# Renders the notification sounds in mods/nebula/sounds/ (chirp, ping, drop) as 44.1 kHz mono MP3s.
# Usage: uv run --with numpy scripts/render-sounds.py   (needs ffmpeg on PATH or /opt/homebrew/bin)
# chirp is playwriter's Web Audio "success" recipe (extension/src/offscreen.ts), computed offline;
# ping and drop are original. Nothing here samples other audio.
import shutil, subprocess, tempfile, wave
from pathlib import Path
import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "mods" / "nebula" / "sounds"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


def env(n, start, attack, decay, peak):
    # exponential ramp 0.0001 -> peak over attack, then -> 0.0001 over decay, like setValueAtTime + exponentialRamp
    e = np.full(n, 0.0001)
    t = np.arange(n) / SR - start
    up = (t >= 0) & (t < attack)
    dn = (t >= attack) & (t < attack + decay)
    e[up] = 0.0001 * (peak / 0.0001) ** (t[up] / attack)
    e[dn] = peak * (0.0001 / peak) ** ((t[dn] - attack) / decay)
    return e


def shimmer(dry):
    # master -> delay 0.1 s -> lowpass 4500 Hz (RBJ biquad, Q 1) -> x0.22 back into the delay; lowpass -> x0.16 -> out
    w = 2 * np.pi * 4500 / SR
    al, c = np.sin(w) / 2, np.cos(w)
    b0, b1, a0, a1, a2 = (1 - c) / 2, 1 - c, 1 + al, -2 * c, 1 - al
    d = int(0.1 * SR)
    din, lp = np.zeros(len(dry)), np.zeros(len(dry))
    for n in range(d, len(dry)):
        din[n] = dry[n - d] + 0.22 * lp[n - d]
        lp[n] = (b0 * (din[n] + (din[n - 2] if n > 1 else 0)) + b1 * din[n - 1] - a1 * lp[n - 1] - a2 * lp[n - 2]) / a0
    return lp


def chirp():
    n = int(SR * 1.6)
    t = np.arange(n) / SR
    dry = np.zeros(n)
    for freq, off, atk, dec, peak in [(880, 0, 0.004, 0.09, 0.06), (1108.73, 0.06, 0.004, 0.1, 0.06), (1318.51, 0.12, 0.004, 0.18, 0.07)]:
        dur = atk + dec + 0.05
        on = (t >= off) & (t < off + dur)
        dry += np.where(on, np.sin(2 * np.pi * freq * (t - off)), 0) * env(n, off, atk, dec, peak)
    dry *= 0.5  # master gain
    return (dry + 0.16 * shimmer(dry)) * 4  # output gain


def ping():
    t = np.arange(int(SR * 0.9)) / SR
    return np.sin(2 * np.pi * 1760 * t) * env(len(t), 0, 0.005, 0.6, 1) + 0.15 * np.sin(2 * np.pi * 3520 * t) * env(len(t), 0, 0.003, 0.2, 1)


def drop():
    t = np.arange(int(SR * 0.4)) / SR
    freq = 900 * (320 / 900) ** np.minimum(t / 0.22, 1)  # exponential glide down, then holds
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(len(t), 0, 0.004, 0.3, 1)


def write(name, x):
    x = x[: np.nonzero(np.abs(x) > 0.001 * np.abs(x).max())[0][-1] + 1]  # trim the tail below -60 dB
    x = x * (0.85 / np.abs(x).max())  # loud enough, no clipping
    x[-441:] *= np.linspace(1, 0, 441)  # 10 ms fade so the cut cannot click
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((x * 32767).astype("<i2").tobytes())
        OUT.mkdir(parents=True, exist_ok=True)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-ar", str(SR), "-ac", "1", "-b:a", "96k", str(OUT / f"{name}.mp3")], check=True)
    print(f"{name}: {len(x) / SR:.2f}s")


for name, fn in [("chirp", chirp), ("ping", ping), ("drop", drop)]:
    write(name, fn())
