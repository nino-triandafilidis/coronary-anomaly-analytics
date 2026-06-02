// One-time backfill: stamp the #66 resolver's entity decision onto each stored
// parsed report's terms, sourced from the resolved corpus and linked by id.
//
// The app reads parsed_reports/ and resolves each term via
// resolveParsedTermPaperFeature, which honors a stored paperFeatureId first. The
// resolver output lives in data/work/results_v2_542.resolved.jsonl (raw
// top-level `findings` shape), so this copies the four paperFeature* fields onto
// the matching parsedTerms in the store. The resolved JSONL already carries the
// full field set per finding (id, label, category, trackingRole), including the
// "none" sentinel for out-of-scope / normal, so this is a pure remap with no
// model call and no dependency on the TS entity tables.
//
// Match is by normalizedName (the resolver resolves once per distinct wording),
// using the same key the app's resolver uses: trim + lowercase + collapse
// whitespace. A term whose wording is absent from the resolved corpus is left
// untouched (its paperFeatureId stays absent, i.e. not-yet-backfilled) and
// counted. Re-runnable; a file is rewritten only if at least one term changed.
//
// Dry-run by default (no writes); pass --write to persist.
//   node scripts/backfill-resolver-ids.mjs            # report only
//   node scripts/backfill-resolver-ids.mjs --write    # apply
//
// Paths default to the checkout this script lives in; override for running a
// worktree copy against the main checkout's store:
//   RESOLVER_STORE_DIR=/abs/parsed_reports/json \
//   RESOLVER_RESOLVED_JSONL=/abs/data/work/results_v2_542.resolved.jsonl \
//   node scripts/backfill-resolver-ids.mjs --write

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WRITE = process.argv.includes("--write");
const PAPER_FEATURE_FIELDS = [
  "paperFeatureId",
  "paperFeatureLabel",
  "paperFeatureCategory",
  "paperFeatureTrackingRole",
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeOverride = process.env.RESOLVER_STORE_DIR;
const resolvedOverride = process.env.RESOLVER_RESOLVED_JSONL;

let jsonDir;
let resolvedPath;
if (storeOverride && resolvedOverride) {
  // Fully overridden (e.g. running a worktree copy against the main checkout):
  // skip touching this checkout's parsed_reports, which may not exist.
  jsonDir = storeOverride;
  resolvedPath = resolvedOverride;
} else {
  // Follow the parsed_reports symlink so we find data/ next to the real store.
  const parsedReportsRoot = fs.realpathSync(path.join(repoRoot, "parsed_reports"));
  jsonDir = storeOverride ?? path.join(parsedReportsRoot, "json");
  resolvedPath =
    resolvedOverride ??
    path.join(path.dirname(parsedReportsRoot), "data/work/results_v2_542.resolved.jsonl");
}

// Same canonical key the app's resolver uses (entityResolver.resolverKey).
const resolverKey = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Build resolverKey(normalizedName) -> { paperFeature* } from the resolved corpus.
const byKey = new Map();
let conflicts = 0;
for (const line of fs.readFileSync(resolvedPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const report = JSON.parse(line);
  const findings = report.findings ?? report.parseResult?.parsedTerms ?? [];
  for (const finding of findings) {
    const key = resolverKey(finding.normalizedName);
    if (!key) continue;
    const fields = Object.fromEntries(PAPER_FEATURE_FIELDS.map((f) => [f, finding[f] ?? null]));
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, fields);
    } else if (prior.paperFeatureId !== fields.paperFeatureId) {
      // The resolver resolves once per wording, so this should not happen; keep
      // the first and report it rather than silently picking one.
      conflicts += 1;
    }
  }
}

let reports = 0;
let terms = 0;
let hit = 0;
let miss = 0;
let toEntity = 0;
let toNone = 0;
let filesUpdated = 0;
const missSamples = [];

for (const file of fs.readdirSync(jsonDir)) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(jsonDir, file);
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const parsedTerms = report.parseResult?.parsedTerms ?? [];
  reports += 1;
  let dirty = false;

  for (const term of parsedTerms) {
    terms += 1;
    const fields = byKey.get(resolverKey(term.normalizedName));
    if (!fields) {
      miss += 1;
      if (missSamples.length < 15) missSamples.push(term.normalizedName);
      continue;
    }
    hit += 1;
    if (fields.paperFeatureId === "none") toNone += 1;
    else toEntity += 1;
    for (const f of PAPER_FEATURE_FIELDS) {
      if (term[f] !== fields[f]) {
        term[f] = fields[f];
        dirty = true;
      }
    }
  }

  if (dirty && WRITE) {
    fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
    filesUpdated += 1;
  } else if (dirty) {
    filesUpdated += 1; // would update
  }
}

console.log(
  [
    `resolver id backfill (${WRITE ? "WRITE" : "dry-run"})`,
    `  store:    ${jsonDir}`,
    `  resolved: ${resolvedPath}`,
    `  distinct resolved wordings: ${byKey.size}${conflicts ? ` (conflicts: ${conflicts})` : ""}`,
    `  reports:  ${reports}`,
    `  terms:    ${terms} (hit ${hit}, miss ${miss})`,
    `  resolved: ${toEntity} to an entity, ${toNone} to none`,
    `  files ${WRITE ? "updated" : "that would update"}: ${filesUpdated}`,
  ].join("\n")
);
if (miss) console.log(`  miss sample: ${JSON.stringify(missSamples)}`);
if (!WRITE) console.log("\n(dry-run; re-run with --write to persist)");
