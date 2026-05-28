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

export interface ReportPositionResolver {
  findTermPosition(term: string, searchAfter?: number): PositionMatch | null;
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

function lowerBoundIndexMap(indexMap: number[], searchAfter: number): number {
  let low = 0;
  let high = indexMap.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (indexMap[mid] < searchAfter) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function createReportPositionResolver(reportText: string): ReportPositionResolver {
  const lowerReport = reportText.toLowerCase();
  let normalizedReportCache: { normalized: string; indexMap: number[] } | null = null;
  const normalizedTermCache = new Map<string, string>();

  const getNormalizedReport = () => {
    if (!normalizedReportCache) {
      normalizedReportCache = normalizeForSearch(reportText);
    }
    return normalizedReportCache;
  };

  const getNormalizedTerm = (term: string) => {
    const cached = normalizedTermCache.get(term);
    if (cached !== undefined) return cached;

    const normalized = normalizeForSearch(term).normalized;
    normalizedTermCache.set(term, normalized);
    return normalized;
  };

  return {
    findTermPosition(term: string, searchAfter: number = 0): PositionMatch | null {
      // Pass 1: exact case-insensitive match from the requested offset.
      const lowerTerm = term.toLowerCase();
      const idx = lowerReport.indexOf(lowerTerm, searchAfter);

      if (idx !== -1) {
        return { startIndex: idx, endIndex: idx + term.length, correctionType: "exact" };
      }

      // Pass 2: whitespace-normalized match from the requested offset.
      const { normalized: normReport, indexMap: reportMap } = getNormalizedReport();
      const normTerm = getNormalizedTerm(term);
      const normSearchAfter =
        searchAfter > 0 ? lowerBoundIndexMap(reportMap, searchAfter) : 0;

      const normIdx = normReport.indexOf(normTerm, normSearchAfter);

      if (normIdx !== -1 && normIdx + normTerm.length - 1 < reportMap.length) {
        const originalStart = reportMap[normIdx];
        const originalEnd = reportMap[normIdx + normTerm.length - 1] + 1;
        return { startIndex: originalStart, endIndex: originalEnd, correctionType: "whitespace" };
      }

      return null;
    },
  };
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
  return createReportPositionResolver(reportText).findTermPosition(term, searchAfter);
}
