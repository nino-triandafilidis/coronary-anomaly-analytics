/**
 * LLM-based anomaly parser using Google Gemini.
 *
 * Sends a CT angiogram report to Gemini and receives structured JSON
 * with all anomaly-related terms, their positions, and metadata.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ParsedTerm, ParseResult } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL_NAME = "gemini-2.5-flash";

// Pricing per 1M tokens (Gemini 2.5 Flash, standard tier)
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 2.50 / 1_000_000;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a clinical NER system for CT angiogram radiology reports.

YOUR TASK: Extract every anomaly-related term from the report.

WHAT TO EXTRACT:
- Named conditions: pulmonary embolism, cardiomegaly, aortic aneurysm, DVT, etc.
- Descriptive findings: filling defect, ground-glass opacity, spiculated nodule, etc.
- Calcification, effusion, thrombus, nodule, atelectasis, edema, stenosis, etc.
- All abbreviations and medical jargon: PE, DVT, CAD, LAD, SVG, etc.
- Any term a cardiologist would consider clinically relevant

WHAT NOT TO EXTRACT:
- Negated findings: "no evidence of dissection" → do NOT extract "dissection"
- Section headers: FINDINGS, IMPRESSION, TECHNIQUE
- Patient demographics, dates, dose information
- Imaging technique descriptions
- Normal anatomy described as normal
- Measurements by themselves without a finding (do NOT extract "measuring up to 1 cm" alone)
- Symptoms from INDICATION section (e.g. "shortness of breath", "chest pain") — only extract the suspected diagnosis if named (e.g. "pulmonary embolism" in "rule out pulmonary embolism")

NEGATION RULES — CRITICAL:
- "No evidence of X" → do NOT extract X
- "No X" → do NOT extract X
- "Without X" → do NOT extract X
- "Ruled out X" → do NOT extract X
- "Not seen / not identified / absent" → do NOT extract
- BUT: "consistent with X" → DO extract X
- BUT: "suggesting possible X" → DO extract X

EXACT TEXT RULE — CRITICAL:
The "term" field MUST be an exact character-for-character copy from the report text. This includes:
- Preserving typos (e.g. if the report says "calicifications", return "calicifications" NOT "calcifications")
- Preserving line breaks if the term spans a line break
- Preserving exact capitalization
- Do NOT paraphrase, summarize, or construct phrases that do not appear verbatim in the text
- Do NOT combine separate words into a phrase unless that exact phrase appears contiguously in the report

DEDUPLICATION:
If the same finding appears in both FINDINGS and IMPRESSION sections, extract BOTH occurrences — each with its own exact text. The UI will show both highlights but the database will deduplicate.

For each term, return a JSON object with:
- "term": exact verbatim text from the report (character-for-character, including typos)
- "normalizedName": the canonical medical term in Title Case (correct any typos here)
- "category": one of "Pulmonary", "Cardiac", "Vascular", "Systemic", "Musculoskeletal"
- "isAnomaly": true if definite clinical finding, false if borderline/uncertain
- "context": the full sentence containing this term
- "hasTypo": true ONLY if the term in the report contains a spelling error that you corrected in normalizedName, false otherwise

Return a JSON array. If no anomalies found, return [].`;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_GEMINI_API_KEY is not set. Copy .env.example to .env and add your Gemini API key."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });
  return _model;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface RawLLMTerm {
  term: string;
  normalizedName: string;
  category: string;
  isAnomaly: boolean;
  context: string;
  hasTypo?: boolean;
}

/**
 * Locate the exact start/end index of a term in the report text.
 * Searches from `searchAfter` to handle duplicate terms.
 */
function findTermPosition(
  reportText: string,
  term: string,
  searchAfter: number = 0
): { startIndex: number; endIndex: number } {
  const lowerReport = reportText.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerReport.indexOf(lowerTerm, searchAfter);

  if (idx === -1) {
    // Fallback: try to find it anywhere
    const fallback = lowerReport.indexOf(lowerTerm);
    if (fallback !== -1) {
      return { startIndex: fallback, endIndex: fallback + term.length };
    }
    return { startIndex: -1, endIndex: -1 };
  }

  return { startIndex: idx, endIndex: idx + term.length };
}

