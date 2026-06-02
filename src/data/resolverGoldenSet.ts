/**
 * Golden examples for the entity-linking resolver (#66) and its eval (#40).
 *
 * Each example is a real finding harvested from the parsed CTA corpus: the
 * `normalizedName` the parser emitted, a trimmed `context` snippet, the
 * `assertion`, and the `expected` paper entity id it should resolve to (or
 * "none" for normal anatomy / out-of-scope).
 *
 * Purpose: this is the label space the LLM resolver must hit. The set is the
 * regression gate the resolver eval runs against, and a few of these double as
 * few-shot anchors in the resolver prompt. Cases marked with a `note` are
 * disambiguation or boundary calls that the rule-based matcher gets wrong (or
 * that need a clinical second opinion); they are deliberately included so the
 * review cycle scrutinizes them.
 *
 * This file ships ahead of the resolver itself. Until the resolver lands, the
 * companion test only checks the set's structural integrity (valid ids, unique
 * inputs, breadth). Once the resolver exists, it is fed these same examples and
 * gated on `expected`.
 *
 * `expected` is a PAPER_FEATURES id (see src/data/paperFeatures.ts) or NONE.
 */

import type { Assertion } from "@/data/parseTypes";

export const NONE = "none" as const;

export interface ResolverGoldenExample {
  /** normalizedName the parser emitted (verbatim from the corpus). */
  normalizedName: string;
  /** Trimmed sentence of surrounding report context. */
  context: string;
  assertion: Assertion;
  /** PAPER_FEATURES id this finding should resolve to, or NONE. */
  expected: string;
  /** Why this case is non-obvious, for boundary / disambiguation labels. */
  note?: string;
}

