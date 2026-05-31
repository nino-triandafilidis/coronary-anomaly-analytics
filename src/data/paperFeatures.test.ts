import { describe, expect, it } from "vitest";
import type { Assertion, ParsedTerm } from "@/data/parseTypes";
import {
  enrichParsedTermWithPaperFeature,
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

  it("excludes reference-only negatives", () => {
    expect(shouldIncludeInNormalizedFrequency(parsedTerm("STJ", "negated"))).toBe(false);
  });

  it("keeps asserted terms without requiring a paper feature", () => {
    expect(
      shouldIncludeInNormalizedFrequency(parsedTerm("pleural effusion", "asserted"))
    ).toBe(true);
  });
});
