import type { ParsedTerm, ReportCohortSide } from "@/data/parseTypes";
import { getReportAnomalousLeftSubtypes } from "@/data/anomalousLeftSubtypes";
import { resolveParsedTermPaperFeature } from "@/data/paperFeatures";
import { getStoredParsedTerms, type StoredParsedReport } from "@/lib/parsedReportStorage";

/**
 * Derives the umbrella AAOCA diagnosis (R-AAOCA / L-AAOCA / single-trunk) for a
 * report from the atomic findings the parser reliably extracts, rather than
 * trusting either the cohort `side` label or a single LLM-emitted umbrella term.
 *
 * Why this exists (issue #105): the Analysis page derived "is this report
 * R-AAOCA" two incompatible ways — the cohort `side` field (over-inclusive: it
 * carries normal-origin and single-trunk mislabels) and an LLM-emitted umbrella
 * `r_aaoca` term (under-inclusive: the model captured the constituents but never
 * synthesized the umbrella in ~22/384 right-cohort reports). The two numbers
 * disagreed by 33 and masked each other.
 *
 * The fix is to make the umbrella a DERIVED label computed once, deterministically,
 * from the constituent features plus the cohort side as a prior. Both the summary
 * card and the feature overview consume this, so they reconcile by construction,
 * and the rule generalizes to any corpus (no per-report LLM variance, no curated
 * side required).
 */

export type AaocaUmbrella =
  | "r_aaoca"
  | "l_aaoca"
  | "lad_aaoca"
  | "lcx_aaoca"
  | "st_aaoca";

export type CohortVessel = "right" | "left";

/**
 * How an umbrella was reached, for provenance / auditing.
 * - `asserted-term`: the parser already emitted the umbrella entity; trusted as-is.
 * - `derived-constituents`: synthesized here from origin + course findings.
 * - `none`: no umbrella diagnosis is supported by the findings.
 */
export type UmbrellaBasis = "asserted-term" | "derived-constituents" | "none";

/**
 * Disposition of the borderline bucket: high takeoff over the vessel's OWN sinus
 * with an absent / qualified ("very slight", "questionable") interarterial course.
 * Under a strict opposite-sinus definition these are not AAOCA; `inclusive` counts
 * them. This is the single clinical-definition knob the 385↔352 reconciliation
 * turns on (issue #105: "the high-takeoff question likely needs Maskatia").
 */
export type BorderlinePolicy = "strict" | "inclusive";

export interface UmbrellaEvidence {
  /** An origin cue placing the vessel at the OPPOSITE sinus or the L-R commissure. */
  oppositeSinusOrigin: boolean;
  /** An interarterial course with a definite descriptor (length, "malignant"). */
  definiteInterarterial: boolean;
  /** High origin / acute takeoff / weak interarterial only, over the own sinus. */
  ownSinusHighTakeoffOnly: boolean;
  /** Single / shared coronary trunk — routes to ST-AAOCA, not R/L. */
  singleTrunk: boolean;
  /** The umbrella entity the parser itself emitted, if any. */
  assertedUmbrella: AaocaUmbrella | null;
}

export interface AaocaUmbrellaResult {
  umbrella: AaocaUmbrella | null;
  borderline: boolean;
  basis: UmbrellaBasis;
  cohortVessel: CohortVessel | null;
  evidence: UmbrellaEvidence;
}

/** The umbrella diagnosis paper-feature ids, in display order. */
export const AAOCA_UMBRELLA_IDS: AaocaUmbrella[] = [
  "r_aaoca",
  "l_aaoca",
  "lad_aaoca",
  "lcx_aaoca",
  "st_aaoca",
];

const UMBRELLA_FEATURE_IDS = new Set<AaocaUmbrella>(AAOCA_UMBRELLA_IDS);

// Findings that attribute an anomalous origin or proximal course to a vessel.
// These are the constituents the parser extracts dependably even when it omits
// the umbrella entity.
const CONSTITUENT_FEATURE_IDS = new Set([
  "high_origin",
  "interarterial_course",
  "acute_angle_of_takeoff",
  "left_sinus",
  "right_sinus",
  "juxtacommissural",
  "left_right_juxtacommissural",
]);

const RCA_VESSEL = /\brca\b|right coronary artery/i;
const LEFT_VESSEL =
  /\blmca\b|left main|\blad\b|left anterior descending|\blcx\b|left circumflex|left coronary artery/i;

