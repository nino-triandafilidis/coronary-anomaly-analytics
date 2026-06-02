/**
 * Corpus backfill for the #66 resolver.
 *
 * Runs the entity resolver over every finding in a set of parsed reports and
 * writes the resolved entity onto each finding's paperFeature* fields (the
 * schema already carries them; today they are null on all findings). Resolution
 * goes through resolveDistinctEntities, so a wording is resolved once and reused
 * across the whole corpus.
 *
 * This module is orchestration with an injected resolver; it mutates each
 * finding object in place (so a nested parseResult.parsedTerms array is updated,
 * not replaced). The runnable entry (resolverBackfill.test.ts, opt-in) wires the
 * real OpenAI client and does the file I/O.
 */

import { NONE_LABEL } from "@/data/entityCatalog";
import { PAPER_FEATURES } from "@/data/paperFeatures";
import {
  resolveDistinctEntities,
  resolverKey,
  type ResolveBatch,
  type ResolverInput,
} from "@/lib/entityResolver";

const PAPER_FEATURE_BY_ID = new Map(PAPER_FEATURES.map((f) => [f.id, f]));

/** The subset of a finding the backfill reads and writes. Extra fields pass through. */
export interface BackfillFinding {
  normalizedName: string;
  context?: string;
  paperFeatureId?: string | null;
  paperFeatureLabel?: string | null;
  paperFeatureCategory?: string | null;
  paperFeatureTrackingRole?: "feature" | "measurement" | "reference" | null;
}

export interface BackfillSummary {
  reports: number;
  findings: number;
  /** Distinct wordings sent to the resolver. */
  distinct: number;
  /** Findings resolved to a paper entity. */
  resolved: number;
  /** Findings left as none (normal / out of scope). */
  none: number;
}

interface ResolvedFeatureFields {
  paperFeatureId: string | null;
  paperFeatureLabel: string | null;
  paperFeatureCategory: string | null;
  paperFeatureTrackingRole: "feature" | "measurement" | "reference" | null;
}

const NULL_FEATURE: ResolvedFeatureFields = {
  paperFeatureId: null,
  paperFeatureLabel: null,
  paperFeatureCategory: null,
  paperFeatureTrackingRole: null,
};

/** The paperFeature* fields for an entity id (all nulled for none / unknown). */
export function resolvedFeatureFields(entityId: string): ResolvedFeatureFields {
  const paperFeature = entityId === NONE_LABEL ? undefined : PAPER_FEATURE_BY_ID.get(entityId);
  if (!paperFeature) {
    // Explicit resolver "none" (or an unknown id): store the NONE sentinel, not
    // null, so the Analysis page can tell "resolved to none" from "not backfilled".
    return { ...NULL_FEATURE, paperFeatureId: NONE_LABEL };
  }
  return {
    paperFeatureId: paperFeature.id,
    paperFeatureLabel: paperFeature.canonical,
    paperFeatureCategory: paperFeature.category,
    paperFeatureTrackingRole: paperFeature.trackingRole,
  };
}

/** Return a copy of the finding with its paperFeature* fields set from an entity id. */
export function applyResolvedId<T extends BackfillFinding>(
  finding: T,
  entityId: string
): T & ResolvedFeatureFields {
  return { ...finding, ...resolvedFeatureFields(entityId) };
}

type ReportLike<F extends BackfillFinding> = {
  findings?: F[];
  parseResult?: { parsedTerms?: F[] };
} & Record<string, unknown>;

/**
 * Read the findings array from a report. Handles both the raw parse-output shape
 * (top-level `findings`, e.g. results_*.jsonl) and the app's stored shape
 * (`parseResult.parsedTerms`, what getStoredParsedTerms and the Analysis page
 * read). The returned objects are mutated in place by the backfill.
 */
const defaultGetFindings = <F extends BackfillFinding>(report: ReportLike<F>): F[] =>
  report.findings ?? report.parseResult?.parsedTerms ?? [];

export interface BackfillOptions<F extends BackfillFinding> {
  batchSize?: number;
  cache?: Map<string, string>;
  /** Override how findings are read from a report (default handles both shapes). */
  getFindings?: (report: ReportLike<F>) => F[];
}

/**
 * Resolve every finding across `reports` and write the entity onto each finding
 * in place. Returns the same report objects plus a summary of what resolved.
 */
export async function backfillReports<F extends BackfillFinding>(
  reports: Array<ReportLike<F>>,
  resolveBatch: ResolveBatch,
  opts: BackfillOptions<F> = {}
): Promise<{ reports: Array<ReportLike<F>>; summary: BackfillSummary }> {
  const getFindings = opts.getFindings ?? defaultGetFindings;

  const inputs: ResolverInput[] = [];
  for (const report of reports) {
    for (const finding of getFindings(report)) {
      inputs.push({ normalizedName: finding.normalizedName, context: finding.context });
    }
  }

  const resolved = await resolveDistinctEntities(inputs, resolveBatch, {
    batchSize: opts.batchSize,
    cache: opts.cache,
  });

  let findings = 0;
  let resolvedCount = 0;
  let none = 0;
  for (const report of reports) {
    for (const finding of getFindings(report)) {
      findings += 1;
      const entityId = resolved.get(resolverKey(finding.normalizedName)) ?? NONE_LABEL;
      Object.assign(finding, resolvedFeatureFields(entityId));
      if (entityId !== NONE_LABEL && PAPER_FEATURE_BY_ID.has(entityId)) resolvedCount += 1;
      else none += 1;
    }
  }

  return {
    reports,
    summary: { reports: reports.length, findings, distinct: resolved.size, resolved: resolvedCount, none },
  };
}
