"""Optional: word-level timestamps for the song from a local Whisper model.

Gemini hears the words reliably but places them only to within about a second.
Whisper's word timestamps are tighter, so align-lyrics.mjs uses them, when this
file's output exists, to pin each lyric line to the first word it recognised,
and keeps Gemini's consensus for lines Whisper missed.

    python -m pip install faster-whisper
    python apps/website/scripts/beyond-the-reef/whisper-words.py [model]

Writes <work dir>/align/whisper-words.json. Runs on CPU; nothing leaves the machine.
"""
import json
import os
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORK = Path(os.environ.get("BTR_WORK_DIR", REPO / ".tmp" / "beyond-the-reef"))
SOURCE = Path(os.environ.get("BTR_SOURCE_AUDIO", HERE.parents[1] / "public" / "beyond-the-reef" / "audio" / "beyond-the-reef.mp3"))
MODEL = sys.argv[1] if len(sys.argv) > 1 else "medium.en"

out_dir = WORK / "align"
out_dir.mkdir(parents=True, exist_ok=True)

started = time.time()
model = WhisperModel(
    MODEL,
    device="cpu",
    compute_type="int8",
    download_root=os.environ.get("BTR_WHISPER_CACHE") or None,
)
segments, info = model.transcribe(
    str(SOURCE),
    language="en",
    beam_size=5,
    word_timestamps=True,
    vad_filter=False,
    condition_on_previous_text=False,
)

words = []
for segment in segments:
    for word in segment.words or []:
        words.append(
            {
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(word.probability, 3),
            }
        )
    print(f"{segment.start:7.2f}-{segment.end:7.2f} {segment.text.strip()}", flush=True)

target = out_dir / "whisper-words.json"
target.write_text(json.dumps({"model": MODEL, "duration": info.duration, "words": words}, indent=1))
print(f"{len(words)} words in {time.time() - started:.0f}s -> {target}")
