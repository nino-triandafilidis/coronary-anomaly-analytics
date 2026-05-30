# STARR cohort definition (AAOCA)

Tool: STARR Cohort Discovery (https://starr-tools.med.stanford.edu/starr-tools/).
Three extracts have been pulled; all use Clinical documents → Computed Tomography, age = any age,
event date = any date, occurrence frequency = one or more, delivered as STRIDE / Download /
de-identified (PHI scrubbed, per-patient date shift), EMR Data = Radiology Reports → CT only.

| | extract 6636 | extract 6660 | extract 6661 (current) |
|---|---|---|---|
| cohort title | "final cohort test (modified)" | "cohort by relevant AAOCA reports & keywords" | refined keyword set |
| exam-type criterion | 24 names (below) | expanded list + variants (below) | same catalog as 6660 |
| keyword criterion | none | 27 terms (below) | 27 + structural terms (below) |
| patients | 2,353 | 2,359 | 2,714 |
| CT reports | 18,887 | 30,332 | 35,327 |

Patient counts are exact (`demographics.csv`). The three cohorts are not the same patient set; see
"Cross-extract linkage" below. 6661 is the cohort in use; 6636 and 6660 are kept for provenance.

## Extract 6636 (previous) — of type(s), no keywords

```
CT ANGIOGRAM CARDIAC CORONARY
CT ANGIOGRAM CORONARY
CT ANGIOGRAM CORONARY ARTERIES W CALCIUM SCORING
CT ANGIOGRAM CORONARY ARTERIES W CONT 3D
CT ANGIOGRAM CORONARY ARTERIES WO CALCIUM SCORING
CT ANGIOGRAM CORONARY W WO CONTRAST W FFRCT IF INDICATED
CT ANGIOGRAM CORONARY WITH CONTRAST
CT ANGIOGRAM CORONARY WITH FUNCTION
CT ANGIOGRAM HEART AND CORONARY ARTERIES WITH CONTRAST
CT CARDIAC ANGIOGRAM STRUCTURAL HEART WITH CORONARY ARTERIES WITH IV CONTRAST
CT CARDIAC ANGIOGRAM WITH CORONARY ARTERIES WITH IV CONTRAST
CT CORONARY ANGIOGRAM
CT CORONARY ANGIOGRAM W CONTRAST
CT CORONARY ANGIOGRAM WO+W CONTRAST
CT HEART CORONARY ANGIOGRAM
CTA CORONARY ANGIOGRAM AND CALCIUM SCORE W CONTRAST
CTA CARDIAC WO/W CONTRAST CORONARY ARTERIES, CARDIAC GATING 3D IMAGE W QUANTITATIVE CALCIUM
CTA CORONARY ARTERIES
CTA CORONARY ARTERIES INCLUDING THORAX W/O CALCIUM SCORING
CTA CORONARY ARTERIES W CONTRAST W 3D
CTA CORONARY ARTERIES W/CALCIUM SCORING
CTA CORONARY ARTERIES WITH CALCIUM SCORING (CLEERLY)
CTA CORONARY ARTERIES WO CALCIUM SCORING
CV CTA CORONARY ARTERIES W CONTRAST AND FFR IF NEEDED
```

`contain keywords`: empty.

## Extract 6660 (current)

### A. Exam type — of type(s)

The curated coronary-CTA exam-name list in `cohort_exam_types_final.txt` (the 6636 KEEP list above
plus the ADD families), and additionally these catalog variants:

```
CT CTA CORONARY ARTERIES
CT CORONARY CTA
CT CORONARY CTA W/ MORPH WO CCS
CT CARDIAC CORONARY ANGIOGRAPHY
CT ANGIOGRAPHY CORONARY ARTERY W CONTRAST
CT ANGIOGRAPHY CARDIAC WITH + WITHOUT IV CONTRAST - CORONARY ARTERIES
CT ANGIO CORONARY W CALCIUM SCORING
CT ANGIO CORONARY WITH IV CONTRAST AND CT CHEST WITHOUT IVC
CT ANGIO CORONARY ARTERY SCAN W/ FFR IF NEEDED
CT ANGIO CORONARY ARTERY STR/MPH/FNT CNT
CT ANGIO HEART CORONARY ARTERIES - FFR CT/PLAQUE ANALYSIS
CT CORONARY ANGIOGRAPHY W WO IV CONTRAST WITH HEARTFLOW (FFRCT)
CTA CORONARY - INPATIENT
CTA CORONARY (CARDIAC)- MARIN ONLY
CTA - CORONARY WITH CALCIUM SCORE
```

### B. Report text — contain keywords (27 terms)

```
interarterial
inter-arterial
anomalous origin
anomalous coronary
anomalous right coronary
anomalous left coronary
anomalous RCA
anomalous LAD
anomalous circumflex
anomalous left main
aberrant right coronary
aberrant RCA
aberrant origin
aberrant left main
single coronary
common origin
high takeoff
high origin
intraseptal
intraconal
subpulmonic
retroaortic
slit-like
anomalous aortic origin
AAOCA
AAORCA
AAOLCA
```

## Extract 6661 (current) — refined keywords

Same exam-type catalog as 6660. The keyword list is the 27 above plus structural terms the
classifier keys on but the 27 missed (origin stated without "anomalous" / "aberrant" /
"interarterial"):

```
ectopic
non-coronary sinus
noncoronary sinus
non-coronary cusp
noncoronary cusp
shared origin
common ostium
opposite sinus
opposite cusp
malignant course
```

Effect (patient_id-linked to 6660 and 6636):
- 6661 is a clean superset of 6660 (same catalog, more keywords): +355 patients, of which only 7 are
  AAOCA. The other 348 are non-AAOCA noise the downstream classifier drops. 2,714 sits well under the
  7,500 extract cap, so the noise is harmless.
- Of the 9 AAOCA patients 6660's 27-keyword cohort had dropped (present and AAOCA in 6636, absent from
  6660), the structural terms recover 3: the ectopic-RCA, the LMCA-from-non-coronary-sinus, and the
  shared-origin RCA+LAD cases. `ectopic`, `non-coronary sinus`, and `shared origin` carry the recall.
