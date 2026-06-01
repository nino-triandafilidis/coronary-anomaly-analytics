import type { IntramuralCourseLengthMeasurement } from "@/data/parseTypes";
import {
  buildCourseLengthHistogram,
  cleanCourseLengthMeasurements,
  type CourseLengthHistogramBin,
} from "@/data/interarterialCourseLengths";

export type IntramuralCourseLengthHistogramBin = CourseLengthHistogramBin;

export function cleanIntramuralCourseLengthMeasurements(
  measurements: unknown
): IntramuralCourseLengthMeasurement[] {
  return cleanCourseLengthMeasurements(measurements, (measurement) => {
    const rawText = measurement.rawText.toLowerCase();
    const mentionsInterarterial = /\binter[\s-]?arterial\b/.test(rawText);
    const mentionsIntramural = /\bintramural\b/.test(rawText);

    return !mentionsInterarterial || mentionsIntramural;
  });
}

export function buildIntramuralCourseLengthHistogram(
  valuesMm: number[],
  binSizeMm = 5
): IntramuralCourseLengthHistogramBin[] {
  return buildCourseLengthHistogram(valuesMm, binSizeMm);
}
