/**
 * Deterministic CTA report family classifier.
 *
 * The 546-report confirmed-AAOCA cohort splits into five template families by
 * header signature. The split tracks the clinical population: pediatric
 * congenital workups (F1, F4) vs adult coronary-CAD workups (F2, F3), with a
 * lean-prose remainder (F5). See
 * src/lib/prompts/REPORT_CLUSTERS_AND_PROMPTING.md for the analysis.
 *
 * Families drive two things downstream:
 *   1. which sections reportPreprocess.ts fences as out-of-scope, and
 *   2. a one-line preamble injected into the parser prompt.
 *
 * Classification is a pure function of the report text. Rules are priority-
 * ordered and mutually exclusive; the two structural headers
 * "EXTRACORONARY CARDIOVASCULAR" and "REMAINING CHEST" never co-occur in the
 * cohort, which is why F1 and F2 are distinct.
 */

export type ReportFamily =
  | "F1_extracoronary_cv"
  | "F2_remaining_chest"
  | "F3_visualized_lungs"
  | "F4_segmental_analysis"
  | "F5_other_prose";

export const FAMILY_LABEL: Record<ReportFamily, string> = {
  F1_extracoronary_cv: "Extracoronary-cardiovascular (sponsor-style)",
  F2_remaining_chest: "Adult CAD with chest survey",
  F3_visualized_lungs: "Stanford structured per-vessel",
  F4_segmental_analysis: "Congenital / segmental analysis",
  F5_other_prose: "Lean prose / calcium-score",
};

/**
 * Assign the first matching family. Order matters: F1's header is checked
 * before F2's because they are exclusive in the cohort, and F3/F4 markers can
 * appear inside otherwise-F1/F2 reports.
 */
export function classifyReportFamily(text: string): ReportFamily {
  if (/EXTRACORONARY CARDIOVASCULAR/i.test(text)) return "F1_extracoronary_cv";
  if (/REMAINING CHEST|REMAINING CARDIOVASCULAR STRUCTURES/i.test(text))
    return "F2_remaining_chest";
  if (/visualized lung/i.test(text)) return "F3_visualized_lungs";
  if (/SEGMENTAL ANALYSIS/i.test(text)) return "F4_segmental_analysis";
  return "F5_other_prose";
}

/**
 * One-line, family-specific note prepended to the parser prompt so the model
 * knows where the anomaly lives and what the templated filler is. Empty for
 * F5, where structure is not predictable.
 */
export function familyPreamble(family: ReportFamily): string {
  switch (family) {
    case "F1_extracoronary_cv":
      return "This report uses the coronary-focused sponsor template. The anomaly is in CORONARY ARTERIES (per-vessel: Left Main / LAD / Left Circumflex / Right) and restated in IMPRESSION. EXTRACORONARY CARDIOVASCULAR and OTHER are mostly templated normals.";
    case "F2_remaining_chest":
      return "This report uses the adult chest-survey template. The REMAINING CHEST and REMAINING CARDIOVASCULAR STRUCTURES lines (lungs, pleura, airways, chest wall, bones, abdomen, lymph nodes) are templated normals; ignore them. The anomaly is in CORONARY ARTERIES and restated in IMPRESSION; calcium score and CAD-RADS describe atherosclerosis, not the anomaly.";
    case "F3_visualized_lungs":
      return "This report lists each organ system under FINDINGS (Visualized lungs, Pulmonary Arteries, Mediastinum, Heart, Pericardium) then a per-vessel CORONARY ARTERIES breakdown, then MISC (abdomen, bones). Extract from the coronary breakdown and IMPRESSION; the organ-system and MISC lines are templated normals.";
    case "F4_segmental_analysis":
      return "This is a congenital-heart template. Extract the coronary findings and IMPRESSION. The SEGMENTAL ANALYSIS block (situs, cavae, pulmonary veins, AV/VA connection) is mostly normal variants, but pull anything that touches the coronaries, such as a left SVC draining to the coronary sinus.";
    case "F5_other_prose":
      return "";
  }
}