- Noise concentrates in `non-coronary cusp` (117 of the 355 new patients, 2 AAOCA) because normal
  reads say "no vessel arises from the non-coronary cusp". `opposite sinus` / `opposite cusp` added 0
  (radiologists name the specific sinus), consistent with `keyword_search_recommendation.md`.

Residual misses keywords cannot close (6 of the 9):
- 4 complex-congenital sinus-mismatch reads (ccTGA, truncus, TOF) that state the origin structurally
  with no anomaly word ("the RCA arises from the left anterior sinus"). A keyword precise enough to
  avoid normals cannot catch these.
- 1 read that defers the coronary detail to a separately-dictated cardiology report ("see cardiology
  summary"), so the anomaly text is not in the radiology-CT document the keyword clause is ANDed with.
- 1 case ("anomalous origin of the LCx from the RCA") that contains a keyword and a catalog exam type
  yet STARR still does not pull, unexplained by keywords or date range. Flag for STARR-side follow-up.

## Cross-extract linkage (correction)

An earlier note here claimed 6636 and 6660 are the same 2,353 patients (linked by `chart_review_id`)
and asked why 6660 carried ~60% more reports and ~2x the AAOCA for the same people. That premise was
wrong. `chart_review_id` does not link people across extracts: it is a 1..N row number assigned
independently per extract (its `chart_review_cohort` differs, 50470 vs 50566). Joining on it pairs
random patients (~49% sex agreement, i.e. chance; 0% date-of-birth agreement).

The real cross-extract key is the de-identified `patient_id` (STSS…), which is deterministic per
person: the PHI date-shift is a fixed per-patient offset, so the same person keeps the same
`patient_id`, sex, date of birth, and coronary-CTA report text across extracts. By that key:
- 6636 and 6660 share ~700 patients, not 2,353. The cohorts are ~70% disjoint.
- The AAOCA "doubling" (364 → 673 patients) is cohort composition, not fuller reads: roughly 300 of
  6660's AAOCA patients are absent from 6636 entirely (pulled in by the keyword criterion), and among
  patients in both extracts the classifier's AAOCA calls agree.
- The report-count jump is the same story (different patients), not a date filter on the same people.

`accession_number` is a per-extract surrogate (`SHS-#####`) and also does not link across extracts
(shared values map to different patients and text); use it only for within-extract study dedup.

To re-verify on a future extract, link by `patient_id`, fall back to `(legal_sex, date_of_birth)`
unique in both, and never by `chart_review_id`.
