/**
 * LLM-based verifier — checks parser output for errors.
 *
 * Uses a second Gemini call (or different provider) to verify:
 * 1. No hallucinated terms (terms not actually in the report)
 * 2. No negated findings incorrectly included
 * 3. No missed findings
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ParsedTerm } from "@/data/mockParseResults";

const VERIFIER_MODEL = "gemini-2.0-flash";

const INPUT_COST_PER_TOKEN = 0.10 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 0.40 / 1_000_000;

const VERIFIER_PROMPT = `You are a clinical verification system. You will receive:
1. A CT angiogram radiology report
2. A list of anomaly terms extracted by another AI

YOUR TASK: Verify the extraction is correct and complete. For each extracted term, check:
- Is it actually present in the report text at the claimed position?
- Is it a genuine anomaly/finding (not a negated finding like "no evidence of X")?
- Is the category correct?

Also check for MISSED findings — anomalies in the report that were NOT extracted.

Return JSON with this exact structure:
{
  "decisions": [
    {
      "term": "the extracted term",
      "verdict": "confirmed" | "rejected" | "uncertain",
      "reason": "brief explanation"
    }
  ],
  "missedFindings": [
    {
      "term": "exact text from report",
      "normalizedName": "Canonical Name",
      "category": "Pulmonary|Cardiac|Vascular|Systemic|Musculoskeletal",
      "confidence": 0.9,
      "context": "the sentence containing this term",
      "isAnomaly": true
    }
  ],
  "overallAgreement": 0.95
}

Be strict about negation. If the report says "no PE" or "without effusion", those should be rejected if they were extracted.`;

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
  verdict: "confirmed" | "rejected" | "uncertain";
  reason: string;
}

export interface MissedFinding {
  term: string;
  normalizedName: string;
  category: string;
  confidence: number;
  context: string;
  isAnomaly: boolean;
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

  const termsForVerification = parsedTerms.map((t) => ({
    term: t.term,
    normalizedName: t.normalizedName,
    category: t.category,
    confidence: t.confidence,
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

  let parsed: {
    decisions?: VerifierDecision[];
    missedFindings?: MissedFinding[];
    overallAgreement?: number;
  };

  try {
    parsed = JSON.parse(response.text());
  } catch {
    console.error("Failed to parse verifier response:", response.text());
    parsed = {};
  }

  return {
    decisions: parsed.decisions ?? [],
    missedFindings: parsed.missedFindings ?? [],
    overallAgreement: parsed.overallAgreement ?? 0,
    tokenUsage: { input: inputTokens, output: outputTokens },
    costUsd: cost,
    timeMs: elapsed,
  };
}
