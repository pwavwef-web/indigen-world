"""Generate a local listening pack. This script has no publishing capability."""
import argparse
import base64
import csv
import hashlib
import importlib.metadata
import json
import shutil
import sys
import unicodedata
import wave
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "facebook/mms-tts-xsm"
REVISION = "66f057a40a0a00e15bddb0f09edc1a94eb32e30d"
SEED = 20260926


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--words", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Output directory already exists; use a new folder to preserve earlier audio and reviews.")

    print("Loading the local speech runtime...", flush=True)
    import numpy as np
    import torch
    print(f"PyTorch {torch.__version__} loaded; loading VITS...", flush=True)
    from transformers import VitsModel, VitsTokenizer, set_seed

    words_bytes = args.words.read_bytes()
    sample = json.loads(words_bytes)
    if len(sample["entries"]) != 28:
        raise SystemExit("This pilot expects exactly 28 selected entries.")
    metadata = args.model_dir / ".cache/huggingface/download/model.safetensors.metadata"
    if not metadata.exists() or metadata.read_text(encoding="utf-8").splitlines()[0] != REVISION:
        raise SystemExit("Download the pinned revision with hf download; model provenance could not be verified.")
    print("Loading the pinned Kasem tokenizer and weights...", flush=True)
    tokenizer = VitsTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    model = VitsModel.from_pretrained(args.model_dir, local_files_only=True, use_safetensors=True).eval()
    torch.set_num_threads(4)
    vocab = tokenizer.get_vocab()
    prepared = []
    for entry in sample["entries"]:
        text = unicodedata.normalize("NFC", entry["headword"]).lower()
        unsupported = sorted(set(text) - set(vocab))
        if unsupported:
            raise SystemExit(f"Unsupported characters in {entry['headword']!r}: {unsupported}. Do not silently respell.")
        inputs = tokenizer(text, return_tensors="pt")
        tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0].tolist())
        reconstructed = "".join(token for token in tokens if token != tokenizer.pad_token)
        if reconstructed != text:
            raise SystemExit(f"Tokenizer changed {text!r} into {reconstructed!r}.")
        prepared.append((entry, text, inputs))

    print("All 28 words preserve every input character. Generating audio...", flush=True)
    args.output.mkdir(parents=True)
    (args.output / "audio").mkdir()
    rate = model.config.sampling_rate
    rows = []
    embedded_audio = {}
    for index, (entry, text, inputs) in enumerate(prepared, 1):
        set_seed(SEED)
        with torch.inference_mode():
            waveform = model(**inputs).waveform[0].cpu().numpy()
        peak = float(np.abs(waveform).max())
        rms = float(np.sqrt(np.mean(waveform ** 2)))
        seconds = len(waveform) / rate
        if not np.isfinite(waveform).all() or peak < 0.005 or rms < 0.0005 or not 0.1 <= seconds <= 15:
            raise RuntimeError(f"Audio sanity check failed for {entry['headword']}: {seconds=}, {peak=}, {rms=}")
        gain = min(1.0, 0.95 / peak)
        padded = np.concatenate([np.zeros(round(rate * 0.15)), waveform * gain, np.zeros(round(rate * 0.25))])
        pcm = np.round(padded * 32767).astype("<i2")
        relative = f"audio/{index:02d}-{entry['entryId']}.wav"
        path = args.output / relative
        with wave.open(str(path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes(pcm.tobytes())
        audio_bytes = path.read_bytes()
        rows.append({**entry, "status": "pending_review", "inputText": text,
                     "audioFile": relative, "audioSha256": digest(audio_bytes),
                     "durationSeconds": round(len(pcm) / rate, 3),
                     "rawDurationSeconds": round(seconds, 3), "rawPeak": peak, "rawRms": rms,
                     "gain": gain, "sampleRate": rate, "seed": SEED})
        embedded_audio[entry["entryId"]] = "data:audio/wav;base64," + base64.b64encode(audio_bytes).decode("ascii")
        print(f"{index:02d}/28 {entry['headword']} → {seconds:.2f}s", flush=True)

    manifest = {
        "schemaVersion": 1, "batchId": "kasem-tts-" + digest(words_bytes)[:12],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "awaiting_human_review", "published": False,
        "model": {"id": MODEL_ID, "revision": REVISION, "license": "CC-BY-NC-4.0",
                  "modelCard": f"https://huggingface.co/{MODEL_ID}",
                  "weightsSha256": digest((args.model_dir / "model.safetensors").read_bytes()),
                  "tokenizerSha256": digest((args.model_dir / "vocab.json").read_bytes())},
        "runtime": {name: importlib.metadata.version(name) for name in ["torch", "transformers", "numpy", "huggingface-hub"]},
        "generation": {"seed": SEED, "device": "cpu", "threads": 4,
                       "speakingRate": model.speaking_rate, "noiseScale": model.noise_scale,
                       "noiseScaleDuration": model.noise_scale_duration},
        "source": sample["source"], "sampleSha256": digest(words_bytes),
        "selection": sample["selection"], "textPolicy": sample["textPolicy"],
        "audioProcessing": "Mono PCM16 WAV. Add 150 ms leading and 250 ms trailing silence. Attenuate only if raw peak exceeds 0.95; no pronunciation correction or denoising.",
        "entries": rows,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copyfile(args.words, args.output / "selected-words.json")
    shutil.copyfile(args.model_dir / "README.md", args.output / "MODEL-CARD.md")
    review_fields = ["entryId", "headword", "meaning", "dialect", "audioFile", "audioSha256",
                     "decision", "tone", "vowels", "consonants", "dialectFit", "notes", "reviewer"]
    with (args.output / "review-sheet.csv").open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=review_fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "decision": "pending"})
    template = Path(__file__).with_name("review-template.html").read_text(encoding="utf-8")
    page_data = json.dumps({"manifest": manifest, "audio": embedded_audio}, ensure_ascii=False).replace("<", "\\u003c")
    (args.output / "review.html").write_text(template.replace("__PILOT_DATA__", page_data), encoding="utf-8")
    instructions = """# Kasem pronunciation trial — 28 words

Open review.html in a browser. Audio is included in that file, so it also works offline.
Listen, choose Sounds right / Needs recording / Unsure, and add notes on tone,
vowels, consonants and dialect. Use Download review to save your decisions as JSON.
The CSV file is an alternative blank review sheet; the audio folder contains each WAV.
Keep the full folder for provenance. Individual audio hashes bind decisions to exact takes.

These are AI-generated candidates, not verified pronunciations. Published dictionary
text is the source, but publication alone does not prove linguistic accuracy.
Check the displayed meaning, especially entries with several senses. Record the variety
you speak. A sound that works in one variety may need another recording for another.

This is a local evaluation, with no publishing connection. A positive trial decision
does not publish audio. Production use still requires resolving the model's
CC-BY-NC-4.0 terms and a separate integration with the authorised review workflow.

Model: Meta / facebook/mms-tts-xsm
Source: https://huggingface.co/facebook/mms-tts-xsm
Revision: 66f057a40a0a00e15bddb0f09edc1a94eb32e30d
See MODEL-CARD.md and manifest.json for attribution, settings and exact source entry IDs.

Only NFC normalization and lowercasing are applied to input. No spelling substitutions
are made. This model's vocabulary lacks ɩ, ʋ and ə (it has ǝ instead); do not silently
map those letters or apply a Ghana pronunciation to a Burkina entry.

After review, report acceptable / rejected / unsure / unreviewed counts and the recurring
errors. Treat the four accent pairs separately. This deliberately varied sample cannot
establish overall accuracy. Preserve human recordings as the fallback for rejected takes.
"""
    (args.output / "README.md").write_text(instructions, encoding="utf-8")
    print(f"Listening pack complete: {args.output / 'review.html'}", flush=True)


if __name__ == "__main__":
    main()
