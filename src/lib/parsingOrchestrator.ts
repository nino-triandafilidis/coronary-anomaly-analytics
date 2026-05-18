/**
 * Parsing orchestrator — single-call OpenAI pipeline with a cost guard.
 *
 * The orchestrator wraps `parseWithOpenAI` (one GPT function call that
 * returns asserted/negated findings in one shot) with a per-call cost ceiling.
 * On any error it throws and the UI surfaces the failure — there is no silent
 * mock-data fallback (canned mocks were masking real LLM failures).
 *
 * The legacy 3-call Gemini pipeline (parser → resolver → verifier) and the
 * dictionary-based `anomalyDetection` fallback have been removed.
 */

import { parseWithOpenAI, estimateOpenAICost } from "@/lib/openaiParser";
import type { ParseResult } from "@/data/mockParseResults";

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
// Orchestrator entry point
// ---------------------------------------------------------------------------

export async function orchestrateParse(reportText: string): Promise<ParseResult> {
  console.group("[Orchestrator] OpenAI single-call");

  try {
    const estimate = estimateOpenAICost(reportText);
    console.log(
      `💲 Estimated cost: $${estimate.estimatedCostUsd.toFixed(5)} (limit: $${COST_LIMIT_PER_CALL})`
    );
    if (estimate.estimatedCostUsd > COST_LIMIT_PER_CALL) {
      throw new CostLimitError(estimate.estimatedCostUsd);
    }

    const result = await parseWithOpenAI(reportText);
    console.log(
      `✅ [Orchestrator] ${result.parsedTerms.length} terms, ` +
        `$${result.estimatedCostUsd.toFixed(5)}, ${result.parseTimeMs}ms`
    );
    return result;
  } finally {
    console.groupEnd();
  }
}
