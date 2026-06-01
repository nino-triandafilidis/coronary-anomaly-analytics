// One-time backfill: stamp the curated cohort side (RCA/LCA) onto each stored
// parsed report, sourced from the offline pipeline results and linked by id.
//
// The app reads parsed_reports/ but the cohort side lives in
// data/work/results_all546.jsonl, so this copies it in. Re-runnable; reports
// without a cohort side (e.g. parsed live in the app) are left untouched and
// fall back to the laterality text heuristic.
//
//   node scripts/backfill-report-side.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Follow the parsed_reports symlink so we find data/ next to the real store.
const parsedReportsRoot = fs.realpathSync(path.join(repoRoot, "parsed_reports"));
const jsonDir = path.join(parsedReportsRoot, "json");
const resultsPath = path.join(
  path.dirname(parsedReportsRoot),
  "data/work/results_all546.jsonl"
);

const sideById = new Map();
for (const line of fs.readFileSync(resultsPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  if (record.patient_id && (record.side === "RCA" || record.side === "LCA")) {
    sideById.set(record.patient_id, record.side);
  }
}

let updated = 0;
let unchanged = 0;
let withoutSide = 0;
for (const file of fs.readdirSync(jsonDir)) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(jsonDir, file);
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const side = sideById.get(report.id);
  if (!side) {
    withoutSide += 1;
    continue;
  }
  if (report.side === side) {
    unchanged += 1;
    continue;
  }
  report.side = side;
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  updated += 1;
}

console.log(
  `backfilled cohort side: ${updated} updated, ${unchanged} already current, ${withoutSide} without a cohort side`
);
