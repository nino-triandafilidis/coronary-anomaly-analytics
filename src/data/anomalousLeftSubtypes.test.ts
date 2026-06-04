import { describe, expect, it } from "vitest";
import {
  cleanAnomalousLeftSubtypes,
  getReportAnomalousLeftSubtypes,
} from "@/data/anomalousLeftSubtypes";

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

describe("structured anomalous-left subtype resolution", () => {
  it("does not infer subtypes from findings text", () => {
    expect(
      getReportAnomalousLeftSubtypes(undefined)
    ).toEqual([]);
    expect(
      getReportAnomalousLeftSubtypes(
        null
      )
    ).toEqual([]);
  });

  it("returns only structured subtype entries", () => {
    expect(
      getReportAnomalousLeftSubtypes(
        [
          {
            subtype: "intraconal_left",
            vessel: "left main",
            rawText: "left main with intraseptal course",
          },
          {
            subtype: "intramural_interarterial_left",
            vessel: "left main",
            rawText: "left main with inter-arterial course and an intramural segment",
          },
        ],
      ).map((entry) => entry.subtype)
    ).toEqual(["intraconal_left", "intramural_interarterial_left"]);
  });
});
