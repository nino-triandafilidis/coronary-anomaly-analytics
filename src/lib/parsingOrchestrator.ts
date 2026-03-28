/**
 * Parsing orchestrator — coordinates parser → resolver → verifier pipeline.
 *
 * Flow:
 * 1. Check for mock data (when no API key).
 * 2. Estimate cost — block if over $1 per call.
 * 3. Run parser (Gemini) — extracts terms, resolves positions (exact + whitespace).
 * 4. Run resolver (Gemini) — fixes unresolved terms, finds missed findings.
 * 5. Run verifier (Gemini) — confirms/rejects the full term set.
 * 6. Return final ParseResult.
 */

import { parseReport, estimateCost } from "@/lib/llmParser";
import { resolveUnmatchedTerms } from "@/lib/llmResolver";
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
// Helper: position-resolve a term in the report
// ---------------------------------------------------------------------------

function positionResolve(
  reportText: string,
  term: string,
  existingTerms: ParsedTerm[]
): { startIndex: number; endIndex: number } | null {
  const lower = reportText.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lower.indexOf(lowerTerm);

  if (idx === -1) return null;

  // Check for overlap with existing terms
  const overlaps = existingTerms.some(
    (t) => idx < t.endIndex && idx + term.length > t.startIndex
  );
  if (overlaps) return null;

  return { startIndex: idx, endIndex: idx + term.length };
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

  // 2. Cost check (estimate 3 calls: parser + resolver + verifier)
  const estimate = estimateCost(reportText);
  const totalEstimate = estimate.estimatedCostUsd * 3;

  console.log(`💲 Estimated cost: $${totalEstimate.toFixed(5)} (limit: $${COST_LIMIT_PER_CALL})`);

  if (totalEstimate > COST_LIMIT_PER_CALL) {
    console.groupEnd();
    throw new CostLimitError(totalEstimate);
  }

  // 3. Run parser
  const parseResult = await parseReport(reportText);
  const unresolved = parseResult.unresolvedRawTerms ?? [];

  // 4. Run resolver (if there are unresolved terms)
  if (unresolved.length > 0) {
    try {
      console.log(
        `🔧 [Orchestrator] ${unresolved.length} unresolved terms → calling resolver...`
      );

      const resolution = await resolveUnmatchedTerms(
        reportText,
        unresolved,
        parseResult.parsedTerms.map((t) => ({
          term: t.term,
          normalizedName: t.normalizedName,
          category: t.category,
        }))
      );

      // Integrate resolved terms that have a verbatim match
      let resolvedCount = 0;
      for (const r of resolution.resolved) {
        if (!r.verbatimText || r.correctionType === "hallucinated" || r.correctionType === "negated") {
          console.log(`  ✗ "${r.originalTerm}" → ${r.correctionType}: ${r.explanation}`);
          continue;
        }

        const pos = positionResolve(reportText, r.verbatimText, parseResult.parsedTerms);
        if (!pos) {
          console.warn(`  ⚠ Resolver returned "${r.verbatimText}" but couldn't position it`);
          continue;
        }

        parseResult.parsedTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: r.normalizedName,
          category: r.category,
          confidence: 1,
          startIndex: pos.startIndex,
          endIndex: pos.endIndex,
          context: "",
          isAnomaly: r.isAnomaly,
          correctionType: "resolved",
          resolutionNote: `${r.correctionType}: ${r.explanation}`,
        });
        resolvedCount++;
      }

      // Integrate missed findings from resolver
      for (const missed of resolution.missedFindings) {
        const pos = positionResolve(reportText, missed.term, parseResult.parsedTerms);
        if (!pos) continue;

        parseResult.parsedTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: missed.normalizedName,
          category: missed.category,
          confidence: 1,
          startIndex: pos.startIndex,
          endIndex: pos.endIndex,
          context: missed.context,
          isAnomaly: missed.isAnomaly,
        });
      }

      console.log(
        `🔧 [Orchestrator] Resolver: ${resolvedCount} recovered, ` +
          `${resolution.resolved.length - resolvedCount} discarded, ` +
          `${resolution.missedFindings.length} missed added`
      );

      // Clear unresolved — they've been handled
      parseResult.unresolvedRawTerms = undefined;

      // Accumulate cost/time
      parseResult.totalTokensUsed +=
        resolution.tokenUsage.input + resolution.tokenUsage.output;
      parseResult.estimatedCostUsd += resolution.costUsd;
      parseResult.parseTimeMs += resolution.timeMs;
    } catch (err) {
      console.warn("⚠ Resolver failed, continuing with partial results:", err);
    }
  }

  // 5. Run verifier (confirm/reject on the full set)
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

      // Add missed findings from verifier (deduplicate against existing)
      for (const missed of verification.missedFindings) {
        const pos = positionResolve(reportText, missed.term, filteredTerms);
        if (!pos) continue;

        filteredTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: missed.normalizedName,
          category: missed.category,
          confidence: 1,
          startIndex: pos.startIndex,
          endIndex: pos.endIndex,
          context: missed.context,
          isAnomaly: missed.isAnomaly,
        });
      }

      filteredTerms.sort((a, b) => a.startIndex - b.startIndex);

      console.log(
        `🔍 [Orchestrator] Verifier: ${rejectedTerms.size} removed, ${verification.missedFindings.length} added`
      );

      parseResult.parsedTerms = filteredTerms;
      parseResult.verifierModel = "gemini-2.5-flash";
      parseResult.verifierAgreement = verification.overallAgreement;
      parseResult.totalTokensUsed +=
        verification.tokenUsage.input + verification.tokenUsage.output;
      parseResult.estimatedCostUsd += verification.costUsd;
      parseResult.parseTimeMs += verification.timeMs;
    } catch (err) {
      console.warn("⚠ Verifier failed, using parser+resolver results:", err);
      parseResult.verifierModel = "error";
      parseResult.verifierAgreement = 0;
    }
  }

  // Sort final set
  parseResult.parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  console.log(
    `✅ [Orchestrator] Final: ${parseResult.parsedTerms.length} terms, ` +
      `$${parseResult.estimatedCostUsd.toFixed(5)}, ${parseResult.parseTimeMs}ms`
  );
  console.groupEnd();

  return parseResult;
}
