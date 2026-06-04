/**
 * Entity label catalog for the #66 LLM resolver (the #75 deliverable).
 *
 * The resolver maps a free-text finding to one paper entity id, or "none". To
 * tell the model what each label means, it needs a one-line definition per
 * entity. Those definitions live here, keyed by `PaperFeature.id`, drawn from
 * the AAOCA paper (Mery et al., JACC Cardiovasc Imaging 2026).
 *
 * Modular by design: the catalog is GENERATED from PAPER_FEATURES, not hardcoded
 * in the resolver prompt. `buildEntityCatalog()` joins each entity with its
 * definition at call time, so adding or editing an entity in paperFeatures.ts
 * updates the prompt (and the eval) automatically. The companion test enforces
 * a 1:1 match between PAPER_FEATURES ids and the definitions here, so a new
 * entity cannot ship without a definition.
 */

import { NONE_PAPER_FEATURE_ID, PAPER_FEATURES, PAPER_FEATURE_IDS } from "@/data/paperFeatures";

/** The out-of-scope / normal-anatomy label, outside PAPER_FEATURES. Shared with
 * the paperFeatureId sentinel so the stored value and the resolver label match. */
export const NONE_LABEL = NONE_PAPER_FEATURE_ID;

/**
 * One-line authoritative definition per paper entity, keyed by id. Kept in sync
 * with PAPER_FEATURES by entityCatalog.test.ts.
 */
