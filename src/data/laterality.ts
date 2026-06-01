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
 * Classifies a report by AAOCA form. A report can be both right and left (e.g.
 * bilateral anomalies); single-trunk and reports with no AAOCA-form evidence are
 * neither and surface only under the "overall" filter.
 */
export function deriveReportLaterality(report: StoredParsedReport): ReportLaterality {
  const parsedTerms = getStoredParsedTerms(report);
  const leftSubtypes = new Set<AnomalousLeftSubtype>(
    getReportAnomalousLeftSubtypes(
      report.parseResult.anomalousLeftSubtypes,
      parsedTerms
    ).map((entry) => entry.subtype)
  );

  let right = false;
  let left = leftSubtypes.size > 0;

  for (const term of parsedTerms) {
    if (term.assertion !== "asserted") continue;
    const feature = resolveParsedTermPaperFeature(term);
    if (!feature) continue;
    if (RIGHT_AAOCA_FEATURE_IDS.has(feature.id)) right = true;
    if (LEFT_AAOCA_FEATURE_IDS.has(feature.id)) left = true;
  }

  return { right, left, leftSubtypes };
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
