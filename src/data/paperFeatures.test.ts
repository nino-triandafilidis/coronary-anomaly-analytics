import { describe, expect, it } from "vitest";
import type { Assertion, ParsedTerm } from "@/data/parseTypes";
import {
  enrichParsedTermWithPaperFeature,
  resolveParsedTermPaperFeature,
  resolvePaperFeature,
  shouldIncludeInNormalizedFrequency,
} from "@/data/paperFeatures";

function parsedTerm(normalizedName: string, assertion: Assertion): ParsedTerm {
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

describe("paper feature resolution", () => {
  it("normalizes aliases, case, and hyphen variation", () => {
    expect(resolvePaperFeature("LS")?.canonical).toBe("left sinus");
    expect(resolvePaperFeature("slit like ostium")?.canonical).toBe("slit-like ostium");
    expect(resolvePaperFeature("No interarterial course")?.canonical).toBe(
      "interarterial course"
    );
  });

  it("enriches new parsed terms with stable paper metadata", () => {
    expect(enrichParsedTermWithPaperFeature(parsedTerm("STJ", "negated"))).toMatchObject({
      paperFeatureId: "sinutubular_junction",
      paperFeatureLabel: "sinutubular junction",
      paperFeatureCategory: "Additional findings",
      paperFeatureTrackingRole: "reference",
    });
  });

  it.each([
    ["intramural course", "intramural_course"],
    ["slit-like origin", "slit_like_ostium"],
    ["myocardial bridging", "myocardial_bridge"],
    ["takeoff angle", "acute_angle_of_takeoff"],
    ["commissural origin", "juxtacommissural"],
  ])("tracks priority paper feature wording %s", (term, expectedId) => {
    expect(enrichParsedTermWithPaperFeature(parsedTerm(term, "negated"))).toMatchObject({
      paperFeatureId: expectedId,
    });
  });

  it("does not resolve structured-only anomalous-left subtypes from parsed finding text", () => {
    expect(resolvePaperFeature("intraseptal left")).toBeUndefined();
    expect(resolvePaperFeature("inter-arterial left")).toBeUndefined();
    expect(
      resolveParsedTermPaperFeature({
        ...parsedTerm("inter-arterial left", "asserted"),
        paperFeatureId: "anomalous_left_intramural_interarterial",
      })
    ).toBeUndefined();
    expect(resolvePaperFeature("L-AAOCA")?.id).toBe("l_aaoca");
  });

  it("prefers a stored paperFeatureId over the rule-based name match (#66 resolver wins)", () => {
    // "intramural course" rule-matches intramural_course, but the resolver stored
    // intraseptal_course from context; the stored id must win.
    const corrected: ParsedTerm = {
      ...parsedTerm("intramural course", "asserted"),
      paperFeatureId: "intraseptal_course",
    };
    expect(resolveParsedTermPaperFeature(corrected)?.id).toBe("intraseptal_course");
    // with no stored id, it falls through to the rule match unchanged
    expect(resolveParsedTermPaperFeature(parsedTerm("intramural course", "asserted"))?.id).toBe(
      "intramural_course"
    );
  });

  it("honors a stored none sentinel as authoritative out-of-scope (no rule fallthrough)", () => {
    // "left sinus" rule-matches left_sinus, but the resolver judged this mention none.
    const outOfScope: ParsedTerm = {
      ...parsedTerm("left sinus", "asserted"),
      paperFeatureId: "none",
    };
    expect(resolveParsedTermPaperFeature(outOfScope)).toBeUndefined();
    // sanity: the same wording rule-matches when not backfilled
    expect(resolveParsedTermPaperFeature(parsedTerm("left sinus", "asserted"))?.id).toBe(
      "left_sinus"
    );
  });
});

describe("normalized frequency filtering", () => {
  it("excludes untracked incidental negatives", () => {
    expect(
      shouldIncludeInNormalizedFrequency(parsedTerm("pleural effusion", "negated"))
    ).toBe(false);
  });

  it("includes tracked negatives even when old saved terms lack paper metadata", () => {
    expect(
      shouldIncludeInNormalizedFrequency(parsedTerm("interarterial", "negated"))
    ).toBe(true);
    expect(shouldIncludeInNormalizedFrequency(parsedTerm("LS", "negated"))).toBe(true);
  });

  it.each([
    "intramural course",
    "slit-like origin",
    "myocardial bridging",
    "takeoff angle",
    "commissural origin",
  ])("includes priority paper feature negative %s", (term) => {
    expect(shouldIncludeInNormalizedFrequency(parsedTerm(term, "negated"))).toBe(true);
  });

  it("excludes reference-only negatives", () => {
    expect(shouldIncludeInNormalizedFrequency(parsedTerm("STJ", "negated"))).toBe(false);
  });

  it("keeps asserted terms without requiring a paper feature", () => {
    expect(
      shouldIncludeInNormalizedFrequency(parsedTerm("pleural effusion", "asserted"))
    ).toBe(true);
  });
});
