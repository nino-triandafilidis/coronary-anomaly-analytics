import type { ParsedTerm } from "@/data/parseTypes";

export type PaperFeatureTrackingRole = "feature" | "measurement" | "reference";

export interface PaperFeature {
  id: string;
  category: string;
  canonical: string;
  aliases: string[];
  trackingRole: PaperFeatureTrackingRole;
}

const feature = (
  id: string,
  category: string,
  canonical: string,
  aliases: string[] = [],
  trackingRole: PaperFeatureTrackingRole = "feature"
): PaperFeature => ({
  id,
  category,
  canonical,
  aliases,
  trackingRole,
});

export const PAPER_FEATURES: PaperFeature[] = [
  feature("anomalous_vessel", "Anomalous vessel", "anomalous coronary artery", [
    "anomalous vessel",
    "AAOCA",
  ]),
  feature("r_aaoca", "Anomalous vessel", "R-AAOCA", [
    "right coronary artery anomalous origin",
  ]),
  feature("l_aaoca", "Anomalous vessel", "L-AAOCA", [
    "left main coronary artery anomalous origin",
  ]),
  feature("lad_aaoca", "Anomalous vessel", "LAD-AAOCA", [
    "left anterior descending anomalous origin",
  ]),
  feature("lcx_aaoca", "Anomalous vessel", "LCX-AAOCA", [
    "left circumflex anomalous origin",
  ]),
  feature("st_aaoca", "Anomalous vessel", "ST-AAOCA", [
    "single trunk",
  ]),

  feature("left_sinus", "Sinus of origin", "left sinus", [
    "LS",
    "left sinus of Valsalva",
  ]),
  feature("right_sinus", "Sinus of origin", "right sinus", [
    "RS",
    "right sinus of Valsalva",
  ]),
  feature("nonfacing_sinus", "Sinus of origin", "nonfacing sinus", [
    "NS",
    "noncoronary sinus",
  ]),
  feature("high_origin", "Sinus of origin", "high origin", ["HO"]),
  feature("left_right_juxtacommissural", "Sinus of origin", "left-right juxtacommissural", [
    "LR",
  ]),
  feature("left_nonfacing_juxtacommissural", "Sinus of origin", "left-nonfacing juxtacommissural", [
    "LN",
  ]),
  feature("right_nonfacing_juxtacommissural", "Sinus of origin", "right-nonfacing juxtacommissural", [
    "RN",
  ]),
  feature("anterior_sinus", "Sinus of origin", "anterior sinus", ["AS"]),
  feature("posterior_sinus", "Sinus of origin", "posterior sinus", ["PS"]),

  feature("interarterial_course", "Proximal course", "interarterial course", [
    "IA",
    "interarterial",
  ]),
  feature("intramural_course", "Proximal course", "intramural course", [
    "IM",
    "intramural",
  ]),
  feature("intraseptal_course", "Proximal course", "intraseptal course", [
    "IS",
    "intraseptal",
  ]),
  feature("prepulmonic_course", "Proximal course", "prepulmonic course", [
    "PP",
    "prepulmonic",
  ]),
  feature("retroaortic_course", "Proximal course", "retroaortic course", [
    "RA",
    "retroaortic",
  ]),
  feature("pulmonary_facing", "Proximal course", "pulmonary-facing", [
    "pulmonary facing",
  ]),
  feature("rvot_facing", "Proximal course", "RVOT-facing", ["RVOT facing"]),

  feature("sinus_1", "Ostial location - circumferential", "sinus 1"),
  feature("sinus_2", "Ostial location - circumferential", "sinus 2"),
  feature("sinus_3", "Ostial location - circumferential", "sinus 3"),
  feature("segment_a", "Ostial location - circumferential", "segment a"),
  feature("segment_b", "Ostial location - circumferential", "segment b"),
  feature("segment_c", "Ostial location - circumferential", "segment c"),
  feature("juxtacommissural", "Ostial location - circumferential", "juxtacommissural", [
    "JC",
    "commissural origin",
    "juxtacommissural origin",
  ]),

  feature("level_i", "Ostial location - height", "level I", ["level 1"]),
  feature("level_ii", "Ostial location - height", "level II", ["level 2"]),
  feature("level_iii", "Ostial location - height", "level III", ["level 3"]),
  feature("level_iv", "Ostial location - height", "level IV", ["level 4"]),

  feature("type_1_separate_ostia", "Ostial relationship", "type 1", ["separate ostia"]),
  feature("type_2_adjacent_ostia", "Ostial relationship", "type 2", ["adjacent ostia"]),
  feature("type_3_single_ostium_intramural_bifurcation", "Ostial relationship", "type 3", [
    "single ostium with intramural bifurcation",
  ]),
  feature("type_4_single_coronary_trunk", "Ostial relationship", "type 4", [
    "single coronary trunk",
  ]),

  feature("round_ostium", "Ostial morphology", "round ostium", ["round"]),
  feature("oval_ostium", "Ostial morphology", "oval ostium", ["oval"]),
  feature("slit_like_ostium", "Ostial morphology", "slit-like ostium", [
    "slit-like",
    "slit-like origin",
  ]),
  feature("hypoplastic_ostium", "Ostial morphology", "hypoplastic ostium", [
    "hypoplastic",
    "pinhole",
  ]),

  feature(
    "intramural_segment_length",
    "Proximal course details",
    "intramural segment length",
    [],
    "measurement"
  ),
  feature("ellipticity", "Proximal course details", "ellipticity", ["ellipticity index"], "measurement"),
  feature("csa_narrowing", "Proximal course details", "%CSA narrowing", [
    "cross-sectional area narrowing",
    "CSA narrowing",
  ], "measurement"),
  feature("effective_lumen_diameter_narrowing", "Proximal course details", "effective lumen diameter narrowing", [], "measurement"),
  feature("acute_angle_of_takeoff", "Proximal course details", "acute angle of takeoff", [
    "acute takeoff angle",
    "acute takeoff",
    "angle of takeoff",
    "takeoff angle",
  ], "measurement"),

  feature("right_dominance", "Coronary dominance", "right dominance", ["RD"]),
  feature("left_dominance", "Coronary dominance", "left dominance", ["LD"]),
  feature("codominance", "Coronary dominance", "codominance", ["CD", "co-dominance"]),

  feature("myocardial_bridge", "Additional findings", "myocardial bridge", [
    "MB",
    "myocardial bridging",
    "bridged segment",
    "bridging",
  ]),
  feature("coronary_fistula", "Additional findings", "coronary fistula", ["fistulae"]),
  feature("coronary_atherosclerotic_lesions", "Additional findings", "coronary atherosclerotic lesions", [
    "calcifications",
  ]),
  feature("intercoronary_pillar", "Additional findings", "intercoronary pillar", [
    "course behind pillar",
  ]),
  feature("dynamic_narrowing", "Additional findings", "dynamic narrowing across cardiac cycle"),
  feature("intracavitary_course", "Additional findings", "intracavitary course", [
    "intracameral course",
  ]),
  feature("sinutubular_junction", "Additional findings", "sinutubular junction", [
    "STJ",
  ], "reference"),
];

