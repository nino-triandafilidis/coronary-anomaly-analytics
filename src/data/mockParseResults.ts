// Type definitions for the parse pipeline.
//
// NOTE: this file used to also export hand-written mock ParseResult data for
// the previous MIMIC sample reports. Those mocks were removed when we replaced
// the samples with real coronary CTAs (real_cta/CTA_*.pdf) — the offsets and
// term lists no longer made sense, and the silent mock-fallback path in the
// orchestrator was hiding real LLM failures from the UI. The orchestrator now
// always calls a live LLM, and surfaces errors to the user instead of falling
// back to canned data.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Whether the radiologist asserted the finding as present or ruled it out. */
export type Assertion = "asserted" | "negated";

export interface ParsedTerm {
  term: string;           // The exact text span found in the report
  normalizedName: string; // Canonical/normalized name (e.g. "Pulmonary Embolism")
  category: string;       // e.g. "Pulmonary", "Cardiac", "Vascular" (kept for legacy Gemini path)
  assertion: Assertion;   // "asserted" = present, "negated" = ruled out
  confidence: number;     // Kept for backward compat — always 1
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
  parserModel: string;    // e.g. "claude-sonnet-4-6", "gemini-2.5-flash"
  verifierModel: string;  // e.g. "gemini-2.5-flash" (Gemini path only)
  verifierAgreement: number; // 0-1, how much verifier agreed with parser (Gemini path only)
  parseTimeMs: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
  /** Raw terms the parser returned that couldn't be position-resolved (Gemini path only) */
  unresolvedRawTerms?: UnresolvedRawTerm[];
}

export interface UnresolvedRawTerm {
  term: string;
  normalizedName: string;
  category: string;
  assertion: Assertion;
  isAnomaly: boolean;
  context: string;
}

export type TermStatus = "pending" | "accepted" | "rejected" | "added";

export interface ReviewableTerm extends ParsedTerm {
  status: TermStatus;
}
