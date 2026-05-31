import type { InterarterialCourseLengthMeasurement } from "@/data/parseTypes";

export interface CourseLengthMeasurement {
  value: number;
  unit: "mm";
  rawText: string;
  vessel?: string;
}

export interface CourseLengthHistogramBin {
  label: string;
  minMm: number;
  maxMm: number;
  count: number;
}

export type InterarterialCourseLengthHistogramBin = CourseLengthHistogramBin;

function normalizeUnit(unit: unknown): "mm" | "cm" | null {
  if (typeof unit !== "string") return null;

  const normalized = unit.trim().toLowerCase();
  if (normalized === "mm" || normalized === "millimeter" || normalized === "millimeters") {
    return "mm";
  }
  if (normalized === "cm" || normalized === "centimeter" || normalized === "centimeters") {
    return "cm";
  }
  return null;
}

export function cleanCourseLengthMeasurements(
  measurements: unknown,
  shouldKeep?: (measurement: CourseLengthMeasurement) => boolean
): CourseLengthMeasurement[] {
  if (!Array.isArray(measurements)) return [];

  return measurements.flatMap((measurement) => {
    if (!measurement || typeof measurement !== "object") return [];

    const raw = measurement as Record<string, unknown>;
    const unit = normalizeUnit(raw.unit);
    const numericValue =
      typeof raw.value === "number"
        ? raw.value
        : typeof raw.value === "string"
          ? Number(raw.value)
          : NaN;

    if (!unit || !Number.isFinite(numericValue) || numericValue <= 0) return [];

    const valueMm = unit === "cm" ? numericValue * 10 : numericValue;
    if (!Number.isFinite(valueMm) || valueMm <= 0) return [];

    const cleaned = {
      value: valueMm,
      unit: "mm" as const,
      rawText: typeof raw.rawText === "string" ? raw.rawText : "",
      vessel:
        typeof raw.vessel === "string" && raw.vessel.trim()
          ? raw.vessel.trim()
          : undefined,
    };

    return !shouldKeep || shouldKeep(cleaned) ? [cleaned] : [];
  });
}

export function cleanInterarterialCourseLengthMeasurements(
  measurements: unknown
): InterarterialCourseLengthMeasurement[] {
  return cleanCourseLengthMeasurements(measurements);
}

export function buildCourseLengthHistogram(
  valuesMm: number[],
  binSizeMm = 5
): CourseLengthHistogramBin[] {
  const validValues = valuesMm.filter(
    (value) => Number.isFinite(value) && value > 0
  );
  if (validValues.length === 0 || !Number.isFinite(binSizeMm) || binSizeMm <= 0) {
    return [];
  }

  const maxValue = Math.max(...validValues);
  const binCount = Math.floor(maxValue / binSizeMm) + 1;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const minMm = index * binSizeMm;
    const maxMm = minMm + binSizeMm;
    return {
      label: `${minMm}-${maxMm} mm`,
      minMm,
      maxMm,
      count: 0,
    };
  });

  validValues.forEach((value) => {
    bins[Math.floor(value / binSizeMm)].count += 1;
  });

  return bins;
}

export function buildInterarterialCourseLengthHistogram(
  valuesMm: number[],
  binSizeMm = 5
): InterarterialCourseLengthHistogramBin[] {
  return buildCourseLengthHistogram(valuesMm, binSizeMm);
}
