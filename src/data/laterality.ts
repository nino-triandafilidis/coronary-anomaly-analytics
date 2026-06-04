import type { AnomalousLeftSubtype } from "@/data/parseTypes";
import { getReportAnomalousLeftSubtypes } from "@/data/anomalousLeftSubtypes";
import { resolveParsedTermPaperFeature } from "@/data/paperFeatures";
import { getStoredParsedTerms, type StoredParsedReport } from "@/lib/parsedReportStorage";

export type LateralitySide = "right" | "left";
export type LateralityFilter = "overall" | "right" | "left";
export type LeftSubtypeFilter = "all" | AnomalousLeftSubtype;

const RIGHT_AAOCA_FEATURE_IDS = new Set(["r_aaoca"]);
const LEFT_AAOCA_FEATURE_IDS = new Set(["l_aaoca", "lad_aaoca", "lcx_aaoca"]);

// A finding only votes on a side when it describes the anomaly itself: an
// explicitly anomalous term, an origin descriptor, or an AAOCA-pathognomonic
// proximal course. This keeps the non-anomalous system (dominance, incidental
// atherosclerosis, bridges) that nearly every report also mentions from voting.
const ANOMALY_CONTEXT =
  /anomalous|aaoca|origin of|inter[\s-]?arterial course|intramural course|intraseptal course|retroaortic course|prepulmonic course|subpulmonic/i;
// A "normal origin of ..." finding describes a normally-arising vessel, so it
// must not vote even though it matches the origin descriptor above.
const NORMAL_FINDING = /\bnormal\b/i;
// Vessel cues require "artery" on the bare left/right form so the sinus of
// origin ("right coronary cusp", "left coronary sinus", etc.) is not mistaken
// for the anomalous vessel — that distinction is what separates an R-AAOCA
// arising from the left cusp from a genuine left anomaly.
const RIGHT_VESSEL = /\brca\b|\bright coronary artery\b/i;
const LEFT_VESSEL =
  /\blmca\b|\bleft main\b|\blad\b|\bleft anterior descending\b|\blcx\b|\bleft circumflex\b|\bleft coronary artery\b/i;

export interface ReportLaterality {
  right: boolean;
  left: boolean;
  leftSubtypes: Set<AnomalousLeftSubtype>;
}

/**
 * Classifies a report by the side of its anomalous coronary. When the curated
 * cohort side is present it is authoritative (RCA = right, LCA = left). Otherwise
 * the side is inferred for live-parsed reports by tallying a vote per
 * anomaly-describing finding and taking the majority; a tie marks both sides
 * (rare, genuinely bilateral) and no vessel-resolved evidence is neither (shown
 * only under "overall").
 */
export function deriveReportLaterality(report: StoredParsedReport): ReportLaterality {
  const parsedTerms = getStoredParsedTerms(report);
  const leftSubtypes = new Set<AnomalousLeftSubtype>(
    getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes).map(
      (entry) => entry.subtype
    )
  );

  if (report.side === "RCA") return { right: true, left: false, leftSubtypes };
  if (report.side === "LCA") return { right: false, left: true, leftSubtypes };

  let rightVotes = 0;
  let leftVotes = leftSubtypes.size > 0 ? 1 : 0;

  for (const term of parsedTerms) {
    if (term.assertion !== "asserted") continue;

    const feature = resolveParsedTermPaperFeature(term);
    if (feature && RIGHT_AAOCA_FEATURE_IDS.has(feature.id)) {
      rightVotes += 1;
      continue;
    }
    if (feature && LEFT_AAOCA_FEATURE_IDS.has(feature.id)) {
      leftVotes += 1;
      continue;
    }

    const haystack = `${term.normalizedName ?? ""} ${term.term ?? ""}`;
    if (NORMAL_FINDING.test(haystack) || !ANOMALY_CONTEXT.test(haystack)) continue;

    const right = RIGHT_VESSEL.test(haystack);
    const left = LEFT_VESSEL.test(haystack);
    if (right && !left) rightVotes += 1;
    else if (left && !right) leftVotes += 1;
  }

  return {
    right: rightVotes > 0 && rightVotes >= leftVotes,
    left: leftVotes > 0 && leftVotes >= rightVotes,
    leftSubtypes,
  };
}

export function reportMatchesFilter(
  laterality: ReportLaterality,
  filter: LateralityFilter,
  leftSubtype: LeftSubtypeFilter = "all"
): boolean {
  if (filter === "overall") return true;
  if (filter === "right") return laterality.right;
  if (!laterality.left) return false;
  return leftSubtype === "all" || laterality.leftSubtypes.has(leftSubtype);
}
