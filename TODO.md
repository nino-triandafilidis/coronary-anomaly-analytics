# TODO

## Pipeline: filter NER output to clinical findings only

**What produced the bad “anomaly” list:** The step that decides what counts as an anomaly is **`run_ner_and_export_frequencies`** in **`scripts/mimic_pipeline.py`**. It:

- Runs scispaCy NER (e.g. `en_core_sci_sm`) on the 300 reports.
- Counts **every** extracted entity (any label).
- Takes the top 80 by frequency and writes `public/anomaly_frequencies.json`.

There is **no** filter for “clinical finding” or “anomaly.” So section headers and common words (“Findings”, “Impression”, “Comparison”, “Indication”, “Technique”, “Patient”, “Examination”, “Procedure”, “Ct”, “Bilateral”, “Abdomen”) dominate.

**Fix:** Filter by NER label (e.g. only DISEASE / CONDITION) or by UMLS semantic type after linking, so the exported list contains actual clinical findings rather than all entities.
