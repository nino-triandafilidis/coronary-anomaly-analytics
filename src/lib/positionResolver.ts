/**
 * Position resolver — locate a term verbatim within a report.
 *
 * Used by LLM parsers to map returned terms
 * back to character offsets in the source text. Two-pass strategy:
 *   1. Case-insensitive exact substring match.
 *   2. Whitespace-normalized match (collapses \n, \t, runs of spaces) so a
 *      term that crosses a line break in the original still resolves.
 */

export interface PositionMatch {
  startIndex: number;
  endIndex: number;
  correctionType: "exact" | "whitespace";
}

/**
 * Build a whitespace-normalized version of a string, tracking the mapping
 * from each normalized character back to its original index.
 */
export function normalizeForSearch(text: string): { normalized: string; indexMap: number[] } {
  const chars: string[] = [];
  const indexMap: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        chars.push(" ");
        indexMap.push(i);
        lastWasSpace = true;
      }
    } else {
      chars.push(ch.toLowerCase());
      indexMap.push(i);
      lastWasSpace = false;
    }
  }

  return { normalized: chars.join(""), indexMap };
}

/**
 * Locate a term in the report text.
 * Pass 1: exact case-insensitive indexOf.
 * Pass 2: whitespace-normalized search (collapses \n, \t, multi-space).
 *
 * `searchAfter` lets the caller find the next occurrence of a duplicate term.
 */
export function findTermPosition(
  reportText: string,
  term: string,
  searchAfter: number = 0
): PositionMatch | null {
  // --- Pass 1: exact (case-insensitive) ---
  const lowerReport = reportText.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let idx = lowerReport.indexOf(lowerTerm, searchAfter);

  if (idx !== -1) {
    return { startIndex: idx, endIndex: idx + term.length, correctionType: "exact" };
  }

  // Try from start (in case searchAfter skipped the only occurrence)
  if (searchAfter > 0) {
    idx = lowerReport.indexOf(lowerTerm);
    if (idx !== -1) {
      return { startIndex: idx, endIndex: idx + term.length, correctionType: "exact" };
    }
  }

  // --- Pass 2: whitespace-normalized ---
  const { normalized: normReport, indexMap: reportMap } = normalizeForSearch(reportText);
  const { normalized: normTerm } = normalizeForSearch(term);

  // Map searchAfter to normalized space
  let normSearchAfter = 0;
  if (searchAfter > 0) {
    for (let i = 0; i < reportMap.length; i++) {
      if (reportMap[i] >= searchAfter) {
        normSearchAfter = i;
        break;
      }
    }
  }

  let normIdx = normReport.indexOf(normTerm, normSearchAfter);

  // Fallback: try from beginning
  if (normIdx === -1 && normSearchAfter > 0) {
    normIdx = normReport.indexOf(normTerm);
  }

  if (normIdx !== -1 && normIdx + normTerm.length - 1 < reportMap.length) {
    const originalStart = reportMap[normIdx];
    const originalEnd = reportMap[normIdx + normTerm.length - 1] + 1;
    return { startIndex: originalStart, endIndex: originalEnd, correctionType: "whitespace" };
  }

  return null;
}
