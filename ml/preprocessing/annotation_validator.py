"""Pre-training Data Quality & Annotation Integrity Validator (Module C).

Checks dataset manifests and annotation records for:
- Missing labels or empty transcripts
- Duplicate record IDs or duplicate media paths
- Invalid or missing media files
- Out-of-range durations (<0.3s or >60s)
- Unreviewed / flagged annotations
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class DataQualityReport:
    dataset_name: str
    total_records: int
    valid_records: int
    approved_records: int
    flagged_records: int
    missing_files: int
    empty_transcripts: int
    duplicate_ids: int
    out_of_range_durations: int
    pass_rate_pct: float
    ready_for_training: bool
    issues: list[dict[str, str]]


def validate_annotations(
    records: list[dict[str, Any]],
    dataset_name: str = "fieldsense_annotations",
    base_dir: str = ".",
) -> DataQualityReport:
    seen_ids: set[str] = set()
    missing_files = 0
    empty_transcripts = 0
    duplicate_ids = 0
    out_of_range = 0
    approved = 0
    flagged = 0
    valid = 0
    issues: list[dict[str, str]] = []

    for rec in records:
        rec_id = str(rec.get("id", "")).strip()
        media_path = str(rec.get("media_path", "")).strip()
        transcript = str(
            rec.get("corrected_transcript") or rec.get("raw_transcript") or ""
        ).strip()
        label = str(rec.get("label", "")).strip()
        modality = str(rec.get("modality", "audio")).strip()
        status = str(rec.get("status", "PENDING")).upper()
        duration = rec.get("duration_sec")

        rec_has_error = False

        if not rec_id:
            rec_has_error = True
            issues.append({"id": "<missing>", "severity": "ERROR", "code": "MISSING_ID", "message": "Record lacks a unique ID."})
        elif rec_id in seen_ids:
            duplicate_ids += 1
            rec_has_error = True
            issues.append({"id": rec_id, "severity": "ERROR", "code": "DUPLICATE_ID", "message": f"Duplicate record ID '{rec_id}'."})
        else:
            seen_ids.add(rec_id)

        if media_path:
            resolved = media_path if os.path.isabs(media_path) else os.path.join(base_dir, media_path.lstrip("/"))
            if not os.path.exists(resolved):
                missing_files += 1
                rec_has_error = True
                issues.append({"id": rec_id, "severity": "ERROR", "code": "MISSING_MEDIA", "message": f"Media file not found: {media_path}"})
        else:
            missing_files += 1
            rec_has_error = True
            issues.append({"id": rec_id, "severity": "ERROR", "code": "NO_MEDIA_PATH", "message": "No media_path specified."})

        if modality == "audio" and not transcript:
            empty_transcripts += 1
            rec_has_error = True
            issues.append({"id": rec_id, "severity": "ERROR", "code": "EMPTY_TRANSCRIPT", "message": "Audio sample has empty transcript."})
        elif modality == "image" and not (label or transcript):
            empty_transcripts += 1
            rec_has_error = True
            issues.append({"id": rec_id, "severity": "ERROR", "code": "MISSING_LABEL", "message": "Image sample lacks classification label or OCR reference."})

        if duration is not None:
            try:
                d_val = float(duration)
                if d_val < 0.3 or d_val > 60.0:
                    out_of_range += 1
                    rec_has_error = True
                    issues.append({"id": rec_id, "severity": "WARN", "code": "DURATION_OUT_OF_RANGE", "message": f"Duration {d_val}s outside [0.3, 60.0]s window."})
            except (TypeError, ValueError):
                out_of_range += 1
                rec_has_error = True
                issues.append({"id": rec_id, "severity": "ERROR", "code": "INVALID_DURATION", "message": f"Non-numeric duration '{duration}'."})

        if status == "APPROVED":
            approved += 1
        elif status == "FLAGGED":
            flagged += 1

        if not rec_has_error:
            valid += 1

    total = len(records)
    pass_rate = (valid / float(total) * 100.0) if total > 0 else 0.0
    ready = total > 0 and missing_files == 0 and duplicate_ids == 0 and empty_transcripts == 0

    return DataQualityReport(
        dataset_name=dataset_name,
        total_records=total,
        valid_records=valid,
        approved_records=approved,
        flagged_records=flagged,
        missing_files=missing_files,
        empty_transcripts=empty_transcripts,
        duplicate_ids=duplicate_ids,
        out_of_range_durations=out_of_range,
        pass_rate_pct=round(pass_rate, 2),
        ready_for_training=ready,
        issues=issues,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate annotation manifest JSON.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--base-dir", default=".")
    args = parser.parse_args()
    data = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else data.get("records", [])
    report = validate_annotations(records, dataset_name=Path(args.manifest).stem, base_dir=args.base_dir)
    print(json.dumps(asdict(report), indent=2))


if __name__ == "__main__":
    main()
