"""Generate a bounded Gemini TTS comparison; no publishing or Firebase writes.

Only public headwords and their public meaning/dialect context go to Google.
GEMINI_API_KEY is read from the environment and never stored in artifacts.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
import wave
from datetime import datetime, timezone

ENGINES = {
    "gemini38": {"id": "gemini-3.8-flash-tts", "label": "Gemini 3.8 Flash TTS", "voice": "Kore"},
    "gemini25": {"id": "gemini-2.5-pro-preview-tts", "label": "Gemini 2.5 Pro TTS", "voice": "Kore"},
}
API = "https://generativelanguage.googleapis.com/v1beta/"
RATE_LOCKS = {engine: threading.Lock() for engine in ENGINES}
NEXT_CALL = {engine: 0.0 for engine in ENGINES}
QUOTA_STOP = {engine: threading.Event() for engine in ENGINES}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def audio_checks(data):
    with wave.open(io.BytesIO(data), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getcomptype() != "NONE":
            raise ValueError("Expected mono uncompressed PCM16 WAV")
        rate = audio.getframerate()
        frames = audio.getnframes()
        pcm = audio.readframes(frames)
    if len(pcm) != frames * 2 or not 8000 <= rate <= 96000 or not 0.1 <= frames / rate <= 15:
        raise ValueError("Truncated WAV or unexpected sample rate/duration")
    values = [v[0] / 32768 for v in struct.iter_unpack("<h", pcm)]
    peak = max(abs(v) for v in values)
    rms = math.sqrt(sum(v * v for v in values) / len(values))
    clipped = sum(abs(v) >= 32767 / 32768 for v in values) / len(values)
    if peak < 0.005 or rms < 0.0005 or clipped > 0.01:
        raise ValueError("Silent or substantially clipped audio")
    return {"durationSeconds": round(frames / rate, 4), "sampleRate": rate,
            "peak": round(peak, 6), "rms": round(rms, 6), "clippedFraction": clipped,
            "technicalCheck": "passed", "linguisticCheck": "not_assessed"}


def request_for(entry, engine):
    text = unicodedata.normalize("NFC", entry["headword"]).lower()
    style = (
        "Pronounce this single Kasem (Kassem, ISO xsm) dictionary word from northern Ghana. "
        "Clear, natural dictionary pronunciation, preserving Kasem vowel quality, vowel length "
        "and lexical tone. Say only the word once; do not translate, spell letters or add commentary. "
        f"Dictionary meaning for context only: {entry['meaning']}. "
        f"Dictionary variety label for context only: {entry['dialect']}."
    )
    model = ENGINES[engine]
    if engine == "gemini38":
        return API + "interactions", {
            "model": model["id"],
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio", "mime_type": "audio/wav"},
            "generation_config": {"speech_config": [{"voice": model["voice"]}]},
        }, text
    return API + f"models/{model['id']}:generateContent", {
        "contents": [{"role": "user", "parts": [{"text": style + "\n\nSpeak only this word: " + text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": model["voice"]}}}},
    }, text


def decode_response(result, engine):
    if engine == "gemini38":
        if result.get("status") != "completed":
            raise ValueError("Speech interaction did not complete")
        parts = [part for step in result.get("steps", []) if step.get("type") == "model_output"
                 for part in step.get("content", []) if part.get("type") == "audio"]
        if len(parts) != 1 or parts[0].get("mime_type") != "audio/wav":
            raise ValueError("Expected one WAV output")
        return base64.b64decode(parts[0]["data"], validate=True)
    candidates = result.get("candidates", [])
    if len(candidates) != 1 or candidates[0].get("finishReason") != "STOP":
        raise ValueError("Speech generation did not finish normally")
    parts = [p["inlineData"] for p in candidates[0].get("content", {}).get("parts", []) if "inlineData" in p]
    if len(parts) != 1:
        raise ValueError("Expected exactly one audio part")
    part = parts[0]
    data = base64.b64decode(part["data"], validate=True)
    if part["mimeType"] == "audio/wav":
        return data
    match = re.fullmatch(r"audio/(?:L16|pcm);(?:codec=pcm;)?rate=(\d+)", part["mimeType"], re.I)
    if not match or len(data) % 2:
        raise ValueError("Unknown PCM encoding: " + part["mimeType"])
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(int(match[1]))
        wav.writeframes(data)
    return output.getvalue()


def generate_one(entry, index, engine, output, attempt=1):
    url, body, text = request_for(entry, engine)
    candidate = {"candidateId": f"{engine}:{entry['entryId']}", "engine": engine,
        "entryId": entry["entryId"], "inputText": text, "generatedAt": now(),
        "requestSha256": sha(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()),
        "status": "generation_failed", "aiGenerated": True}
    basename = f"{index:02d}-{engine}" + (f"-attempt-{attempt}" if attempt > 1 else "")
    write_json(output / "requests" / f"{basename}.json", {"url": url, "body": body})
    key = os.environ["GEMINI_API_KEY"]
    request = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with RATE_LOCKS[engine]:
            time.sleep(max(0, NEXT_CALL[engine] - time.monotonic()))
            if QUOTA_STOP[engine].is_set():
                candidate["error"] = "HTTP 429: Not attempted after this model reached its quota."
                return candidate
            NEXT_CALL[engine] = time.monotonic() + 8
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        # The unmodified response is retained locally to recover a successful billable call.
        write_json(output / "responses" / f"{basename}.json", result)
        data = decode_response(result, engine)
        checks = audio_checks(data)
        relative = f"audio/{basename}.wav"
        (output / relative).write_bytes(data)
        candidate.update(checks)
        candidate.update({"status": "pending_review", "audioFile": relative,
            "audioSha256": sha(data), "providerResponseId": result.get("id", result.get("responseId")),
            "returnedModel": result.get("model", result.get("modelVersion")),
            "usage": result.get("usage", result.get("usageMetadata"))})
    except urllib.error.HTTPError as error:
        candidate["error"] = f"HTTP {error.code}: " + error.read().decode(errors="replace")[:1800].replace(key, "[REDACTED]")
        if error.code == 429:
            QUOTA_STOP[engine].set()
    except Exception as error:
        candidate["error"] = str(error)[:1800].replace(key, "[REDACTED]")
    print(f"{engine} {index:02d} {entry['headword']}: {candidate['status']}", flush=True)
    return candidate


def build_page(output, manifest):
    embedded = {}
    for entry in manifest["entries"]:
        for candidate in entry["candidates"]:
            if candidate.get("audioFile"):
                data = (output / candidate["audioFile"]).read_bytes()
                if sha(data) != candidate["audioSha256"]:
                    raise ValueError("Recording hash mismatch")
                embedded[candidate["candidateId"]] = "data:audio/wav;base64," + base64.b64encode(data).decode()
    template = Path(__file__).with_name("comparison-template.html").read_text(encoding="utf-8")
    payload = json.dumps({"manifest": manifest, "audio": embedded}, ensure_ascii=False).replace("<", "\\u003c")
    state_script = Path(__file__).with_name("comparison-state.cjs").read_text(encoding="utf-8")
    (output / "review.html").write_text(template.replace("__COMPARISON_STATE__", state_script)
        .replace("__COMPARISON_DATA__", payload), encoding="utf-8")


def finish(output, manifest):
    for entry in manifest["entries"]:
        entry["candidates"].sort(key=lambda c: ["gemini38", "gemini25", "mms"].index(c["engine"]))
    manifest["completedAt"] = now()
    manifest["status"] = "awaiting_human_comparison"
    manifest["counts"] = {engine: {"generated": sum(c["status"] == "pending_review"
        for e in manifest["entries"] for c in e["candidates"] if c["engine"] == engine),
        "failed": sum(c["status"] == "generation_failed"
        for e in manifest["entries"] for c in e["candidates"] if c["engine"] == engine)} for engine in ENGINES}
    write_json(output / "manifest.json", manifest)
    build_page(output, manifest)
    print(json.dumps(manifest["counts"]))
    print("Comparison ready:", output / "review.html")


def retry_rate_limited(output):
    """Recover only requests explicitly rejected by quota; never regenerate a successful clip."""
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    if any(manifest["engines"].get(k) != v for k, v in ENGINES.items()) or manifest.get("published"):
        raise ValueError("Unexpected comparison manifest")
    if manifest["sampleSha256"] != sha((output / "selected-words.json").read_bytes()):
        raise ValueError("Source sample changed")
    build_page(output, manifest)  # Verifies every existing audio hash first.
    jobs_to_run = [(entry, index, c) for index, entry in enumerate(manifest["entries"], 1)
        for c in entry["candidates"] if c["status"] == "generation_failed" and c.get("error", "").startswith("HTTP 429:")]
    if not jobs_to_run:
        raise SystemExit("No rate-limited requests to recover")
    archive = output / ("manifest-before-recovery-" + now().replace(":", "").replace(".", "-") + ".json")
    shutil.copyfile(output / "manifest.json", archive)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(generate_one, entry, index, old["engine"], output,
                 len(old.get("attemptHistory", [])) + 2): (entry, old) for entry, index, old in jobs_to_run}
        for future in concurrent.futures.as_completed(jobs):
            entry, old = jobs[future]
            replacement = future.result()
            replacement["attemptHistory"] = old.get("attemptHistory", []) + [{k: v for k, v in old.items() if k != "attemptHistory"}]
            entry["candidates"][entry["candidates"].index(old)] = replacement
            write_json(output / "manifest.json", manifest)
    finish(output, manifest)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--baseline", type=Path)
    source.add_argument("--words", type=Path, help="New public word sample; generates two models without an MMS baseline")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--retry-rate-limited", action="store_true",
                        help="After the reported cooldown, retry only HTTP 429 requests; preserve all successful audio")
    args = parser.parse_args()
    if args.render_only:
        build_page(args.output, json.loads((args.output / "manifest.json").read_text(encoding="utf-8")))
        return
    if not os.environ.get("GEMINI_API_KEY"):
        raise SystemExit("Set GEMINI_API_KEY in your environment; do not pass a key in a command or file.")
    if args.retry_rate_limited:
        retry_rate_limited(args.output)
        return
    if args.output.exists():
        raise SystemExit("Use a new output directory; existing audio and reviews are never overwritten.")
    if not args.baseline and not args.words:
        raise SystemExit("Provide --baseline or --words")
    words_path = args.baseline / "selected-words.json" if args.baseline else args.words
    words_bytes = words_path.read_bytes()
    sample = json.loads(words_bytes)
    baseline = json.loads((args.baseline / "manifest.json").read_text(encoding="utf-8")) if args.baseline else None
    if not 1 <= len(sample["entries"]) <= 60 or (baseline and baseline["sampleSha256"] != sha(words_bytes)):
        raise SystemExit("Expected 1–60 entries and a matching source hash when using a baseline")
    ids = [entry["entryId"] for entry in sample["entries"]]
    if len(set(ids)) != len(ids) or (baseline and set(ids) != {e["entryId"] for e in baseline["entries"]}):
        raise SystemExit("Source IDs are duplicated or do not match")
    baseline_audio = {}
    for entry in sample["entries"]:
        if entry.get("isPublished") is not True:
            raise SystemExit("Only public dictionary text can be used")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", entry["entryId"]):
            raise SystemExit("Invalid entry ID")
        if not baseline:
            if entry.get("existingAudio") is not False:
                raise SystemExit("New samples must have no existing audio")
            continue
        old = next(e for e in baseline["entries"] if e["entryId"] == entry["entryId"])
        if any(old[k] != entry[k] for k in ["headword", "meaning", "dialect"]):
            raise SystemExit("Baseline text differs")
        path = (args.baseline / old["audioFile"]).resolve()
        if not path.is_relative_to(args.baseline.resolve()):
            raise SystemExit("Baseline audio path escapes its folder")
        data = path.read_bytes()
        if sha(data) != old["audioSha256"]:
            raise SystemExit("Baseline recording has changed")
        audio_checks(data)
        baseline_audio[entry["entryId"]] = (old, data)
    args.output.mkdir(parents=True)
    for folder in ["audio", "requests", "responses"]:
        (args.output / folder).mkdir()
    shutil.copyfile(words_path, args.output / "selected-words.json")
    if baseline:
        shutil.copyfile(args.baseline / "MODEL-CARD.md", args.output / "MMS-MODEL-CARD.md")
    manifest = {"schemaVersion": 2, "batchId": "kasem-comparison-" + now().replace(":", "").replace(".", "-"),
        "createdAt": now(), "sampleSha256": sha(words_bytes), "source": sample["source"],
        "published": False, "submittedForReview": False, "status": "generating",
        "engines": {**ENGINES, **({"mms": {**baseline["model"], "label": "Original Meta MMS"}} if baseline else {})},
        "languageSupport": "Kasem is not listed in Gemini's documented supported languages. Experimental candidates only.",
        "processing": "No resampling, trimming, denoising, gain change or tone correction. Wrap Gemini 2.5 PCM in WAV only.",
        "baselineBatchId": baseline["batchId"] if baseline else None, "entries": []}
    for index, entry in enumerate(sample["entries"], 1):
        if not baseline:
            manifest["entries"].append({**entry, "status": "awaiting_comparison", "candidates": []})
            continue
        old, data = baseline_audio[entry["entryId"]]
        relative = f"audio/{index:02d}-mms.wav"
        (args.output / relative).write_bytes(data)
        manifest["entries"].append({**entry, "status": "awaiting_comparison", "candidates": [{
            "candidateId": "mms:" + entry["entryId"], "engine": "mms", "entryId": entry["entryId"],
            "inputText": old["inputText"], "audioFile": relative, "audioSha256": sha(data),
            "status": "baseline_only", "aiGenerated": True, **audio_checks(data)}]})
    write_json(args.output / "manifest.json", manifest)
    # Two independent calls at a time. No retries, hidden fallbacks or unbounded batches.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(generate_one, entry, index, engine, args.output): entry["entryId"]
                for index, entry in enumerate(sample["entries"], 1) for engine in ENGINES}
        for future in concurrent.futures.as_completed(jobs):
            candidate = future.result()
            next(e for e in manifest["entries"] if e["entryId"] == jobs[future])["candidates"].append(candidate)
            write_json(args.output / "manifest.json", manifest)
    finish(args.output, manifest)


if __name__ == "__main__":
    main()
