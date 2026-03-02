# Agent instructions

## Pipeline and anomaly list

- **Anomaly recognition** comes from **`scripts/mimic_pipeline.py`**, function **`run_ner_and_export_frequencies`**. It runs scispaCy NER (e.g. `en_core_sci_sm`) over the 300 reports, aggregates all extracted entity spans by count, and exports the top 80 as `public/anomaly_frequencies.json`. The app then uses that file for highlighting and frequency tooltips.
- **Why it highlighted unrelated terms:** The pipeline does **not** filter by entity type. It keeps every NER span (section headers like "Findings", "Impression", "Comparison", "Indication", "Technique", "Patient", "Examination", "Procedure", and common words like "Ct", "Bilateral", "Abdomen"). So the "anomaly" list is really a generic high-frequency entity list, not a list of clinical findings. Improving this would require filtering by NER label (e.g. only DISEASE/CONDITION) or by UMLS semantic type after linking.

## Before wiring pipeline outputs

- **Investigate intermediary reports.** Before treating a pipeline output (e.g. `anomaly_frequencies.json`) as the source of truth for the app, inspect it:
  - Open the generated JSON and scan the first 20–30 entries. Check that they look like the intended concept (e.g. clinical findings/anomalies), not section headers or boilerplate.
  - If the pipeline has steps (e.g. NER → entity list, or NER → linker → CUI table), inspect the output after each step (e.g. sample of NER entities per report, or CUI counts) to catch misconfigurations or wrong entity types early.
- Add or run a small script to dump a sample of intermediary outputs (e.g. top NER entities per report, or label distribution) when changing the pipeline.
