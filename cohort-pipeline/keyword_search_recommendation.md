# Keyword search for AAOCA, expanded from the real report language

Measured against the 568 confirmed-AAOCA reports in Nino's cohort. The sponsor's proposed list
(acronyms AAOCA/AAORCA/AAOLCA + "anomalous aortic origin") matches only 17/568 = 2%, because the
acronyms almost never appear in report bodies. The recommended list below reaches ~92%.

Hit rate = fraction of the 568 confirmed-AAOCA reports whose text contains the term.

## Recommended keywords (OR all of these) and why each is in

| keyword(s) | hit rate | rationale |
|---|---:|---|
| interarterial / inter-arterial | 64% / 6% | The single highest-yield term. An interarterial course (vessel running between aorta and pulmonary artery) is the hallmark of the dangerous anomalous origin, and a normally-arising coronary is never described this way. Both spellings included; radiologists vary. |
| anomalous origin | 43% | The dominant explicit phrase ("anomalous origin of the RCA / left main / ..."). Core recall driver. |
| anomalous right coronary / anomalous left coronary / anomalous RCA / anomalous LAD / anomalous circumflex / anomalous left main | 23% / 2% / 9% / 1% / 0.5% / 1% | Vessel-named variants. Some reports write "anomalous RCA" without the word "origin", so "anomalous origin" alone misses them. These plug that gap and also let you split RCA vs left at search time. |
| anomalous coronary | 8% | Catches the generic "anomalous coronary artery" phrasing. |
| aberrant right coronary / aberrant RCA / aberrant origin / aberrant left main | 22% (bare "aberrant") | "Aberrant" is the main synonym for "anomalous". Written as coronary-specific forms on purpose: bare "aberrant" pulls aberrant subclavian artery, a frequent unrelated incidental. |
| single coronary | 8% | A distinct origin-anomaly subtype (single coronary artery / ostium / trunk). Specific. |
| common origin / common ostium | 6% / 2% | Both coronaries sharing one origin or ostium, an origin anomaly. |
| high takeoff / high origin | 13% / 12% | Capture the high/commissural-origin variant, some of which reports describe as "high takeoff" rather than "anomalous". Adds a little noise (benign high-takeoff variants) for the recall gain. |
| intraseptal / intraconal / subpulmonic | ~1% each | The (more benign) left-sided anomalous courses. Low individual yield but specific, and they catch cases the "anomalous origin" wording misses. A normal vessel is never described this way. |
| retroaortic / prepulmonic | 5% / 0% | Other named anomalous courses (e.g., retroaortic circumflex). Specific; cheap to include. |
| slit-like | 6% | A slit-like ostium is strongly tied to intramural anomalous origins. Abnormal morphology, fairly specific; catches morphology-led reports. |
| anomalous aortic origin | 1% | The sponsor's formal term and the canonical name. Low yield but catches the rare structured report; included to honor the request and to span non-CTA documents. |
| AAOCA / AAORCA / AAOLCA | ~1% / 1% / 0% | Near-zero in report bodies. Kept because they are cheap, honor the sponsor's list, and pick up mentions in cardiology or operative notes if the search spans non-CTA documents. |

## Deliberately left out, and why

| term | hit rate | why excluded |
|---|---:|---|
| arises from the left coronary sinus | 8% | The left coronary normally arises from the left sinus, so this matches normal anatomy and would flood results with normals. Only abnormal when it is the RCA, but a keyword can't tell which vessel. |
| intramural | (high) | Shared with myocardial bridge ("intramuscular") and aortic intramural hematoma. Too noisy. "interarterial" co-occurs in true cases, so little recall is lost. |
| bare "aberrant" | 22% | Pulls aberrant subclavian artery. Use the coronary-specific forms instead. |
| opposite sinus / opposite coronary sinus | 0% | Near-zero yield. Radiologists name the specific sinus ("from the left coronary sinus") rather than "opposite". |
| myocardial bridge / bridging | n/a | A different entity, not an anomalous origin. Would inflate the pull with bridge-only cases. |

## How to run it and what to expect

- OR all the recommended terms in the "contain keywords" field. If wildcards are supported, `inter*arterial` covers both spellings; keep "anomalous origin" as an exact phrase (bare `anomal*` over-pulls).
- This is a recall net, not a clean cohort. It cannot do negation, so it will also pull normal studies that say "no anomalous origin" or "no interarterial course", and the referral question in the history ("evaluate for anomalous coronary"). Filter afterward (the classifier, or review).
- Residual ~8% missed are post-op cases described only by the repair ("reimplantation", "unroofing") and complex congenital. Add `coronary reimplantation`, `coronary unroofing`, `coronary translocation` to chase them, at the cost of more noise.
- Caveat on the 92%: recall was measured against the set the classifier flagged AAOCA, so the per-term hit rates are real substring frequencies but the combined figure is partly circular. The non-circular fact is the 2%: the acronyms genuinely almost never appear.

## Complementary, not just alternative

A keyword search can catch AAOCA patients whose diagnosis lives in a cardiology or operative note, or on a coronary CTA whose exam name wasn't in the type list. Those are cases the exam-type pull structurally cannot see.

## Structural terms added in extract 6661

The 27-term 6660 net missed AAOCA whose origin is stated structurally, with no "anomalous" / "aberrant" / "interarterial". These were added for 6661 (measured on the 6636 type-only set and the `patient_id`-linked 6660 → 6661 delta):

| term | effect |
|---|---|
| ectopic | recovers "ectopic RCA above the sinotubular junction"; some noise from "ectopic atrial rhythm". |
| non-coronary sinus / cusp | recovers "LMCA from the non-coronary sinus"; high noise, since normal reads say "no vessel arises from the non-coronary cusp" (`non-coronary cusp` alone pulled 117 of the 355 new patients for 2 AAOCA). |
| shared origin | recovers "shared origin of the RCA and LAD". |
| malignant course | specific, low-noise; covers the malignant-course phrasing. |
| opposite sinus / cusp | added but contributed 0, consistent with the 0% note above; safe to drop. |

Net: +355 patients over 6660 (2,359 → 2,714, well under the 7,500 cap), recovering 3 of the 9 AAOCA 6660 had dropped. The other 6 are not keyword-reachable (complex-congenital structural reads and a cardiology-deferred read); see `STARR_cohort_definition.md`.
