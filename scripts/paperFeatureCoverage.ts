// #66 coverage metric: how well the rule-based resolver maps real findings to
// the paper entity set. Reuses the production canonicalFeature/resolvePaperFeature
// so the numbers match the Analysis page. No LLM.
//
//   npx tsx scripts/paperFeatureCoverage.ts <results.jsonl> [--json out.json]
//
// Reports, over ASSERTED findings: dictionary hit-rate (paper vs narrowing vs
// Other), per-category paper hits, top unmatched "Other" wordings, and the
// case-fold floor (distinct normalizedName raw vs lowercased).

import { readFileSync, writeFileSync } from "node:fs";
import { canonicalFeature } from "@/data/featureCanonical";
import type { ParsedTerm } from "@/data/parseTypes";

const path = process.argv[2];
if (!path) throw new Error("usage: paperFeatureCoverage.ts <results.jsonl> [--json out.json]");
const jsonIdx = process.argv.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;

const recs = readFileSync(path, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((r) => r.ok);

type Finding = { verbatimText?: string; normalizedName?: string; assertion?: string; context?: string };
const asTerm = (f: Finding): ParsedTerm =>
  ({
    term: f.verbatimText ?? "",
    normalizedName: f.normalizedName ?? "",
    assertion: (f.assertion as ParsedTerm["assertion"]) ?? "asserted",
    confidence: 1,
    startIndex: 0,
    endIndex: 0,
    context: f.context ?? "",
    isAnomaly: true,
  }) as ParsedTerm;

let paper = 0;
let narrowing = 0;
let other = 0;
let total = 0;
const paperByCategory = new Map<string, number>();
const otherCounts = new Map<string, number>();
const rawNames = new Set<string>();
const foldedNames = new Set<string>();

for (const r of recs) {
  for (const f of (r.findings ?? []) as Finding[]) {
    if (f.assertion !== "asserted") continue;
    total += 1;
    const name = (f.normalizedName ?? "").replace(/\s+/g, " ").trim();
    if (name) {
      rawNames.add(name);
      foldedNames.add(name.toLowerCase());
    }
    const cf = canonicalFeature(asTerm(f));
    if (!cf) {
      other += 1;
      continue;
    }
    if (cf.key.startsWith("paper:")) {
      paper += 1;
      paperByCategory.set(cf.category, (paperByCategory.get(cf.category) ?? 0) + 1);
    } else if (cf.key.startsWith("narrowing:")) {
      narrowing += 1;
    } else {
      other += 1;
      otherCounts.set(cf.label.toLowerCase(), (otherCounts.get(cf.label.toLowerCase()) ?? 0) + 1);
    }
  }
}

const pct = (n: number) => (total ? `${((100 * n) / total).toFixed(1)}%` : "n/a");
const topOther = [...otherCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log(`== PAPER-FEATURE COVERAGE: ${path.split("/").pop()} (${recs.length} reports) ==`);
console.log(`asserted findings: ${total}`);
console.log(`  paper-feature hit:   ${paper} (${pct(paper)})`);
console.log(`  narrowing concept:   ${narrowing} (${pct(narrowing)})`);
console.log(`  Other (unresolved):  ${other} (${pct(other)})`);
console.log(`dictionary hit-rate (paper+narrowing): ${pct(paper + narrowing)}`);
console.log("");
console.log("paper hits by category:");
for (const [cat, n] of [...paperByCategory.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(5)}  ${cat}`);
}
console.log("");
console.log(`case-fold floor: ${rawNames.size} distinct normalizedName -> ${foldedNames.size} after case-fold`);
console.log("");
console.log("top-20 unresolved 'Other' wordings (count):");
for (const [name, n] of topOther) console.log(`  ${n.toString().padStart(4)}  ${name}`);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        file: path.split("/").pop(),
        reports: recs.length,
        assertedFindings: total,
        paperHit: paper,
        narrowing,
        other,
        dictionaryHitRate: total ? +((paper + narrowing) / total).toFixed(4) : 0,
        paperByCategory: Object.fromEntries(paperByCategory),
        caseFoldFloor: { rawDistinct: rawNames.size, foldedDistinct: foldedNames.size },
        topOther: Object.fromEntries(topOther),
      },
      null,
      2
    )
  );
  console.log(`\nwrote ${jsonOut}`);
}
