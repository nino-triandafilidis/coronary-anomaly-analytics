import { describe, expect, it } from "vitest";
import type { ParsedTerm } from "@/data/parseTypes";
import {
  cleanAnomalousLeftSubtypes,
  getReportAnomalousLeftSubtypes,
  resolveAnomalousLeftSubtypesFromTerm,
} from "@/data/anomalousLeftSubtypes";

function parsedTerm(
  text: string,
  assertion: ParsedTerm["assertion"] = "asserted"
): ParsedTerm {
  return {
    term: text,
    normalizedName: text,
    assertion,
    confidence: 1,
    startIndex: 0,
    endIndex: text.length,
    context: text,
    isAnomaly: true,
  };
}

describe("anomalous-left subtype cleaning", () => {
  it("keeps valid entries, preserves vessel labels, and removes exact duplicates", () => {
    expect(
      cleanAnomalousLeftSubtypes([
        { subtype: "intraconal_left", vessel: "LAD", rawText: "LAD with intraseptal course" },
        { subtype: "intraconal_left", vessel: "LAD", rawText: "LAD with intraseptal course" },
        { subtype: "unknown", vessel: "LCX", rawText: "retroaortic LCX" },
      ])
    ).toEqual([
      { subtype: "intraconal_left", vessel: "LAD", rawText: "LAD with intraseptal course" },
    ]);
  });
});

describe("legacy anomalous-left subtype resolution", () => {
  it("recognizes intraconal and intramural/inter-arterial left courses", () => {
    expect(
      resolveAnomalousLeftSubtypesFromTerm(
        parsedTerm("Anomalous left main coronary artery with intraseptal course")
      )
    ).toEqual([
      {
        subtype: "intraconal_left",
        rawText: "Anomalous left main coronary artery with intraseptal course",
      },
    ]);
    expect(
      resolveAnomalousLeftSubtypesFromTerm(
        parsedTerm("Left main courses between the aorta and pulmonary artery with an intramural segment")
      )
    ).toEqual([
      {
        subtype: "intramural_interarterial_left",
        rawText: "Left main courses between the aorta and pulmonary artery with an intramural segment",
      },
    ]);
  });

  it("supports short explicit subtype wording", () => {
    expect(resolveAnomalousLeftSubtypesFromTerm(parsedTerm("intraconal left"))).toEqual([
      { subtype: "intraconal_left", rawText: "intraconal left" },
    ]);
    expect(resolveAnomalousLeftSubtypesFromTerm(parsedTerm("inter-arterial left"))).toEqual([
      { subtype: "intramural_interarterial_left", rawText: "inter-arterial left" },
    ]);
  });

  it("does not infer a subtype from general left anomaly or retroaortic course", () => {
    expect(
      resolveAnomalousLeftSubtypesFromTerm(
        parsedTerm("Anomalous left coronary artery from the right sinus")
      )
    ).toEqual([]);
    expect(
      resolveAnomalousLeftSubtypesFromTerm(
        parsedTerm("Anomalous LCX with retroaortic course")
      )
    ).toEqual([]);
  });

  it("ignores negated course findings", () => {
    expect(
      resolveAnomalousLeftSubtypesFromTerm(
        parsedTerm("No intramural course of the left main coronary artery", "negated")
      )
    ).toEqual([]);
    expect(
      resolveAnomalousLeftSubtypesFromTerm(parsedTerm("inter-arterial left", "negated"))
    ).toEqual([]);
  });

  it("excludes negated terms when deriving fallback subtypes", () => {
    expect(
      getReportAnomalousLeftSubtypes(
        [],
        [
          parsedTerm("No intramural course of the left main coronary artery", "negated"),
          parsedTerm("inter-arterial left", "asserted"),
        ]
      ).map((entry) => entry.subtype)
    ).toEqual(["intramural_interarterial_left"]);
  });

  it("can return both subtype features and merges structured plus legacy entries", () => {
    expect(
      getReportAnomalousLeftSubtypes(
        [
          {
            subtype: "intraconal_left",
            vessel: "left main",
            rawText: "left main with intraseptal course",
          },
        ],
        [
          parsedTerm(
            "Left main with intraseptal and inter-arterial course and an intramural segment"
          ),
        ]
      ).map((entry) => entry.subtype)
    ).toEqual([
      "intraconal_left",
      "intraconal_left",
      "intramural_interarterial_left",
    ]);
  });
});
