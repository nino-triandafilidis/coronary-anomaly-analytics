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

YOUR TASK: Extract every anomaly-related term from the report. An anomaly is any clinical finding, condition, disease, pathology, or abnormal observation. Include:
- Named conditions (e.g., "pulmonary embolism", "cardiomegaly", "aortic aneurysm")
- Descriptive findings (e.g., "filling defect", "moderate stenosis", "mildly enlarged")
- Measurements indicating abnormality (e.g., "measures 5.2 cm", "approximately 50%")
- All abbreviations and medical jargon (e.g., "PE", "LAD", "SVG")
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
  confidence: number;
  isAnomaly: boolean;
  context: string;
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
    // Term not found in text — return -1 to signal filtering
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

  // Parse JSON response
  const rawText = response.text();
  let rawTerms: RawLLMTerm[];
  try {
    rawTerms = JSON.parse(rawText);
  } catch {
    console.error("Failed to parse Gemini JSON response:", rawText);
    rawTerms = [];
  }

  if (!Array.isArray(rawTerms)) {
    console.error("Gemini response is not an array:", rawTerms);
    rawTerms = [];
  }

  // Resolve positions against source text
  const usedPositions = new Set<number>();
  const parsedTerms: ParsedTerm[] = [];

  for (const raw of rawTerms) {
    // Find position, avoiding duplicates
    let searchAfter = 0;
    let pos = findTermPosition(reportText, raw.term, searchAfter);

    // Skip past positions already claimed by other terms
    while (pos.startIndex !== -1 && usedPositions.has(pos.startIndex)) {
      searchAfter = pos.startIndex + 1;
      pos = findTermPosition(reportText, raw.term, searchAfter);
    }

    if (pos.startIndex === -1) {
      // Term not found in report — LLM hallucinated or paraphrased. Skip it.
      console.warn(`Term "${raw.term}" not found in report text, skipping.`);
      continue;
    }

    usedPositions.add(pos.startIndex);

    parsedTerms.push({
      term: reportText.substring(pos.startIndex, pos.endIndex),
      normalizedName: raw.normalizedName || raw.term,
      category: raw.category || "Systemic",
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.8)),
      startIndex: pos.startIndex,
      endIndex: pos.endIndex,
      context: raw.context || "",
      isAnomaly: raw.isAnomaly ?? true,
    });
  }

  // Sort by position
  parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  return {
    reportId: crypto.randomUUID(),
    reportText,
    parsedTerms,
    parserModel: MODEL_NAME,
    verifierModel: "", // filled by orchestrator if verifier runs
    verifierAgreement: 0,
    parseTimeMs: elapsed,
    totalTokensUsed: totalTokens,
    estimatedCostUsd: cost,
  };
}

/**
 * Estimate the cost of parsing a report (without actually calling the API).
 * Uses rough token estimation: ~4 chars per token.
 */
export function estimateCost(reportText: string): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
} {
  const promptTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
  const reportTokens = Math.ceil(reportText.length / 4);
  const estimatedInputTokens = promptTokens + reportTokens;
  // Assume output is roughly 30% of input for NER tasks
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.3);
  const estimatedCostUsd =
    estimatedInputTokens * INPUT_COST_PER_TOKEN +
    estimatedOutputTokens * OUTPUT_COST_PER_TOKEN;

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd };
}
