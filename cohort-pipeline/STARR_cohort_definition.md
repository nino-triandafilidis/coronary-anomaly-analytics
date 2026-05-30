# STARR cohort definition (AAOCA)

Tool: STARR Cohort Discovery (https://starr-tools.med.stanford.edu/starr-tools/).
Latest extract: `starr_confidential_stride_78827_extract_6660` (2,359 patients, 30,332 CT reports).

## Cohort criteria

Title in STARR: "cohort by relevant AAOCA reports & keywords". Two document criteria, both on
Clinical documents → Computed Tomography:

### A. Exam type — of type(s)

The curated coronary-CTA exam-name list in `cohort_exam_types_final.txt` (KEEP + ADD).
The live cohort additionally included these catalog variants beyond that file:

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

### Filters

- age at event: any age
- event date: any date
- occurrence frequency: one or more

## Extract delivery

STRIDE (in-house) data model, Download, de-identified (PHI scrubbed, per-patient date shift),
EMR Data = Radiology Reports → CT only.

## Note / open item

`extract_6660` is the same patient set as the earlier `extract_6636` (all 2,353 shared by
chart_review_id, +6 new) but carries ~60% more reports (30,332 vs 18,887). Same patients with a
much larger report set means an extract-scope change (date range / delivery), not a cohort change.
Confirm what differed before treating 6660 as a like-for-like refinement of 6636.
