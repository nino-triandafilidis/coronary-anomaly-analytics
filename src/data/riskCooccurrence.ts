/**
 * Risk-feature co-occurrence on the R-AAOCA cohort.
 *
 * The cohort is screened for right-sided AAOCA; lefts are a control. The clinical
 * signal is not any single feature but which high-risk features travel together
 * (slit-like ostium rarely matters on its own — it matters when it rides with an
 * interarterial/intramural proximal course). This module reduces each report to a
 * set of present (asserted) risk flags and counts how often each pair co-occurs,
 * so the UI can render one symmetric heatmap instead of a matrix per flag.
 *
 * Detection reuses the existing resolvers: paper-feature ids for the binary
 * features, normalizeCoronaryNarrowingFeature for narrowing, and the report's
 * laterality for the vessel-relative "opposite sinus" flag (a right from the left
 * sinus, a left from the right sinus). Counting is pure and unit-tested; the
 * Analysis page owns provenance, mirroring the rest of the drill-down.
 */

import type { ParsedTerm } from "@/data/parseTypes";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";
import { getStoredParsedTerms } from "@/lib/parsedReportStorage";
import { resolveParsedTermPaperFeature } from "@/data/paperFeatures";
import { normalizeCoronaryNarrowingFeature } from "@/data/featureCanonical";
import type { ReportLaterality } from "@/data/laterality";

export type RiskFlagKey =
  | "opposite_sinus"
  | "interarterial"
  | "intramural"
  | "slit_like"
  | "high_origin"
  | "acute_takeoff"
  | "narrowing";

export interface RiskFlag {
  key: RiskFlagKey;
  label: string;
  short: string;
}

/** Display order, high-risk anatomy first. `slit_like` is the sponsor's flag. */
export const RISK_FLAGS: RiskFlag[] = [
  { key: "opposite_sinus", label: "Opposite sinus", short: "OS" },
  { key: "interarterial", label: "Interarterial", short: "IA" },
  { key: "intramural", label: "Intramural", short: "IM" },
  { key: "slit_like", label: "Slit-like ostium", short: "Slit" },
  { key: "high_origin", label: "High origin", short: "HO" },
  { key: "acute_takeoff", label: "Acute takeoff", short: "Take" },
  { key: "narrowing", label: "Sig. narrowing", short: "Narr" },
];

/** The sponsor-priority flag, foregrounded in the UI. */
export const SPONSOR_FLAG: RiskFlagKey = "slit_like";

/** Binary flags that resolve straight to a single paper-feature id. */
const FLAG_BY_PAPER_FEATURE: Partial<Record<RiskFlagKey, string>> = {
  interarterial: "interarterial_course",
  intramural: "intramural_course",
  slit_like: "slit_like_ostium",
  high_origin: "high_origin",
  acute_takeoff: "acute_angle_of_takeoff",
};

const PAPER_FEATURE_TO_FLAG = new Map<string, RiskFlagKey>(
  Object.entries(FLAG_BY_PAPER_FEATURE).map(([flag, featureId]) => [
    featureId,
    flag as RiskFlagKey,
  ])
);

export interface ReportRiskFlags {
  reportId: string;
  /** Present (asserted) flags. */
  flags: Set<RiskFlagKey>;
  /** First asserted term that triggered each flag, for provenance. */
  evidence: Map<RiskFlagKey, ParsedTerm>;
}

/**
 * Reduce one report to its present risk flags plus the supporting term per flag.
 * Only asserted terms count (a negated "no interarterial course" is absence, not
 * presence). The opposite-sinus flag is vessel-relative and uses the report side.
 */
export function detectReportRiskFlags(
  report: StoredParsedReport,
  side: ReportLaterality
): ReportRiskFlags {
  const evidence = new Map<RiskFlagKey, ParsedTerm>();
  const set = (key: RiskFlagKey, term: ParsedTerm) => {
    if (!evidence.has(key)) evidence.set(key, term);
  };

  for (const term of getStoredParsedTerms(report)) {
    if (term.assertion !== "asserted") continue;

    const feature = resolveParsedTermPaperFeature(term);
    if (feature) {
      const flag = PAPER_FEATURE_TO_FLAG.get(feature.id);
      if (flag) set(flag, term);
      // Opposite sinus is the vessel arising from the wrong sinus: a right from
      // the left sinus, a left from the right sinus. Keyed off the report side so
      // the same flag is meaningful for the control cohort too.
      if (side.right && feature.id === "left_sinus") set("opposite_sinus", term);
      if (side.left && feature.id === "right_sinus") set("opposite_sinus", term);
    }

    if (normalizeCoronaryNarrowingFeature(term)) set("narrowing", term);
  }

  return { reportId: report.id, flags: new Set(evidence.keys()), evidence };
}

export interface ReportFlagSet {
  reportId: string;
  flags: Set<RiskFlagKey>;
}

export interface CooccurrenceCounts {
  /** Cohort size = denominator for prevalence (every report, flagged or not). */
  total: number;
  /** Reports carrying each flag (the diagonal). */
  diagonal: Record<RiskFlagKey, number>;
  /** Reports carrying both flags. Symmetric: pair[a][b] === pair[b][a]. */
  pair: Record<RiskFlagKey, Record<RiskFlagKey, number>>;
}

function emptyFlagRecord(): Record<RiskFlagKey, number> {
  return RISK_FLAGS.reduce(
    (acc, flag) => {
      acc[flag.key] = 0;
      return acc;
    },
    {} as Record<RiskFlagKey, number>
  );
}

/**
 * Count single-flag and pairwise co-occurrence across a cohort. One report
 * contributes at most once to any cell (per-report incidence, not per-mention),
 * consistent with every other count on the Analysis page.
 */
export function countCooccurrence(sets: ReportFlagSet[]): CooccurrenceCounts {
  const diagonal = emptyFlagRecord();
  const pair = RISK_FLAGS.reduce(
    (acc, flag) => {
      acc[flag.key] = emptyFlagRecord();
      return acc;
    },
    {} as Record<RiskFlagKey, Record<RiskFlagKey, number>>
  );

  for (const { flags } of sets) {
    const present = RISK_FLAGS.filter((flag) => flags.has(flag.key)).map((f) => f.key);
    for (let i = 0; i < present.length; i += 1) {
      diagonal[present[i]] += 1;
      for (let j = i + 1; j < present.length; j += 1) {
        pair[present[i]][present[j]] += 1;
        pair[present[j]][present[i]] += 1;
      }
    }
  }

  return { total: sets.length, diagonal, pair };
}

export interface FlagPrevalence {
  count: number;
  /** Share of the cohort with the flag, 0-100, rounded. */
  pct: number;
}

/** Per-flag prevalence (count over cohort size), for the control comparison. */
export function flagPrevalence(
  diagonal: Record<RiskFlagKey, number>,
  total: number
): Record<RiskFlagKey, FlagPrevalence> {
  return RISK_FLAGS.reduce(
    (acc, flag) => {
      const count = diagonal[flag.key];
      acc[flag.key] = { count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
      return acc;
    },
    {} as Record<RiskFlagKey, FlagPrevalence>
  );
}
