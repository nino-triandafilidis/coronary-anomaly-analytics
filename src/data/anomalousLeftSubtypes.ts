import type {
  AnomalousLeftSubtypeEntry,
  AnomalousLeftSubtype,
} from "@/data/parseTypes";

const VALID_SUBTYPES = new Set<AnomalousLeftSubtype>([
  "intraconal_left",
  "intramural_interarterial_left",
]);

function normalizeEntryKey(entry: AnomalousLeftSubtypeEntry): string {
  return [
    entry.subtype,
    entry.vessel?.trim().toLowerCase() ?? "",
    entry.rawText.trim().toLowerCase(),
  ].join("|");
}

export function cleanAnomalousLeftSubtypes(
  entries: unknown
): AnomalousLeftSubtypeEntry[] {
  if (!Array.isArray(entries)) return [];

  const seen = new Set<string>();
  const cleaned: AnomalousLeftSubtypeEntry[] = [];

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;

    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.subtype !== "string" ||
      !VALID_SUBTYPES.has(raw.subtype as AnomalousLeftSubtype)
    ) {
      return;
    }

    const next: AnomalousLeftSubtypeEntry = {
      subtype: raw.subtype as AnomalousLeftSubtype,
      rawText: typeof raw.rawText === "string" ? raw.rawText : "",
      vessel:
        typeof raw.vessel === "string" && raw.vessel.trim()
          ? raw.vessel.trim()
          : undefined,
    };
    const key = normalizeEntryKey(next);
    if (seen.has(key)) return;

    seen.add(key);
    cleaned.push(next);
  });

  return cleaned;
}

export function getReportAnomalousLeftSubtypes(entries: unknown): AnomalousLeftSubtypeEntry[] {
  return cleanAnomalousLeftSubtypes(entries);
}
