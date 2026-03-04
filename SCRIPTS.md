# Scripts you need to run

## 1. Generate the 300-report dataset (required for the Dataset page)

From the project root, run:

```bash
python3 scripts/mimic_pipeline.py
```

- **No venv or pip needed.** This script uses only the Python standard library (csv, gzip, json, etc.).
- **What it does:** Reads MIMIC-IV-Note `radiology.csv.gz` from the default path (see below), takes the first 300 radiology reports, and writes **`public/mimic_reports_300.json`**.
- **You need:** MIMIC data at the default path, or pass `--mimic-dir` (see “Options” below).
- **Result:** The app’s **Dataset** page (link “300 reports in database”) will load this file and show the 300 reports with click-to-preview.

---

## 2. Optional: NER + anomaly frequency export

If you want to generate **real** anomaly frequencies from the 300 reports (instead of the mock database), use a venv so you don’t pollute system Python:

```bash
# Create and use a venv (recommended)
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install pipeline dependencies (one-time)
pip install -r requirements-pipeline.txt

# Install a biomedical NER model (one-time). These are scispaCy models — use pip, not "spacy download":
pip install scispacy
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_core_sci_sm-0.5.4.tar.gz
# Or the BC5CDR NER model (drug/condition focused):
# pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz

# Run pipeline with NER and write public/anomaly_frequencies.json
python scripts/mimic_pipeline.py --run-ner
```

- **What it does:** Same as step 1, plus runs NER on each report, aggregates entity counts, and writes **`public/anomaly_frequencies.json`**.
- **Result:** The app automatically loads `public/anomaly_frequencies.json` on startup. If the file exists, the analyzer and dataset page use these real frequencies instead of the mock database.

---

## Options for `mimic_pipeline.py`

| Option | Meaning |
|--------|--------|
| `--mimic-dir PATH` | Folder containing `radiology.csv.gz` (default: your MIMIC-IV-Note 2.2 `note` folder). |
| `--output-dir PATH` | Where to write `mimic_reports_300.json` (and, with `--run-ner`, `anomaly_frequencies.json`). Default: `public/`. |
| `--run-ner` | Also run NER and export `anomaly_frequencies.json`. |

Example with a custom MIMIC path:

```bash
python scripts/mimic_pipeline.py --mimic-dir "/path/to/mimic-iv-note/2.2/note" --output-dir public
```

---

## 3. Generate a test PDF (report not in the DB)

To test **PDF upload/parsing** and **detection on text the DB hasn’t seen**, generate a single PDF from the 301st MIMIC report (so it’s not one of the 300 in the dataset):

```bash
# Requires reportlab (e.g. in your venv)
pip install reportlab

python scripts/generate_sample_pdf.py
```

- **Output:** `public/sample_report_not_in_db.pdf`
- **Options:** `--mimic-dir PATH` (same as pipeline), `--output PATH` (output PDF path).
- Use this file in the app: upload it to confirm PDF parsing works and to see which terms get highlighted on a report that wasn’t in the training set.

---

## Summary

| Goal | Command |
|------|--------|
| **Dataset page with 300 reports** | `python3 scripts/mimic_pipeline.py` (no venv) |
| **Same + NER frequency export** | Create venv, `pip install -r requirements-pipeline.txt`, then `python scripts/mimic_pipeline.py --run-ner` |
| **Test PDF + new-text detection** | `pip install reportlab` then `python scripts/generate_sample_pdf.py` |

No other scripts are required for the Dataset page; only step 1 is required.
