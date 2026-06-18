import { describe, it, expect } from "vitest";
import {
  canonicalFeature,
  normalizeCoronaryNarrowingFeature,
  reportIncidence,
} from "./featureCanonical";
import type { ParsedTerm } from "./parseTypes";

const term = (p: Partial<ParsedTerm>): ParsedTerm =>
  ({
    term: "",
    normalizedName: "",
    assertion: "asserted",
    startIndex: 0,
    endIndex: 0,
    context: "",
    isAnomaly: true,
    ...p,
  }) as ParsedTerm;

describe("canonicalFeature", () => {
  it("maps a paper-tracked concept to one key regardless of vessel wording", () => {
    const a = canonicalFeature(term({ normalizedName: "interarterial course of RCA" }));
    const b = canonicalFeature(term({ normalizedName: "interarterial course of right coronary artery" }));
    expect(a?.key).toMatch(/^paper:/);
    expect(a?.key).toBe(b?.key);
  });

  it("collapses narrowing wording + vessel synonyms to one key", () => {
    const a = canonicalFeature(term({ normalizedName: "significant narrowing of LCx" }));
    const b = canonicalFeature(term({ normalizedName: "Significant Narrowing Of Left Circumflex Artery" }));
    expect(a?.key).toBe(b?.key);
  });

  it("does not infer a vessel-specific narrowing feature from broad context", () => {
    expect(
      normalizeCoronaryNarrowingFeature(
        term({
          normalizedName: "significant narrowing",
          context: "The RCA has an interarterial course and is significantly narrowed proximally.",
        })
      )
    ).toBeNull();
  });

  it("falls back to a lowercased key so case/whitespace variants still collapse", () => {
    const a = canonicalFeature(term({ normalizedName: "Some Incidental Phrase" }));
    const b = canonicalFeature(term({ normalizedName: "some incidental   phrase" }));
    expect(a?.key).toBe(b?.key);
  });
});

describe("reportIncidence", () => {
  const select = (t: ParsedTerm) => canonicalFeature(t);

  it("counts a feature once per report, not once per mention", () => {
    const reports = [
      {
        id: "r1",
        terms: [
          term({ normalizedName: "interarterial course of RCA" }),
          term({ normalizedName: "interarterial course of right coronary artery" }),
        ],
      },
    ];
    const rows = reportIncidence(reports, (r) => r.terms, select);
    const ia = rows.find((row) => /interarterial/i.test(row.label));
    expect(ia?.reports).toBe(1);
    expect(ia?.reportIds).toEqual(["r1"]);
  });

  it("tracks asserted vs negated incidence per report", () => {
    const reports = [
      { id: "r1", terms: [term({ normalizedName: "myocardial bridge", assertion: "asserted" })] },
      { id: "r2", terms: [term({ normalizedName: "myocardial bridge", assertion: "negated" })] },
    ];
    const rows = reportIncidence(reports, (r) => r.terms, select);
    const mb = rows.find((row) => /bridge/i.test(row.label));
    expect(mb?.assertedReports).toBe(1);
    expect(mb?.negatedReports).toBe(1);
    expect(mb?.reports).toBe(2);
  });
});
