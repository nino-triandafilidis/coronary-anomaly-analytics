import { describe, expect, it } from "vitest";
import {
  combinationKey,
  computeCombinationRows,
  type FilteringFeatureId,
  type ReportFeatureSet,
} from "@/data/filteringFeatures";

function featureSet(id: string, present: FilteringFeatureId[]): ReportFeatureSet {
  return {
    report: { id } as ReportFeatureSet["report"],
    side: { right: false, left: false, leftSubtypes: new Set() },
    present: new Set(present),
    evidence: new Map(),
  };
}

describe("computeCombinationRows", () => {
  it("partitions reports into exact buckets across the selected features", () => {
    const selected: FilteringFeatureId[] = [
      "interarterial",
      "high_origin",
      "bridge:grade:2",
    ];
    const onlyGrade2: FilteringFeatureId[] = ["bridge:grade:2"];
    const interarterialGrade2: FilteringFeatureId[] = [
      "interarterial",
      "bridge:grade:2",
    ];

    const rows = computeCombinationRows(
      [
        featureSet("only-grade-2", onlyGrade2),
        featureSet("all-three", selected),
        featureSet("interarterial-grade-2", interarterialGrade2),
      ],
      selected
    );

    const reportIdsByKey = new Map(
      rows.map((row) => [row.key, row.reports.map((item) => item.report.id)])
    );

    expect(reportIdsByKey.get(combinationKey(onlyGrade2))).toEqual(["only-grade-2"]);
    expect(reportIdsByKey.get(combinationKey(selected))).toEqual(["all-three"]);
    expect(reportIdsByKey.get(combinationKey(interarterialGrade2))).toEqual([
      "interarterial-grade-2",
    ]);
  });
});
