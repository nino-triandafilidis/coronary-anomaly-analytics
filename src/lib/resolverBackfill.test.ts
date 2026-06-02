import { describe, expect, it } from "vitest";
import { PAPER_FEATURES } from "@/data/paperFeatures";
import { createOpenAIResolver, type ResolveBatch } from "@/lib/entityResolver";
import { applyResolvedId, backfillReports, type BackfillFinding } from "@/lib/resolverBackfill";

describe("applyResolvedId", () => {
  it("writes the paper feature fields for a resolved id", () => {
    const rd = PAPER_FEATURES.find((f) => f.id === "right_dominance");
    if (!rd) throw new Error("right_dominance missing");
    expect(applyResolvedId({ normalizedName: "x" }, "right_dominance")).toMatchObject({
      paperFeatureId: "right_dominance",
      paperFeatureLabel: rd.canonical,
      paperFeatureCategory: rd.category,
      paperFeatureTrackingRole: rd.trackingRole,
    });
  });

  it("nulls the fields for none or an unknown id", () => {
    expect(applyResolvedId({ normalizedName: "x" }, "none")).toMatchObject({
      paperFeatureId: null,
      paperFeatureLabel: null,
      paperFeatureCategory: null,
    });
    expect(applyResolvedId({ normalizedName: "x" }, "not_an_entity").paperFeatureId).toBeNull();
  });
});

describe("backfillReports", () => {
  const fake: ResolveBatch = async (batch) => ({
    results: batch.map((b, i) => ({
      index: i,
      id: b.normalizedName.toLowerCase().includes("dominant") ? "right_dominance" : "none",
    })),
  });

  it("writes paperFeatureId across both report shapes, dedups wordings, mutates in place", async () => {
    const reports: Array<{
      findings?: BackfillFinding[];
      parseResult?: { parsedTerms?: BackfillFinding[] };
      [k: string]: unknown;
    }> = [
      // raw parse-output shape: top-level findings
      {
        id: "r1",
        side: "RCA",
        findings: [
          { normalizedName: "Right Dominant Coronary Circulation", context: "..." },
          { normalizedName: "foo bar", context: "" },
        ],
      },
      // app stored shape: parseResult.parsedTerms, with a duplicate wording
      {
        id: "r2",
        parseResult: { parsedTerms: [{ normalizedName: "right dominant coronary circulation" }] },
      },
    ];

    const { reports: out, summary } = await backfillReports<BackfillFinding>(reports, fake);

    expect(summary).toEqual({ reports: 2, findings: 3, distinct: 2, resolved: 2, none: 1 });
    // top-level findings shape populated
    expect(out[0].findings?.[0].paperFeatureId).toBe("right_dominance");
    expect(out[0].findings?.[1].paperFeatureId).toBeNull();
    // app stored shape (parseResult.parsedTerms) populated, not a new top-level array
    expect(out[1].parseResult?.parsedTerms?.[0].paperFeatureId).toBe("right_dominance");
    expect(out[1].findings).toBeUndefined();
    // mutated in place (same object refs), extra fields untouched
    expect(out[0]).toBe(reports[0]);
    expect(out[0].side).toBe("RCA");
  });
});

// Opt-in real-model backfill over a corpus file. Skipped unless RUN_BACKFILL=1
// and a key is set, so the default `npm test` never calls the paid API. Run:
//   RUN_BACKFILL=1 BACKFILL_IN=data/work/results_v2_542.jsonl \
//   BACKFILL_OUT=/tmp/results_v2_542.resolved.jsonl \
//   npx vitest run src/lib/resolverBackfill.test.ts
const RUN_REAL =
  process.env.RUN_BACKFILL === "1" && Boolean(import.meta.env.VITE_OPENAI_API_KEY);

describe.skipIf(!RUN_REAL)("backfillReports (real model)", () => {
  it(
    "resolves a corpus jsonl and writes paperFeatureId per finding",
    async () => {
      const { readFileSync, writeFileSync } = await import("node:fs");
      const inPath = process.env.BACKFILL_IN;
      const outPath = process.env.BACKFILL_OUT;
      if (!inPath || !outPath) throw new Error("Set BACKFILL_IN and BACKFILL_OUT.");

      const reports = readFileSync(inPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      const { reports: out, summary } = await backfillReports(reports, createOpenAIResolver(), {
        batchSize: 25,
      });
      writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log("backfill summary:", summary);
      expect(summary.findings).toBeGreaterThan(0);
    },
    1_800_000
  );
});
