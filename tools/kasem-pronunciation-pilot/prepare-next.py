"""Select an explicit set of further public, unvoiced entries for listening review."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from prepare import plain, PROJECT

GROUPS = {
    "Everyday words": [(w, "Navrongo") for w in
        ["dane", "diim", "Kukura", "boŋo", "Asibiti", "done", "Nazwono", "Kukua", "Sa", "bene"]],
    "Nature and the world": [(w, "Ghana Kasem") for w in
        ["tio", "teeni", "ywona", "vara", "zuna", "bia", "naneo", "logo", "lim", "pwooni"]],
    "Actions": [(w, "Ghana Kasem") for w in
        ["pae", "nii", "kwei", "taa", "bere", "puli", "kare", "jaane", "tiŋi", "tigisi"]],
    "Time, numbers and more": [(w, "Ghana Kasem") for w in
        ["bena", "chane", "yadɛ", "te-pwoŋa", "tetare", "jeŋa", "siu", "ŋwea", "yana", "yaredo"]],
}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--exclude", type=Path, action="append", required=True,
                        help="Earlier manifest to exclude; repeat for every prior batch")
    parser.add_argument("--selection", type=Path, help="JSON mapping group names to [headword, dialect] pairs")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Use a new source sample path")
    excluded = {e["entryId"] for path in args.exclude
                for e in json.loads(path.read_text(encoding="utf-8"))["entries"]}
    groups = json.loads(args.selection.read_text(encoding="utf-8")) if args.selection else GROUPS
    if not isinstance(groups, dict) or not groups:
        raise SystemExit("Selection must contain named groups")
    selections_flat = []
    for group, pairs in groups.items():
        if not isinstance(group, str) or not group or not isinstance(pairs, list):
            raise SystemExit("Invalid selection group")
        for pair in pairs:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2 or not all(isinstance(v, str) and v.strip() for v in pair):
                raise SystemExit("Each selection needs an exact headword and dialect")
            selections_flat.append(tuple(pair))
    if not 1 <= len(selections_flat) <= 60 or len(set(selections_flat)) != len(selections_flat):
        raise SystemExit("Select 1–60 distinct headword/dialect pairs")
    response = json.loads(args.snapshot.read_text(encoding="utf-8-sig"))
    docs = [r["document"] for r in response if "document" in r]
    if len(docs) >= 2000:
        raise SystemExit("Snapshot query limit reached")
    entries = []
    for doc in docs:
        f = {k: plain(v) for k, v in doc["fields"].items()}
        if not doc["name"].startswith(f"projects/{PROJECT}/databases/(default)/documents/dictionaryEntries/") or f.get("isPublished") is not True:
            raise SystemExit("Wrong project or non-public entry")
        entries.append({"entryId": doc["name"].rsplit("/", 1)[-1], "documentPath": doc["name"],
            "sourceUpdateTime": doc.get("updateTime"), "headword": f.get("kasemText") or f.get("headword") or "",
            "meaning": f.get("englishText") or f.get("translation") or "", "dialect": f.get("dialect") or "Not recorded",
            "partOfSpeech": f.get("partOfSpeech") or "Not recorded", "attribution": f.get("attribution") or "Not recorded in the public entry",
            "authenticationStatus": f.get("authenticationStatus") or "Not recorded", "isPublished": True,
            "existingAudio": bool(f.get("audioUrl") or f.get("pronunciationAudioUrl"))})
    selected = []
    for group, selections in groups.items():
        for word, dialect in selections:
            matches = [e for e in entries if e["headword"] == word and e["dialect"] == dialect
                and e["entryId"] not in excluded and not e["existingAudio"]]
            if len(matches) != 1:
                raise SystemExit(f"Expected one unvoiced, new entry for {word!r} / {dialect}: {len(matches)}")
            selected.append({**matches[0], "group": group, "status": "awaiting_generation"})
    sample = {"schemaVersion": 1, "preparedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"projectId": PROJECT, "collection": "dictionaryEntries", "filter": "isPublished == true",
            "publishedEntriesRead": len(docs), "readTimes": sorted({r["readTime"] for r in response if "readTime" in r}),
            "snapshotFile": args.snapshot.name},
        "selection": f"{len(selected)} further words; all supplied earlier trial IDs excluded. Purposive sample, not an accuracy estimate.",
        "textPolicy": "Keep original source fields; NFC normalization and lowercase only for synthesis. No respelling.",
        "excludedEntryIds": sorted(excluded), "entries": selected}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Selected {len(selected)} new words from {len(docs)} public entries")


if __name__ == "__main__":
    main()
