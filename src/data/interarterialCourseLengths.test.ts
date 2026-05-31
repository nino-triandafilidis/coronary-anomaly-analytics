import { describe, expect, it } from "vitest";
import {
  buildInterarterialCourseLengthHistogram,
  cleanInterarterialCourseLengthMeasurements,
} from "@/data/interarterialCourseLengths";

describe("inter-arterial course length cleaning", () => {
  it("normalizes valid millimeter and centimeter measurements", () => {
    expect(
      cleanInterarterialCourseLengthMeasurements([
        { value: 8, unit: "mm", rawText: "inter-arterial course measures 8 mm", vessel: "RCA" },
        { value: 1.2, unit: "cm", rawText: "approximately 1.2 cm interarterial course", vessel: null },
      ])
    ).toEqual([
      { value: 8, unit: "mm", rawText: "inter-arterial course measures 8 mm", vessel: "RCA" },
      { value: 12, unit: "mm", rawText: "approximately 1.2 cm interarterial course", vessel: undefined },
    ]);
  });

  it("drops missing, invalid, zero, and negative measurements", () => {
    expect(
      cleanInterarterialCourseLengthMeasurements([
        { value: 0, unit: "mm" },
        { value: -2, unit: "mm" },
        { value: Number.POSITIVE_INFINITY, unit: "mm" },
        { value: 8, unit: "inch" },
        null,
      ])
    ).toEqual([]);
    expect(cleanInterarterialCourseLengthMeasurements(undefined)).toEqual([]);
  });
});

describe("inter-arterial course length histogram", () => {
  it("uses 5 mm bins and includes the maximum value in the final bin", () => {
    expect(buildInterarterialCourseLengthHistogram([4.9, 5, 9.9, 10])).toEqual([
      { label: "0-5 mm", minMm: 0, maxMm: 5, count: 1 },
      { label: "5-10 mm", minMm: 5, maxMm: 10, count: 2 },
      { label: "10-15 mm", minMm: 10, maxMm: 15, count: 1 },
    ]);
  });

  it("returns an empty histogram when no valid values exist", () => {
    expect(buildInterarterialCourseLengthHistogram([])).toEqual([]);
    expect(buildInterarterialCourseLengthHistogram([0, -1, Number.NaN])).toEqual([]);
  });
});
