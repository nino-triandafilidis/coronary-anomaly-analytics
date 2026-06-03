import type { MyocardialBridgeDetail, MyocardialBridgeSummary } from "@/data/parseTypes";
import type {
  FilteringEvidence,
  FilteringFeatureDetection,
} from "@/data/filteringFeatures";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";

export type BridgeFilteringFeatureId =
  | "bridge:any"
  | "bridge:grade:1"
  | "bridge:grade:2"
  | "bridge:grade:3"
  | "bridge:grade:unknown"
  | "bridge:length:0-5"
  | "bridge:length:5-10"
  | "bridge:length:10-15"
  | "bridge:length:15-20"
  | "bridge:length:gt20"
  | "bridge:length:unknown";

export interface BridgeLengthBucket {
  id: Extract<BridgeFilteringFeatureId, `bridge:length:${string}`>;
  label: string;
  shortLabel: string;
  matches: (value: number) => boolean;
}

export const BRIDGE_LENGTH_BUCKETS: BridgeLengthBucket[] = [
  {
    id: "bridge:length:0-5",
    label: "Length 0-5 mm",
    shortLabel: "0-5",
    matches: (value) => value >= 0 && value < 5,
  },
  {
    id: "bridge:length:5-10",
    label: "Length 5-10 mm",
    shortLabel: "5-10",
    matches: (value) => value >= 5 && value < 10,
  },
  {
    id: "bridge:length:10-15",
    label: "Length 10-15 mm",
    shortLabel: "10-15",
    matches: (value) => value >= 10 && value < 15,
  },
  {
    id: "bridge:length:15-20",
    label: "Length 15-20 mm",
    shortLabel: "15-20",
    matches: (value) => value >= 15 && value <= 20,
  },
  {
    id: "bridge:length:gt20",
    label: "Length >20 mm",
    shortLabel: ">20",
    matches: (value) => value > 20,
  },
];

export interface BridgeAggregate {
  anyBridge: boolean;
  highestGrade: 1 | 2 | 3 | null;
  highestGradeBridge?: MyocardialBridgeDetail;
  longestLengthMm: number | null;
  longestLengthBridge?: MyocardialBridgeDetail;
  lengthBucket?: BridgeLengthBucket;
  firstBridge?: MyocardialBridgeDetail;
}

function validGrade(grade: unknown): grade is 1 | 2 | 3 {
  return grade === 1 || grade === 2 || grade === 3;
}

function evidenceText(bridge: MyocardialBridgeDetail | undefined): string {
  return (
    bridge?.evidenceText?.trim() ||
    [bridge?.vessel, bridge?.segment].filter(Boolean).join(" ") ||
    "Myocardial bridge asserted"
  );
}

export function bridgeLengthBucket(value: number | null): BridgeLengthBucket | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  return BRIDGE_LENGTH_BUCKETS.find((bucket) => bucket.matches(value));
}

export function aggregateBridgeSummary(
  summary: MyocardialBridgeSummary | undefined
): BridgeAggregate {
  const bridges = summary?.bridges ?? [];
  const bridgeCount = summary?.bridgeCount ?? bridges.length;
  const anyBridge = bridgeCount > 0 || bridges.length > 0;
  const bridgeGrades = bridges
    .map((bridge) => bridge.grade)
    .filter(validGrade);
  const highestGrade = validGrade(summary?.highestGrade)
    ? summary.highestGrade
    : bridgeGrades.length > 0
      ? (Math.max(...bridgeGrades) as 1 | 2 | 3)
      : null;
  const highestGradeBridge =
    highestGrade === null ? undefined : bridges.find((bridge) => bridge.grade === highestGrade);

  const bridgesWithLength = bridges.filter(
    (bridge) => typeof bridge.lengthMm === "number" && Number.isFinite(bridge.lengthMm)
  );
  const longestLengthBridge = bridgesWithLength.reduce<MyocardialBridgeDetail | undefined>(
    (longest, bridge) =>
      !longest || (bridge.lengthMm ?? -Infinity) > (longest.lengthMm ?? -Infinity)
        ? bridge
        : longest,
    undefined
  );
  const longestLengthMm = longestLengthBridge?.lengthMm ?? null;

  return {
    anyBridge,
    highestGrade,
    highestGradeBridge,
    longestLengthMm,
    longestLengthBridge,
    lengthBucket: bridgeLengthBucket(longestLengthMm),
    firstBridge: bridges[0],
  };
}

function bridgeSummaryText(aggregate: BridgeAggregate): string {
  const grade = aggregate.highestGrade ? `Grade ${aggregate.highestGrade}` : "Unknown grade";
  const length = aggregate.lengthBucket?.label.replace("Length ", "") ?? "Unknown length";
  return `Highest grade: ${grade}; Longest length: ${length}`;
}

function bridgeEvidence(
  aggregate: BridgeAggregate,
  bridge: MyocardialBridgeDetail | undefined,
  label: string
): FilteringEvidence[] {
  return [
    {
      text: evidenceText(bridge),
      normalizedName: label,
      context: `${bridgeSummaryText(aggregate)}. ${evidenceText(bridge)}`,
    },
  ];
}

export function detectAnyBridge(report: StoredParsedReport): FilteringFeatureDetection {
  const aggregate = aggregateBridgeSummary(report.parseResult.myocardialBridgeSummary);
  return {
    present: aggregate.anyBridge,
    evidence: aggregate.anyBridge
      ? bridgeEvidence(aggregate, aggregate.firstBridge, bridgeSummaryText(aggregate))
      : [],
  };
}

export function detectBridgeGrade(
  report: StoredParsedReport,
  grade: 1 | 2 | 3 | "unknown"
): FilteringFeatureDetection {
  const aggregate = aggregateBridgeSummary(report.parseResult.myocardialBridgeSummary);
  const present =
    aggregate.anyBridge &&
    (grade === "unknown" ? aggregate.highestGrade === null : aggregate.highestGrade === grade);
  const label =
    grade === "unknown" ? "Highest grade: Unknown grade" : `Highest grade: Grade ${grade}`;
  return {
    present,
    evidence: present
      ? bridgeEvidence(aggregate, aggregate.highestGradeBridge ?? aggregate.firstBridge, label)
      : [],
  };
}

export function detectBridgeLengthBucket(
  report: StoredParsedReport,
  bucketId: BridgeLengthBucket["id"] | "bridge:length:unknown"
): FilteringFeatureDetection {
  const aggregate = aggregateBridgeSummary(report.parseResult.myocardialBridgeSummary);
  const present =
    aggregate.anyBridge &&
    (bucketId === "bridge:length:unknown"
      ? !aggregate.lengthBucket
      : aggregate.lengthBucket?.id === bucketId);
  const label =
    bucketId === "bridge:length:unknown"
      ? "Longest length: Unknown length"
      : `Longest length: ${aggregate.lengthBucket?.label.replace("Length ", "") ?? ""}`;
  return {
    present,
    evidence: present
      ? bridgeEvidence(aggregate, aggregate.longestLengthBridge ?? aggregate.firstBridge, label)
      : [],
  };
}
