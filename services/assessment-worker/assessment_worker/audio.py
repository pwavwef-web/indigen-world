"""Audio usability measurements.

Measures what can be measured honestly — duration, how much of it is speech
energy, clipping, level — and nothing about accent, dialect or the speaker.
Inexpensive equipment and background noise lower the TECHNICAL score a
little and are explained; they never reject a recording. Speech presence is
an energy measure, not speech recognition: a validator listens before
deciding, and verified aligned duration (the effort unit) is confirmed by the
validator, never taken from this measurement alone.

PCM WAV is read with the standard library. Other formats are decoded with
ffmpeg when one is available (imageio-ffmpeg ships a binary in production);
without it the result says "unavailable" and routes to a validator.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

MAX_BYTES = 200 * 1024 * 1024
MAX_SECONDS = 30 * 60
FRAME_SECONDS = 0.03


def _ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 — absence is a stated outcome, not an error
        return None


def _read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as w:
        channels, width, rate, count = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        if count / max(rate, 1) > MAX_SECONDS:
            raise ValueError("too-long")
        raw = w.readframes(count)
    if width == 1:
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128) / 128
    elif width == 2:
        data = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        ints = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        ints = np.where(ints & 0x800000, ints - 0x1000000, ints)
        data = ints.astype(np.float64) / 8388608
    elif width == 4:
        data = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648
    else:
        raise ValueError("unsupported-sample-width")
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, rate


def decode(path: str) -> tuple[np.ndarray, int]:
    try:
        return _read_wav(path)
    except (wave.Error, EOFError):
        pass
    exe = _ffmpeg()
    if not exe:
        raise ValueError("no-decoder")
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "decoded.wav")
        subprocess.run([exe, "-nostdin", "-v", "error", "-i", path, "-t", str(MAX_SECONDS + 1), "-ac", "1", "-ar", "16000", "-f", "wav", out],
                       check=True, timeout=120, capture_output=True)
        return _read_wav(out)


def analyse(path: str) -> dict:
    size = os.path.getsize(path)
    if size > MAX_BYTES:
        return {"status": "issues", "durationSeconds": None, "speechSeconds": None, "clippingRatio": None, "silenceRatio": None,
                "notes": [f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB and was not analysed."], "score": None}
    try:
        samples, rate = decode(path)
    except ValueError as error:
        reason = {"too-long": f"Longer than {MAX_SECONDS // 60} minutes.", "no-decoder": "No decoder is available for this format here.",
                  "unsupported-sample-width": "Unsupported WAV sample format."}.get(str(error), "The audio could not be decoded.")
        return {"status": "unavailable", "durationSeconds": None, "speechSeconds": None, "clippingRatio": None, "silenceRatio": None, "notes": [reason], "score": None}
    except (subprocess.SubprocessError, OSError):
        return {"status": "unavailable", "durationSeconds": None, "speechSeconds": None, "clippingRatio": None, "silenceRatio": None,
                "notes": ["The audio could not be decoded."], "score": None}
    return measure(samples, rate)


def measure(samples: np.ndarray, rate: int) -> dict:
    duration = len(samples) / rate if rate else 0.0
    notes: list[str] = []
    if duration <= 0:
        return {"status": "issues", "durationSeconds": 0.0, "speechSeconds": 0.0, "clippingRatio": 0.0, "silenceRatio": 1.0,
                "notes": ["The recording is empty."], "score": 10}
    frame = max(1, int(rate * FRAME_SECONDS))
    usable = samples[: len(samples) // frame * frame].reshape(-1, frame) if len(samples) >= frame else samples.reshape(1, -1)
    rms = np.sqrt(np.mean(usable ** 2, axis=1)) + 1e-12
    db = 20 * np.log10(rms)
    floor = float(np.percentile(db, 10))
    speech = (db > max(floor + 12, -50))
    speech_seconds = float(speech.sum() * frame / rate)
    clipping = float(np.mean(np.abs(samples) >= 0.999))
    peak = float(20 * np.log10(np.max(np.abs(samples)) + 1e-12))
    silence = 1 - speech_seconds / duration
    score = 90
    if speech_seconds < 0.5:
        notes.append("Little or no speech energy was detected. A validator should listen before deciding.")
        score = 30
    if clipping > 0.005:
        notes.append(f"About {clipping:.1%} of samples are clipped (distorted at full volume).")
        score -= 20
    if peak < -30:
        notes.append("The recording is very quiet.")
        score -= 15
    if silence > 0.6 and speech_seconds >= 0.5:
        notes.append("Most of the file is silence or background; only speech counts towards effort.")
    if floor > -35:
        notes.append("Background noise is noticeable. This is noted, not penalised beyond the technical score.")
        score -= 5
    status = "usable" if score >= 70 else "issues"
    return {"status": status, "durationSeconds": round(duration, 2), "speechSeconds": round(speech_seconds, 2),
            "clippingRatio": round(clipping, 5), "silenceRatio": round(max(0.0, min(1.0, silence)), 3), "notes": notes, "score": max(0, score)}