/**
 * Parse a CT angiogram report using Gemini.
 * Returns structured anomaly data with positions resolved against source text.
 */
export async function parseReport(reportText: string): Promise<ParseResult> {
  const model = getModel();
  const startTime = performance.now();

  console.group("🔬 [Parser] Calling Gemini...");
  console.log("Model:", MODEL_NAME);
  console.log("Report length:", reportText.length, "chars");

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: `REPORT:\n\n${reportText}` },
  ]);

  const response = result.response;
  const elapsed = Math.round(performance.now() - startTime);

  // Extract token usage
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const cost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  console.log(`⏱ ${elapsed}ms | 📊 ${inputTokens}+${outputTokens} tokens | 💲 $${cost.toFixed(5)}`);

  // Parse JSON response
  const rawText = response.text();
  let rawTerms: RawLLMTerm[];
  try {
    rawTerms = JSON.parse(rawText);
  } catch {
    console.error("❌ JSON parse failed:", rawText.slice(0, 300));
    rawTerms = [];
  }

  if (!Array.isArray(rawTerms)) {
    console.error("❌ Response is not an array:", rawTerms);
    rawTerms = [];
  }

  console.log(`📋 LLM returned ${rawTerms.length} terms`);

  // Resolve positions against source text
  const usedPositions = new Set<number>();
  const parsedTerms: ParsedTerm[] = [];
  const skipped: string[] = [];

  for (const raw of rawTerms) {
    let searchAfter = 0;
    let pos = findTermPosition(reportText, raw.term, searchAfter);

    while (pos.startIndex !== -1 && usedPositions.has(pos.startIndex)) {
      searchAfter = pos.startIndex + 1;
      pos = findTermPosition(reportText, raw.term, searchAfter);
    }

    if (pos.startIndex === -1) {
      skipped.push(raw.term);
      continue;
    }

    usedPositions.add(pos.startIndex);

    parsedTerms.push({
      term: reportText.substring(pos.startIndex, pos.endIndex),
      normalizedName: raw.normalizedName || raw.term,
      category: raw.category || "Systemic",
      confidence: 1, // Not used — kept for type compatibility
      startIndex: pos.startIndex,
      endIndex: pos.endIndex,
      context: raw.context || "",
      isAnomaly: raw.isAnomaly ?? true,
    });
  }

  if (skipped.length > 0) {
    console.warn(`⚠ ${skipped.length} terms not found in report text:`, skipped);
  }
  console.log(`✅ ${parsedTerms.length} terms resolved to positions`);
  console.table(parsedTerms.map(t => ({
    term: t.term.slice(0, 40),
    normalized: t.normalizedName,
    category: t.category,
    pos: `${t.startIndex}-${t.endIndex}`,
    isAnomaly: t.isAnomaly,
  })));
  console.groupEnd();

  // Sort by position
  parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  return {
    reportId: crypto.randomUUID(),
    reportText,
    parsedTerms,
    parserModel: MODEL_NAME,
    verifierModel: "",
    verifierAgreement: 0,
    parseTimeMs: elapsed,
    totalTokensUsed: totalTokens,
    estimatedCostUsd: cost,
  };
}

/**
 * Estimate the cost of parsing a report (without actually calling the API).
 */
export function estimateCost(reportText: string): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
} {
  const promptTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
  const reportTokens = Math.ceil(reportText.length / 4);
  const estimatedInputTokens = promptTokens + reportTokens;
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.3);
  const estimatedCostUsd =
    estimatedInputTokens * INPUT_COST_PER_TOKEN +
    estimatedOutputTokens * OUTPUT_COST_PER_TOKEN;

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd };
}
