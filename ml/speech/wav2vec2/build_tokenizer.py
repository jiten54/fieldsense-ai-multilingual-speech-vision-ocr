"""Build character-level CTC vocabulary JSON from speech manifest transcripts.

Works in pure Python 3.11 without external dependencies so tokenizer generation
can be tested and audited anywhere.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_vocab_from_manifest(manifest_path: str, output_vocab_path: str) -> dict[str, int]:
    rows = [
        json.loads(line)
        for line in Path(manifest_path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    chars: set[str] = set()
    for row in rows:
        text = str(row.get("transcript", "")).lower().strip()
        for ch in text:
            chars.add(ch)

    vocab_list = sorted(c for c in chars if c != " ")
    vocab: dict[str, int] = {ch: idx for idx, ch in enumerate(vocab_list)}
    vocab["|"] = len(vocab)  # Word delimiter token for wav2vec2 CTC
    vocab["[UNK]"] = len(vocab)
    vocab["[PAD]"] = len(vocab)  # Blank / padding token

    out_path = Path(output_vocab_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    return vocab


def main() -> None:
    parser = argparse.ArgumentParser(description="Build wav2vec2 character CTC vocabulary.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", default="experiments/configs/wav2vec2_vocab.json")
    args = parser.parse_args()
    vocab = build_vocab_from_manifest(args.manifest, args.output)
    print(json.dumps({"vocab_size": len(vocab), "output": args.output}, indent=2))


if __name__ == "__main__":
    main()
