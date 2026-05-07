// Anomaly frequency database: loaded from public/anomaly_frequencies.json when available (from
// scripts/mimic_pipeline.py --run-ner), otherwise uses the mock below.

import type { Assertion } from "./mockParseResults";

export type Severity = "low" | "moderate" | "high" | "critical";

export interface AnomalyEntry {
  term: string;
  aliases: string[];
  /** Total mentions across all reports (asserted + negated). Kept for backward compat. */
  frequency: number;
  /** Number of reports where the radiologist asserted this finding as present. */
  frequencyAsserted: number;
  /** Number of reports where the radiologist explicitly ruled this finding out. */
  frequencyNegated: number;
  totalReports: number;
}

/**
 * A user-confirmed finding linked back to its database entry, with positions
 * in the report text and assertion status. Lives here (rather than in a
 * separate detector module) because it's just a join between an `AnomalyEntry`
 * and a parsed/reviewed term span — no detection logic of its own.
 */
export interface DetectedAnomaly {
  term: string;           // The matched text from the report
  entry: AnomalyEntry;    // Reference to the database entry
  startIndex: number;     // Start position in the text
  endIndex: number;       // End position in the text
  assertion: Assertion;   // Whether the radiologist asserted or negated this finding
}

const TOTAL_REPORTS = 300;

/** In-memory database; set by fetching /anomaly_frequencies.json in App. */
let loadedDatabase: AnomalyEntry[] | null = null;
let mockDatabaseBackfilled: AnomalyEntry[] | null = null;

/**
 * Returns the active anomaly list (fetched from JSON if loaded, else mock).
 * The mock list pre-dates the asserted/negated split, so we backfill it on
 * first access — every existing entry is treated as fully asserted.
 */
export function getAnomalyDatabase(): AnomalyEntry[] {
  if (loadedDatabase) return loadedDatabase;
  if (!mockDatabaseBackfilled) {
    mockDatabaseBackfilled = MOCK_ANOMALY_DATABASE.map((entry) => ({
      ...entry,
      frequencyAsserted: entry.frequency,
      frequencyNegated: 0,
    }));
  }
  return mockDatabaseBackfilled;
}

/**
 * Called when /anomaly_frequencies.json has been fetched. Backfills the new
 * asserted/negated fields if the JSON file pre-dates the schema change — in
 * that case all of `frequency` is treated as asserted, with zero negated.
 */
export function setAnomalyDatabase(entries: AnomalyEntry[]): void {
  if (entries.length === 0) {
    loadedDatabase = null;
    return;
  }
  loadedDatabase = entries.map((entry) => ({
    ...entry,
    frequencyAsserted:
      entry.frequencyAsserted ?? entry.frequency ?? 0,
    frequencyNegated: entry.frequencyNegated ?? 0,
    frequency:
      entry.frequency ??
      (entry.frequencyAsserted ?? 0) + (entry.frequencyNegated ?? 0),
  }));
}

/**
 * Compute severity from frequency: rarer findings are more severe.
 *   < 5%  → critical
 *   5-15% → high
 *  15-25% → moderate
 *   > 25% → low
 */
export function getSeverity(entry: AnomalyEntry): Severity {
  const pct = (entry.frequency / entry.totalReports) * 100;
  if (pct < 5) return "critical";
  if (pct < 15) return "high";
  if (pct < 25) return "moderate";
  return "low";
}

// The mock literal pre-dates the asserted/negated split. The two new fields
// are filled in lazily by getAnomalyDatabase() the first time it's read.
type MockAnomalyEntry = Omit<AnomalyEntry, "frequencyAsserted" | "frequencyNegated">;

const MOCK_ANOMALY_DATABASE: MockAnomalyEntry[] = [
  {
    term: "Pulmonary embolism",
    // Do not add "PE" as alias — too ambiguous; matches "PERFORMED", "PERSPECTIVE", etc.
    aliases: ["pulmonary thromboembolism"],
    frequency: 42,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Coronary artery stenosis",
    aliases: ["coronary stenosis", "coronary narrowing", "coronary artery disease"],
    frequency: 87,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Aortic aneurysm",
    aliases: ["aortic dilatation", "aortic ectasia"],
    frequency: 23,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Carotid plaque",
    aliases: ["carotid atherosclerosis", "carotid artery plaque"],
    frequency: 65,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Dissection",
    aliases: ["aortic dissection", "arterial dissection"],
    frequency: 8,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Pericardial effusion",
    aliases: ["pericardial fluid"],
    frequency: 31,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Pleural effusion",
    aliases: ["pleural fluid"],
    frequency: 58,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Calcification",
    aliases: ["calcified plaque", "vascular calcification", "coronary calcification"],
    frequency: 112,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Thrombus",
    aliases: ["blood clot", "intraluminal thrombus", "mural thrombus"],
    frequency: 35,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Lymphadenopathy",
    aliases: ["enlarged lymph nodes", "lymph node enlargement"],
    frequency: 47,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Atelectasis",
    aliases: ["lung collapse", "partial lung collapse"],
    frequency: 73,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Cardiomegaly",
    aliases: ["enlarged heart", "cardiac enlargement"],
    frequency: 54,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Pulmonary nodule",
    aliases: ["lung nodule", "pulmonary mass"],
    frequency: 39,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Mitral valve calcification",
    aliases: ["mitral annular calcification"],
    frequency: 28,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Aortic valve calcification",
    aliases: ["aortic valve stenosis", "aortic sclerosis"],
    frequency: 34,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Pulmonary hypertension",
    aliases: ["elevated pulmonary pressure"],
    frequency: 19,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Stenosis",
    aliases: ["luminal narrowing", "vessel narrowing"],
    frequency: 96,
    totalReports: TOTAL_REPORTS,
  },
  {
    term: "Consolidation",
    aliases: ["lung consolidation", "airspace consolidation"],
    frequency: 41,
    totalReports: TOTAL_REPORTS,
  },
];

export function getAnomalyByTerm(term: string): AnomalyEntry | undefined {
  const lower = term.toLowerCase();
  return getAnomalyDatabase().find(
    (entry) =>
      entry.term.toLowerCase() === lower ||
      entry.aliases.some((alias) => alias.toLowerCase() === lower)
  );
}

export function getFrequencyPercentage(entry: AnomalyEntry): string {
  return ((entry.frequency / entry.totalReports) * 100).toFixed(1);
}
