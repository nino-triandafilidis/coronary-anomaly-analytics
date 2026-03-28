/**
 * LLM-based verifier — checks parser output for errors.
 *
 * Checks:
 * 1. No hallucinated terms (terms not in the report)
 * 2. No negated findings incorrectly included
 * 3. No missed findings
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ParsedTerm } from "@/data/mockParseResults";

const VERIFIER_MODEL = "gemini-2.5-flash";

const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 2.50 / 1_000_000;

const VERIFIER_PROMPT = `You are a clinical verification system. You will receive:
1. A CT angiogram radiology report
2. A list of anomaly terms extracted by another AI

YOUR TASK: Verify the extraction is correct and complete.

For each extracted term, check:
- Is it actually present in the report text? (exact text match)
- Is it a genuine anomaly/finding? (not a negated finding like "no evidence of X")
- Was it correctly extracted? (not a symptom, not a section header, not normal anatomy)

Also check for MISSED findings — anomalies in the report that were NOT extracted.
Only flag genuinely missed clinical findings, not borderline terms.

NEGATION: Be strict. "No PE", "without effusion", "not seen" → those findings should NOT be in the extracted list.

Return JSON:
{
  "decisions": [
    {
      "term": "the extracted term text",
      "verdict": "confirmed" | "rejected",
      "reason": "brief explanation"
    }
  ],
  "missedFindings": [
    {
      "term": "exact text from report (verbatim, including typos)",
      "normalizedName": "Canonical Name",
      "category": "Pulmonary|Cardiac|Vascular|Systemic|Musculoskeletal",
      "isAnomaly": true,
      "context": "the sentence containing this term"
    }
  ],
  "overallAgreement": 0.95
}`;

let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (_model) return _model;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _model = genAI.getGenerativeModel({
    model: VERIFIER_MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });
  return _model;
}

export interface VerifierDecision {
  term: string;
  verdict: "confirmed" | "rejected";
  reason: string;
}

export interface MissedFinding {
  term: string;
  normalizedName: string;
  category: string;
  isAnomaly: boolean;
  context: string;
}

export interface VerifyResult {
  decisions: VerifierDecision[];
  missedFindings: MissedFinding[];
  overallAgreement: number;
  tokenUsage: { input: number; output: number };
  costUsd: number;
  timeMs: number;
}

/**
 * Verify parser output against the original report.
 */
export async function verifyParseResult(
  reportText: string,
  parsedTerms: ParsedTerm[]
): Promise<VerifyResult> {
  const model = getModel();
  const startTime = performance.now();

  console.group("🔍 [Verifier] Checking parser output...");
  console.log("Model:", VERIFIER_MODEL);
  console.log("Terms to verify:", parsedTerms.length);

  const termsForVerification = parsedTerms.map((t) => ({
    term: t.term,
    normalizedName: t.normalizedName,
    category: t.category,
    isAnomaly: t.isAnomaly,
  }));

  const result = await model.generateContent([
    { text: VERIFIER_PROMPT },
    {
      text: `REPORT:\n\n${reportText}\n\nEXTRACTED TERMS:\n\n${JSON.stringify(termsForVerification, null, 2)}`,
    },
  ]);

  const response = result.response;
  const elapsed = Math.round(performance.now() - startTime);

  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const cost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  console.log(`⏱ ${elapsed}ms | 📊 ${inputTokens}+${outputTokens} tokens | 💲 $${cost.toFixed(5)}`);

  let parsed: {
    decisions?: VerifierDecision[];
    missedFindings?: MissedFinding[];
    overallAgreement?: number;
  };

  try {
    parsed = JSON.parse(response.text());
  } catch {
    console.error("❌ Failed to parse verifier response:", response.text().slice(0, 300));
    parsed = {};
  }

  const decisions = parsed.decisions ?? [];
  const missed = parsed.missedFindings ?? [];

  const confirmed = decisions.filter(d => d.verdict === "confirmed").length;
  const rejected = decisions.filter(d => d.verdict === "rejected").length;

  console.log(`✅ ${confirmed} confirmed | ❌ ${rejected} rejected | 🆕 ${missed.length} missed findings`);

  if (rejected > 0) {
    console.table(decisions.filter(d => d.verdict === "rejected").map(d => ({
      term: d.term.slice(0, 40),
      reason: d.reason,
    })));
  }
  if (missed.length > 0) {
    console.table(missed.map(m => ({
      term: m.term.slice(0, 40),
      normalized: m.normalizedName,
      category: m.category,
    })));
  }
  console.groupEnd();

  return {
    decisions,
    missedFindings: missed,
    overallAgreement: parsed.overallAgreement ?? 0,
    tokenUsage: { input: inputTokens, output: outputTokens },
    costUsd: cost,
    timeMs: elapsed,
  };
}
