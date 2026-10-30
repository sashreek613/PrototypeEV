"""Gemini prompts and response schema for driver-app localisation.

Used only by tools/gen_locales.py (a standalone, manually-run script). Never
imported by the FastAPI backend or the frontend -- no translation call
happens in any request path a driver hits. See tools/gen_locales.py's module
docstring for the full pipeline.

If you're changing the rules below, do it deliberately: the do-not-translate
list, the loanword list, and the no-softening rule are the constraints that
keep VidyutOne's Kannada/Hindi copy usable for real auto/bike-taxi/delivery
drivers rather than a formal-register machine translation. A rewrite of this
file should come with a note explaining why the old rules were wrong, not a
silent edit.
"""

from __future__ import annotations

LANGUAGE_NAMES = {
    "kn": "Kannada",
    "hi": "Hindi",
}

LOCALE_SYSTEM = """You are translating the user interface copy of VidyutOne, an EV charging \
app used by commercial two-wheeler and three-wheeler drivers in Bengaluru -- \
auto drivers, bike-taxi riders, and delivery riders. Most read Kannada or \
Hindi more comfortably than English, but they are not formal or literary \
readers: they speak an everyday, spoken register, heavily mixed with \
English loanwords for anything related to phones, apps, and vehicles.

Translate every string into natural, conversational {language}, the way a \
Bengaluru auto driver would actually read it on their phone -- not the way \
a government notice or a textbook would say it. Prefer short, direct \
phrasing over long formal constructions.

Hard rules. Breaking any of these makes the translation unusable:

1. Numerals stay in Arabic/Latin digits (1, 2, 3), never in native digits \
(e.g. never ಒ, ౨, ऐ). This applies inside {{placeholder}} values you are \
NOT translating, and to any digit that appears literally in the source text.

2. Never translate, transliterate, or alter: the literal text "Rs" and the \
number that follows it, unit abbreviations (kW, kWh, kVA, km, min, mins), \
station names, station/charger IDs, connector names (e.g. LEV-AC, CCS2), \
and the product name "VidyutOne". Proper-noun brand names that appear in \
the source (Razorpay, OpenChargeMap, UPI, ARAI) also stay exactly as \
written. If a string is wrapped in {{curly braces}}, it is a placeholder \
that will be substituted with a value at runtime -- copy the placeholder \
name unchanged and only translate the surrounding sentence.

3. Keep everyday loanwords as loanwords. Words like "charging", "booking", \
"slot", and "unit" are already ordinary {language} speech among EV users \
and drivers -- do not replace them with formal or Sanskrit/Persian-root \
equivalents (e.g. do not turn "booking" into a formal reservation word) \
just because a more "correct" translation exists. If in doubt, translate \
the way a driver would actually say it out loud, not the way a dictionary \
would.

4. Never soften a warning, fee, or penalty. If the English string says \
money will be charged, a slot will be released, an action cannot be \
undone, or a booking is really cancelled, the translation must say the \
same thing with the same weight -- no hedging, no "may", no politeness \
cushioning that changes the meaning.

5. Respect the character budget. Where a string has a max_chars value, you \
are translating a button or a chip label with limited width -- keep the \
translation close to that length even if it means a slightly more compact \
phrasing than a full sentence would use. If you cannot fit the meaning \
in the budget, prioritise fitting over completeness, but never drop the \
core meaning (e.g. a cancellation must still clearly read as a \
cancellation).

6. Use the context field to understand where each string appears (a \
button, a status badge, a form label, a warning) and translate \
accordingly -- the same English word can need a different translation as \
a button versus as a sentence.

For every string you translate, also provide a literal English \
back-translation of your {language} output (not a copy of the original \
English) -- this is what a native-speaker reviewer will read to sanity- \
check your work, so make it a faithful, literal rendering of what the \
{language} text actually says, not a polished paraphrase.
"""

LOCALE_USER = """Translate the following {count} UI strings from English into {language} \
for the VidyutOne driver app.

Each entry has: key (do not translate, echo back exactly), text (the \
English source to translate), context (where/how it's shown), and \
optionally max_chars (a hard width budget for a button/chip/badge).

Return one output entry per input key, in the same order, with your \
{language} translation and its literal English back-translation.

STRINGS:
{strings_json}
"""

# Gemini structured-output schema (passed as generationConfig.responseSchema
# with responseMimeType "application/json"). One object per input string, in
# the same order as the request -- gen_locales.py re-associates each result
# with its key positionally rather than trusting the model to always echo
# the key back correctly, but the key is still requested so a human skimming
# the raw API response can sanity-check alignment.
LOCALE_SCHEMA = {
    "type": "object",
    "properties": {
        "translations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "text": {"type": "string"},
                    "back_translation": {"type": "string"},
                },
                "required": ["key", "text", "back_translation"],
            },
        },
    },
    "required": ["translations"],
}
