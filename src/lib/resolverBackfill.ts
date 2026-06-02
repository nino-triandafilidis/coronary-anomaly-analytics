/**
 * Corpus backfill for the #66 resolver.
 *
 * Runs the entity resolver over every finding in a set of parsed reports and
 * writes the resolved entity onto each finding's paperFeature* fields (the
 * schema already carries them; today they are null on all findings). Resolution
 * goes through resolveDistinctEntities, so a wording is resolved once and reused
 * across the whole corpus.
 *
 * This module is pure orchestration with an injected resolver. The runnable
 * entry (resolverBackfill.test.ts, opt-in) wires the real OpenAI client and
 * does the file I/O.
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

/** Return a copy of the finding with its paperFeature* fields set from an entity id. */
export function applyResolvedId<T extends BackfillFinding>(
  finding: T,
  entityId: string
): T & ResolvedFeatureFields {
  const paperFeature = entityId === NONE_LABEL ? undefined : PAPER_FEATURE_BY_ID.get(entityId);
  if (!paperFeature) return { ...finding, ...NULL_FEATURE };
  return {
    ...finding,
    paperFeatureId: paperFeature.id,
    paperFeatureLabel: paperFeature.canonical,
    paperFeatureCategory: paperFeature.category,
    paperFeatureTrackingRole: paperFeature.trackingRole,
  };
}

type ReportLike<F extends BackfillFinding> = { findings?: F[] } & Record<string, unknown>;

/**
 * Resolve every finding across `reports` and write the entity onto each. Returns
 * new report objects (input is not mutated) and a summary of what resolved.
 */
export async function backfillReports<F extends BackfillFinding>(
  reports: Array<ReportLike<F>>,
  resolveBatch: ResolveBatch,
  opts: { batchSize?: number; cache?: Map<string, string> } = {}
): Promise<{ reports: Array<ReportLike<F>>; summary: BackfillSummary }> {
  const inputs: ResolverInput[] = [];
  for (const report of reports) {
    for (const finding of report.findings ?? []) {
      inputs.push({ normalizedName: finding.normalizedName, context: finding.context });
    }
  }

  const resolved = await resolveDistinctEntities(inputs, resolveBatch, opts);

  let findings = 0;
  let resolvedCount = 0;
  let none = 0;
  const outReports = reports.map((report) => ({
    ...report,
    findings: (report.findings ?? []).map((finding) => {
      findings += 1;
      const entityId = resolved.get(resolverKey(finding.normalizedName)) ?? NONE_LABEL;
      const isResolved = entityId !== NONE_LABEL && PAPER_FEATURE_BY_ID.has(entityId);
      if (isResolved) resolvedCount += 1;
      else none += 1;
      return applyResolvedId(finding, entityId);
    }),
  }));

  return {
    reports: outReports,
    summary: { reports: reports.length, findings, distinct: resolved.size, resolved: resolvedCount, none },
  };
}
