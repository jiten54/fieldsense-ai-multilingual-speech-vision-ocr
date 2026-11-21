"""PII Detection and Redaction utility for FieldSense AI (Module I).

Redacts phone numbers, email addresses, dates of birth, ID numbers, and labeled
person names prior to storage or logging. Never sends data to external APIs.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass

PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "EMAIL",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        "[REDACTED_EMAIL]",
    ),
    (
        "PHONE",
        re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{4}\b"),
        "[REDACTED_PHONE]",
    ),
    (
        "DOB",
        re.compile(
            r"(?i)(date of birth|dob|born)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})"
        ),
        r"\1: [REDACTED_DOB]",
    ),
    (
        "PERSON_NAME",
        re.compile(
            r"(?i)(patient name(?:\s*\([^)]*\))?|guardian name|student name|child name)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})"
        ),
        r"\1: [REDACTED_NAME]",
    ),
    (
        "GOV_OR_NATIONAL_ID",
        re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),
        "[REDACTED_ID]",
    ),
]


@dataclass
class RedactionResult:
    redacted_text: str
    findings_count: int
    entity_types: list[str]
    matches: list[dict[str, str]]


def redact_pii(text: str) -> RedactionResult:
    if not text:
        return RedactionResult(
            redacted_text="",
            findings_count=0,
            entity_types=[],
            matches=[],
        )

    redacted = text
    matches: list[dict[str, str]] = []
    types_found: set[str] = set()

    for label, pattern, replacement in PATTERNS:
        found = list(pattern.finditer(redacted))
        if found:
            types_found.add(label)
            for m in found:
                matches.append(
                    {
                        "type": label,
                        "span": f"{m.start()}:{m.end()}",
                        "preview": "[MASKED]",
                    }
                )
            redacted = pattern.sub(replacement, redacted)

    return RedactionResult(
        redacted_text=redacted,
        findings_count=len(matches),
        entity_types=sorted(types_found),
        matches=matches,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Redact PII from field text.")
    parser.add_argument("--text", required=True)
    args = parser.parse_args()
    res = redact_pii(args.text)
    print(json.dumps(asdict(res), indent=2))


if __name__ == "__main__":
    main()
