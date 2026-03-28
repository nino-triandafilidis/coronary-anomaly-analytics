/**
 * LLM-based anomaly parser using Google Gemini.
 *
 * Sends a CT angiogram report to Gemini and receives structured JSON
 * with all anomaly-related terms, their positions, and metadata.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ParsedTerm, ParseResult, UnresolvedRawTerm } from "@/data/mockParseResults";

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

// ---------------------------------------------------------------------------
// Position resolution — two-pass: exact match → whitespace-normalized
// ---------------------------------------------------------------------------

interface PositionMatch {
  startIndex: number;
  endIndex: number;
  correctionType: "exact" | "whitespace";
}

/**
 * Build a whitespace-normalized version of a string, tracking the mapping
 * from each normalized character back to its original index.
 */
function normalizeForSearch(text: string): { normalized: string; indexMap: number[] } {
  const chars: string[] = [];
  const indexMap: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        chars.push(" ");
        indexMap.push(i);
        lastWasSpace = true;
      }
    } else {
      chars.push(ch.toLowerCase());
      indexMap.push(i);
      lastWasSpace = false;
    }
  }

  return { normalized: chars.join(""), indexMap };
}

/**
 * Locate a term in the report text.
 * Pass 1: exact case-insensitive indexOf.
 * Pass 2: whitespace-normalized search (collapses \n, \t, multi-space).
 */
function findTermPosition(
  reportText: string,
  term: string,
  searchAfter: number = 0
): PositionMatch | null {
  // --- Pass 1: exact (case-insensitive) ---
  const lowerReport = reportText.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let idx = lowerReport.indexOf(lowerTerm, searchAfter);

  if (idx !== -1) {
    return { startIndex: idx, endIndex: idx + term.length, correctionType: "exact" };
  }

  // Try from start (in case searchAfter skipped the only occurrence)
  if (searchAfter > 0) {
    idx = lowerReport.indexOf(lowerTerm);
    if (idx !== -1) {
      return { startIndex: idx, endIndex: idx + term.length, correctionType: "exact" };
    }
  }

  // --- Pass 2: whitespace-normalized ---
  const { normalized: normReport, indexMap: reportMap } = normalizeForSearch(reportText);
  const { normalized: normTerm } = normalizeForSearch(term);

  // Map searchAfter to normalized space
  let normSearchAfter = 0;
  if (searchAfter > 0) {
    for (let i = 0; i < reportMap.length; i++) {
      if (reportMap[i] >= searchAfter) {
        normSearchAfter = i;
        break;
      }
    }
  }

  let normIdx = normReport.indexOf(normTerm, normSearchAfter);

  // Fallback: try from beginning
  if (normIdx === -1 && normSearchAfter > 0) {
    normIdx = normReport.indexOf(normTerm);
  }

  if (normIdx !== -1 && normIdx + normTerm.length - 1 < reportMap.length) {
    const originalStart = reportMap[normIdx];
    const originalEnd = reportMap[normIdx + normTerm.length - 1] + 1;
    return { startIndex: originalStart, endIndex: originalEnd, correctionType: "whitespace" };
  }

  return null; // Truly unresolved — will go to the LLM resolver
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
