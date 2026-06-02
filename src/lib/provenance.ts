// Provenance model for the Analysis page drill-down (issue #63).
//
// Every aggregate number/bar on the Analysis page is built by iterating the
// parsed reports. A ProvenanceContributor records one report's contribution to
// an aggregate, keeping the verbatim matched text and (where available) the
// character offsets so the Dataset view can focus the exact span.

import type { Assertion } from "@/data/parseTypes";

export interface ProvenanceContributor {
  reportId: string;
  matchedText: string; // verbatim span / rawText / evidence text
  normalizedName?: string; // parser's canonical label for the term, e.g. the vessel it resolved
  context?: string; // surrounding sentence, when the source carries one
  assertion?: Assertion; // omitted for report-level surfaces that don't split
  startIndex?: number; // for focusing the span in the Dataset view
  endIndex?: number;
}

export interface ProvenanceSource {
  title: string;
  subtitle?: string;
  splitByAssertion: boolean;
  contributors: ProvenanceContributor[];
}

export interface ProvenanceGroup {
  key: string; // normalized phrasing, used for grouping + open/close state
  phrase: string; // most common original casing, used for display
  count: number;
  contributors: ProvenanceContributor[];
}

export function normalizePhrase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^["“”'']+|["“”'']+$/g, "")
    .replace(/\s+/g, " ");
}

// ~100 contributors collapse to a handful of distinct wordings, so the default
// view groups by verbatim phrasing and lets the user expand a wording.
export function groupContributorsByPhrasing(
  contributors: ProvenanceContributor[]
): ProvenanceGroup[] {
  const groups = new Map<
    string,
    { display: Map<string, number>; items: ProvenanceContributor[] }
  >();

  for (const contributor of contributors) {
    const raw = contributor.matchedText.trim() || "(no matched text)";
    const key = normalizePhrase(raw) || "(no matched text)";
    const group = groups.get(key) ?? { display: new Map(), items: [] };
    group.items.push(contributor);
    group.display.set(raw, (group.display.get(raw) ?? 0) + 1);
    groups.set(key, group);
  }

  const result: ProvenanceGroup[] = [];
  for (const [key, group] of groups) {
    let phrase = key;
    let best = -1;
    for (const [raw, count] of group.display) {
      if (count > best) {
        best = count;
        phrase = raw;
      }
    }
    result.push({ key, phrase, count: group.items.length, contributors: group.items });
  }

  return result.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

export function distinctReportCount(contributors: ProvenanceContributor[]): number {
  return new Set(contributors.map((contributor) => contributor.reportId)).size;
}

export function contributorsToCsv(
  title: string,
  contributors: ProvenanceContributor[]
): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["feature", "report_id", "assertion", "matched_text", "context"].join(",");
  const rows = contributors.map((contributor) =>
    [
      escape(title),
      escape(contributor.reportId),
      escape(contributor.assertion ?? ""),
      escape(contributor.matchedText ?? ""),
      escape(contributor.context ?? ""),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