export const PAPER_FEATURE_IDS = new Set(PAPER_FEATURES.map((paperFeature) => paperFeature.id));

const PAPER_FEATURES_BY_ID = new Map(
  PAPER_FEATURES.map((paperFeature) => [paperFeature.id, paperFeature])
);

const LEADING_NEGATION_PATTERN =
  /^(?:no evidence of|not identified|negative for|ruled out|no obvious|without|not seen|absent|no)\s+/;

function normalizePaperFeatureTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/[%]/g, " percent ")
    .replace(/-+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(LEADING_NEGATION_PATTERN, "")
    .trim();
}

const PAPER_FEATURE_LOOKUP = new Map<string, PaperFeature>();

PAPER_FEATURES.forEach((paperFeature) => {
  [paperFeature.canonical, ...paperFeature.aliases].forEach((name) => {
    PAPER_FEATURE_LOOKUP.set(normalizePaperFeatureTerm(name), paperFeature);
  });
});

export function resolvePaperFeature(term: string): PaperFeature | undefined {
  if (!term) return undefined;

  const normalized = normalizePaperFeatureTerm(term);
  const exact = PAPER_FEATURE_LOOKUP.get(normalized);
  if (exact) return exact;

  return Array.from(PAPER_FEATURE_LOOKUP.entries()).find(
    ([alias]) =>
      alias.length >= 5 &&
      (normalized.startsWith(`${alias} of `) || normalized.endsWith(` ${alias}`))
  )?.[1];
}

export function isPaperTrackedFeature(term: string): boolean {
  return Boolean(resolvePaperFeature(term));
}

export function resolveParsedTermPaperFeature(term: ParsedTerm): PaperFeature | undefined {
  return (
    resolvePaperFeature(term.normalizedName) ??
    resolvePaperFeature(term.term) ??
    (term.paperFeatureId ? PAPER_FEATURES_BY_ID.get(term.paperFeatureId) : undefined)
  );
}

export function enrichParsedTermWithPaperFeature<T extends ParsedTerm>(term: T): T {
  const paperFeature = resolveParsedTermPaperFeature(term);
  if (!paperFeature) return term;

  return {
    ...term,
    paperFeatureId: paperFeature.id,
    paperFeatureLabel: paperFeature.canonical,
    paperFeatureCategory: paperFeature.category,
    paperFeatureTrackingRole: paperFeature.trackingRole,
  };
}

export function shouldIncludeInNormalizedFrequency(term: ParsedTerm): boolean {
  if (term.assertion === "asserted") return true;
  if (term.assertion !== "negated") return false;

  const paperFeature = resolveParsedTermPaperFeature(term);
  return (
    paperFeature?.trackingRole === "feature" ||
    paperFeature?.trackingRole === "measurement"
  );
}
