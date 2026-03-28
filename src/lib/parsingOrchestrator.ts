/**
 * Parsing orchestrator — coordinates parser + verifier with cost controls.
 *
 * Flow:
 * 1. Estimate cost. If over $1 per call, throw (caller should show warning).
 * 2. Run parser.
 * 3. Optionally run verifier.
 * 4. Merge verifier feedback (reject bad terms, add missed terms).
 * 5. Return final ParseResult.
 */

import { parseReport, estimateCost } from "@/lib/llmParser";
import { verifyParseResult } from "@/lib/llmVerifier";
import type { ParseResult, ParsedTerm } from "@/data/mockParseResults";
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

/**
 * Parse a report end-to-end: mock fallback → cost check → parser → verifier → merged result.
 */
export async function orchestrateParse(
  reportText: string,
  options: OrchestratorOptions = {}
): Promise<ParseResult> {
  const { runVerifier = true, useMock } = options;

  // 1. Try mock data first (default when no API key set)
  const shouldUseMock = useMock ?? !import.meta.env.VITE_GEMINI_API_KEY;
  if (shouldUseMock) {
    const mock = findMockParseResultByText(reportText);
    if (mock) return mock;
    // No mock match — if no API key, we can't proceed
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      throw new Error(
        "No API key set and no mock data matches this report. Set VITE_GEMINI_API_KEY in .env."
      );
    }
  }

  // 2. Cost check
  const estimate = estimateCost(reportText);
  // Parser + verifier = roughly 2x
  const totalEstimate = runVerifier
    ? estimate.estimatedCostUsd * 2
    : estimate.estimatedCostUsd;

  if (totalEstimate > COST_LIMIT_PER_CALL) {
    throw new CostLimitError(totalEstimate);
  }

  // 3. Run parser
  const parseResult = await parseReport(reportText);

  // 4. Optionally run verifier
  if (runVerifier && parseResult.parsedTerms.length > 0) {
    try {
      const verification = await verifyParseResult(
        reportText,
        parseResult.parsedTerms
      );

      // Apply verifier decisions: remove rejected terms, flag uncertain ones
      const rejectedTerms = new Set(
        verification.decisions
          .filter((d) => d.verdict === "rejected")
          .map((d) => d.term.toLowerCase())
      );

      const filteredTerms = parseResult.parsedTerms.filter(
        (t) => !rejectedTerms.has(t.term.toLowerCase())
      );

      // Lower confidence for uncertain terms
      const uncertainTerms = new Set(
        verification.decisions
          .filter((d) => d.verdict === "uncertain")
          .map((d) => d.term.toLowerCase())
      );

      for (const t of filteredTerms) {
        if (uncertainTerms.has(t.term.toLowerCase())) {
          t.confidence = Math.min(t.confidence, 0.6);
        }
      }

      // Add missed findings with resolved positions
      for (const missed of verification.missedFindings) {
        const lowerReport = reportText.toLowerCase();
        const lowerTerm = missed.term.toLowerCase();
        const idx = lowerReport.indexOf(lowerTerm);

        if (idx !== -1) {
          // Check it doesn't overlap with existing terms
          const overlaps = filteredTerms.some(
            (t) => idx < t.endIndex && idx + missed.term.length > t.startIndex
          );

          if (!overlaps) {
            filteredTerms.push({
              term: reportText.substring(idx, idx + missed.term.length),
              normalizedName: missed.normalizedName,
              category: missed.category,
              confidence: missed.confidence * 0.9, // slightly lower since it was missed initially
              startIndex: idx,
              endIndex: idx + missed.term.length,
              context: missed.context,
              isAnomaly: missed.isAnomaly,
            });
          }
        }
      }

      // Re-sort by position
      filteredTerms.sort((a, b) => a.startIndex - b.startIndex);

      // Update result
      parseResult.parsedTerms = filteredTerms;
      parseResult.verifierModel = "gemini-2.5-flash";
      parseResult.verifierAgreement = verification.overallAgreement;
      parseResult.totalTokensUsed +=
        verification.tokenUsage.input + verification.tokenUsage.output;
      parseResult.estimatedCostUsd += verification.costUsd;
      parseResult.parseTimeMs += verification.timeMs;
    } catch (err) {
      // Verifier failure is non-fatal — return parser results without verification
      console.warn("Verifier failed, using parser results only:", err);
      parseResult.verifierModel = "error";
      parseResult.verifierAgreement = 0;
    }
  }

  return parseResult;
}