export const ENTITY_DEFINITIONS: Record<string, string> = {
  // Anomalous vessel
  anomalous_vessel: "anomalous coronary artery (AAOCA): a coronary arising from an abnormal site on the aorta",
  r_aaoca: "anomalous RIGHT coronary artery (R-AAOCA): RCA arising from an abnormal aortic site (e.g. the left sinus)",
  l_aaoca: "anomalous LEFT main (L-AAOCA): left main arising from an abnormal aortic site (e.g. the right sinus)",
  lad_aaoca: "anomalous LAD (LAD-AAOCA): left anterior descending arising from an abnormal aortic site",
  lcx_aaoca: "anomalous left circumflex (LCX-AAOCA): circumflex arising from an abnormal site such as the right sinus/cusp or the proximal RCA/right coronary artery",
  st_aaoca: "single coronary trunk (ST-AAOCA): all major coronaries arising from one aortic trunk/ostium",
  anomalous_left_intraconal: "anomalous left coronary with an intraconal/intraseptal (subpulmonic) proximal course",
  anomalous_left_intramural_interarterial: "left-sided anomalous coronary artery, such as anomalous LMCA/LAD/LCX, where the anomalous left-sided vessel itself has an intramural and/or interarterial course",

  // Sinus of origin
  left_sinus: "left coronary sinus of Valsalva (LS) as the site of origin",
  right_sinus: "right coronary sinus of Valsalva (RS) as the site of origin",
  nonfacing_sinus: "nonfacing / noncoronary sinus (NS) as the site of origin",
  // Operational reading: covers qualitative "high takeoff at/near the STJ", not
  // only the strict HO threshold, since reports rarely state the measurement.
  // Rationale in resolverGoldenSet.ts (Sinus / ostium). level_i..level_iv carry
  // the precise measured height.
  high_origin: "high origin / high takeoff (HO): ostium arising high, at or above the sinotubular junction; formally >=5 mm or >20% of sinus depth above the STJ. A qualitative 'high takeoff' maps here; an explicitly-measured sub-threshold height is level_iii.",
  left_right_juxtacommissural: "origin at the left-right commissure (LR)",
  left_nonfacing_juxtacommissural: "origin at the left-nonfacing commissure (LN)",
  right_nonfacing_juxtacommissural: "origin at the right-nonfacing commissure (RN)",
  anterior_sinus: "anterior sinus (AS), used for bicuspid-valve aortas with two sinuses",
  posterior_sinus: "posterior sinus (PS), used for bicuspid-valve aortas with two sinuses",

  // Proximal course
  interarterial_course: "interarterial course (IA): proximal vessel runs between the aorta and the pulmonary artery",
  intramural_course: "intramural course (IM): proximal vessel runs within the aortic wall (NOT within myocardium)",
  intraseptal_course: "intraseptal course (IS): proximal vessel enters the interventricular septum below the pulmonary valve (incl. intramuscular/subpulmonic LM/LAD)",
  prepulmonic_course: "prepulmonic course (PP): proximal vessel crosses anterior to the RVOT / pulmonary artery",
  retroaortic_course: "retroaortic course (RA): proximal vessel runs posterior to the aorta",
  pulmonary_facing: "pulmonary-facing interarterial course (toward the pulmonary-artery side)",
  rvot_facing: "RVOT-facing interarterial course (toward the right ventricular outflow tract)",

  // Ostial location - circumferential (topography map)
  sinus_1: "ostial circumferential location: sinus 1 (right sinus) on the topography map",
  sinus_2: "ostial circumferential location: sinus 2 (left sinus) on the topography map",
  sinus_3: "ostial circumferential location: sinus 3 (nonfacing sinus) on the topography map",
  segment_a: "ostial circumferential location: segment a (lateral quarter toward one commissure)",
  segment_b: "ostial circumferential location: segment b (middle half of the sinus)",
  segment_c: "ostial circumferential location: segment c (lateral quarter toward the other commissure)",
  juxtacommissural: "ostium located at or adjacent to a commissure (JC)",

  // Ostial location - height
  level_i: "ostial height level I: within the sinus, up to the level of the commissures",
  level_ii: "ostial height level II: between the commissures and the sinotubular junction",
  level_iii: "ostial height level III: from the STJ up to <5 mm (or <20% of sinus depth) above it",
  level_iv: "ostial height level IV: >=5 mm (or >=20%) above the STJ (equivalent to high origin)",

  // Ostial relationship
  type_1_separate_ostia: "ostial relationship type 1: completely separate coronary ostia",
  type_2_adjacent_ostia: "ostial relationship type 2: separate but adjacent ostia",
  type_3_single_ostium_intramural_bifurcation: "ostial relationship type 3: single ostium bifurcating into separate vessels within the aortic wall",
  type_4_single_coronary_trunk: "ostial relationship type 4: single ostium and single coronary trunk (equivalent to ST)",

  // Ostial morphology
  round_ostium: "round ostial morphology: minor axis approximately equal to the major axis",
  oval_ostium: "oval ostial morphology: minor axis 50-90% of the major axis",
  slit_like_ostium: "slit-like ostial morphology: minor axis <50% of the major axis",
  hypoplastic_ostium: "hypoplastic / pinhole ostium: both axes smaller than the distal coronary vessel",

  // Proximal course details (measurements)
  intramural_segment_length: "measured length of the intramural segment, in mm",
  ellipticity: "ellipticity index of the proximal course (major axis / minor axis)",
  csa_narrowing: "%CSA narrowing: minimal cross-sectional area vs distal reference, of the proximal segment",
  effective_lumen_diameter_narrowing: "effective lumen diameter narrowing (%) of the proximal segment",
  acute_angle_of_takeoff: "acute angle of takeoff of the proximal vessel from the aorta",

  // Coronary dominance
  right_dominance: "right-dominant circulation: the posterior descending artery arises from the RCA",
  left_dominance: "left-dominant circulation: the posterior descending artery arises from the circumflex",
  codominance: "codominant circulation: posterior supply shared between the RCA and the circumflex",

  // Additional findings
  myocardial_bridge: "myocardial bridge (MB): a NORMALLY-arising epicardial vessel tunneling under myocardium in its mid-course",
  coronary_fistula: "coronary artery fistula: an abnormal communication to a cardiac chamber or vessel",
  coronary_atherosclerotic_lesions: "presence of coronary atherosclerotic lesions (plaque / calcification / CAD); severity grading is out of scope",
  intercoronary_pillar: "course behind the intercoronary pillar (the thickened commissural tissue)",
  dynamic_narrowing: "dynamic narrowing of the proximal segment across the cardiac cycle (systolic compression)",
  intracavitary_course: "intracavitary / intracameral course: the vessel runs through a cardiac chamber",
  sinutubular_junction: "the sinotubular junction landmark (reference only; not a finding on its own)",
};

/** The resolver's full label space: every paper entity id plus NONE. */
export const RESOLVER_LABELS: string[] = [...PAPER_FEATURE_IDS, NONE_LABEL];

/**
 * Render the entity catalog block for the resolver prompt, one line per entity,
 * generated from PAPER_FEATURES (not hardcoded). Format:
 *   <id> — <definition> [<category>]
 */
export function buildEntityCatalog(): string {
  return PAPER_FEATURES.map(
    (entity) => `${entity.id} — ${ENTITY_DEFINITIONS[entity.id]} [${entity.category}]`
  ).join("\n");
}
