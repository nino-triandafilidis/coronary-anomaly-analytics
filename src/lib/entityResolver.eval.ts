/**
 * Resolver eval harness (#40, gates #66).
 *
 * Runs the golden set through a resolver and scores how often the resolved
 * entity id matches the expected label. The resolver is injected (`resolveBatch`)
 * so this is pure orchestration: the unit test drives it with a fake, and the
 * real run (entityResolver.eval.test.ts, opt-in) drives it with the OpenAI
 * client. Reuses resolveDistinctEntities so dedup/cache/batching match
 * production exactly.
 */

import { NONE_LABEL } from "@/data/entityCatalog";
import {
  RESOLVER_GOLDEN_SET,
  type ResolverGoldenExample,
} from "@/data/resolverGoldenSet";
import {
  resolveDistinctEntities,
  resolverKey,
  type ResolveBatch,
} from "@/lib/entityResolver";

export interface ResolverEvalMismatch {
  normalizedName: string;
  expected: string;
  got: string;
  note?: string;
}

export interface ResolverEvalReport {
  total: number;
  passed: number;
  accuracy: number;
  mismatches: ResolverEvalMismatch[];
}

export interface RunResolverEvalOptions {
  goldenSet?: ResolverGoldenExample[];
  batchSize?: number;
}

/** Resolve every golden example and compare to its expected label. */
export async function runResolverEval(
  resolveBatch: ResolveBatch,
  opts: RunResolverEvalOptions = {}
): Promise<ResolverEvalReport> {
  const golden = opts.goldenSet ?? RESOLVER_GOLDEN_SET;
  const inputs = golden.map((g) => ({ normalizedName: g.normalizedName, context: g.context }));
  const resolved = await resolveDistinctEntities(inputs, resolveBatch, {
    batchSize: opts.batchSize,
  });

  const mismatches: ResolverEvalMismatch[] = [];
  for (const g of golden) {
    const got = resolved.get(resolverKey(g.normalizedName)) ?? NONE_LABEL;
    if (got !== g.expected) {
      mismatches.push({ normalizedName: g.normalizedName, expected: g.expected, got, note: g.note });
    }
  }

  const passed = golden.length - mismatches.length;
  return {
    total: golden.length,
    passed,
    accuracy: golden.length ? passed / golden.length : 1,
    mismatches,
  };
}