// Opposite-sinus origin, expressed vessel-relative. For the RCA the opposite
// sinus is the left; for a left vessel it is the right. The L-R commissure counts
// for either side: origin straddling the commissure is the pathognomonic AAOCA
// pattern regardless of which vessel is anomalous.
const COMMISSURE = /left[\s-]?right commissure|right[\s-]?left commissure|[lr][\s-]?[lr] commissure/i;
const RCA_OPPOSITE_ORIGIN =
  /left (coronary )?(sinus|cusp)|left sinus of valsalva|aligned (with|superior to)( the)? left|from (above |the )?left (coronary )?(sinus|cusp)/i;
const LEFT_OPPOSITE_ORIGIN =
  /right (coronary )?(sinus|cusp)|right sinus of valsalva|aligned (with|superior to)( the)? right|from (above |the )?right (coronary )?(sinus|cusp)/i;

// A definite interarterial course: stated with a length, or flagged malignant.
const INTERARTERIAL_DEFINITE = /\d+\s*(mm|cm)|malignant/i;
// A hedged interarterial course that, on its own, leaves the case borderline.
const INTERARTERIAL_WEAK = /very slight|slight|questionable|very short|minimal|trivial|possible/i;

const SINGLE_TRUNK =
  /single coronary artery|single coronary trunk|single trunk|shared (origin|trunk)|common trunk/i;

function assertedTerms(report: StoredParsedReport): ParsedTerm[] {
  return getStoredParsedTerms(report).filter((term) => term.assertion === "asserted");
}

// Resolve through the same tiered resolver the feature overview uses, so the
// classifier honors the #66 `none` sentinel and the rule fallbacks rather than
// reading a possibly-absent `paperFeatureId` off the term directly.
function resolvedFeatureId(term: ParsedTerm): string {
  return resolveParsedTermPaperFeature(term)?.id ?? "";
}

function termText(term: ParsedTerm): string {
  return `${term.normalizedName ?? ""} ${term.term ?? ""}`;
}

/**
 * The vessel whose anomaly the report is about. The curated cohort side is
 * authoritative when present; otherwise it is inferred from which vessel carries
 * the anomalous-origin / interarterial constituents, so the classifier still
 * works on live-parsed reports that have no `side`.
 */
function resolveCohortVessel(
  report: StoredParsedReport,
  terms: ParsedTerm[]
): CohortVessel | null {
  const side: ReportCohortSide | undefined = report.side;
  if (side === "RCA") return "right";
  if (side === "LCA") return "left";

  let right = 0;
  let left = 0;
  for (const term of terms) {
    if (!CONSTITUENT_FEATURE_IDS.has(resolvedFeatureId(term))) continue;
    const text = termText(term);
    if (RCA_VESSEL.test(text)) right += 1;
    else if (LEFT_VESSEL.test(text)) left += 1;
  }
  if (right === 0 && left === 0) return null;
  return right >= left ? "right" : "left";
}

function gatherEvidence(
  terms: ParsedTerm[],
  vessel: CohortVessel | null
): UmbrellaEvidence {
  const oppositeOrigin = vessel === "left" ? LEFT_OPPOSITE_ORIGIN : RCA_OPPOSITE_ORIGIN;

  let assertedUmbrella: AaocaUmbrella | null = null;
  let oppositeSinusOrigin = false;
  let definiteInterarterial = false;
  let anyOriginOrCourse = false;
  let singleTrunk = false;

  for (const term of terms) {
    const id = resolvedFeatureId(term);
    const text = termText(term);

    if (UMBRELLA_FEATURE_IDS.has(id as AaocaUmbrella)) {
      assertedUmbrella = id as AaocaUmbrella;
    }
    if (id === "type_4_single_coronary_trunk" || SINGLE_TRUNK.test(text)) {
      singleTrunk = true;
    }
    if (!CONSTITUENT_FEATURE_IDS.has(id)) continue;

    anyOriginOrCourse = true;
    if (oppositeOrigin.test(text) || COMMISSURE.test(text)) {
      oppositeSinusOrigin = true;
    }
    if (id === "interarterial_course") {
      if (INTERARTERIAL_DEFINITE.test(text)) definiteInterarterial = true;
      else if (!INTERARTERIAL_WEAK.test(text)) definiteInterarterial = true;
    }
  }

  return {
    oppositeSinusOrigin,
    definiteInterarterial,
    ownSinusHighTakeoffOnly:
      anyOriginOrCourse && !oppositeSinusOrigin && !definiteInterarterial,
    singleTrunk,
    assertedUmbrella,
  };
}

