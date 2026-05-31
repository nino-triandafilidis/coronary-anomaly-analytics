import type {
  AnomalousLeftSubtypeEntry,
  AnomalousLeftSubtype,
  ParsedTerm,
} from "@/data/parseTypes";

const VALID_SUBTYPES = new Set<AnomalousLeftSubtype>([
  "intraconal_left",
  "intramural_interarterial_left",
]);

const LEFT_VESSEL_PATTERN =
  /\b(?:left coronary artery|left main(?: coronary artery)?|lmca|lad|left anterior descending(?: artery)?|lcx|left circumflex(?: artery)?)\b/i;
const INTRACONAL_PATTERN =
  /\b(?:intraconal|intraseptal|subpulmonic|infundibular|conal[\s-]?septal)\b/i;
const INTRAMURAL_INTERARTERIAL_PATTERN =
  /\b(?:intramural|inter[\s-]?arterial|between the aorta and (?:the )?pulmonary artery)\b/i;
const EXPLICIT_LEFT_SUBTYPE_PATTERN =
  /\b(?:intraconal|intraseptal|subpulmonic|infundibular|conal[\s-]?septal|intramural|inter[\s-]?arterial)\s+left\b/i;

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

export function resolveAnomalousLeftSubtypesFromTerm(
  term: Pick<ParsedTerm, "term" | "normalizedName" | "context">
): AnomalousLeftSubtypeEntry[] {
  const rawText = term.term.trim() || term.normalizedName.trim();
  const evidence = `${term.normalizedName} ${term.term} ${term.context}`;
  if (!LEFT_VESSEL_PATTERN.test(evidence) && !EXPLICIT_LEFT_SUBTYPE_PATTERN.test(evidence)) {
    return [];
  }

  const subtypes: AnomalousLeftSubtypeEntry[] = [];
  if (INTRACONAL_PATTERN.test(evidence)) {
    subtypes.push({ subtype: "intraconal_left", rawText });
  }
  if (INTRAMURAL_INTERARTERIAL_PATTERN.test(evidence)) {
    subtypes.push({ subtype: "intramural_interarterial_left", rawText });
  }
  return subtypes;
}

export function getReportAnomalousLeftSubtypes(
  entries: unknown,
  parsedTerms: ParsedTerm[]
): AnomalousLeftSubtypeEntry[] {
  return cleanAnomalousLeftSubtypes([
    ...cleanAnomalousLeftSubtypes(entries),
    ...parsedTerms.flatMap(resolveAnomalousLeftSubtypesFromTerm),
  ]);
}
