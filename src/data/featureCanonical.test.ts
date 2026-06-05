import { describe, it, expect } from "vitest";
import { canonicalFeature, reportIncidence } from "./featureCanonical";
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

  it("no longer special-cases coronary narrowing (#88 retired the rule tier)", () => {
    // The generic per-vessel narrowing tier is gone: a narrowing wording with no
    // resolved paperFeatureId now falls to the lowercased 'Other' bucket like any
    // other unmatched term, rather than a synthesized 'Coronary narrowing' key.
    const narrowing = canonicalFeature(term({ normalizedName: "significant narrowing of LCx" }));
    expect(narrowing?.key).toBe("term:significant narrowing of lcx");
    expect(narrowing?.category).toBe("Other");
  });

  it("routes in-scope narrowing to the paper entity via paperFeatureId", () => {
    const csa = canonicalFeature(
      term({ normalizedName: "ostial narrowing of RCA", paperFeatureId: "csa_narrowing" })
    );
    expect(csa?.key).toBe("paper:csa_narrowing");
    expect(csa?.category).not.toBe("Coronary narrowing");
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
