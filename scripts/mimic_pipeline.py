#!/usr/bin/env python3
"""
MIMIC-IV-Note pipeline: filter radiology → first 300 reports, optional NER + UMLS → export JSON.

Usage:
  python scripts/mimic_pipeline.py [--mimic-dir PATH] [--output-dir PATH] [--run-ner]

  --mimic-dir   Path to MIMIC-IV-Note 2.2 note folder (radiology.csv.gz, radiology_detail.csv.gz).
                Default: Shared drive path.
  --output-dir  Where to write mimic_reports_300.json and anomaly_frequencies.json (default: public/)
  --run-ner     Also run scispaCy NER + EntityLinker and export anomaly_frequencies.json
                (requires: pip install scispacy en_ner_bc5cdr_md; UMLS linker optional)
"""

import argparse
import csv
import gzip
import json
import os
import sys
from pathlib import Path

# Default paths
DEFAULT_MIMIC_NOTE = os.path.expanduser(
    "/Users/ninotriandafilidis/Library/CloudStorage/GoogleDrive-ninot@stanford.edu/Shared drives/CS224n/MIMIC/mimic-iv-note/2.2/note"
)
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT = REPO_ROOT / "public"


def extract_300_reports(mimic_note_dir: Path, output_dir: Path) -> list[dict]:
    """Read radiology.csv.gz, take first 300 reports, write mimic_reports_300.json. Returns list of reports."""
    radiology_gz = mimic_note_dir / "radiology.csv.gz"
    if not radiology_gz.exists():
        print(f"Not found: {radiology_gz}", file=sys.stderr)
        sys.exit(1)

    reports = []
    with gzip.open(radiology_gz, "rt", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if len(reports) >= 300:
                break
            text = (row.get("text") or "").strip()
            if not text:
                continue
            reports.append({
                "id": row.get("note_id", ""),
                "subjectId": row.get("subject_id", ""),
                "noteType": row.get("note_type", ""),
                "charttime": row.get("charttime", ""),
                "text": text,
                "title": f"Report {len(reports)} — {row.get('note_type', '')}",
            })

    out_file = output_dir / "mimic_reports_300.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"total": len(reports), "reports": reports}, f, indent=2)
    print(f"Wrote {len(reports)} reports to {out_file}")
    return reports


def run_ner_and_export_frequencies(reports: list[dict], output_dir: Path, total_reports: int) -> None:
    """Run scispaCy NER, aggregate entity counts, export anomaly_frequencies.json.
    Note: This aggregates all NER entity types (no filter for clinical findings). Inspect
    intermediary output before wiring to the app; see AGENTS.md."""
    try:
        import spacy
    except ImportError:
        print("pip install spacy then: python -m spacy download en_ner_bc5cdr_md", file=sys.stderr)
        return

    # Prefer scispaCy models (install via pip; see SCRIPTS.md)
    for model_name in ("en_core_sci_sm", "en_ner_bc5cdr_md", "en_core_sci_md"):
        try:
            nlp = spacy.load(model_name)
            break
        except OSError:
            continue
    else:
        print(
            "No biomedical NER model found. Install one with pip (see SCRIPTS.md), e.g.:\n"
            "  pip install scispacy\n"
            "  pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_core_sci_sm-0.5.4.tar.gz",
            file=sys.stderr,
        )
        return

    # Optional: add UMLS linker (requires scispacy + umls knowledge base)
    try:
        nlp.add_pipe("scispacy_linker", config={"resolve_abbreviations": True, "linker_name": "umls"})
        use_linker = True
    except Exception:
        use_linker = False

    # Aggregate: (text, label) -> count; if linker: (cui, preferred_term) -> count
    from collections import defaultdict
    term_counts: dict[str, int] = defaultdict(int)
    term_labels: dict[str, str] = {}  # term -> label for category

    for rep in reports:
        text = rep.get("text", "")[:100000]  # limit length
        doc = nlp(text)
        for ent in doc.ents:
            key = ent.text.strip().lower()
            if not key or len(key) < 2:
                continue
            term_counts[key] += 1
            term_labels[key] = ent.label_

    # Build anomaly list: prefer terms that look like conditions (DISEASE, etc.)
    total = total_reports or len(reports)
    entries = []
    seen_terms = set()
    for (term_lower, count) in sorted(term_counts.items(), key=lambda x: -x[1])[:80]:
        if term_lower in seen_terms:
            continue
        seen_terms.add(term_lower)
        label = term_labels.get(term_lower, "ENTITY")
        category = label.replace("_", " ").title()
        term_display = term_lower.title() if term_lower.islower() else term_lower
        entries.append({
            "term": term_display,
            "aliases": [],
            "frequency": count,
            "totalReports": total,
            "category": category,
        })

    out_file = output_dir / "anomaly_frequencies.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"totalReports": total, "entries": entries}, f, indent=2)
    print(f"Wrote {len(entries)} anomaly entries to {out_file}")


def main():
    p = argparse.ArgumentParser(description="MIMIC-IV-Note: extract 300 reports, optional NER → JSON")
    p.add_argument("--mimic-dir", type=Path, default=Path(DEFAULT_MIMIC_NOTE), help="MIMIC-IV-Note 2.2 note folder")
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT, help="Output directory (e.g. public/)")
    p.add_argument("--run-ner", action="store_true", help="Run scispaCy NER and export anomaly_frequencies.json")
    args = p.parse_args()

    reports = extract_300_reports(args.mimic_dir, args.output_dir)
    if args.run_ner and reports:
        run_ner_and_export_frequencies(reports, args.output_dir, len(reports))


if __name__ == "__main__":
    main()
