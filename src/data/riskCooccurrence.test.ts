import { describe, expect, it } from "vitest";
import type { Assertion, ParsedTerm } from "@/data/parseTypes";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";
import type { ReportLaterality } from "@/data/laterality";
import {
  countCooccurrence,
  detectReportRiskFlags,
  flagPrevalence,
  RISK_FLAGS,
  type RiskFlagKey,
} from "@/data/riskCooccurrence";

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

function makeReport(id: string, parsedTerms: ParsedTerm[]): StoredParsedReport {
  return {
    id,
    textFile: `${id}.txt`,
    jsonFile: `${id}.json`,
    storedAt: "2026-01-01T00:00:00.000Z",
    reviewed: false,
    text: "",
    parseResult: {
      reportId: id,
      reportText: "",
      parsedTerms,
      myocardialBridgeSummary: { bridgeCount: 0, highestGrade: null, bridges: [] },
      parserModel: "test",
      parseTimeMs: 0,
      totalTokensUsed: 0,
      estimatedCostUsd: 0,
    },
  };
}

const RIGHT: ReportLaterality = { right: true, left: false, leftSubtypes: new Set() };
const LEFT: ReportLaterality = { right: false, left: true, leftSubtypes: new Set() };

function flagSet(report: StoredParsedReport, side: ReportLaterality): Set<RiskFlagKey> {
  return detectReportRiskFlags(report, side).flags;
}

describe("detectReportRiskFlags", () => {
  it("flags asserted binary risk features and narrowing", () => {
    const flags = flagSet(
      makeReport("r1", [
        makeTerm("interarterial course"),
        makeTerm("intramural course"),
        makeTerm("slit-like ostium"),
        makeTerm("acute angle of takeoff"),
        makeTerm("significant narrowing of right coronary artery"),
      ]),
      RIGHT
    );
    expect(flags).toEqual(
      new Set<RiskFlagKey>([
        "interarterial",
        "intramural",
        "slit_like",
        "acute_takeoff",
        "narrowing",
      ])
    );
  });

  it("ignores negated features", () => {
    const flags = flagSet(
      makeReport("r2", [
        makeTerm("interarterial course", "negated"),
        makeTerm("slit-like ostium", "negated"),
      ]),
      RIGHT
    );
    expect(flags.size).toBe(0);
  });

  it("treats a right vessel from the left sinus as opposite-sinus", () => {
    expect(flagSet(makeReport("r3", [makeTerm("left sinus")]), RIGHT).has("opposite_sinus")).toBe(true);
    // ...but the same left-sinus origin is NOT opposite-sinus for a left vessel.
    expect(flagSet(makeReport("r4", [makeTerm("left sinus")]), LEFT).has("opposite_sinus")).toBe(false);
  });

  it("treats a left vessel from the right sinus as opposite-sinus", () => {
    expect(flagSet(makeReport("r5", [makeTerm("right sinus")]), LEFT).has("opposite_sinus")).toBe(true);
    expect(flagSet(makeReport("r6", [makeTerm("right sinus")]), RIGHT).has("opposite_sinus")).toBe(false);
  });

  it("keeps the supporting term as evidence for each flag", () => {
    const detected = detectReportRiskFlags(
      makeReport("r7", [makeTerm("slit-like ostium")]),
      RIGHT
    );
    expect(detected.evidence.get("slit_like")?.normalizedName).toBe("slit-like ostium");
  });
});

describe("countCooccurrence", () => {
  const sets = [
    { reportId: "a", flags: new Set<RiskFlagKey>(["slit_like", "interarterial", "intramural"]) },
    { reportId: "b", flags: new Set<RiskFlagKey>(["slit_like", "interarterial"]) },
    { reportId: "c", flags: new Set<RiskFlagKey>(["interarterial"]) },
    { reportId: "d", flags: new Set<RiskFlagKey>([]) },
  ];

  it("counts the cohort and the diagonal per-report", () => {
    const counts = countCooccurrence(sets);
    expect(counts.total).toBe(4);
    expect(counts.diagonal.slit_like).toBe(2);
    expect(counts.diagonal.interarterial).toBe(3);
    expect(counts.diagonal.intramural).toBe(1);
    expect(counts.diagonal.high_origin).toBe(0);
  });

  it("counts pairwise co-occurrence symmetrically", () => {
    const counts = countCooccurrence(sets);
    expect(counts.pair.slit_like.interarterial).toBe(2);
    expect(counts.pair.interarterial.slit_like).toBe(2);
    expect(counts.pair.slit_like.intramural).toBe(1);
    expect(counts.pair.intramural.high_origin).toBe(0);
  });

  it("never counts a flag as co-occurring with itself", () => {
    const counts = countCooccurrence(sets);
    for (const flag of RISK_FLAGS) {
      expect(counts.pair[flag.key][flag.key]).toBe(0);
    }
  });
});

describe("flagPrevalence", () => {
  it("expresses each flag as a rounded share of the cohort", () => {
    const counts = countCooccurrence([
      { reportId: "a", flags: new Set<RiskFlagKey>(["slit_like"]) },
      { reportId: "b", flags: new Set<RiskFlagKey>(["slit_like"]) },
      { reportId: "c", flags: new Set<RiskFlagKey>([]) },
      { reportId: "d", flags: new Set<RiskFlagKey>([]) },
    ]);
    const prev = flagPrevalence(counts.diagonal, counts.total);
    expect(prev.slit_like).toEqual({ count: 2, pct: 50 });
    expect(prev.interarterial).toEqual({ count: 0, pct: 0 });
  });

  it("is safe on an empty cohort", () => {
    const prev = flagPrevalence(countCooccurrence([]).diagonal, 0);
    expect(prev.slit_like).toEqual({ count: 0, pct: 0 });
  });
});
