// Anomaly Detection Module
// This is a rule-based NER system using dictionary matching.
// Designed to be modular — can be replaced with a fine-tuned clinical NER model
// or transformer-based medical entity extraction model in the future.

import { anomalyDatabase, type AnomalyEntry } from "@/data/anomalyDatabase";

export interface DetectedAnomaly {
  term: string;           // The matched text from the report
  entry: AnomalyEntry;    // Reference to the database entry
  startIndex: number;     // Start position in the text
  endIndex: number;       // End position in the text
}

/**
 * Detect anomalies in a given report text using dictionary-based matching.
 * Returns all detected anomalies with their positions in the text.
 *
 * Future replacement: Swap this function with a call to a fine-tuned
 * clinical NER model (e.g., BioBERT, Med7, or a custom transformer).
 */
export function detectAnomalies(text: string): DetectedAnomaly[] {
  const detected: DetectedAnomaly[] = [];
  const lowerText = text.toLowerCase();

  for (const entry of anomalyDatabase) {
    const allTerms = [entry.term, ...entry.aliases];

    for (const term of allTerms) {
      const lowerTerm = term.toLowerCase();
      let searchFrom = 0;

      while (searchFrom < lowerText.length) {
        const index = lowerText.indexOf(lowerTerm, searchFrom);
        if (index === -1) break;

        // Check word boundaries to avoid partial matches
        const before = index > 0 ? lowerText[index - 1] : " ";
        const after = index + lowerTerm.length < lowerText.length
          ? lowerText[index + lowerTerm.length]
          : " ";

        const isWordBoundary = (ch: string) => /[\s.,;:!?()\-\/\n\r]/.test(ch);

        if (isWordBoundary(before) && isWordBoundary(after)) {
          // Check for overlapping detections
          const overlaps = detected.some(
            (d) =>
              (index >= d.startIndex && index < d.endIndex) ||
              (index + lowerTerm.length > d.startIndex && index + lowerTerm.length <= d.endIndex)
          );

          if (!overlaps) {
            detected.push({
              term: text.substring(index, index + lowerTerm.length),
              entry,
              startIndex: index,
              endIndex: index + lowerTerm.length,
            });
          }
        }

        searchFrom = index + 1;
      }
    }
  }

  // Sort by position in text
  detected.sort((a, b) => a.startIndex - b.startIndex);
  return detected;
}

/**
 * Get unique anomalies from detection results (deduplicated by database entry).
 */
export function getUniqueAnomalies(detected: DetectedAnomaly[]): AnomalyEntry[] {
  const seen = new Set<string>();
  const unique: AnomalyEntry[] = [];

  for (const d of detected) {
    if (!seen.has(d.entry.term)) {
      seen.add(d.entry.term);
      unique.push(d.entry);
    }
  }

  return unique.sort((a, b) => b.frequency - a.frequency);
}
