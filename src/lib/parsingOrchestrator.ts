/**
 * Parsing orchestrator — coordinates parser + verifier with cost controls.
 *
 * Flow:
 * 1. Check for mock data (when no API key).
 * 2. Estimate cost — block if over $1 per call.
 * 3. Run parser (Gemini).
 * 4. Run verifier (Gemini) — reject bad terms, add missed terms.
 * 5. Return final ParseResult.
 */

import { parseReport, estimateCost } from "@/lib/llmParser";
import { verifyParseResult } from "@/lib/llmVerifier";
import type { ParseResult } from "@/data/mockParseResults";
import { findMockParseResultByText } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// Cost guard
// ---------------------------------------------------------------------------

const COST_LIMIT_PER_CALL = 1.0; // USD

export class CostLimitError extends Error {
  estimatedCost: number;
  constructor(estimatedCost: number) {
    super(
      `Estimated cost $${estimatedCost.toFixed(4)} exceeds limit of $${COST_LIMIT_PER_CALL.toFixed(2)} per call.`
    );
    this.name = "CostLimitError";
    this.estimatedCost = estimatedCost;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  /** Run the verifier after parsing. Default: true */
  runVerifier?: boolean;
  /** Use mock data if available instead of calling the API. Default: true when no API key */
  useMock?: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function orchestrateParse(
  reportText: string,
  options: OrchestratorOptions = {}
): Promise<ParseResult> {
  const { runVerifier = true, useMock } = options;

  console.group("🏗 [Orchestrator] Starting parse pipeline...");

  // 1. Mock fallback
  const shouldUseMock = useMock ?? !import.meta.env.VITE_GEMINI_API_KEY;
  if (shouldUseMock) {
    const mock = findMockParseResultByText(reportText);
    if (mock) {
      console.log("📦 Using mock data (no API key or mock match found)");
      console.groupEnd();
      return mock;
    }
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      console.groupEnd();
      throw new Error(
        "No API key set and no mock data matches this report. Set VITE_GEMINI_API_KEY in .env."
      );
    }
  }

  // 2. Cost check
  const estimate = estimateCost(reportText);
  const totalEstimate = runVerifier
    ? estimate.estimatedCostUsd * 2
    : estimate.estimatedCostUsd;

  console.log(`💲 Estimated cost: $${totalEstimate.toFixed(5)} (limit: $${COST_LIMIT_PER_CALL})`);

  if (totalEstimate > COST_LIMIT_PER_CALL) {
    console.groupEnd();
    throw new CostLimitError(totalEstimate);
  }

  // 3. Run parser
  const parseResult = await parseReport(reportText);

  // 4. Run verifier
  if (runVerifier && parseResult.parsedTerms.length > 0) {
    try {
      const verification = await verifyParseResult(
        reportText,
        parseResult.parsedTerms
      );

      // Remove rejected terms
      const rejectedTerms = new Set(
        verification.decisions
          .filter((d) => d.verdict === "rejected")
          .map((d) => d.term.toLowerCase())
      );

      const filteredTerms = parseResult.parsedTerms.filter(
        (t) => !rejectedTerms.has(t.term.toLowerCase())
      );

      // Add missed findings with resolved positions
      for (const missed of verification.missedFindings) {
        const lowerReport = reportText.toLowerCase();
        const lowerTerm = missed.term.toLowerCase();
        const idx = lowerReport.indexOf(lowerTerm);

        if (idx !== -1) {
          const overlaps = filteredTerms.some(
            (t) => idx < t.endIndex && idx + missed.term.length > t.startIndex
          );

          if (!overlaps) {
            filteredTerms.push({
              term: reportText.substring(idx, idx + missed.term.length),
              normalizedName: missed.normalizedName,
              category: missed.category,
              confidence: 1,
              startIndex: idx,
              endIndex: idx + missed.term.length,
              context: missed.context,
              isAnomaly: missed.isAnomaly,
            });
          }
        }
      }

      filteredTerms.sort((a, b) => a.startIndex - b.startIndex);

      const removed = parseResult.parsedTerms.length - filteredTerms.length + verification.missedFindings.length;
      console.log(`🔍 [Orchestrator] Verifier: ${rejectedTerms.size} removed, ${verification.missedFindings.length} added`);

      parseResult.parsedTerms = filteredTerms;
      parseResult.verifierModel = "gemini-2.5-flash";
      parseResult.verifierAgreement = verification.overallAgreement;
      parseResult.totalTokensUsed +=
        verification.tokenUsage.input + verification.tokenUsage.output;
      parseResult.estimatedCostUsd += verification.costUsd;
      parseResult.parseTimeMs += verification.timeMs;
    } catch (err) {
      console.warn("⚠ Verifier failed, using parser results only:", err);
      parseResult.verifierModel = "error";
      parseResult.verifierAgreement = 0;
    }
  }

  console.log(`✅ [Orchestrator] Final: ${parseResult.parsedTerms.length} terms, $${parseResult.estimatedCostUsd.toFixed(5)}, ${parseResult.parseTimeMs}ms`);
  console.groupEnd();

  return parseResult;
}
