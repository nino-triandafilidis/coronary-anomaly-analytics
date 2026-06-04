import type { AnomalousLeftSubtype } from "@/data/parseTypes";
import { getReportAnomalousLeftSubtypes } from "@/data/anomalousLeftSubtypes";
import { resolveParsedTermPaperFeature } from "@/data/paperFeatures";
import { getStoredParsedTerms, type StoredParsedReport } from "@/lib/parsedReportStorage";

export type LateralitySide = "right" | "left";
export type LateralityFilter = "overall" | "right" | "left";
export type LeftSubtypeFilter = "all" | AnomalousLeftSubtype;

const RIGHT_AAOCA_FEATURE_IDS = new Set(["r_aaoca"]);
const LEFT_AAOCA_FEATURE_IDS = new Set(["l_aaoca", "lad_aaoca", "lcx_aaoca"]);

export interface ReportLaterality {
  right: boolean;
  left: boolean;
  leftSubtypes: Set<AnomalousLeftSubtype>;
}

/**
 * Classifies a report by the side of its anomalous coronary. When the curated
 * cohort side is present it is authoritative (RCA = right, LCA = left). Otherwise
 * the side comes only from structured left-subtype entries or parser-resolved
 * AAOCA paper-feature ids. No vessel/course regex fallback is applied.
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