function leftUmbrellaForVessel(terms: ParsedTerm[]): AaocaUmbrella {
  // When deriving a left umbrella with no asserted entity, name it by the
  // specific left vessel the constituents point to; default to the L-AAOCA
  // (left main) umbrella.
  const text = terms.map(termText).join(" ");
  if (/\blad\b|left anterior descending/i.test(text)) return "lad_aaoca";
  if (/\blcx\b|left circumflex/i.test(text)) return "lcx_aaoca";
  return "l_aaoca";
}

/**
 * Classifies a report's umbrella AAOCA diagnosis. Pure and deterministic.
 *
 * Decision order:
 *  1. An asserted umbrella entity is trusted as-is (the parser already synthesized it).
 *  2. A single / shared trunk routes to ST-AAOCA.
 *  3. For the cohort vessel: opposite-sinus origin OR a definite interarterial
 *     course yields the umbrella; high takeoff over the own sinus with only a
 *     weak / absent interarterial course is borderline; no anomalous constituents
 *     yields none (a cohort mislabel, e.g. a normal-origin or post-surgical read).
 */
export function deriveAaocaUmbrella(
  report: StoredParsedReport,
  policy: BorderlinePolicy = "strict"
): AaocaUmbrellaResult {
  const terms = assertedTerms(report);
  const vessel = resolveCohortVessel(report, terms);
  const evidence = gatherEvidence(terms, vessel);

  const none = (basis: UmbrellaBasis, borderline = false): AaocaUmbrellaResult => ({
    umbrella: null,
    borderline,
    basis,
    cohortVessel: vessel,
    evidence,
  });

  if (evidence.assertedUmbrella) {
    return {
      umbrella: evidence.assertedUmbrella,
      borderline: false,
      basis: "asserted-term",
      cohortVessel: vessel,
      evidence,
    };
  }

  if (evidence.singleTrunk) {
    return {
      umbrella: "st_aaoca",
      borderline: false,
      basis: "derived-constituents",
      cohortVessel: vessel,
      evidence,
    };
  }

  // A structured anomalous-left subtype is itself a left-AAOCA assertion. It lives
  // outside parsedTerms, so the constituent gate below cannot see it; honor it
  // directly (unless the cohort vessel is the right, which would be a conflicting
  // label left to the constituent path).
  if (vessel !== "right" && getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes).length > 0) {
    return {
      umbrella: leftUmbrellaForVessel(terms),
      borderline: false,
      basis: "derived-constituents",
      cohortVessel: vessel ?? "left",
      evidence,
    };
  }

  if (!vessel) return none("none");

  const target: AaocaUmbrella =
    vessel === "right" ? "r_aaoca" : leftUmbrellaForVessel(terms);

  if (evidence.oppositeSinusOrigin || evidence.definiteInterarterial) {
    return {
      umbrella: target,
      borderline: false,
      basis: "derived-constituents",
      cohortVessel: vessel,
      evidence,
    };
  }

  if (evidence.ownSinusHighTakeoffOnly) {
    if (policy === "inclusive") {
      return {
        umbrella: target,
        borderline: true,
        basis: "derived-constituents",
        cohortVessel: vessel,
        evidence,
      };
    }
    return none("none", true);
  }

  return none("none");
}

/** True when the report is R-AAOCA under the given policy. */
export function isRightAaoca(
  report: StoredParsedReport,
  policy: BorderlinePolicy = "strict"
): boolean {
  return deriveAaocaUmbrella(report, policy).umbrella === "r_aaoca";
}

/** True when the report is any left-sided AAOCA umbrella under the given policy. */
export function isLeftAaoca(
  report: StoredParsedReport,
  policy: BorderlinePolicy = "strict"
): boolean {
  const { umbrella } = deriveAaocaUmbrella(report, policy);
  return umbrella === "l_aaoca" || umbrella === "lad_aaoca" || umbrella === "lcx_aaoca";
}
