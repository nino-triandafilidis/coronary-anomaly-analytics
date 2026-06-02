import { describe, expect, it } from "vitest";
import type {
  AnomalousLeftSubtypeEntry,
  Assertion,
  ParsedTerm,
} from "@/data/parseTypes";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";
import { deriveReportLaterality, reportMatchesFilter } from "@/data/laterality";

function makeTerm(normalizedName: string, assertion: Assertion = "asserted"): ParsedTerm {
  return {
    term: normalizedName,
    normalizedName,
    assertion,
    confidence: 1,
    startIndex: 0,
    endIndex: normalizedName.length,
    context: normalizedName,
    isAnomaly: true,
  };
}

function makeReport(
  parsedTerms: ParsedTerm[],
  anomalousLeftSubtypes: AnomalousLeftSubtypeEntry[] = []
): StoredParsedReport {
  return {
    id: "report-1",
    textFile: "report-1.txt",
    jsonFile: "report-1.json",
    storedAt: "2026-01-01T00:00:00.000Z",
    reviewed: false,
    text: "",
    parseResult: {
      reportId: "report-1",
      reportText: "",
      parsedTerms,
      myocardialBridgeSummary: { bridgeCount: 0, highestGrade: null, bridges: [] },
      anomalousLeftSubtypes,
      parserModel: "test",
      parseTimeMs: 0,
      totalTokensUsed: 0,
      estimatedCostUsd: 0,
    },
  };
}

describe("deriveReportLaterality", () => {
  it("classifies an R-AAOCA report as right only", () => {
    const laterality = deriveReportLaterality(makeReport([makeTerm("R-AAOCA")]));
    expect(laterality.right).toBe(true);
    expect(laterality.left).toBe(false);
    expect(laterality.leftSubtypes.size).toBe(0);
  });

  it("classifies an L-AAOCA or LAD-AAOCA report as left only", () => {
    expect(deriveReportLaterality(makeReport([makeTerm("L-AAOCA")])).left).toBe(true);
    expect(deriveReportLaterality(makeReport([makeTerm("L-AAOCA")])).right).toBe(false);
    expect(deriveReportLaterality(makeReport([makeTerm("LAD-AAOCA")])).left).toBe(true);
  });

  it("marks a report with a left subtype as left and records the subtype", () => {
    const laterality = deriveReportLaterality(
      makeReport([], [{ subtype: "intraconal_left", rawText: "intraseptal left main" }])
    );
    expect(laterality.left).toBe(true);
    expect(laterality.leftSubtypes.has("intraconal_left")).toBe(true);
    expect(laterality.leftSubtypes.has("intramural_interarterial_left")).toBe(false);
  });

  it("classifies a bilateral report as both right and left", () => {
    const laterality = deriveReportLaterality(
      makeReport([makeTerm("R-AAOCA"), makeTerm("L-AAOCA")])
    );
    expect(laterality.right).toBe(true);
    expect(laterality.left).toBe(true);
  });

  it("treats a report with no AAOCA-form evidence as neither side", () => {
    const laterality = deriveReportLaterality(makeReport([makeTerm("right dominance")]));
    expect(laterality.right).toBe(false);
    expect(laterality.left).toBe(false);
  });

  it("ignores negated AAOCA-form terms", () => {
    const laterality = deriveReportLaterality(makeReport([makeTerm("R-AAOCA", "negated")]));
    expect(laterality.right).toBe(false);
  });

  it("reads a free-text RCA anomaly as right, not the left cusp it arises from", () => {
    const laterality = deriveReportLaterality(
      makeReport([makeTerm("Anomalous Origin of RCA from Left Coronary Cusp")])
    );
    expect(laterality.right).toBe(true);
    expect(laterality.left).toBe(false);
  });

  it("reads a free-text left-circumflex anomaly as left", () => {
    const laterality = deriveReportLaterality(
      makeReport([makeTerm("Anomalous Origin of Left Circumflex Artery")])
    );
    expect(laterality.left).toBe(true);
    expect(laterality.right).toBe(false);
  });

  it("takes the majority side when a report names both systems", () => {
    const laterality = deriveReportLaterality(
      makeReport([
        makeTerm("Anomalous Origin of RCA from Left Coronary Sinus"),
        makeTerm("Interarterial Course of RCA"),
        makeTerm("Intramural Course of RCA"),
        makeTerm("Anomalous Origin of Left Anterior Descending Artery"),
      ])
    );
    expect(laterality.right).toBe(true);
    expect(laterality.left).toBe(false);
  });

  it("does not vote on a normally-arising vessel", () => {
    const laterality = deriveReportLaterality(
      makeReport([makeTerm("normal origin of left main artery")])
    );
    expect(laterality.right).toBe(false);
    expect(laterality.left).toBe(false);
  });

  it("prefers the curated cohort side over text cues", () => {
    const report = makeReport([makeTerm("Anomalous Origin of Left Circumflex Artery")]);
    report.side = "RCA";
    const laterality = deriveReportLaterality(report);
    expect(laterality.right).toBe(true);
    expect(laterality.left).toBe(false);
  });

  it("maps a curated LCA side to left even with no anomaly terms", () => {
    const report = makeReport([]);
    report.side = "LCA";
    const laterality = deriveReportLaterality(report);
    expect(laterality.left).toBe(true);
    expect(laterality.right).toBe(false);
  });
});

describe("reportMatchesFilter", () => {
  const right = { right: true, left: false, leftSubtypes: new Set<never>() };
  const leftIntraconal = {
    right: false,
    left: true,
    leftSubtypes: new Set(["intraconal_left" as const]),
  };
  const unsided = { right: false, left: false, leftSubtypes: new Set<never>() };

  it("passes everything under overall", () => {
    expect(reportMatchesFilter(unsided, "overall")).toBe(true);
    expect(reportMatchesFilter(right, "overall")).toBe(true);
  });

  it("filters by side under right and left", () => {
    expect(reportMatchesFilter(right, "right")).toBe(true);
    expect(reportMatchesFilter(leftIntraconal, "right")).toBe(false);
    expect(reportMatchesFilter(leftIntraconal, "left")).toBe(true);
    expect(reportMatchesFilter(right, "left")).toBe(false);
  });

  it("narrows by left subtype", () => {
    expect(reportMatchesFilter(leftIntraconal, "left", "intraconal_left")).toBe(true);
    expect(reportMatchesFilter(leftIntraconal, "left", "intramural_interarterial_left")).toBe(false);
    expect(reportMatchesFilter(leftIntraconal, "left", "all")).toBe(true);
  });
});
