# STARR cohort definition (AAOCA)

Tool: STARR Cohort Discovery (https://starr-tools.med.stanford.edu/starr-tools/).
Two extracts have been pulled; both use Clinical documents → Computed Tomography, age = any age,
event date = any date, occurrence frequency = one or more, delivered as STRIDE / Download /
de-identified (PHI scrubbed, per-patient date shift), EMR Data = Radiology Reports → CT only.

| | extract 6636 (previous) | extract 6660 (current) |
|---|---|---|
| cohort title | "final cohort test (modified)" | "cohort by relevant AAOCA reports & keywords" |
| exam-type criterion | 24 names (below) | expanded list + variants (below) |
| keyword criterion | none | 27 terms (below) |
| patients | 2,353 | 2,359 (2,353 shared + 6 new) |
| CT reports | 18,887 | 30,332 |

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

## Note / open item

6636 and 6660 are the same patient set (all 2,353 shared by chart_review_id, +6 new) yet 6660
carries ~60% more reports (30,332 vs 18,887) and ~2x the AAOCA (929 vs 568 reports; 673 vs 364
patients). Both cohorts used event date = any date, so the report-count jump is not a cohort-level
date filter. The likely source is the Create-Extract form's own optional Date Range (separate from
the cohort's event date) or simply a later, fuller pull. Confirm what differed on the extract side
before treating 6660 as a like-for-like refinement of 6636.
