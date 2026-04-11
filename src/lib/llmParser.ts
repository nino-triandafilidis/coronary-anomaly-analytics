/**
 * LLM-based anomaly parser using Google Gemini.
 *
 * Sends a CT angiogram report to Gemini and receives structured JSON
 * with all anomaly-related terms, their positions, and metadata.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ParsedTerm, ParseResult, UnresolvedRawTerm } from "@/data/mockParseResults";
import { GEMINI_PARSER_PROMPT } from "@/lib/prompts/geminiParser.prompt";
import { findTermPosition } from "@/lib/positionResolver";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL_NAME = "gemini-2.5-flash";

// Pricing per 1M tokens (Gemini 2.5 Flash, standard tier)
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 2.50 / 1_000_000;

// Prompt is in src/lib/prompts/geminiParser.prompt.ts
const SYSTEM_PROMPT = GEMINI_PARSER_PROMPT;

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

// Position resolver lives in src/lib/positionResolver.ts so the Anthropic
// parser can reuse it.

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

  // Resolve positions against source text (exact + whitespace-normalized)
  const usedPositions = new Set<number>();
  const parsedTerms: ParsedTerm[] = [];
  const unresolvedRawTerms: UnresolvedRawTerm[] = [];
  let whitespaceFixCount = 0;

  for (const raw of rawTerms) {
    let searchAfter = 0;
    let pos = findTermPosition(reportText, raw.term, searchAfter);

    // Skip already-used positions (for duplicate terms)
    while (pos && usedPositions.has(pos.startIndex)) {
      searchAfter = pos.startIndex + 1;
      pos = findTermPosition(reportText, raw.term, searchAfter);
    }

    if (!pos) {
      // Could not resolve — save for LLM resolver
      unresolvedRawTerms.push({
        term: raw.term,
        normalizedName: raw.normalizedName || raw.term,
        category: raw.category || "Systemic",
        // Gemini parser prompt explicitly skips negated findings, so any term
        // it returns is an asserted finding by construction.
        assertion: "asserted",
        isAnomaly: raw.isAnomaly ?? true,
        context: raw.context || "",
      });
      continue;
    }

    usedPositions.add(pos.startIndex);
    if (pos.correctionType === "whitespace") whitespaceFixCount++;

    parsedTerms.push({
      term: reportText.substring(pos.startIndex, pos.endIndex),
      normalizedName: raw.normalizedName || raw.term,
      category: raw.category || "Systemic",
      // Gemini parser prompt explicitly skips negated findings, so any term
      // it returns is an asserted finding by construction.
      assertion: "asserted",
      confidence: 1,
      startIndex: pos.startIndex,
      endIndex: pos.endIndex,
      context: raw.context || "",
      isAnomaly: raw.isAnomaly ?? true,
      correctionType: pos.correctionType,
      resolutionNote:
        pos.correctionType === "whitespace"
          ? "Matched after normalizing whitespace/line breaks"
          : undefined,
    });
  }

  if (unresolvedRawTerms.length > 0) {
    console.warn(
      `⚠ ${unresolvedRawTerms.length} terms unresolved (→ LLM resolver):`,
      unresolvedRawTerms.map((t) => t.term)
    );
  }
  if (whitespaceFixCount > 0) {
    console.log(`🔧 ${whitespaceFixCount} terms matched via whitespace normalization`);
  }
  console.log(`✅ ${parsedTerms.length} terms resolved to positions`);
  console.table(
    parsedTerms.map((t) => ({
      term: t.term.slice(0, 40),
      normalized: t.normalizedName,
      category: t.category,
      pos: `${t.startIndex}-${t.endIndex}`,
      match: t.correctionType ?? "exact",
    }))
  );
  console.groupEnd();

  // Sort by position
  parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  return {
    reportId: crypto.randomUUID(),
    reportText,
    parsedTerms,
    unresolvedRawTerms: unresolvedRawTerms.length > 0 ? unresolvedRawTerms : undefined,
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
