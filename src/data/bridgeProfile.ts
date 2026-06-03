import {
  BRIDGE_LENGTH_BUCKETS,
  aggregateBridgeSummary,
  type BridgeLengthBucket,
} from "@/data/bridgeFiltering";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";

export type BridgeProfileGradeKey = "grade1" | "grade2" | "grade3" | "unknown";
export type BridgeProfileLengthKey =
  | "0-5"
  | "5-10"
  | "10-15"
  | "15-20"
  | "gt20"
  | "unknown";

export interface BridgeProfileGradeBucket {
  key: BridgeProfileGradeKey;
  label: string;
}

export interface BridgeProfileLengthBucket {
  key: BridgeProfileLengthKey;
  label: string;
  sourceId?: BridgeLengthBucket["id"];
}

export const BRIDGE_PROFILE_GRADE_BUCKETS: BridgeProfileGradeBucket[] = [
  { key: "grade1", label: "Grade 1" },
  { key: "grade2", label: "Grade 2" },
  { key: "grade3", label: "Grade 3" },
  { key: "unknown", label: "Unknown grade" },
];

export const BRIDGE_PROFILE_LENGTH_BUCKETS: BridgeProfileLengthBucket[] = [
  { key: "0-5", label: "0-5 mm", sourceId: "bridge:length:0-5" },
  { key: "5-10", label: "5-10 mm", sourceId: "bridge:length:5-10" },
  { key: "10-15", label: "10-15 mm", sourceId: "bridge:length:10-15" },
  { key: "15-20", label: "15-20 mm", sourceId: "bridge:length:15-20" },
  { key: "gt20", label: ">20 mm", sourceId: "bridge:length:gt20" },
  { key: "unknown", label: "Unknown length" },
];

export interface BridgeProfileSummary {
  matchingReports: number;
  reportsWithBridge: number;
  reportsWithoutBridge: number;
  unknownBridgeGrade: number;
  unknownBridgeLength: number;
}

export interface BridgeProfileCell<T> {
  gradeKey: BridgeProfileGradeKey;
  lengthKey: BridgeProfileLengthKey;
  reports: T[];
}

export interface BridgeProfile<T> {
  summary: BridgeProfileSummary;
  cells: Record<BridgeProfileGradeKey, Record<BridgeProfileLengthKey, BridgeProfileCell<T>>>;
}

function emptyCells<T>(): BridgeProfile<T>["cells"] {
  return BRIDGE_PROFILE_GRADE_BUCKETS.reduce(
    (gradeAcc, grade) => {
      gradeAcc[grade.key] = BRIDGE_PROFILE_LENGTH_BUCKETS.reduce(
        (lengthAcc, length) => {
          lengthAcc[length.key] = {
            gradeKey: grade.key,
            lengthKey: length.key,
            reports: [],
          };
          return lengthAcc;
        },
        {} as Record<BridgeProfileLengthKey, BridgeProfileCell<T>>
      );
      return gradeAcc;
    },
    {} as BridgeProfile<T>["cells"]
  );
}

function gradeKeyForReport(report: StoredParsedReport): BridgeProfileGradeKey {
  const aggregate = aggregateBridgeSummary(report.parseResult.myocardialBridgeSummary);
  if (aggregate.highestGrade === 1) return "grade1";
  if (aggregate.highestGrade === 2) return "grade2";
  if (aggregate.highestGrade === 3) return "grade3";
  return "unknown";
}

function lengthKeyForReport(report: StoredParsedReport): BridgeProfileLengthKey {
  const aggregate = aggregateBridgeSummary(report.parseResult.myocardialBridgeSummary);
  const sourceId = aggregate.lengthBucket?.id;
  const bucket = BRIDGE_PROFILE_LENGTH_BUCKETS.find((item) => item.sourceId === sourceId);
  return bucket?.key ?? "unknown";
}

export function computeBridgeProfile<T extends { report: StoredParsedReport }>(
  items: T[]
): BridgeProfile<T> {
  const cells = emptyCells<T>();
  const summary: BridgeProfileSummary = {
    matchingReports: items.length,
    reportsWithBridge: 0,
    reportsWithoutBridge: 0,
    unknownBridgeGrade: 0,
    unknownBridgeLength: 0,
  };

  for (const item of items) {
    const aggregate = aggregateBridgeSummary(item.report.parseResult.myocardialBridgeSummary);
    if (!aggregate.anyBridge) {
      summary.reportsWithoutBridge += 1;
      continue;
    }

    summary.reportsWithBridge += 1;
    const gradeKey = gradeKeyForReport(item.report);
    const lengthKey = lengthKeyForReport(item.report);
    if (gradeKey === "unknown") summary.unknownBridgeGrade += 1;
    if (lengthKey === "unknown") summary.unknownBridgeLength += 1;
    cells[gradeKey][lengthKey].reports.push(item);
  }

  return { summary, cells };
}
