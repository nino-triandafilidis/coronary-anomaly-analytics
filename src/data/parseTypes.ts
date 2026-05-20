// Shared type definitions for the parse and review pipeline.
//
// The orchestrator calls a live OpenAI LLM and surfaces errors to the UI; there
// is no mock-data fallback.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Whether the radiologist asserted the finding as present or ruled it out. */
export type Assertion = "asserted" | "negated";

export interface ParsedTerm {
  term: string;           // The exact text span found in the report
  normalizedName: string; // Canonical/normalized name (e.g. "Pulmonary Embolism")
  assertion: Assertion;   // "asserted" = present, "negated" = ruled out
  confidence: number;     // Kept for backward compatibility; always 1
  startIndex: number;     // Position in report text
  endIndex: number;       // Position in report text
  context: string;        // Surrounding sentence for context
  isAnomaly: boolean;     // LLM's assessment: is this a clinical finding/anomaly?
  correctionType?: "exact" | "whitespace" | "resolved"; // How position was matched
  resolutionNote?: string; // Human-readable description of the correction
}

export interface ParseResult {
  reportId: string;
  reportText: string;
  parsedTerms: ParsedTerm[];
  parserModel: string;    // e.g. "gpt-5.4"
  parseTimeMs: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
}

export type TermStatus = "pending" | "accepted" | "rejected" | "added";

export interface ReviewableTerm extends ParsedTerm {
  status: TermStatus;
}

export type ReviewDecision = "keep" | "skip";

export interface ReviewDecisionRecord extends ParsedTerm {
  decision: ReviewDecision;
  reviewedAt: string;
}
