/**
 * Test script: Run Gemini parser on seed reports and print results.
 *
 * Usage:
 *   npx tsx scripts/test-parser.ts
 *   npx tsx scripts/test-parser.ts --report mimic-235
 *   npx tsx scripts/test-parser.ts --test-set
 *
 * Requires VITE_GEMINI_API_KEY in .env
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";

// Load .env
config({ path: resolve(import.meta.dirname, "../.env") });

const API_KEY = process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ VITE_GEMINI_API_KEY not found in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parser prompt (same as llmParser.ts)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a clinical NER system for CT angiogram radiology reports.

YOUR TASK: Extract every anomaly-related term from the report. An anomaly is any clinical finding, condition, disease, pathology, or abnormal observation. Include:
- Named conditions (e.g., "pulmonary embolism", "cardiomegaly", "aortic aneurysm")
- Descriptive findings (e.g., "filling defect", "moderate stenosis", "mildly enlarged")
- Measurements indicating abnormality (e.g., "measures 5.2 cm", "approximately 50%")
- All abbreviations and medical jargon (e.g., "PE", "DVT", "SVG")
- Calcification, effusion, thrombus, nodule, atelectasis, etc.
- Any term a cardiologist would consider clinically relevant

DO NOT extract:
- Normal/negative findings (e.g., "no evidence of dissection", "within normal limits", "unremarkable")
- Section headers (e.g., "FINDINGS:", "IMPRESSION:", "TECHNIQUE:")
- Patient demographics or dates
- Imaging technique descriptions (e.g., "80 mL of iodinated contrast")
- Anatomy that is described as normal

NEGATION RULES — THIS IS CRITICAL:
- If a finding is explicitly negated ("no", "no evidence of", "without", "ruled out", "not seen", "not identified", "absent"), DO NOT include it.
- "No evidence of dissection" → do NOT extract "dissection"
- "No pleural effusion" → do NOT extract "pleural effusion"
- BUT: "consistent with pulmonary embolism" → DO extract "pulmonary embolism"
- BUT: "rule out pulmonary embolism" in INDICATION section → DO extract it (it's the suspected finding)

For each term, provide:
- "term": the exact text as it appears in the report (preserve case)
- "normalizedName": the canonical medical term (Title Case)
- "category": one of "Pulmonary", "Cardiac", "Vascular", "Systemic", "Musculoskeletal"
- "confidence": 0.0-1.0, your confidence this is a real anomaly
- "isAnomaly": true if this is a definite clinical finding, false if borderline/uncertain
- "context": the full sentence containing this term

Return a JSON array. If no anomalies are found, return an empty array [].`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Report {
  id: string;
  text: string;
  title?: string;
}

interface ParsedTerm {
  term: string;
  normalizedName: string;
  category: string;
  confidence: number;
  isAnomaly: boolean;
  context: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0,
    responseMimeType: "application/json",
  },
});

async function parseReport(report: Report): Promise<{
  terms: ParsedTerm[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timeMs: number;
}> {
  const start = performance.now();

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: `REPORT:\n\n${report.text}` },
  ]);

  const elapsed = Math.round(performance.now() - start);
  const response = result.response;
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const costUsd =
    inputTokens * (0.30 / 1_000_000) + outputTokens * (2.50 / 1_000_000);

  let terms: ParsedTerm[];
  try {
    terms = JSON.parse(response.text());
    if (!Array.isArray(terms)) terms = [];
  } catch {
    console.error("  ❌ JSON parse failed:", response.text().slice(0, 200));
    terms = [];
  }

  return { terms, inputTokens, outputTokens, costUsd, timeMs: elapsed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const useTestSet = args.includes("--test-set");
  const specificReport = args.find((a, i) => args[i - 1] === "--report");

  const filePath = useTestSet
    ? resolve(import.meta.dirname, "../public/test_reports_5.json")
    : resolve(import.meta.dirname, "../public/seed_reports_10.json");

  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  let reports: Report[] = data.reports.map((r: any) => ({
    id: r.id,
    text: r.text,
    title: r.title,
  }));

  if (specificReport) {
    reports = reports.filter((r) => r.id === specificReport);
    if (reports.length === 0) {
      console.error(`❌ Report "${specificReport}" not found`);
      process.exit(1);
    }
  }

  console.log(`\n🔬 Parsing ${reports.length} report(s) with gemini-2.5-flash\n`);

  let totalCost = 0;
  let totalTerms = 0;

  for (const report of reports) {
    console.log(`━━━ ${report.id} (${report.text.length} chars) ━━━`);

    const { terms, inputTokens, outputTokens, costUsd, timeMs } =
      await parseReport(report);

    totalCost += costUsd;
    totalTerms += terms.length;

    console.log(
      `  ⏱ ${timeMs}ms | 📊 ${inputTokens}+${outputTokens} tokens | 💲 $${costUsd.toFixed(5)}`
    );
    console.log(`  Found ${terms.length} terms:\n`);

    for (const t of terms) {
      // Verify term exists in report text
      const found = report.text.toLowerCase().includes(t.term.toLowerCase());
      const marker = found ? "✓" : "⚠ NOT FOUND";
      const anomalyFlag = t.isAnomaly ? "" : " [borderline]";

      console.log(
        `  ${marker} "${t.term}" → ${t.normalizedName} (${t.category}, ${(t.confidence * 100).toFixed(0)}%)${anomalyFlag}`
      );
    }

    // Check for negation leaks
    const negationPatterns = [
      /\bno evidence of\b/i,
      /\bno\s+\w+\s+effusion\b/i,
      /\bno\s+\w+\s+embolism\b/i,
      /\bwithout\b/i,
      /\bunremarkable\b/i,
      /\bnormal\s+in\s+caliber\b/i,
      /\bwithin normal limits\b/i,
      /\bno\s+significant\b/i,
    ];

    const leaks = terms.filter((t) =>
      negationPatterns.some((p) => p.test(t.context) && t.context.toLowerCase().includes(t.term.toLowerCase()))
    );
    if (leaks.length > 0) {
      console.log(`\n  ⚠ Possible negation leaks (check manually):`);
      for (const l of leaks) {
        console.log(`    "${l.term}" in context: "${l.context.slice(0, 100)}..."`);
      }
    }

    console.log();
  }

  console.log(`━━━ SUMMARY ━━━`);
  console.log(`Reports parsed: ${reports.length}`);
  console.log(`Total terms found: ${totalTerms}`);
  console.log(`Total cost: $${totalCost.toFixed(5)}`);
  console.log(`Avg cost/report: $${(totalCost / reports.length).toFixed(5)}`);
}

main().catch(console.error);
