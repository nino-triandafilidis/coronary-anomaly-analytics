import { describe, expect, it } from "vitest";
import {
  buildIntramuralCourseLengthHistogram,
  cleanIntramuralCourseLengthMeasurements,
} from "@/data/intramuralCourseLengths";

describe("intramural course length cleaning", () => {
  it("normalizes valid millimeter and centimeter measurements", () => {
    expect(
      cleanIntramuralCourseLengthMeasurements([
        { value: 8, unit: "mm", rawText: "intramural segment measures 8 mm", vessel: "RCA" },
        { value: 1.2, unit: "cm", rawText: "approximately 1.2 cm intramural course", vessel: null },
      ])
    ).toEqual([
      { value: 8, unit: "mm", rawText: "intramural segment measures 8 mm", vessel: "RCA" },
      { value: 12, unit: "mm", rawText: "approximately 1.2 cm intramural course", vessel: undefined },
    ]);
  });

  it("does not copy measurements stated only for an inter-arterial course", () => {
    expect(
      cleanIntramuralCourseLengthMeasurements([
        { value: 8, unit: "mm", rawText: "inter-arterial course measures 8 mm" },
        { value: 10, unit: "mm", rawText: "inter-arterial and intramural course measures 10 mm" },
      ])
    ).toEqual([
      { value: 10, unit: "mm", rawText: "inter-arterial and intramural course measures 10 mm", vessel: undefined },
    ]);
  });

  it("drops missing, invalid, zero, and negative measurements", () => {
    expect(
      cleanIntramuralCourseLengthMeasurements([
        { value: 0, unit: "mm" },
        { value: -2, unit: "mm" },
        { value: Number.POSITIVE_INFINITY, unit: "mm" },
        { value: 8, unit: "inch" },
        null,
      ])
    ).toEqual([]);
    expect(cleanIntramuralCourseLengthMeasurements(undefined)).toEqual([]);
  });
});

describe("intramural course length histogram", () => {
  it("uses 5 mm bins and includes the maximum value in the final bin", () => {
    expect(buildIntramuralCourseLengthHistogram([4.9, 5, 9.9, 10])).toEqual([
      { label: "0-5 mm", minMm: 0, maxMm: 5, count: 1 },
      { label: "5-10 mm", minMm: 5, maxMm: 10, count: 2 },
      { label: "10-15 mm", minMm: 10, maxMm: 15, count: 1 },
    ]);
  });

  it("returns an empty histogram when no valid values exist", () => {
    expect(buildIntramuralCourseLengthHistogram([])).toEqual([]);
    expect(buildIntramuralCourseLengthHistogram([0, -1, Number.NaN])).toEqual([]);
  });
});
