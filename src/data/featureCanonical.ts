/**
 * Single source of truth for turning parsed terms into counted features.
 *
 * Every count on the Analysis page must go through here so the same clinical
 * concept resolves to one canonical key and is counted the same way in every
 * view. Two things are centralized:
 *   1. canonicalFeature(): term -> one canonical { key, label, category }.
 *   2. reportIncidence(): per-report presence (not per-occurrence), which is
 *      the product's headline metric, plus the contributing report ids.
 */

import type { ParsedTerm } from "@/data/parseTypes";
import { resolveParsedTermPaperFeature } from "@/data/paperFeatures";

export interface CanonicalFeature {
  key: string;
  label: string;
  category: string;
}

/** The display name for a term: normalizedName, falling back to the raw term. */
export function getAnalysisFeatureName(record: {
  normalizedName?: string;
  term?: string;
}): string {
  return (record.normalizedName?.trim() || record.term?.trim() || "").replace(/\s+/g, " ");
}

/**
 * Resolve a term to its single canonical feature. Precedence:
 *   1. paper-tracked feature (bounded PAPER_FEATURES dictionary),
 *   2. lowercased normalized name (so case/whitespace variants still collapse).
 * Returns null only when there is no usable name.
 */
export function canonicalFeature(term: ParsedTerm): CanonicalFeature | null {
  const paperFeature = resolveParsedTermPaperFeature(term);
  if (paperFeature) {
    return { key: `paper:${paperFeature.id}`, label: paperFeature.canonical, category: paperFeature.category };
  }

  const name = getAnalysisFeatureName(term);
  if (!name) return null;
  return { key: `term:${name.toLowerCase()}`, label: name, category: "Other" };
}

export interface IncidenceTally {
  key: string;
  label: string;
  category: string;
  /** Reports in which the feature is asserted at least once. */
  assertedReports: number;
  /** Reports in which the feature is negated at least once. */
  negatedReports: number;
  /** Reports mentioning the feature at all (the headline incidence). */
  reports: number;
  /** Ids of the reports mentioning the feature (for provenance drill-down). */
  reportIds: string[];
}

/**
 * Count per-report incidence (not per-occurrence) of each canonical feature.
 * A feature counts once per report regardless of how many times it appears,
 * which is the cohort-incidence metric the product reports.
 */
export function reportIncidence<T extends { id: string }>(
  reports: T[],
  termsOf: (report: T) => ParsedTerm[],
  selectFeature: (term: ParsedTerm) => CanonicalFeature | null
): IncidenceTally[] {
  const acc = new Map<
    string,
    { label: string; category: string; asserted: Set<string>; negated: Set<string>; any: Set<string> }
  >();

  for (const report of reports) {
    for (const term of termsOf(report)) {
      const feature = selectFeature(term);
      if (!feature) continue;
      let entry = acc.get(feature.key);
      if (!entry) {
        entry = { label: feature.label, category: feature.category, asserted: new Set(), negated: new Set(), any: new Set() };
        acc.set(feature.key, entry);
      }
      (term.assertion === "negated" ? entry.negated : entry.asserted).add(report.id);
      entry.any.add(report.id);
    }
  }

  return Array.from(acc, ([key, entry]) => ({
    key,
    label: entry.label,
    category: entry.category,
    assertedReports: entry.asserted.size,
    negatedReports: entry.negated.size,
    reports: entry.any.size,
    reportIds: Array.from(entry.any),
  }));
}
