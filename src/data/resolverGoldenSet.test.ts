import { describe, expect, it } from "vitest";
import { PAPER_FEATURE_IDS, resolvePaperFeature } from "@/data/paperFeatures";
import { NONE, RESOLVER_GOLDEN_SET } from "@/data/resolverGoldenSet";

const validTargets = new Set<string>([...PAPER_FEATURE_IDS, NONE]);

describe("resolver golden set integrity", () => {
  it("targets only valid paper entity ids or NONE", () => {
    const bad = RESOLVER_GOLDEN_SET.filter((ex) => !validTargets.has(ex.expected));
    expect(bad.map((ex) => `${ex.normalizedName} -> ${ex.expected}`)).toEqual([]);
  });

  it("has no duplicate inputs", () => {
    const keys = RESOLVER_GOLDEN_SET.map((ex) => ex.normalizedName.toLowerCase());
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("every example carries the required fields", () => {
    for (const ex of RESOLVER_GOLDEN_SET) {
      expect(ex.normalizedName.trim().length).toBeGreaterThan(0);
      expect(ex.context.trim().length).toBeGreaterThan(0);
      expect(["asserted", "negated"]).toContain(ex.assertion);
    }
  });

  it("covers a breadth of entities and includes out-of-scope cases", () => {
    const distinctEntities = new Set(
      RESOLVER_GOLDEN_SET.filter((ex) => ex.expected !== NONE).map((ex) => ex.expected)
    );
    expect(distinctEntities.size).toBeGreaterThanOrEqual(12);
    expect(RESOLVER_GOLDEN_SET.some((ex) => ex.expected === NONE)).toBe(true);
  });
});

describe("resolver golden set captures the rule-based gap (#66)", () => {
  // The point of #66 is that string/alias matching cannot resolve real
  // dictation. Confirm the golden set actually exercises that gap: the current
  // dictionary tier (resolvePaperFeature on normalizedName) must get at least
  // one case wrong, otherwise the set is not testing what the resolver fixes.
  it("includes wordings the current dictionary tier does not resolve correctly", () => {
    const ruleResolves = (name: string): string => resolvePaperFeature(name)?.id ?? NONE;
    const missed = RESOLVER_GOLDEN_SET.filter((ex) => ruleResolves(ex.normalizedName) !== ex.expected);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.length).toBeLessThan(RESOLVER_GOLDEN_SET.length);
  });
});
