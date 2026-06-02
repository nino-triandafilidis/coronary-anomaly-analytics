import { describe, expect, it } from "vitest";
import {
  buildResolverInstructions,
  parseResolverOutput,
  resolveDistinctEntities,
  resolverKey,
  RESOLVER_FEW_SHOTS,
  type ResolverInput,
} from "@/lib/entityResolver";

describe("buildResolverInstructions", () => {
  const prompt = buildResolverInstructions();

  it("states the context-over-surface-name contract", () => {
    expect(prompt).toMatch(/do not match on surface words/i);
  });

  it("embeds the generated entity catalog and the none label", () => {
    expect(prompt).toMatch(/intramural_course —[^\n]*aortic wall/);
    expect(prompt).toMatch(/myocardial_bridge —[^\n]*tunneling under myocardium/);
    expect(prompt).toContain("none — normal anatomy");
  });

  it("includes the boundary few-shots that pin the hard calls", () => {
    expect(RESOLVER_FEW_SHOTS.length).toBeGreaterThanOrEqual(6);
    // intramuscular-into-septum -> intraseptal_course (not bridge / not intramural)
    expect(prompt).toMatch(/Intramuscular course of left main[^\n]*-> intraseptal_course/);
    // normal LM-from-left-cusp -> none
    expect(prompt).toMatch(/Origin of Left Main Coronary Artery from Left Coronary Cusp[^\n]*-> none/);
    // verbose dominance -> right_dominance
    expect(prompt).toContain("-> right_dominance");
  });
});

describe("parseResolverOutput", () => {
  const batch: ResolverInput[] = [
    { normalizedName: "a" },
    { normalizedName: "b" },
    { normalizedName: "c" },
  ];

  it("aligns ids by index", () => {
    const raw = {
      results: [
        { index: 0, id: "right_dominance" },
        { index: 1, id: "high_origin" },
        { index: 2, id: "none" },
      ],
    };
    expect(parseResolverOutput(raw, batch)).toEqual(["right_dominance", "high_origin", "none"]);
  });

  it("coerces unknown ids and fills missing/out-of-range indices with none", () => {
    const raw = {
      results: [
        { index: 0, id: "not_a_real_entity" },
        { index: 5, id: "high_origin" }, // out of range, ignored
        // index 1 missing -> none
        { index: 2, id: "coronary_atherosclerotic_lesions" },
      ],
    };
    expect(parseResolverOutput(raw, batch)).toEqual([
      "none",
      "none",
      "coronary_atherosclerotic_lesions",
    ]);
  });

  it("returns all none for a malformed response", () => {
    expect(parseResolverOutput(null, batch)).toEqual(["none", "none", "none"]);
    expect(parseResolverOutput({}, batch)).toEqual(["none", "none", "none"]);
  });
});

describe("resolveDistinctEntities", () => {
  // Fake resolver: echoes a deterministic id per name, records the batches seen.
  const idFor = (name: string) =>
    name.toLowerCase().includes("dominant") ? "right_dominance" : "high_origin";

  function fakeResolver() {
    const seen: ResolverInput[][] = [];
    const fn = async (batch: ResolverInput[]) => {
      seen.push(batch);
      return { results: batch.map((b, i) => ({ index: i, id: idFor(b.normalizedName) })) };
    };
    return { fn, seen };
  }

  it("dedups distinct wordings before calling the model", async () => {
    const { fn, seen } = fakeResolver();
    const inputs: ResolverInput[] = [
      { normalizedName: "Right Dominant Coronary Circulation" },
      { normalizedName: "right dominant coronary circulation" }, // case variant
      { normalizedName: "Right  Dominant  Coronary  Circulation " }, // whitespace variant
    ];
    const out = await resolveDistinctEntities(inputs, fn);
    expect(seen.flat()).toHaveLength(1);
    expect(out.get(resolverKey("Right Dominant Coronary Circulation"))).toBe("right_dominance");
  });

  it("skips entries already in the cache", async () => {
    const { fn, seen } = fakeResolver();
    const cache = new Map<string, string>([[resolverKey("High origin of RCA"), "high_origin"]]);
    const inputs: ResolverInput[] = [
      { normalizedName: "High origin of RCA" }, // cached
      { normalizedName: "Right dominant system" }, // new
    ];
    const out = await resolveDistinctEntities(inputs, fn, { cache });
    expect(seen.flat().map((b) => b.normalizedName)).toEqual(["Right dominant system"]);
    expect(out.get(resolverKey("High origin of RCA"))).toBe("high_origin");
    expect(out.get(resolverKey("Right dominant system"))).toBe("right_dominance");
  });

  it("batches uncached inputs by batchSize", async () => {
    const { fn, seen } = fakeResolver();
    const inputs = Array.from({ length: 23 }, (_, i) => ({ normalizedName: `finding ${i}` }));
    await resolveDistinctEntities(inputs, fn, { batchSize: 10 });
    expect(seen.map((b) => b.length)).toEqual([10, 10, 3]);
  });
});
