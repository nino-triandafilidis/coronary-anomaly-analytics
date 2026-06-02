// Freeze the assembled CTA parser prompt to a plain-text file so the offline
// corpus runner (data/work/runRange.mjs) sends byte-for-byte the same prompt as
// the app's parser. The runner cannot import the TS module, so we materialize
// CTA_PARSER_PROMPT here.
//
//   npx tsx scripts/genFrozenPrompt.ts [outPath]

import { writeFileSync } from "node:fs";
import { CTA_PARSER_PROMPT } from "../src/lib/prompts/ctaParser.prompt.ts";

const outPath = process.argv[2] ?? "/tmp/_newPrompt_v2.txt";
writeFileSync(outPath, CTA_PARSER_PROMPT);
console.log(`wrote ${CTA_PARSER_PROMPT.length} chars to ${outPath}`);
