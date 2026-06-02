import { describe, expect, it } from "vitest";
import { RESOLVER_GOLDEN_SET } from "@/data/resolverGoldenSet";
import {
  createOpenAIResolver,
  resolverKey,
  type ResolveBatch,
  type ResolverInput,
} from "@/lib/entityResolver";
import { runResolverEval } from "@/lib/entityResolver.eval";

const EXPECTED_BY_KEY = new Map(
  RESOLVER_GOLDEN_SET.map((g) => [resolverKey(g.normalizedName), g.expected])
);

const perfectResolver: ResolveBatch = async (batch: ResolverInput[]) => ({
  results: batch.map((b, i) => ({
    index: i,
    id: EXPECTED_BY_KEY.get(resolverKey(b.normalizedName)) ?? "none",
  })),
});

describe("runResolverEval (scoring logic)", () => {
  it("scores a perfect resolver at 100%", async () => {
    const report = await runResolverEval(perfectResolver);
    expect(report.total).toBe(RESOLVER_GOLDEN_SET.length);
    expect(report.mismatches).toEqual([]);
    expect(report.accuracy).toBe(1);
  });

  it("reports the offending case when a resolver misses one", async () => {
    const target = RESOLVER_GOLDEN_SET.find((g) => g.expected !== "none");
    if (!target) throw new Error("golden set has no non-none case");
    const wrongResolver: ResolveBatch = async (batch) => ({
      results: batch.map((b, i) => ({
        index: i,
        id:
          resolverKey(b.normalizedName) === resolverKey(target.normalizedName)
            ? "none"
            : EXPECTED_BY_KEY.get(resolverKey(b.normalizedName)) ?? "none",
      })),
    });
    const report = await runResolverEval(wrongResolver);
    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]).toMatchObject({
      normalizedName: target.normalizedName,
      expected: target.expected,
      got: "none",
    });
    expect(report.passed).toBe(RESOLVER_GOLDEN_SET.length - 1);
  });
});

// Opt-in real-model eval. Skipped unless RUN_RESOLVER_EVAL=1 and a key is set,
// so the default `npm test` never calls the paid API. Run it with:
//   RUN_RESOLVER_EVAL=1 npx vitest run src/lib/entityResolver.eval.test.ts
const RUN_REAL =
  process.env.RUN_RESOLVER_EVAL === "1" && Boolean(import.meta.env.VITE_OPENAI_API_KEY);

describe.skipIf(!RUN_REAL)("runResolverEval (real model)", () => {
  it(
    "resolves the golden set at >= 0.9 accuracy",
    async () => {
      const report = await runResolverEval(createOpenAIResolver());
      if (report.mismatches.length) console.table(report.mismatches);
      console.log(
        `resolver eval: ${report.passed}/${report.total} (${(report.accuracy * 100).toFixed(1)}%)`
      );
      expect(report.accuracy).toBeGreaterThanOrEqual(0.9);
    },
    120_000
  );
});
