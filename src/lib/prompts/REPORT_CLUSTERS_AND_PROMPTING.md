# AAOCA CTA report clusters and prompting plan

Analysis of the 546 confirmed-AAOCA reports in
`Confirmed AAOCA CTA Reports/full cohorts/extract_6661/aaoca_preprocessed/confirmed_AAOCA/reports.jsonl`,
and what to change in the parser (`src/lib/openaiParser.ts`) and prompt
(`src/lib/prompts/ctaParser.prompt.ts`) so the LLM focuses on AAOCA-pertinent
positives and negatives instead of the templated chest/abdomen survey.

> Status: this branch is rebased on `analysis-page`, which already scopes the
> prompt to paper-tracked features, filters extracoronary negatives, and emits
> structured course-length and anomalous-left-subtype output. So the prompt and
> schema recommendations below are largely covered there. What this branch
> actually ships is the deterministic preprocessing layer that analysis-page
> does not have: report-family classification (`reportFamily.ts`), boilerplate
> stripping and distractor-section fencing (`reportPreprocess.ts`), and a
> family-specific prompt preamble. The cluster analysis is kept because it is
> what justifies those families and the fencing scope map.

## Headline

The current prompt was designed on the 13 sponsor reports. Eleven of those use one
template (EXTRACORONARY CARDIOVASCULAR) and two use another (SEGMENTAL ANALYSIS).
Those two templates together are only 37% of the full cohort (201/546). The other
63% use structures the prompt has never seen, and most of them carry a large block
of templated extracoronary "normal" statements (lungs, pleura, bones, abdomen,
lymph nodes) that the current instruction "extract every clinically relevant term,
asserted and negated" turns into output noise.

Measured on the one batch already parsed (5 reports, all family F3): 28-47 findings
per report, 8-15 of them negated. On report `STSS27a05cd1` only about 6 of 33
findings are AAOCA-pertinent; the rest are extracoronary negatives (no pulmonary
embolism, no lymphadenopathy, no pericardial effusion), aortic measurements, and
incidental liver cysts. Signal-to-noise is roughly 1 in 5.

## The five clusters

Families are mutually exclusive, assigned by the first header signature that matches
(rules in the "Family classifier" section). The split tracks a clinical reality:
pediatric congenital-anomaly workups (F1, F4) versus adult coronary-CAD workups
(F2, F3).

| Family | n (%) | Median age | Defining header(s) | Coronary section | Distractor load | AAOCA vocab | Prompt seen it? |
|---|---|---|---|---|---|---|---|
| F1 extracoronary-CV (sponsor-style) | 170 (31%) | 11 | `EXTRACORONARY CARDIOVASCULAR`, `Prior Surgery/Intervention:` | prose per vessel (Left Main / LAD / Left Circumflex / Right) | low-moderate (`OTHER` block) | high (MB 64%, intramural 46%) | yes (11 of 13 sponsor) |
| F2 adult-CAD + chest survey | 172 (31%) | 62 | `REMAINING CHEST` + `REMAINING CARDIOVASCULAR STRUCTURES` | prose per vessel, often CAD-first | high (full chest survey, 5-9 templated negatives) | low (MB 25%, intramural 12%), CAD-RADS 79% | no |
| F3 Stanford structured per-vessel | 43 (8%) | 52 | `Visualized lungs:` with per-vessel sublist | structured (`Proximal/Mid/Distal LAD: Normal`) | high (FINDINGS organ list + `MISC` abdomen) | mixed, CAD-RADS 53% | no |
| F4 congenital / segmental | 31 (6%) | 9 | `SEGMENTAL ANALYSIS` | prose per vessel | medium, distractor is congenital anatomy (situs, cavae, pulmonary veins) | high (MB 71%) | yes (2 of 13 sponsor) |
| F5 lean prose / calcium-score | 130 (24%) | 41 | none of the above | prose, sometimes `CALCIUM SCORE` table + `REFERENCE NORMS` | low-medium, plus numeric calcium tables | variable (intramural 34%) | no |

Notes that matter for prompting:

- F1 and F2 read as two templates because they are two populations. F1 is pediatric
  (97% under 18); F2 is adult (88% 40+). The anomaly is the same target; the
  surrounding report is not.
