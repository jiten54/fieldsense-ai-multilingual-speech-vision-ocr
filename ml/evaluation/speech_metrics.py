"""Exact Speech & OCR Evaluation Metrics (WER, CER, Edit Alignment, Error Analysis).

Implements normalized Levenshtein edit distance at both word and character levels
with full substitution, deletion, and insertion alignment for error analysis.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from dataclasses import asdict, dataclass
from typing import Sequence


def normalize_text(text: str) -> str:
    """Unicode NFKC normalization, lowercase, punctuation strip, whitespace collapse."""
    normalized = unicodedata.normalize("NFKC", text).lower()
    # Keep unicode word chars and spaces
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _levenshtein_align(ref: Sequence[str], hyp: Sequence[str]) -> dict[str, object]:
    """Compute minimum edit distance and backtrace alignment operations."""
    n = len(ref)
    m = len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    op = [[""] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        dp[i][0] = i
        op[i][0] = "D"
    for j in range(1, m + 1):
        dp[0][j] = j
        op[0][j] = "I"

    for i in range(1, n + 1):
        r_tok = ref[i - 1]
        for j in range(1, m + 1):
            h_tok = hyp[j - 1]
            if r_tok == h_tok:
                dp[i][j] = dp[i - 1][j - 1]
                op[i][j] = "H"  # Hit
            else:
                sub_cost = dp[i - 1][j - 1] + 1
                del_cost = dp[i - 1][j] + 1
                ins_cost = dp[i][j - 1] + 1
                best = min(sub_cost, del_cost, ins_cost)
                dp[i][j] = best
                if best == sub_cost:
                    op[i][j] = "S"
                elif best == del_cost:
                    op[i][j] = "D"
                else:
                    op[i][j] = "I"

    # Backtrace
    i, j = n, m
    alignment: list[dict[str, str]] = []
    hits = subs = dels = inss = 0
    confusion_pairs: list[tuple[str, str]] = []

    while i > 0 or j > 0:
        cur = op[i][j]
        if cur == "H":
            hits += 1
            alignment.append({"op": "match", "ref": ref[i - 1], "hyp": hyp[j - 1]})
            i -= 1
            j -= 1
        elif cur == "S":
            subs += 1
            alignment.append({"op": "substitute", "ref": ref[i - 1], "hyp": hyp[j - 1]})
            confusion_pairs.append((ref[i - 1], hyp[j - 1]))
            i -= 1
            j -= 1
        elif cur == "D":
            dels += 1
            alignment.append({"op": "delete", "ref": ref[i - 1], "hyp": ""})
            i -= 1
        else:
            inss += 1
            alignment.append({"op": "insert", "ref": "", "hyp": hyp[j - 1]})
            j -= 1

    alignment.reverse()
    distance = dp[n][m]
    return {
        "distance": distance,
        "hits": hits,
        "substitutions": subs,
        "deletions": dels,
        "insertions": inss,
        "ref_len": n,
        "hyp_len": m,
        "alignment": alignment,
        "confusion_pairs": confusion_pairs,
    }


@dataclass
class SpeechComparisonResult:
    reference_raw: str
    hypothesis_raw: str
    reference_normalized: str
    hypothesis_normalized: str
    wer: float
    cer: float
    word_hits: int
    word_substitutions: int
    word_deletions: int
    word_insertions: int
    reference_word_count: int
    hypothesis_word_count: int
    word_alignment: list[dict[str, str]]
    top_confusions: list[dict[str, object]]


def evaluate_pair(reference: str, hypothesis: str) -> SpeechComparisonResult:
    """Compute exact normalized WER, CER, and word alignment for a single pair."""
    ref_norm = normalize_text(reference)
    hyp_norm = normalize_text(hypothesis)

    ref_words = ref_norm.split() if ref_norm else []
    hyp_words = hyp_norm.split() if hyp_norm else []

    if len(ref_words) == 0:
        wer = 0.0 if len(hyp_words) == 0 else 1.0
        w_align = {
            "hits": 0,
            "substitutions": 0,
            "deletions": 0,
            "insertions": len(hyp_words),
            "alignment": [{"op": "insert", "ref": "", "hyp": w} for w in hyp_words],
            "confusion_pairs": [],
        }
    else:
        w_align = _levenshtein_align(ref_words, hyp_words)
        wer = float(w_align["distance"]) / float(len(ref_words))

    ref_chars = list(ref_norm)
    hyp_chars = list(hyp_norm)
    if len(ref_chars) == 0:
        cer = 0.0 if len(hyp_chars) == 0 else 1.0
    else:
        c_align = _levenshtein_align(ref_chars, hyp_chars)
        cer = float(c_align["distance"]) / float(len(ref_chars))

    pair_counts = Counter(w_align["confusion_pairs"])
    top_confusions = [
        {"reference": r, "predicted": h, "count": c}
        for (r, h), c in pair_counts.most_common(10)
    ]

    return SpeechComparisonResult(
        reference_raw=reference,
        hypothesis_raw=hypothesis,
        reference_normalized=ref_norm,
        hypothesis_normalized=hyp_norm,
        wer=round(wer, 4),
        cer=round(cer, 4),
        word_hits=int(w_align["hits"]),
        word_substitutions=int(w_align["substitutions"]),
        word_deletions=int(w_align["deletions"]),
        word_insertions=int(w_align["insertions"]),
        reference_word_count=len(ref_words),
        hypothesis_word_count=len(hyp_words),
        word_alignment=list(w_align["alignment"]),
        top_confusions=top_confusions,
    )


def evaluate_corpus(records: list[dict[str, str]]) -> dict[str, object]:
    """Compute corpus-level micro-WER, micro-CER, and confusion breakdowns."""
    total_ref_words = 0
    total_word_edits = 0
    total_ref_chars = 0
    total_char_edits = 0
    total_subs = total_dels = total_inss = 0
    all_confusions: Counter[tuple[str, str]] = Counter()

    per_sample: list[dict[str, object]] = []
    for idx, rec in enumerate(records):
        res = evaluate_pair(rec.get("reference", ""), rec.get("hypothesis", ""))
        ref_w = max(res.reference_word_count, 1)
        edits_w = res.word_substitutions + res.word_deletions + res.word_insertions
        total_ref_words += res.reference_word_count
        total_word_edits += edits_w
        total_subs += res.word_substitutions
        total_dels += res.word_deletions
        total_inss += res.word_insertions

        ref_c = len(res.reference_normalized)
        total_ref_chars += ref_c
        total_char_edits += int(round(res.cer * max(ref_c, 1)))

        for c in res.top_confusions:
            all_confusions[(str(c["reference"]), str(c["predicted"]))] += int(c["count"])

        per_sample.append(
            {
                "id": rec.get("id", f"sample_{idx}"),
                "language": rec.get("language", "unknown"),
                "condition": rec.get("condition", "standard"),
                "wer": res.wer,
                "cer": res.cer,
                "substitutions": res.word_substitutions,
                "deletions": res.word_deletions,
                "insertions": res.word_insertions,
            }
        )

    corpus_wer = total_word_edits / float(max(total_ref_words, 1))
    corpus_cer = total_char_edits / float(max(total_ref_chars, 1))

    return {
        "sample_count": len(records),
        "corpus_wer": round(corpus_wer, 4),
        "corpus_cer": round(corpus_cer, 4),
        "total_substitutions": total_subs,
        "total_deletions": total_dels,
        "total_insertions": total_inss,
        "top_confusions": [
            {"reference": r, "predicted": h, "count": cnt}
            for (r, h), cnt in all_confusions.most_common(15)
        ],
        "per_sample": per_sample,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute WER/CER evaluation.")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--hypothesis", required=True)
    args = parser.parse_args()
    result = evaluate_pair(args.reference, args.hypothesis)
    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
