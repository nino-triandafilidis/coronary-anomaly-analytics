# AAOCA cohort pipeline

Turns a STARR coronary-CTA export into a parse-ready, one-report-per-patient AAOCA pre-op cohort,
split into confirmed_AAOCA (RCA / LCA) and needs_medical_review (flagged for clinician adjudication).

## Data handling

This pipeline runs on confidential STARR report text. Inputs and outputs hold PHI-adjacent content
and must never be committed. The repo `.gitignore` excludes the data tree and pipeline outputs
(`AAOCA CTA Report Copies/`, `cohort-pipeline/*.csv`, `cohort-pipeline/*.jsonl`,
`cohort-pipeline/aaoca_preprocessed/`). Keep it that way.

## Step 0 — the STARR cohort (manual, in STARR Cohort Discovery)

Define the cohort as Clinical documents → Computed Tomography → of type(s) = the coronary-CTA exam
names in `cohort_exam_types_final.txt`, then extract the CT radiology reports for those patients.

Notes learned the hard way (see `keyword_search_recommendation.md`):
- The exam-type list is the right cohort lever. A content/keyword search overshoots (it can't do
  negation, so "no anomalous origin" normals get pulled), and CPT 75574 (all coronary CTAs)
  overshoots the other way. AAOCA itself is identified downstream, by the classifier, not at the
  cohort level.
- The extract returns *all* CT reports for the cohort patients (modality filter), so the pipeline
  re-applies the coronary-CTA filter itself in step 1.

## Step 1 — classify (`classify_final.py`)

```
python classify_final.py radiology_report.csv classified_reports.csv
```

Labels every report: coronary-CTA filter → anomalous-origin detection (negation-aware, anchored on
IMPRESSION + CORONARY ARTERIES, never the referral question) → pre/post → RCA/LCA laterality.
Writes one row per report. Also importable: `from classify_final import analyze, is_coronary_cta`.

## Step 2 — preprocess to parse-ready (`preprocess.py`)

```
python preprocess.py radiology_report.csv -o aaoca_preprocessed
```

End to end: classify → dedup same-date duplicates → drop post-op → one report per patient (latest
pre-op) → split confirmed_AAOCA vs needs_medical_review. Output:

```
aaoca_preprocessed/
  confirmed_AAOCA/   reports.jsonl   manifest.csv     <- parse this
```

Each `reports.jsonl` record is one patient: `{patient_id, date, side, age, title, text}`. To count
feature frequencies across all / RCA / LCA, parse the records and group resulting terms by `side`,
no separate rollup needed.

### needs_medical_review (computed, not saved by default)

The flagged bucket: AAOCA-relevant studies that aren't a clean single-sided RCA/LCA call, held for
clinician adjudication. The pipeline computes it and prints its count but does not write it by
default. To save it, uncomment the `write(review, out_dir + '/needs_medical_review', True)` line in
`preprocess.py`; it writes `needs_medical_review/{reports.jsonl,manifest.csv}` with two extra
manifest columns, `flag` and `flag_reason`. Flags:

`single` (single coronary, no side), `both` (bilateral), `other` (common/generic origin),
`unspec` (interarterial, vessel not pinned), `origin-from-PA` (ALCAPA/ARCAPA, not aortic).

## Caveats

Deterministic rules, spot-checked on samples, not clinician-adjudicated. Known residual gaps: post-op
described only by the repair, complex congenital, benign high-takeoff borderline.