- F2 expresses the anomaly tersely inside a `Left main:` / `Right:` line and restates
  it in `IMPRESSION`, then spends most of its length on `REMAINING CHEST` normals.
  Example anomaly line from F2: "Anomalous origin of the left main arises from the
  right coronary cusp jointly with RCA and takes transseptal course entering the
  septal myocardium. Full-thickness course ... within the septum for a distance of
  42 mm." That course type (transseptal) is not in the current prompt.
- F4's distractor is different from the others: congenital segmental anatomy
  (situs, cavae, pulmonary veins, AV/VA connection). Some of it is genuinely
  relevant (for example a left SVC draining to the coronary sinus), so this section
  cannot be blanket-ignored the way the chest survey can.
- F5 contains per-vessel `CALCIUM SCORE` numeric tables ("Number of lesions = 0;
  volume (mm^3) = 0; calcium score = 0") and a `REFERENCE NORMS` paragraph, neither
  of which the current EXCLUDE list covers.

## What the prompt currently misses or over-extracts

Course descriptors present in the cohort but not enumerated in the prompt:

- retroaortic: 74 reports
- transseptal / intraseptal / intramyocardial / "within the septum": 24 reports
- prepulmonic / subpulmonic / anterior: 15 reports

(For comparison the prompt does name interarterial, 374 reports, and intramural, 161.)

Spelling and format variants for the same concept, which need to collapse in
`normalizedName`:

- anomalous (442) vs aberrant (111)
- slit-like (40) vs slitlike (66) vs slit like (10)
- interarterial (336) vs inter-arterial (45) vs intra-arterial (25)

Non-AAOCA blocks the prompt does not exclude and that leak into output:

- templated extracoronary negatives: 323 reports (59%) have 5 or more lines like
  "Lymph nodes: no lymphadenopathy", "Pleura: No significant abnormality",
  "Bones: No aggressive osseous lesions"
- calcium-score numeric tables: 66 reports
- CAD-RADS reference text: 197 reports
- signature / consult-line / "Interpreted by" boilerplate: 315 reports
- PHI-masking footer: all 546

## Recommended pipeline changes (`src/lib/openaiParser.ts`, orchestrator)

Three deterministic preprocessing steps before the LLM call, all cheap, none requiring
a second model:

1. Family classifier. Tag each report F1-F5 by header signature (rules below). Store
   on the parse result. This drives section scoping, lets you inject a family-specific
   preamble, and lets you eval per-family instead of in aggregate.

2. Section segmenter, fence don't delete. Split the report into labeled sections using
   the family's known headers, then wrap out-of-scope sections in explicit markers
   rather than removing them, for example:

   ```
   <<OUT_OF_SCOPE: chest/abdomen survey, do not extract>>
   REMAINING CHEST:
   Lung parenchyma: ...
   <<END_OUT_OF_SCOPE>>
   ```

   Keep the full text as the matching target so the position resolver and UI offsets
   still work (verbatimText stays a substring of the original). Fencing rather than
   truncating preserves the occasional relevant item in a "distractor" section
   (for example the dilated pulmonary artery in F2's REMAINING CARDIOVASCULAR
   STRUCTURES, or the coronary-sinus drainage in F4's segmental analysis), because
   the model still sees it and can pull it into the secondary bucket.

   Per-family scope map:

   - In scope (extract): CORONARY ARTERIES / per-vessel lines / SEGMENTAL ANALYSIS
     coronary portion / CORONARY ARTERY ANGIOGRAM FINDINGS, IMPRESSION, CLINICAL
     HISTORY (the suspected anomaly and the specific question only), aortic root
     measurements, and the cardiovascular part of EXTRACORONARY CARDIOVASCULAR
     (heart, pericardium, aorta, pulmonary arteries).
   - Out of scope (fence): REMAINING CHEST, OTHER, lung parenchyma, airways, pleura,
     chest wall, bones, upper abdomen, lymph nodes, medical devices, TECHNIQUE /
     PROCEDURE COMMENTS / dose, CALCIUM SCORE numeric tables and REFERENCE NORMS,
     signature / consult / PHI-masking footer.
   - F4 exception: do not fence the whole segmental analysis; keep it in scope but
     mark it secondary, since pieces of it are AAOCA-adjacent.

   For F5 and any report whose headers do not match a known family, skip fencing and
   send the full text; the prompt's exclude list is the only filter there.

3. Pass manifest priors. The manifest already records `side` (RCA or LCA = the
   anomalous vessel), `age`, and `date`. Feed `side` to the model as a hint
   ("the anomalous vessel is on the RCA side") so it anchors on the right vessel and
   does not under-read a tersely described anomaly. Do not let the hint drive
   negation; it is a focusing prior, not a label.

## Recommended prompt changes (`src/lib/prompts/ctaParser.prompt.ts`)

The core change is to replace "extract every clinically relevant term" with a scoped
AAOCA target, split into three buckets, and add an explicit do-not-extract list drawn
from the real templates. Keep the parts that already work: coronary-modifier
resolution, the exact-text rule, dedup, and the myocardial bridge summary.

Specific edits:

1. Reframe TASK: extract AAOCA-pertinent findings (the anomaly and the features that
   drive surgical risk) plus a short list of secondary cardiac findings; do not
   extract the templated extracoronary survey or scan/admin boilerplate. Precision
   over recall on non-coronary content.

2. Add the AAOCA target ontology (positives and the pertinent negatives), enumerating
   all course types including the missing retroaortic, transseptal/intraseptal, and
   prepulmonic/subpulmonic.

3. Add a canonical vocabulary so `normalizedName` collapses the spelling variants, and
   add the rule that interarterial vs intramural is decided by context (between the
   great vessels = interarterial; within the aortic wall = intramural), since
   "intra-arterial" is used loosely in this corpus.

4. Add a `certainty` distinction for hedged anomalies. Many reports hedge: "likely
   has an intra-arterial course", "suggesting very slight interarterial course". For
   AAOCA the difference between confirmed and suspected matters. Either add a third
   value (`suspected`) or a `certainty` field alongside `assertion`.

5. Add an explicit DO NOT EXTRACT list with examples from the templates.

6. Split output into buckets (schema change): `aaocaFindings` (primary),
   `secondaryCardiac` (aortic root, ventricles, valves, CAD-RADS, pericardial
   effusion if present), and optionally `incidental` (liver cyst, lung nodule,
   thyroid nodule) which the cardiologist can collapse. Keep `myocardialBridgeSummary`.
   Add a patient-level `anomalySummary` (anomalous vessel, origin sinus/cusp, ostium
   type, course types, high-risk features present/absent, intramural length), which is
   the structured core the dashboard wants, analogous to the bridge summary.

7. Inject a one-line family preamble selected by the classifier, for example for F2:
   "This report uses the adult chest-survey template. The chest, abdomen, bone, and
   lymph-node lines are templated normals; ignore them. The anomaly is in CORONARY
   ARTERIES and restated in IMPRESSION."

### Drop-in revised prompt

```
You are a clinical NER system for coronary CT angiogram (CTA) reports, used to
build an AAOCA registry for pediatric and adult cardiology. Your output is shown to
a cardiologist evaluating anomalous aortic origin of a coronary artery (AAOCA).

PRIME DIRECTIVE
Extract the anomaly and the features that drive AAOCA surgical risk, plus a short
list of secondary cardiac findings that affect management. Do NOT extract the
templated extracoronary survey (lungs, pleura, airways, chest wall, bones, abdomen,
lymph nodes) or scan/administrative text. On non-coronary content, prefer precision:
when in doubt, leave it out. Reports vary in template; the anomaly may sit in a
single line under CORONARY ARTERIES and be restated in IMPRESSION.

{{FAMILY_PREAMBLE}}
{{ANOMALOUS_SIDE_HINT}}

BUCKET 1 - AAOCA-PRIMARY (extract, asserted and negated)
Origin: anomalous/aberrant origin of a coronary from a sinus or cusp; right coronary
  cusp, left coronary cusp, non-coronary cusp; opposite/wrong sinus; single or shared
  ostium; separate ostium; high origin above the sinotubular junction.
Course (capture all that apply): interarterial; intramural (with length in mm);
  transseptal / intraseptal / intramyocardial / "within the septum"; retroaortic;
  prepulmonic / anterior / subpulmonic.
High-risk morphology: slit-like / slit-shaped / oval ostium; acute or tangential
  takeoff angle; proximal narrowing, stenosis, or hypoplasia of the anomalous segment;
  dynamic systolic compression.
Measurements bound to the anomaly: intramural length, interarterial length, ostial
  dimensions, cross-sectional dimensions, distance above the sinotubular junction,
  percent stenosis.
Dominance, and the normal-origin statements for the non-anomalous vessels (these are
  the pertinent negatives that confirm a single anomaly).
Pertinent negatives to keep: no interarterial course; no intramural segment; no
  systolic compression; no significant narrowing of the anomalous vessel; no
  myocardial bridge; no high-risk features.
Myocardial bridging: see MYOCARDIAL BRIDGE SUMMARY below (unchanged).

BUCKET 2 - SECONDARY CARDIAC (extract, mark secondary)
Aortic root and ascending aorta dimensions; LV/RV size, function, hypertrophy; valve
disease; pericardial effusion if present; significant CAD, calcified or non-calcified
plaque, and the CAD-RADS category as a single finding; intracardiac thrombus.

BUCKET 3 - DO NOT EXTRACT
Templated extracoronary survey normals: "Lungs clear", "No pleural effusion",
  "No lymphadenopathy", "Airways/Chest wall/Bones/Upper abdomen: No significant
  abnormality", and incidental non-cardiac findings (liver cyst, lung nodule, thyroid
  nodule) unless asked.
Calcium-score numeric tables ("Number of lesions = ...; volume (mm^3) = ...; calcium
  score = ...") and REFERENCE NORMS paragraphs.
Technique, procedure comments, dose (DLP, CTDIvol, mGy), contrast, gating,
  reconstruction.
Section headers, signatures, "Interpreted by", consult-line phone numbers, accession
  numbers, and the PHI-masking footer lines.

CERTAINTY
Set assertion = "asserted" when present, "negated" when explicitly absent. When the
finding is hedged but reported as probably present ("likely interarterial",
"suggesting an interarterial course"), set assertion = "asserted" and certainty =
"suspected". Use certainty = "definite" otherwise.

CANONICAL VOCABULARY (normalizedName)
Collapse variants: anomalous = aberrant; slit-like = slitlike = slit-shaped;
interarterial = inter-arterial = intra-arterial. Decide interarterial vs intramural by
context: a course between the aorta and pulmonary artery is interarterial; a segment
running inside the aortic wall is intramural. Resolve generic modifiers to the most
specific vessel or segment in the same or preceding sentence (keep the existing
coronary-modifier rule and examples).

[KEEP UNCHANGED: CORONARY-SPECIFIC MODIFIERS, MEASUREMENTS include/exclude,
MYOCARDIAL BRIDGE SUMMARY, PARTIAL NEGATION, DEDUPLICATION, EXACT-TEXT RULE.]

OUTPUT
Call record_findings once with: anomalySummary, myocardialBridgeSummary,
aaocaFindings, secondaryCardiac. Each finding keeps verbatimText, normalizedName,
assertion, certainty, context.
```

### Schema changes (`FINDINGS_SCHEMA` in `openaiParser.ts`)

- Split `findings` into `aaocaFindings` and `secondaryCardiac` (same item shape),
  optionally `incidental`.
- Add `certainty` ("definite" | "suspected") to the finding item.
- Add `anomalySummary` object: `anomalousVessel`, `originSinus`, `ostiumType`,
  `courseTypes` (array), `intramuralLengthMm`, `highRiskFeatures` (array),
  `compressionPresent` (bool/null).
- Keep `myocardialBridgeSummary` as is.

The position resolver and review UI keep working: every finding still has
verbatimText resolved against the full report text.

## Family classifier (validated rules)

Assign the first match:

1. F1 if text contains `EXTRACORONARY CARDIOVASCULAR`.
2. else F2 if text contains `REMAINING CHEST` or `REMAINING CARDIOVASCULAR STRUCTURES`.
3. else F3 if text contains `Visualized lungs` (case-insensitive `visualized lung`).
4. else F4 if text contains `SEGMENTAL ANALYSIS`.
5. else F5.

Validated on the 546-report set: F1 170, F2 172, F3 43, F4 31, F5 130, no overlap.
The two structural headers `EXTRACORONARY CARDIOVASCULAR` and `REMAINING CHEST` never
co-occur, which is why they are separate families.

## Rollout and eval

1. Build a per-family gold set (5-10 reports each, hand-annotated for AAOCA-pertinent
   findings). The only existing parsed sample is 5 reports, all F3.
2. Metrics to track per family: recall on AAOCA-primary findings, precision on
   AAOCA-primary, and a noise rate (count of extracoronary templated negatives that
   still leak through). Baseline to beat: report `STSS27a05cd1`, about 6 AAOCA-pertinent
   of 33 returned.
3. Order of change by leverage: prompt rescope and do-not-extract list first (helps all
   families, no code), then the buckets and anomalySummary schema, then the family
   classifier and section fencing (largest win on F2 and F3), then manifest priors.
```
