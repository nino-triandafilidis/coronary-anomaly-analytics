import { describe, expect, it } from "vitest";
import type { Assertion, ParsedTerm, ReportCohortSide } from "@/data/parseTypes";
import type { StoredParsedReport } from "@/lib/parsedReportStorage";
import { deriveAaocaUmbrella, isRightAaoca } from "@/data/aaocaUmbrella";

function term(
  normalizedName: string,
  paperFeatureId?: string,
  assertion: Assertion = "asserted"
): ParsedTerm {
  return {
    term: normalizedName,
    normalizedName,
    assertion,
    confidence: 1,
    startIndex: 0,
    endIndex: normalizedName.length,
    context: normalizedName,
    isAnomaly: true,
    paperFeatureId,
  };
}

function report(parsedTerms: ParsedTerm[], side?: ReportCohortSide): StoredParsedReport {
  return {
    id: "r",
    textFile: "r.txt",
    jsonFile: "r.json",
    storedAt: "2026-01-01T00:00:00.000Z",
    reviewed: false,
    text: "",
    side,
    parseResult: {
      reportId: "r",
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

describe("deriveAaocaUmbrella", () => {
  it("trusts an asserted umbrella entity as-is", () => {
    const result = deriveAaocaUmbrella(report([term("R-AAOCA", "r_aaoca")], "RCA"));
    expect(result.umbrella).toBe("r_aaoca");
    expect(result.basis).toBe("asserted-term");
  });

  // --- the 22 true parser misses: constituents present, umbrella never emitted ---
  it("derives r_aaoca from an explicit opposite (left) sinus origin", () => {
    // mirrors STSS27a41df9
    const result = deriveAaocaUmbrella(
      report(
        [
          term(
            "High Origin of Right Coronary Artery from Left Coronary Sinus Above Sinotubular Junction",
            "high_origin"
          ),
          term("Interarterial Course of Right Coronary Artery, 1.6 cm", "interarterial_course"),
        ],
        "RCA"
      )
    );
    expect(result.umbrella).toBe("r_aaoca");
    expect(result.basis).toBe("derived-constituents");
    expect(result.evidence.oppositeSinusOrigin).toBe(true);
  });

  it("derives r_aaoca from an L-R commissural origin", () => {
    // mirrors STSS27a3c206
    const result = deriveAaocaUmbrella(
      report(
        [
          term("high and medialized origin of right coronary artery", "high_origin"),
          term("origin at the junction of right and left cusps", "left_right_juxtacommissural"),
          term("interarterial course of right coronary artery, 9 mm", "interarterial_course"),
        ],
        "RCA"
      )
    );
    expect(result.umbrella).toBe("r_aaoca");
    expect(result.evidence.oppositeSinusOrigin).toBe(true);
  });

  it("derives r_aaoca from a definite (malignant) interarterial course without a sinus cue", () => {
    // mirrors STSS27a420da
    const result = deriveAaocaUmbrella(
      report(
        [
          term(
            "Anterior Takeoff and Malignant Interarterial Course of Ostial RCA",
            "interarterial_course"
          ),
        ],
        "RCA"
      )
    );
    expect(result.umbrella).toBe("r_aaoca");
    expect(result.evidence.definiteInterarterial).toBe(true);
  });

  // --- the 6 borderline high-takeoff-over-own-sinus cases ---
  it("marks own-sinus high takeoff with a weak interarterial course as borderline (strict)", () => {
    // mirrors STSS27a05cd1: "very slight interarterial course of RCA"
    const result = deriveAaocaUmbrella(
      report([term("very slight interarterial course of RCA", "interarterial_course")], "RCA")
    );
    expect(result.umbrella).toBeNull();
    expect(result.borderline).toBe(true);
  });

  it("counts the same borderline case under the inclusive policy", () => {
    const r = report(
      [
        term("High Origin of RCA above Sinotubular Junction", "high_origin"),
        term("Interarterial Course of Proximal Right Coronary Artery", "interarterial_course"),
      ],
      "RCA"
    );
    // bare (unhedged) interarterial reads as definite -> r_aaoca even in strict
    expect(deriveAaocaUmbrella(r, "strict").umbrella).toBe("r_aaoca");

    // a hedged-only case flips on the policy knob
    const hedged = report(
      [term("High Origin of RCA Above Sinotubular Junction", "high_origin")],
      "RCA"
    );
    expect(deriveAaocaUmbrella(hedged, "strict").umbrella).toBeNull();
    expect(deriveAaocaUmbrella(hedged, "strict").borderline).toBe(true);
    expect(deriveAaocaUmbrella(hedged, "inclusive").umbrella).toBe("r_aaoca");
    expect(deriveAaocaUmbrella(hedged, "inclusive").borderline).toBe(true);
  });

  // --- the 3 not-anomalous cohort mislabels ---
  it("returns no umbrella when the RCA-cohort report carries no anomalous constituents", () => {
    // mirrors STSS27a62a13: normal RCA origin, post-surgical read
    const result = deriveAaocaUmbrella(
      report(
        [
          term("Normal origin of RCA from right sinus of Valsalva", "right_sinus", "negated"),
          term("right dominance", "right_dominance"),
        ],
        "RCA"
      )
    );
    expect(result.umbrella).toBeNull();
    expect(result.borderline).toBe(false);
    expect(result.basis).toBe("none");
  });

  // --- the 2 other-subtype cohort mislabels ---
  it("routes a single / shared trunk to st_aaoca, not r_aaoca", () => {
    // mirrors STSS27a3c20b: shared RCA + LAD trunk
    const result = deriveAaocaUmbrella(
      report(
        [term("Shared origin of the RCA and LAD from the facing left anterior sinus")],
        "RCA"
      )
    );
    expect(result.umbrella).toBe("st_aaoca");
  });

  // --- left-side symmetry ---
  it("derives a left umbrella from an opposite (right) sinus origin", () => {
    const result = deriveAaocaUmbrella(
      report(
        [
          term("High Origin of LAD from Right Coronary Sinus", "high_origin"),
          term("Interarterial Course of LAD, 8 mm", "interarterial_course"),
        ],
        "LCA"
      )
    );
    expect(result.umbrella).toBe("lad_aaoca");
  });

  // --- live-parsed report with no curated side: vessel is inferred ---
  it("infers the cohort vessel when side is absent", () => {
    const result = deriveAaocaUmbrella(
      report([
        term("anomalous origin of RCA from the left coronary sinus", "high_origin"),
        term("interarterial course of RCA, 10 mm", "interarterial_course"),
      ])
    );
    expect(result.cohortVessel).toBe("right");
    expect(result.umbrella).toBe("r_aaoca");
  });

  it("isRightAaoca tracks the umbrella for r_aaoca only", () => {
    expect(
      isRightAaoca(
        report([term("Interarterial Course of RCA, 1.2 cm", "interarterial_course")], "RCA")
      )
    ).toBe(true);
    expect(
      isRightAaoca(report([term("High Origin of LAD from Right Coronary Sinus", "high_origin")], "LCA"))
    ).toBe(false);
  });
});
