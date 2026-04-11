/**
 * Parsing orchestrator — provider switch + cost guard for the parse pipeline.
 *
 * Two providers are supported, selected via VITE_LLM_PROVIDER:
 *
 *   anthropic (default)  → src/lib/anthropicParser.ts
 *                          One Claude call with tool-use forced JSON output.
 *                          Returns terms with asserted/negated assertion status.
 *
 *   gemini               → legacy 3-call pipeline:
 *                          parser → resolver → verifier
 *                          See src/lib/llmParser.ts, llmResolver.ts, llmVerifier.ts.
 *                          The Gemini prompts skip negated findings entirely,
 *                          so all returned terms are tagged "asserted".
 *
 * The mock-data fallback that used to live here was removed when we replaced
 * the sample reports with real coronary CTAs — the canned mock results no
 * longer matched the new samples and were silently masking real LLM failures.
 * On any error, the orchestrator now throws and the UI surfaces the error.
 */

import { parseReport, estimateCost as estimateGeminiCost } from "@/lib/llmParser";
import { resolveUnmatchedTerms } from "@/lib/llmResolver";
import { verifyParseResult } from "@/lib/llmVerifier";
import { parseWithAnthropic, estimateAnthropicCost } from "@/lib/anthropicParser";
import { findTermPosition } from "@/lib/positionResolver";
import type { ParseResult, ParsedTerm } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export type LLMProvider = "anthropic" | "gemini";

function getProvider(): LLMProvider {
  const raw = (import.meta.env.VITE_LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (raw === "gemini") return "gemini";
  if (raw === "anthropic") return "anthropic";
  console.warn(
    `Unknown VITE_LLM_PROVIDER="${raw}", falling back to "anthropic".`
  );
  return "anthropic";
}

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
// Helper: position-resolve a term in the report (for Gemini resolver path)
// ---------------------------------------------------------------------------

function positionResolveAvailable(
  reportText: string,
  term: string,
  existingTerms: ParsedTerm[]
): { startIndex: number; endIndex: number } | null {
  const match = findTermPosition(reportText, term);
  if (!match) return null;
  const overlaps = existingTerms.some(
    (t) => match.startIndex < t.endIndex && match.endIndex > t.startIndex
  );
  if (overlaps) return null;
  return { startIndex: match.startIndex, endIndex: match.endIndex };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  /** Run the verifier after parsing (Gemini path only). Default: true */
  runVerifier?: boolean;
  /** Override the provider (otherwise reads VITE_LLM_PROVIDER). */
  provider?: LLMProvider;
}

// ---------------------------------------------------------------------------
// Orchestrator entry point
// ---------------------------------------------------------------------------

export async function orchestrateParse(
  reportText: string,
  options: OrchestratorOptions = {}
): Promise<ParseResult> {
  const provider = options.provider ?? getProvider();

  console.group(`🏗 [Orchestrator] Provider: ${provider}`);

  try {
    if (provider === "anthropic") {
      return await runAnthropicPath(reportText);
    }
    return await runGeminiPath(reportText, options.runVerifier ?? true);
  } finally {
    console.groupEnd();
  }
}

// ---------------------------------------------------------------------------
// Anthropic path — one call, done
// ---------------------------------------------------------------------------

async function runAnthropicPath(reportText: string): Promise<ParseResult> {
  const estimate = estimateAnthropicCost(reportText);
  console.log(
    `💲 Estimated cost: $${estimate.estimatedCostUsd.toFixed(5)} (limit: $${COST_LIMIT_PER_CALL})`
  );
  if (estimate.estimatedCostUsd > COST_LIMIT_PER_CALL) {
    throw new CostLimitError(estimate.estimatedCostUsd);
  }

  const result = await parseWithAnthropic(reportText);
  console.log(
    `✅ [Orchestrator] Anthropic: ${result.parsedTerms.length} terms, ` +
      `$${result.estimatedCostUsd.toFixed(5)}, ${result.parseTimeMs}ms`
  );
  return result;
}

// ---------------------------------------------------------------------------
// Gemini path — legacy 3-call pipeline
// ---------------------------------------------------------------------------

async function runGeminiPath(
  reportText: string,
  runVerifier: boolean
): Promise<ParseResult> {
  // Cost check (estimate 3 calls: parser + resolver + verifier)
  const estimate = estimateGeminiCost(reportText);
  const totalEstimate = estimate.estimatedCostUsd * 3;

  console.log(
    `💲 Estimated cost: $${totalEstimate.toFixed(5)} (limit: $${COST_LIMIT_PER_CALL})`
  );

  if (totalEstimate > COST_LIMIT_PER_CALL) {
    throw new CostLimitError(totalEstimate);
  }

  // 1. Parser
  const parseResult = await parseReport(reportText);
  const unresolved = parseResult.unresolvedRawTerms ?? [];

  // 2. Resolver (if there are unresolved terms)
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
        if (
          !r.verbatimText ||
          r.correctionType === "hallucinated" ||
          r.correctionType === "negated"
        ) {
          console.log(`  ✗ "${r.originalTerm}" → ${r.correctionType}: ${r.explanation}`);
          continue;
        }

        const pos = positionResolveAvailable(
          reportText,
          r.verbatimText,
          parseResult.parsedTerms
        );
        if (!pos) {
          console.warn(
            `  ⚠ Resolver returned "${r.verbatimText}" but couldn't position it`
          );
          continue;
        }

        parseResult.parsedTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: r.normalizedName,
          category: r.category,
          assertion: "asserted",
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
        const pos = positionResolveAvailable(
          reportText,
          missed.term,
          parseResult.parsedTerms
        );
        if (!pos) continue;

        parseResult.parsedTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: missed.normalizedName,
          category: missed.category,
          assertion: "asserted",
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

      parseResult.unresolvedRawTerms = undefined;

      parseResult.totalTokensUsed +=
        resolution.tokenUsage.input + resolution.tokenUsage.output;
      parseResult.estimatedCostUsd += resolution.costUsd;
      parseResult.parseTimeMs += resolution.timeMs;
    } catch (err) {
      console.warn("⚠ Resolver failed, continuing with partial results:", err);
    }
  }

  // 3. Verifier
  if (runVerifier && parseResult.parsedTerms.length > 0) {
    try {
      const verification = await verifyParseResult(reportText, parseResult.parsedTerms);

      const rejectedTerms = new Set(
        verification.decisions
          .filter((d) => d.verdict === "rejected")
          .map((d) => d.term.toLowerCase())
      );

      const filteredTerms = parseResult.parsedTerms.filter(
        (t) => !rejectedTerms.has(t.term.toLowerCase())
      );

      for (const missed of verification.missedFindings) {
        const pos = positionResolveAvailable(reportText, missed.term, filteredTerms);
        if (!pos) continue;

        filteredTerms.push({
          term: reportText.substring(pos.startIndex, pos.endIndex),
          normalizedName: missed.normalizedName,
          category: missed.category,
          assertion: "asserted",
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

  parseResult.parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  console.log(
    `✅ [Orchestrator] Gemini: ${parseResult.parsedTerms.length} terms, ` +
      `$${parseResult.estimatedCostUsd.toFixed(5)}, ${parseResult.parseTimeMs}ms`
  );

  return parseResult;
}
