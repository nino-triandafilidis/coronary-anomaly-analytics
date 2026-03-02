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
 * Terms are sorted by length (longest first) so specific terms like
 * "coronary artery stenosis" take priority over generic "stenosis".
 *
 * Future replacement: Swap this function with a call to a fine-tuned
 * clinical NER model (e.g., BioBERT, Med7, or a custom transformer).
 */
export function detectAnomalies(text: string): DetectedAnomaly[] {
  const detected: DetectedAnomaly[] = [];
  const lowerText = text.toLowerCase();

  // Build a flat list of {term, entry} pairs sorted by term length descending.
  // This ensures longer/more-specific terms get matched first.
  const searchTerms: { term: string; entry: AnomalyEntry }[] = [];
  for (const entry of anomalyDatabase) {
    for (const term of [entry.term, ...entry.aliases]) {
      searchTerms.push({ term, entry });
    }
  }
  searchTerms.sort((a, b) => b.term.length - a.term.length);

  const isWordBoundary = (ch: string) => /[\s.,;:!?()\-\/\n\r]/.test(ch);

  for (const { term, entry } of searchTerms) {
    const lowerTerm = term.toLowerCase();
    const isShortTerm = term.length <= 2;
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const index = lowerText.indexOf(lowerTerm, searchFrom);
      if (index === -1) break;

      const end = index + lowerTerm.length;

      // Check word boundaries to avoid partial matches
      const before = index > 0 ? lowerText[index - 1] : " ";
      const after = end < lowerText.length ? lowerText[end] : " ";

      if (!isWordBoundary(before) || !isWordBoundary(after)) {
        searchFrom = index + 1;
        continue;
      }

      // For very short terms (e.g. "PE"), require uppercase in original text to avoid
      // false positives in words like "PERFORMED", "PERSPECTIVE"
      if (isShortTerm) {
        const actualSlice = text.substring(index, end);
        if (actualSlice !== actualSlice.toUpperCase()) {
          searchFrom = index + 1;
          continue;
        }
      }

      // Overlap or full containment: skip if this range intersects or is inside an existing detection
      const overlaps = detected.some(
        (d) =>
          (index < d.endIndex && end > d.startIndex) ||
          (index >= d.startIndex && end <= d.endIndex)
      );

      if (!overlaps) {
        detected.push({
          term: text.substring(index, end),
          entry,
          startIndex: index,
          endIndex: end,
        });
      }

      searchFrom = index + 1;
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
