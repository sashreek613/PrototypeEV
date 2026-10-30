#!/usr/bin/env python3
"""Generate Kannada/Hindi locale files for the VidyutOne driver app.

Standalone, manually-run script -- NOT imported by the FastAPI backend or by
the frontend build. This is the only place a Gemini translation call happens
anywhere in this project. Nothing in a driver's request path ever calls
Gemini: the frontend only ever reads the committed frontend/src/locales/*.json
files (see frontend/src/i18n/index.tsx).

Usage:
    GEMINI_API_KEY=... python tools/gen_locales.py --lang kn
    GEMINI_API_KEY=... python tools/gen_locales.py --lang hi
    GEMINI_API_KEY=... python tools/gen_locales.py --lang all

    Or skip the env var entirely: paste the key into backend/.env as
    GEMINI_API_KEY=... (gitignored, never committed) and just run
    `python tools/gen_locales.py --lang kn` -- see
    read_gemini_key_from_backend_env() below. The env var wins if both are set.

What it does, per language:
  1. Reads frontend/src/locales/en.json (source of truth: key -> {text,
     context, max_chars?}).
  2. Skips any key a human has already approved for this language (see
     "Idempotency / human approval" below) -- those are neither re-sent to
     Gemini nor overwritten.
  3. Sends every remaining key to Gemini in ONE request (model pinned to
     gemini-3.5-flash, temperature=0, structured JSON output per
     tools/prompts.py's LOCALE_SCHEMA).
  4. Writes frontend/src/locales/<lang>.json -- flat key -> translated
     string, no metadata, since this file is fetched by the browser.
  5. Writes frontend/src/locales/_review_<lang>.md -- a table a native
     speaker reads to approve the output: key, English source, translation,
     back-translation, and an over_budget flag. Sorted so the strings most
     likely to be wrong come first: fee/penalty strings, then buttons/chips
     with a character budget, then everything else.
  6. Writes frontend/src/locales/_state.<lang>.json -- the approval-tracking
     sidecar described below. Not read by the frontend.

Idempotency / human approval
-----------------------------
Decided for this project (documented here rather than invented silently):
each language has a sidecar _state.<lang>.json of
    { "<key>": { "source_hash": "<sha256 of the en.json text>",
                 "approved": true | false } }
A key is skipped on the next run (translation in <lang>.json left exactly as
it is, never re-sent to Gemini) only when BOTH:
  - state[key].approved is true, AND
  - state[key].source_hash still matches the current en.json text for that
    key (so editing the English source un-skips it automatically).
Freshly machine-translated keys are written with approved: false. A human
approves a string -- after optionally hand-editing its value directly in
<lang>.json -- by flipping that key's "approved" to true in
_state.<lang>.json. There is no CLI flag for this on purpose: approval is a
one-line JSON edit a reviewer makes while reading _review_<lang>.md, not a
workflow this script should own.

A key removed from en.json is pruned from <lang>.json and _state.<lang>.json
on the next run for that language, so stale strings don't linger forever.

Fails loudly
------------
Any API error, HTTP status != 200, unparseable JSON, or a response that
doesn't match LOCALE_SCHEMA (wrong count, missing keys, key order mismatch)
raises and exits non-zero with the reason. Nothing is written to disk unless
every check for that language passes -- outputs are built fully in memory
first, then written via a temp-file-plus-replace so a crash mid-write can
never leave a half-written file either.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompts import LANGUAGE_NAMES, LOCALE_SCHEMA, LOCALE_SYSTEM, LOCALE_USER  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = REPO_ROOT / "frontend" / "src" / "locales"
EN_JSON = LOCALES_DIR / "en.json"

MODEL = "gemini-3.5-flash"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
REQUEST_TIMEOUT_SECONDS = 180


class GenLocalesError(Exception):
    """Raised for any failure that should abort with a non-zero exit and no
    partial writes. Caught only at main()."""


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        raise GenLocalesError(f"{path} is not valid JSON: {exc}") from exc


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp_path, path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def call_gemini(api_key: str, language: str, batch: list[tuple[str, dict[str, Any]]]) -> list[dict[str, str]]:
    """One request, the whole batch. Returns a list of {key, text,
    back_translation} dicts in the SAME ORDER as `batch`. Raises
    GenLocalesError on any failure -- network, non-200, bad JSON, or a
    response shape that doesn't match LOCALE_SCHEMA / doesn't line up
    positionally with the request."""
    strings_payload = [
        {
            "key": key,
            "text": entry["text"],
            "context": entry.get("context", ""),
            **({"max_chars": entry["max_chars"]} if "max_chars" in entry else {}),
        }
        for key, entry in batch
    ]

    system_text = LOCALE_SYSTEM.format(language=language)
    user_text = LOCALE_USER.format(
        count=len(batch),
        language=language,
        strings_json=json.dumps(strings_payload, ensure_ascii=False, indent=2),
    )

    request_body = {
        "system_instruction": {"parts": [{"text": system_text}]},
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": LOCALE_SCHEMA,
        },
    }

    req = urllib.request.Request(
        f"{API_URL}?key={api_key}",
        data=json.dumps(request_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GenLocalesError(f"Gemini API returned HTTP {exc.code} for {language}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise GenLocalesError(f"Could not reach Gemini API for {language}: {exc.reason}") from exc

    if status != 200:
        raise GenLocalesError(f"Gemini API returned unexpected status {status} for {language}")

    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GenLocalesError(f"Gemini API response for {language} was not valid JSON: {exc}") from exc

    candidates = body.get("candidates") or []
    if not candidates:
        raise GenLocalesError(f"Gemini API returned no candidates for {language}. Full response: {body}")

    parts = candidates[0].get("content", {}).get("parts") or []
    if not parts or "text" not in parts[0]:
        raise GenLocalesError(f"Gemini API candidate for {language} had no text part. Full response: {body}")

    try:
        payload = json.loads(parts[0]["text"])
    except json.JSONDecodeError as exc:
        raise GenLocalesError(
            f"Gemini API's structured output for {language} was not valid JSON: {exc}\nRaw text: {parts[0]['text'][:2000]}"
        ) from exc

    translations = payload.get("translations")
    if not isinstance(translations, list):
        raise GenLocalesError(f"Gemini API response for {language} is missing a 'translations' array. Got: {payload}")

    if len(translations) != len(batch):
        raise GenLocalesError(
            f"Gemini API returned {len(translations)} translations for {language}, expected {len(batch)} "
            "(the full batch, in order). Refusing to guess which ones are missing."
        )

    for i, (item, (expected_key, _entry)) in enumerate(zip(translations, batch)):
        for field in ("key", "text", "back_translation"):
            if field not in item or not isinstance(item[field], str):
                raise GenLocalesError(f"Gemini API response for {language}, item {i}: missing or non-string '{field}'. Got: {item}")
        if item["key"] != expected_key:
            raise GenLocalesError(
                f"Gemini API response for {language}, item {i}: key mismatch -- expected '{expected_key}', "
                f"got '{item['key']}'. The response must echo keys back in request order."
            )

    return translations


# --- Review-file ordering -------------------------------------------------
# Heuristic only, to help a reviewer triage: fee/cancellation/error/warning
# strings first (highest cost if mistranslated), then space-constrained
# button/chip/badge labels, then everything else. Order within each group
# follows en.json's own key order.
_FEE_PENALTY_MARKERS = (
    "cancel", "delete", "error", "penalty", "fee", "denied", "released",
    "confirm_delete", "refund", "no_show", "failed", "warn",
)


def classify_for_review(key: str, entry: dict[str, Any]) -> int:
    lowered = key.lower()
    if any(marker in lowered for marker in _FEE_PENALTY_MARKERS):
        return 0
    if "max_chars" in entry:
        return 1
    return 2


def build_review_markdown(language_name: str, lang: str, en: dict[str, Any], translations_by_key: dict[str, dict[str, str]], skipped_keys: set[str]) -> str:
    rows = []
    for key, entry in en.items():
        group = classify_for_review(key, entry)
        translated = translations_by_key.get(key)
        rows.append((group, key, entry, translated))
    rows.sort(key=lambda r: (r[0], list(en.keys()).index(r[1])))

    lines = [
        f"# {language_name} ({lang}) locale review",
        "",
        "Generated by `tools/gen_locales.py`. Sorted with the strings most likely to be wrong first: "
        "fee/cancellation/error/warning copy, then buttons/chips with a character budget, then everything else.",
        "",
        "To approve a row: confirm the translation reads correctly (edit the value directly in "
        f"`{lang}.json` if it needs a fix), then set `\"approved\": true` for that key in `_state.{lang}.json`. "
        "Approved keys are left untouched on the next generation run.",
        "",
        "| Key | Skipped (human-approved) | English source | Translation | Back-translation | Over budget? |",
        "|---|---|---|---|---|---|",
    ]

    def esc(s: str) -> str:
        return s.replace("|", "\\|").replace("\n", " ")

    for _group, key, entry, translated in rows:
        skipped = key in skipped_keys
        max_chars = entry.get("max_chars")
        if translated is None:
            translation_cell = "*(skipped -- see _state file)*" if skipped else "**MISSING**"
            back_cell = ""
            over_budget = ""
        else:
            translation_cell = esc(translated["text"])
            back_cell = esc(translated["back_translation"])
            if max_chars is not None:
                over_budget = "⚠️ yes" if len(translated["text"]) > max_chars else "no"
            else:
                over_budget = ""
        budget_note = f" (max {max_chars} chars)" if max_chars is not None else ""
        lines.append(
            f"| `{key}` | {'yes' if skipped else ''} | {esc(entry['text'])}{budget_note} | {translation_cell} | {back_cell} | {over_budget} |"
        )

    lines.append("")
    return "\n".join(lines)


def generate_for_language(lang: str, api_key: str) -> None:
    language_name = LANGUAGE_NAMES[lang]
    en = load_json(EN_JSON)
    if not en:
        raise GenLocalesError(f"{EN_JSON} is empty or missing -- nothing to translate.")

    lang_json_path = LOCALES_DIR / f"{lang}.json"
    state_path = LOCALES_DIR / f"_state.{lang}.json"
    review_path = LOCALES_DIR / f"_review_{lang}.md"

    existing_translations = load_json(lang_json_path)
    existing_state = load_json(state_path)

    batch: list[tuple[str, dict[str, Any]]] = []
    skipped_keys: set[str] = set()
    for key, entry in en.items():
        state_entry = existing_state.get(key)
        current_hash = source_hash(entry["text"])
        if state_entry and state_entry.get("approved") and state_entry.get("source_hash") == current_hash and key in existing_translations:
            skipped_keys.add(key)
            continue
        batch.append((key, entry))

    translations_by_key: dict[str, dict[str, str]] = {
        key: {"text": existing_translations[key], "back_translation": "(approved -- not re-requested)"}
        for key in skipped_keys
    }

    if batch:
        print(f"[{lang}] translating {len(batch)} strings ({len(skipped_keys)} already approved, skipped)...")
        results = call_gemini(api_key, language_name, batch)
        for item in results:
            translations_by_key[item["key"]] = {"text": item["text"], "back_translation": item["back_translation"]}
    else:
        print(f"[{lang}] nothing to translate -- all {len(skipped_keys)} keys already approved.")

    # Build outputs fully in memory before touching disk.
    new_lang_json = {key: translations_by_key[key]["text"] for key in en if key in translations_by_key}

    new_state = {}
    for key, entry in en.items():
        current_hash = source_hash(entry["text"])
        if key in skipped_keys:
            new_state[key] = existing_state[key]
        elif key in translations_by_key:
            new_state[key] = {"source_hash": current_hash, "approved": False}

    review_md = build_review_markdown(language_name, lang, en, translations_by_key, skipped_keys)

    missing = [key for key in en if key not in new_lang_json]
    if missing:
        raise GenLocalesError(f"[{lang}] internal error: {len(missing)} keys have no translation after generation (first: {missing[0]!r}). Refusing to write a partial file.")

    write_json_atomic(lang_json_path, new_lang_json)
    write_json_atomic(state_path, new_state)
    write_text_atomic(review_path, review_md)

    print(f"[{lang}] wrote {lang_json_path.relative_to(REPO_ROOT)}, {state_path.relative_to(REPO_ROOT)}, {review_path.relative_to(REPO_ROOT)}")


def read_gemini_key_from_backend_env() -> str:
    """Fallback only: os.environ wins if GEMINI_API_KEY is already set there.
    Otherwise, look for a GEMINI_API_KEY= line in backend/.env, since that's
    where this project's other API keys (OCM_API_KEY, etc.) already live and
    where a human pasting a key by hand would naturally put it. backend/.env
    is gitignored -- never read any other .env file, and never write to this
    one. A minimal line parser, not a real dotenv implementation: good enough
    for "KEY=value" lines, nothing fancier."""
    backend_env = REPO_ROOT / "backend" / ".env"
    if not backend_env.exists():
        return ""
    for line in backend_env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", required=True, choices=["kn", "hi", "all"], help="Target language(s) to generate.")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip() or read_gemini_key_from_backend_env()
    if not api_key:
        print(
            "ERROR: GEMINI_API_KEY is not set. Export it, or paste it into backend/.env as GEMINI_API_KEY=... "
            "(gitignored, never committed).",
            file=sys.stderr,
        )
        return 1

    langs = ["kn", "hi"] if args.lang == "all" else [args.lang]

    try:
        for lang in langs:
            generate_for_language(lang, api_key)
    except GenLocalesError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 -- fail loudly with the real cause, never swallow
        print(f"ERROR: unexpected failure: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
