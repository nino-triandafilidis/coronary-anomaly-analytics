# Public Dataset Recommendations for LLM-Based Anomaly Detection

This document lists prioritized dataset recommendations for training and evaluating LLM-based anomaly detection on radiology (e.g., CT angiogram) reports.

---

## Primary (you have access)

### 1. MIMIC-IV-Note — Radiology reports

- **What:** ~2.3M clinical notes; filter by CPT for CTPA studies to get ~20K radiology reports.
- **Why:** Real clinical prose, ideal for LLM stress testing and future NER/anomaly extraction.
- **Location (local):**  
  `'/Users/ninotriandafilidis/Library/CloudStorage/GoogleDrive-ninot@stanford.edu/Shared drives/CS224n/MIMIC/mimic-iv-note/2.2/note'`
- **Use:** Filter note types / CPT codes for CT chest / CTPA; use for training, validation, and benchmarking.

---

## NER / Extraction benchmarking

### 5. n2c2 / i2b2 — Annotated clinical NER

- **What:** Annotated clinical text (de-identified) with entity spans (e.g., conditions, medications).
- **Why:** Standard benchmarks for validating extraction methodology and NER quality before/after LLM integration.
- **Use:** Compare dictionary-based vs. LLM-based entity boundaries and labels.

---

## Summary

| Dataset        | Use case                          | Access   |
|---------------|------------------------------------|----------|
| MIMIC-IV-Note | CTPA/radiology reports, LLM stress | Local    |
| n2c2 / i2b2   | NER benchmarking                  | Public   |

Start with MIMIC-IV-Note for real report volume and diversity; use n2c2/i2b2 to validate extraction and NER performance.