export const RESOLVER_GOLDEN_SET: ResolverGoldenExample[] = [
  // --- Coronary dominance: the rule matcher only knows "RD"/"right dominance";
  // the verbose dictation forms all scatter into "Other" today. -------------
  {
    normalizedName: "Right Dominant Coronary Circulation",
    context: "Right dominant coronary arterial system.",
    assertion: "asserted",
    expected: "right_dominance",
  },
  {
    normalizedName: "Right Dominant Coronary Artery System",
    context: "CORONARY ARTERIES: Right dominant coronary artery system.",
    assertion: "asserted",
    expected: "right_dominance",
  },
  {
    normalizedName: "Right dominant coronary artery anatomy",
    context: "Right: No visible plaque or stenosis. Right dominant coronary artery anatomy.",
    assertion: "asserted",
    expected: "right_dominance",
  },
  {
    normalizedName: "Left Dominant Coronary System",
    context: "- Dominance: The coronary system is left dominant.",
    assertion: "asserted",
    expected: "left_dominance",
  },
  {
    normalizedName: "Codominant Coronary Artery System",
    context: "CORONARY ARTERIES: Codominant coronary artery system.",
    assertion: "asserted",
    expected: "codominance",
  },

  // --- Anomalous origin: same concept, many surface forms. ------------------
  {
    normalizedName: "Anomalous origin of RCA from left coronary cusp",
    context:
      "RIGHT CORONARY ARTERY: Anomalous origin from the left coronary cusp with a 7 mm segment that is severely stenotic.",
    assertion: "asserted",
    expected: "r_aaoca",
  },
  {
    normalizedName: "Anomalous Right Coronary Artery",
    context: "Aberrant right coronary artery with high take off 0.9 cm above the sinotubular junction.",
    assertion: "asserted",
    expected: "r_aaoca",
  },
  {
    normalizedName: "Anomalous origin of left main coronary artery from right coronary cusp",
    context:
      "Left main: Malignant course of the left main coronary artery which courses from the right coronary cusp inter-arterially for 24 mm.",
    assertion: "asserted",
    expected: "l_aaoca",
  },
  {
    normalizedName: "Anomalous origin of left main coronary artery from right coronary sinus",
    context: "- Origins: The RCA and the LMCA both arise from the right coronary sinus.",
    assertion: "asserted",
    expected: "l_aaoca",
  },
  {
    normalizedName: "anomalous origin of left circumflex artery from right coronary cusp",
    context: "Left Circumflex Artery: Anomalous origin from the right coronary cusp, with a retroaortic course.",
    assertion: "asserted",
    expected: "lcx_aaoca",
  },
  {
    normalizedName: "anomalous origin of left circumflex artery from right coronary artery",
    context:
      "Left Circumflex: Arises from the right coronary artery shortly after its origin, and courses posteriorly to take a retroaortic course.",
    assertion: "asserted",
    expected: "lcx_aaoca",
  },
  {
    normalizedName: "Anomalous Origin of Left Circumflex Artery",
    context: "Left Circumflex: Patent with no anomalous origin, aneurysm or stenosis.",
    assertion: "negated",
    expected: "lcx_aaoca",
    note: "Negated anomalous origin still maps to the entity; the resolver must not drop negatives that name a paper feature.",
  },

  // --- Proximal course: positive controls + a dictation typo. ---------------
  {
    normalizedName: "Interarterial course of RCA",
    context: "This interarterial course is considered malignant.",
    assertion: "asserted",
    expected: "interarterial_course",
    note: "Positive control: the rules already resolve this. 'Malignant' is a risk word the paper avoids; it does not change the entity.",
  },
  {
    normalizedName: "Interatrial Course of Proximal RCA Between Aorta and Right Ventricle",
    context: "Anomalous origin of the RCA arising from the proximal aorta with malignant interatrial course of the proximal RCA.",
    assertion: "asserted",
    expected: "interarterial_course",
    note: "'Interatrial' is a frequent dictation typo for interarterial; the rules miss it.",
  },
  {
    normalizedName: "Intramural Course of Right Coronary Artery, 8 mm",
    context: "Suspected intramural segment measuring 8 mm in length.",
    assertion: "asserted",
    expected: "intramural_course",
    note: "Intramural = within the aortic wall. Contrast with the intramuscular/bridge case below.",
  },

  // --- Sinus / ostium. ------------------------------------------------------
  // high_origin here is the OPERATIONAL reading, not the paper's strict threshold.
  // The paper defines HO formally as >=5 mm or >20% of sinus depth above the STJ
  // (Level IV), with at-the-STJ being Level III. But reports almost never state
  // the measurement, so reserving high_origin for the strict threshold would push
  // most real "high takeoff" findings to none or an unassignable height level and
  // lose the signal. The measured-height case is what level_i..level_iv are for.
  // So both cases below resolve to high_origin: the 9 mm one (clearly above) and
  // the qualitative at-the-STJ takeoff. Decided 2026-06-02; the catalog definition
  // of high_origin was widened to match (entityCatalog.ts).
  {
    normalizedName: "High origin of right coronary artery above sinotubular junction, 9 mm",
    context: "Right: High origin of the right coronary artery which arises approximately 9 mm above the sinotubular junction.",
    assertion: "asserted",
    expected: "high_origin",
    note: "Origin above the STJ is the definition of high origin; it should resolve to high_origin, not to the sinutubular_junction landmark.",
  },
  {
    normalizedName: "Slit-like ostium of right coronary artery",
    context: "The RCA is slit-like at its origin.",
    assertion: "asserted",
    expected: "slit_like_ostium",
  },
  {
    normalizedName: "Acute Angle of Takeoff of Right Coronary Artery",
    context: "Right Coronary Artery: Originates near the intersection of the right and left coronary cusps at an acute angle.",
    assertion: "asserted",
    expected: "acute_angle_of_takeoff",
  },
  {
    normalizedName: "sinotubular junction",
    context: "High takeoff of the coronary arteries, about the level of the sinotubular junction.",
    assertion: "asserted",
    expected: "high_origin",
    note: "Contract: resolve the clinical concept from name + context, not the bare surface name. A high-takeoff-at-the-STJ context is high_origin; the parser prompt already treats 'origin at/above the STJ' as high origin and says bare STJ landmarks should not be standalone findings. Also a sino-/sinu- spelling-robustness case: the spelling must not block resolution.",
  },

  // --- Atherosclerotic lesions: tracked as presence; detailed CAD grading is
  // beyond the paper's scope (p13). -----------------------------------------
  {
    normalizedName: "Mild Coronary Plaque",
    context: "P1: 1-2 vessels with mild amount of plaque.",
    assertion: "asserted",
    expected: "coronary_atherosclerotic_lesions",
    note: "'Plaque' is the atherosclerotic-lesion feature; the alias list only carries 'calcifications'.",
  },
  {
    normalizedName: "Coronary Calcification of Left Main Coronary Artery",
    context: "Left Main Coronary Artery: Normal caliber and contour. No calcifications.",
    assertion: "negated",
    expected: "coronary_atherosclerotic_lesions",
  },

  // --- Myocardial bridge, including the intramural-vs-intramyocardial trap. --
  {
    normalizedName: "Type 1 Partial Myocardial Bridge Of Mid LAD, 11 Mm Length",
    context: "Incidental note is made of a partial (type I) myocardial bridge within the mid LAD.",
    assertion: "asserted",
    expected: "myocardial_bridge",
    note: "Bridge entity only; the grade/length live in the structured myocardialBridgeSummary, not the entity label (see #82).",
  },
  {
    normalizedName: "Myocardial Bridge of Left Anterior Descending Artery",
    context: "Left Anterior Descending: Patent without significant narrowing. No significant myocardial bridge.",
    assertion: "negated",
    expected: "myocardial_bridge",
  },
  {
    normalizedName: "Intramuscular course of left main coronary artery, 27 mm",
    context:
      "After its aberrant origin, the LMCA turns sharply to the left and dives into the ventricular outlet septum. The LMCA courses intramuscularly for 2.7 cm.",
    assertion: "asserted",
    expected: "intraseptal_course",
    note: "Aberrant LMCA diving into the ventricular outlet septum is the intraseptal pattern, not a myocardial bridge (a normally-arising epicardial vessel tunneling under myocardium mid-course) and not intramural (within the aortic wall). The 'intramuscular = bridge' heuristic misfires because the septum is muscle. anomalous_left_intraconal (alias 'left main with intraseptal course') is the same finding on the anomalous-vessel axis; resolver author sets axis priority.",
  },

  // --- Single trunk. --------------------------------------------------------
  {
    normalizedName: "Single Coronary Artery Arising Off The Left Cusp",
    context: "Single coronary artery arising off the left cusp, designated the left main coronary artery.",
    assertion: "asserted",
    expected: "st_aaoca",
    note: "The alias list only carries 'single trunk'; 'single coronary artery' misses. Two-axis ambiguity: st_aaoca is the anomalous-vessel label; type_4_single_coronary_trunk (alias 'single coronary trunk') is the same concept on the ostial-relationship axis. Labeled on the vessel axis here; resolver author sets axis priority.",
  },

  // --- None: normal anatomy and genuinely out-of-scope. ---------------------
  {
    normalizedName: "Origin of Left Main Coronary Artery from Left Coronary Cusp",
    context: "LEFT MAIN CORONARY ARTERY: Normal origin from the left coronary cusp. Normal.",
    assertion: "asserted",
    expected: NONE,
    note: "LM from the left cusp is normal anatomy. Same surface shape as an anomalous origin; only the vessel-sinus pairing distinguishes it. This is why a keyword rule cannot decide it (#39).",
  },
  {
    normalizedName: "Coronary Artery Aneurysm",
    context: "No new aneurysm is identified.",
    assertion: "negated",
    expected: NONE,
    note: "Aneurysm is not an AAOCA nomenclature feature.",
  },
  {
    normalizedName: "Obstructive coronary artery disease",
    context: "No evidence of obstructive coronary artery disease [CAD-RADS 0].",
    assertion: "negated",
    expected: "coronary_atherosclerotic_lesions",
    note: "Scope rule: lesion presence/absence is the tracked feature; obstruction/stenosis-severity grading (CAD-RADS as a risk grade) is beyond paper scope (p13). CAD-RADS 0 asserts no plaque, the same presence axis as 'Mild Coronary Plaque' and 'No calcifications', so it is negated coronary_atherosclerotic_lesions, not none.",
  },
];
