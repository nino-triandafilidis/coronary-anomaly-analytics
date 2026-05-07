/**
 * Historical-frequency lookups derived from the user's localStorage-saved
 * reports. The "database" is whatever the cardiologist has saved so far —
 * there is no static reference corpus.
 *
 * If a term has never appeared in any saved report (or no reports are saved),
 * the UI renders a "no historical data" badge instead of a 0/N count.
 */

import type { Assertion } from "./mockParseResults";
import { getSavedReports } from "@/lib/reportDatabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Historical counts for a single normalized term, derived from saved reports.
 * `totalSaved` is the size of the saved-report corpus at the moment of lookup.
 */
export interface TermHistory {
  countAsserted: number;
  countNegated: number;
  totalSaved: number;
}

/**
 * A reviewed-and-confirmed finding with its position in the report and its
 * historical frequency in the saved-report corpus.
 */
export interface DetectedAnomaly {
  term: string;            // The matched text from the report
  normalizedName: string;  // Canonical name (e.g. "Pericardial Effusion")
  startIndex: number;
  endIndex: number;
  assertion: Assertion;
  history: TermHistory;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Count how many distinct saved reports contain `normalizedName` as an
 * asserted finding and as a negated finding. Case-insensitive match on
 * `parsedTerm.normalizedName`.
 */
export function getHistoryForTerm(normalizedName: string): TermHistory {
  const reports = getSavedReports();
  const target = normalizedName.toLowerCase();

  let countAsserted = 0;
  let countNegated = 0;

  for (const r of reports) {
    let hasAsserted = false;
    let hasNegated = false;
    for (const t of r.parsedTerms) {
      if (t.normalizedName.toLowerCase() !== target) continue;
      if (t.assertion === "asserted") hasAsserted = true;
      else if (t.assertion === "negated") hasNegated = true;
    }
    if (hasAsserted) countAsserted++;
    if (hasNegated) countNegated++;
  }

  return { countAsserted, countNegated, totalSaved: reports.length };
}
