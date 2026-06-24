import type { ParsedTerm } from "@/data/parseTypes";
import {
  BRIDGE_LENGTH_BUCKETS,
  detectBridgeGrade,
  detectBridgeLengthBucket,
  type BridgeFilteringFeatureId,
} from "@/data/bridgeFiltering";
import { RISK_FLAGS, type RiskFlagKey } from "@/data/riskCooccurrence";
import { detectReportRiskFlags } from "@/data/riskCooccurrence";
import type { ReportLaterality } from "@/data/laterality";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";

export type FilteringFeatureId = RiskFlagKey | BridgeFilteringFeatureId;

export interface FilteringEvidence {
  text: string;
  normalizedName?: string;
  context?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface FilteringFeatureDetection {
  present: boolean;
  evidence?: FilteringEvidence[];
}

export interface FilteringFeature {
  id: FilteringFeatureId;
  label: string;
  shortLabel: string;
  category: string;
  detect: (
    report: StoredParsedReport,
    side: ReportLaterality
  ) => FilteringFeatureDetection;
}

export interface ReportFeatureSet {
  report: StoredParsedReport;
  side: ReportLaterality;
  present: Set<FilteringFeatureId>;
  evidence: Map<FilteringFeatureId, FilteringEvidence[]>;
}

export interface CombinationRow {
  key: string;
  featureIds: FilteringFeatureId[];
  reports: ReportFeatureSet[];
}

function termEvidence(term: ParsedTerm | undefined): FilteringEvidence[] {
  if (!term) return [];
  const text = (term.term || term.normalizedName || "").trim();
  if (!text) return [];
  return [
    {
      text,
      normalizedName: term.normalizedName?.trim() || undefined,
      context: term.context?.trim() || undefined,
      startIndex: Number.isFinite(term.startIndex) ? term.startIndex : undefined,
      endIndex: Number.isFinite(term.endIndex) ? term.endIndex : undefined,
    },
  ];
}

function detectRiskFeature(
  report: StoredParsedReport,
  side: ReportLaterality,
  key: RiskFlagKey
): FilteringFeatureDetection {
  const risk = detectReportRiskFlags(report, side);
  return {
    present: risk.flags.has(key),
    evidence: termEvidence(risk.evidence.get(key)),
  };
}

const RISK_FILTERING_FEATURES: FilteringFeature[] = RISK_FLAGS.map<FilteringFeature>((flag) => ({
  id: flag.key,
  label: flag.label,
  shortLabel: flag.short,
  category: "Risk features",
  detect: (report, side) => detectRiskFeature(report, side, flag.key),
})).filter((feature) => feature.id !== "opposite_sinus");

const BRIDGE_FILTERING_FEATURES: FilteringFeature[] = [
  {
    id: "bridge:grade:1",
    label: "Bridge Grade 1",
    shortLabel: "G1",
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeGrade(report, 1),
  },
  {
    id: "bridge:grade:2",
    label: "Bridge Grade 2",
    shortLabel: "G2",
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeGrade(report, 2),
  },
  {
    id: "bridge:grade:3",
    label: "Bridge Grade 3",
    shortLabel: "G3",
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeGrade(report, 3),
  },
  {
    id: "bridge:grade:unknown",
    label: "Bridge Unknown Grade",
    shortLabel: "G?",
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeGrade(report, "unknown"),
  },
  ...BRIDGE_LENGTH_BUCKETS.map<FilteringFeature>((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    shortLabel: bucket.shortLabel,
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeLengthBucket(report, bucket.id),
  })),
  {
    id: "bridge:length:unknown",
    label: "Unknown bridge length",
    shortLabel: "L?",
    category: "Myocardial Bridge",
    detect: (report) => detectBridgeLengthBucket(report, "bridge:length:unknown"),
  },
];

export const FILTERING_FEATURES: FilteringFeature[] = RISK_FILTERING_FEATURES.concat(
  BRIDGE_FILTERING_FEATURES
);

export function buildReportFeatureSet(
  report: StoredParsedReport,
  side: ReportLaterality,
  features: FilteringFeature[] = FILTERING_FEATURES
): ReportFeatureSet {
  const present = new Set<FilteringFeatureId>();
  const evidence = new Map<FilteringFeatureId, FilteringEvidence[]>();

  for (const feature of features) {
    const result = feature.detect(report, side);
    if (!result.present) continue;
    present.add(feature.id);
    evidence.set(feature.id, result.evidence ?? []);
  }

  return { report, side, present, evidence };
}

export function reportHasEveryFeature(
  featureSet: ReportFeatureSet,
  selectedFeatureIds: FilteringFeatureId[]
): boolean {
  return selectedFeatureIds.every((id) => featureSet.present.has(id));
}

export function combinationKey(featureIds: FilteringFeatureId[]): string {
  return featureIds.join("|");
}

export function computeCombinationRows(
  featureSets: ReportFeatureSet[],
  selectedFeatureIds: FilteringFeatureId[]
): CombinationRow[] {
  if (selectedFeatureIds.length === 0) return [];

  const rows = new Map<string, CombinationRow>();

  for (const featureSet of featureSets) {
    const featureIds = selectedFeatureIds.filter((id) => featureSet.present.has(id));
    const key = combinationKey(featureIds);
    const row = rows.get(key) ?? { key, featureIds, reports: [] };
    row.reports.push(featureSet);
    rows.set(key, row);
  }

  const allSelectedKey = combinationKey(selectedFeatureIds);
  return [...rows.values()].sort((a, b) => {
    if (a.key === allSelectedKey) return -1;
    if (b.key === allSelectedKey) return 1;
    if (b.reports.length !== a.reports.length) return b.reports.length - a.reports.length;
    return b.featureIds.length - a.featureIds.length;
  });
}
