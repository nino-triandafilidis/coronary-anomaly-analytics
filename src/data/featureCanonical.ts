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
 * Canonicalize a coronary-narrowing finding to "<severity> <location> <concept>
 * of <vessel>" so wording variants collapse. Returns null when the term is not
 * a narrowing/stenosis/compression finding bound to a recognizable vessel.
 */
export function normalizeCoronaryNarrowingFeature(record: {
  normalizedName?: string;
  term?: string;
  context?: string;
}): string | null {
  const featureName = getAnalysisFeatureName(record);
  const haystack = `${featureName} ${record.context ?? ""}`.toLowerCase();

  const hasNarrowingConcept =
    /\bnarrow(?:ing|ed)?\b/.test(haystack) ||
    /\bstenos(?:is|ed)\b/.test(haystack) ||
    /\bcompression\b/.test(haystack) ||
    /\bcompressed\b/.test(haystack);
  if (!hasNarrowingConcept) return null;

  const vessel = (() => {
    if (/\bleft\s+main\b|\blmca\b|\bleft\s+main\s+coronary\s+artery\b/.test(haystack)) return "left main coronary artery";
    if (/\bleft\s+circumflex\b|\bcircumflex\b|\blcx\b/.test(haystack)) return "left circumflex artery";
    if (/\bright\s+coronary\b|\brca\b/.test(haystack)) return "right coronary artery";
    if (/\bleft\s+anterior\s+descending\b|\blad\b/.test(haystack)) return "left anterior descending artery";
    if (/\bleft\s+coronary\s+artery\b|\blca\b/.test(haystack)) return "left coronary artery";
    if (/\bcoronary\s+arter(?:y|ies)\b/.test(haystack)) return "coronary artery";
    return null;
  })();
  if (!vessel) return null;

  const location = (() => {
    if (/\bostium\b|\bostial\b/.test(haystack)) return "ostial ";
    if (/\bproximal(?:ly)?\b/.test(haystack)) return "proximal ";
    if (/\bmid\b/.test(haystack)) return "mid ";
    if (/\bdistal(?:ly)?\b/.test(haystack)) return "distal ";
    return "";
  })();

  const severity = (() => {
    if (/\bsevere(?:ly)?\b/.test(haystack)) return "severe ";
    if (/\bmoderate(?:ly)?\b/.test(haystack)) return "moderate ";
    if (/\bmild(?:ly)?\b/.test(haystack)) return "mild ";
    if (/\bsignificant(?:ly)?\b/.test(haystack)) return "significant ";
    if (/\bslight(?:ly)?\b/.test(haystack)) return "slight ";
    if (/\bminimal(?:ly)?\b/.test(haystack)) return "minimal ";
    return "";
  })();

  const concept = /\bcompression\b|\bcompressed\b/.test(haystack)
    ? "compression"
    : /\bstenos(?:is|ed)\b/.test(haystack)
      ? "stenosis"
      : "narrowing";

  return `${severity}${location}${concept} of ${vessel}`.replace(/\s+/g, " ").trim();
}

/**
 * Resolve a term to its single canonical feature. Precedence:
 *   1. paper-tracked feature (bounded PAPER_FEATURES dictionary),
 *   2. canonical coronary-narrowing concept,
 *   3. lowercased normalized name (so case/whitespace variants still collapse).
 * Returns null only when there is no usable name.
 */
export function canonicalFeature(term: ParsedTerm): CanonicalFeature | null {
  const paperFeature = resolveParsedTermPaperFeature(term);
  if (paperFeature) {
    return { key: `paper:${paperFeature.id}`, label: paperFeature.canonical, category: paperFeature.category };
  }

  const narrowing = normalizeCoronaryNarrowingFeature(term);
  if (narrowing) {
    return { key: `narrowing:${narrowing.toLowerCase()}`, label: narrowing, category: "Coronary narrowing" };
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
