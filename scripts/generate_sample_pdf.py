#!/usr/bin/env python3
"""
Generate a single PDF from one MIMIC radiology report that is NOT in the 300-report DB.
Use this to test: (1) PDF upload/parsing in the app, (2) detection on text the DB hasn't seen.

Usage:
  python scripts/generate_sample_pdf.py [--mimic-dir PATH] [--output PATH]

Requires: pip install reportlab
"""

import argparse
import csv
import gzip
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT = REPO_ROOT / "public" / "sample_report_not_in_db.pdf"


def get_report_after_n(mimic_note_dir: Path, skip_count: int = 300) -> dict | None:
    """Read radiology.csv.gz, skip first skip_count reports, return the next one."""
    radiology_gz = mimic_note_dir / "radiology.csv.gz"
    if not radiology_gz.exists():
        print(f"Not found: {radiology_gz}", file=sys.stderr)
        return None
    collected = 0
    with gzip.open(radiology_gz, "rt", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = (row.get("text") or "").strip()
            if not text:
                continue
            if collected < skip_count:
                collected += 1
                continue
            return {
                "id": row.get("note_id", ""),
                "text": text,
                "note_type": row.get("note_type", ""),
                "charttime": row.get("charttime", ""),
            }
    return None


def text_to_pdf(text: str, output_path: Path) -> None:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate

        output_path.parent.mkdir(parents=True, exist_ok=True)
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72,
        )
        style = getSampleStyleSheet()["Normal"]
        flowables = [
            Paragraph(block.replace("&", "&amp;").replace("<", "&lt;"), style)
            for block in text.split("\n")
        ]
        doc.build(flowables)
    except ImportError:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter

        output_path.parent.mkdir(parents=True, exist_ok=True)
        c = canvas.Canvas(str(output_path), pagesize=letter)
        width, height = letter
        y = height - 72
        c.setFont("Helvetica", 10)
        for line in text.replace("\r", "").split("\n"):
            if y < 72:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = height - 72
            x = 72
            while line:
                chunk = line[:80] if len(line) > 80 else line
                idx = chunk.rfind(" ") + 1 if len(line) > 80 else len(chunk)
                if idx <= 0:
                    idx = len(chunk)
                chunk = line[:idx]
                line = line[idx:].lstrip()
                c.drawString(x, y, chunk[:80])
                y -= 14
        c.save()


def main():
    p = argparse.ArgumentParser(description="Generate a test PDF from one MIMIC report not in the DB.")
    p.add_argument(
        "--mimic-dir",
        type=Path,
        default=Path(
            "/Users/ninotriandafilidis/Library/CloudStorage/GoogleDrive-ninot@stanford.edu/Shared drives/CS224n/MIMIC/mimic-iv-note/2.2/note"
        ),
        help="Path to MIMIC-IV-Note 2.2 note folder (radiology.csv.gz)",
    )
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output PDF path")
    args = p.parse_args()

    report = get_report_after_n(args.mimic_dir, skip_count=300)
    if not report:
        print("Could not find a report after the first 300 (not enough rows?).", file=sys.stderr)
        sys.exit(1)

    try:
        text_to_pdf(report["text"], args.output)
    except Exception as e:
        print(f"PDF generation failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Wrote PDF from report {report['id']} (not in DB) to {args.output}")
    print("Use this file in the app to test PDF parsing and detection on new text.")


if __name__ == "__main__":
    main()
