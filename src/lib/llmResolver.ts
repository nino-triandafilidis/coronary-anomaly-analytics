/**
 * LLM-based resolver — handles terms the parser couldn't match verbatim.
 *
 * Responsibilities:
 * 1. Resolve unmatched terms → find the actual verbatim text in the report
 * 2. Identify missed clinical findings
 * 3. Flag hallucinated / negated terms
 *
 * This runs BETWEEN the parser and the verifier in the pipeline.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { UnresolvedRawTerm } from "@/data/mockParseResults";

const RESOLVER_MODEL = "gemini-2.5-flash";

const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 2.50 / 1_000_000;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const RESOLVER_PROMPT = `You are a clinical text matching system for radiology reports.

CONTEXT: An AI parser extracted anomaly terms from a radiology report. Some terms could not be located verbatim in the report — they may be paraphrased, span line breaks, or be fabricated.

You will receive:
1. The original report text
2. Terms that were already successfully matched (for context — do NOT re-process these)
3. UNRESOLVED terms that could not be matched to exact text in the report

YOUR TASKS:

TASK 1 — RESOLVE UNMATCHED TERMS:
For each unresolved term, search the report for the closest matching text.

Rules:
- If the term is a paraphrase of report text: return the EXACT verbatim text from the report
- If the term combines non-contiguous words: return the actual contiguous phrase
- If the term is from a negated finding ("no evidence of X", "without X"): mark as "negated"
- If the term is completely fabricated: mark as "hallucinated"
- The "verbatimText" MUST be an exact character-for-character copy from the report, including typos, line breaks, and capitalization

TASK 2 — MISSED FINDINGS:
Check the report for important clinical findings that were NOT captured by either the matched or unresolved term lists. Only flag genuinely significant findings, not borderline or normal anatomy.

NEGATION: "No X", "without X", "not seen", "ruled out X" → these are NOT findings. Do NOT include them as missed.

Return JSON:
{
  "resolved": [
    {
      "originalTerm": "what the parser returned",
      "verbatimText": "exact text from report, or null if hallucinated/negated",
      "normalizedName": "Canonical Medical Term",
      "category": "Pulmonary|Cardiac|Vascular|Systemic|Musculoskeletal",
      "isAnomaly": true,
      "correctionType": "paraphrase|negated|hallucinated",
      "explanation": "brief reason for the correction"
    }
  ],
  "missedFindings": [
    {
      "term": "exact verbatim text from report",
      "normalizedName": "Canonical Name",
      "category": "Pulmonary|Cardiac|Vascular|Systemic|Musculoskeletal",
      "isAnomaly": true,
      "context": "the sentence containing this term"
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({
    model: RESOLVER_MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });
  return _model;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedTerm {
  originalTerm: string;
  verbatimText: string | null;
  normalizedName: string;
  category: string;
  isAnomaly: boolean;
  correctionType: "paraphrase" | "negated" | "hallucinated";
  explanation: string;
}

export interface ResolverMissedFinding {
  term: string;
  normalizedName: string;
  category: string;
  isAnomaly: boolean;
  context: string;
}

export interface ResolverResult {
  resolved: ResolvedTerm[];
  missedFindings: ResolverMissedFinding[];
  tokenUsage: { input: number; output: number };
  costUsd: number;
  timeMs: number;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve unmatched terms and detect missed findings.
 *
 * @param reportText      The full report text
 * @param unresolvedTerms Terms the parser returned but couldn't position-match
 * @param resolvedTerms   Terms that WERE matched (passed for context so the LLM
 *                        doesn't flag them as missed)
 */
export async function resolveUnmatchedTerms(
  reportText: string,
  unresolvedTerms: UnresolvedRawTerm[],
  resolvedTerms: Array<{ term: string; normalizedName: string; category: string }>
): Promise<ResolverResult> {
  const model = getModel();
  const startTime = performance.now();

  console.group("🔧 [Resolver] Resolving unmatched terms...");
  console.log("Model:", RESOLVER_MODEL);
  console.log("Unresolved terms:", unresolvedTerms.length);

  const alreadyMatched = resolvedTerms.map((t) => ({
    term: t.term,
    normalizedName: t.normalizedName,
    category: t.category,
  }));

  const userMessage = [
    `REPORT:\n\n${reportText}`,
    `\nALREADY MATCHED (${alreadyMatched.length} terms — for context only):\n${JSON.stringify(alreadyMatched, null, 2)}`,
    `\nUNRESOLVED TERMS (${unresolvedTerms.length} — need resolution):\n${JSON.stringify(unresolvedTerms, null, 2)}`,
  ].join("\n");

  const result = await model.generateContent([
    { text: RESOLVER_PROMPT },
    { text: userMessage },
  ]);

  const response = result.response;
  const elapsed = Math.round(performance.now() - startTime);

  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const cost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  console.log(`⏱ ${elapsed}ms | 📊 ${inputTokens}+${outputTokens} tokens | 💲 $${cost.toFixed(5)}`);

  let parsed: {
    resolved?: ResolvedTerm[];
    missedFindings?: ResolverMissedFinding[];
  };

  try {
    parsed = JSON.parse(response.text());
  } catch {
    console.error("❌ Failed to parse resolver response:", response.text().slice(0, 300));
    parsed = {};
  }

  const resolved = parsed.resolved ?? [];
  const missed = parsed.missedFindings ?? [];

  const byType = {
    paraphrase: resolved.filter((r) => r.correctionType === "paraphrase").length,
    negated: resolved.filter((r) => r.correctionType === "negated").length,
    hallucinated: resolved.filter((r) => r.correctionType === "hallucinated").length,
  };

  console.log(
    `📋 Resolved: ${byType.paraphrase} paraphrased, ${byType.negated} negated, ${byType.hallucinated} hallucinated`
  );
  console.log(`🆕 ${missed.length} missed findings`);

  if (resolved.length > 0) {
    console.table(
      resolved.map((r) => ({
        original: r.originalTerm.slice(0, 35),
        resolved: r.verbatimText?.slice(0, 35) ?? "—",
        type: r.correctionType,
        reason: r.explanation.slice(0, 50),
      }))
    );
  }
  if (missed.length > 0) {
    console.table(
      missed.map((m) => ({
        term: m.term.slice(0, 40),
        normalized: m.normalizedName,
        category: m.category,
      }))
    );
  }
  console.groupEnd();

  return {
    resolved,
    missedFindings: missed,
    tokenUsage: { input: inputTokens, output: outputTokens },
    costUsd: cost,
    timeMs: elapsed,
  };
}
