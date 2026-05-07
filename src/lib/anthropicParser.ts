/**
 * Single-call CTA parser using Anthropic Claude.
 *
 * Replaces the legacy 3-call Gemini pipeline (parser → resolver → verifier)
 * with one Claude call that uses tool-use for forced JSON output. Returns the
 * same `ParseResult` shape as the Gemini orchestrator so the UI is provider-
 * agnostic.
 *
 * Position resolution against the source text uses the shared two-pass
 * matcher in src/lib/positionResolver.ts (exact + whitespace-normalized).
 *
 * The prompt is in src/lib/prompts/anthropicParser.prompt.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ParsedTerm, ParseResult, Assertion } from "@/data/mockParseResults";
import { ANTHROPIC_PARSER_PROMPT } from "@/lib/prompts/anthropicParser.prompt";
import { findTermPosition } from "@/lib/positionResolver";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL_NAME = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

// Pricing per 1M tokens for Claude Sonnet 4.6.
// Update if Anthropic publishes different rates.
const INPUT_COST_PER_TOKEN = 3.00 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15.00 / 1_000_000;

// ---------------------------------------------------------------------------
// Tool schema — forces structured JSON output
// ---------------------------------------------------------------------------

const RECORD_FINDINGS_TOOL: Anthropic.Tool = {
  name: "record_findings",
  description:
    "Record every clinically relevant term extracted from the CTA report, " +
    "with assertion status and verbatim source text.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        description: "Every clinically relevant term in the report.",
        items: {
          type: "object",
          properties: {
            verbatimText: {
              type: "string",
              description:
                "Exact substring of the report text — character-for-character, " +
                "preserving case, punctuation, line breaks, and any typos.",
            },
            normalizedName: {
              type: "string",
              description: "Canonical name in Title Case (e.g. 'Pericardial Effusion').",
            },
            assertion: {
              type: "string",
              enum: ["asserted", "negated"],
              description:
                "'asserted' if the radiologist reports the finding as present; " +
                "'negated' if the radiologist explicitly rules it out " +
                "(e.g. 'no pericardial effusion').",
            },
            context: {
              type: "string",
              description: "The full sentence containing the term.",
            },
          },
          required: ["verbatimText", "normalizedName", "assertion", "context"],
        },
      },
    },
    required: ["findings"],
  },
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your Anthropic API key."
    );
  }

  _client = new Anthropic({
    apiKey,
    // Required for browser use. Production deployments should proxy through a backend.
    dangerouslyAllowBrowser: true,
  });
  return _client;
}

// ---------------------------------------------------------------------------
// Tool input shape (matches the schema above)
// ---------------------------------------------------------------------------

interface ToolFinding {
  verbatimText: string;
  normalizedName: string;
  assertion: Assertion;
  context: string;
}

interface ToolInput {
  findings: ToolFinding[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a CTA report with Claude in a single tool-use call.
 * Position-resolves all returned terms against the source text and drops
 * any that cannot be located (these are reported in the console but never
 * reach the UI — we never paint highlights at incorrect offsets).
 */
export async function parseWithAnthropic(reportText: string): Promise<ParseResult> {
  const client = getClient();
  const startTime = performance.now();

  console.group("🤖 [AnthropicParser] Calling Claude...");
  console.log("Model:", MODEL_NAME);
  console.log("Report length:", reportText.length, "chars");

  const response = await client.messages.create({
    model: MODEL_NAME,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: ANTHROPIC_PARSER_PROMPT,
    tools: [RECORD_FINDINGS_TOOL],
    tool_choice: { type: "tool", name: "record_findings" },
    messages: [
      {
        role: "user",
        content: `REPORT:\n\n${reportText}`,
      },
    ],
  });

  const elapsed = Math.round(performance.now() - startTime);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const totalTokens = inputTokens + outputTokens;
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  console.log(
    `⏱ ${elapsed}ms | 📊 ${inputTokens}+${outputTokens} tokens | 💲 $${cost.toFixed(5)}`
  );

  // Extract the tool_use block. With tool_choice forcing this tool, Claude
  // must respond with exactly one tool_use block.
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    console.error("❌ Claude did not return a tool_use block:", response.content);
    console.groupEnd();
    throw new Error(
      "Anthropic parser: response contained no tool_use block. " +
        "This is unexpected with forced tool_choice."
    );
  }

  const toolInput = toolUseBlock.input as ToolInput;
  const findings = Array.isArray(toolInput?.findings) ? toolInput.findings : [];

  console.log(`📋 Claude returned ${findings.length} findings`);

  // ---------------------------------------------------------------
  // Position-resolve every finding back to source text
  // ---------------------------------------------------------------
  const usedPositions = new Set<number>();
  const parsedTerms: ParsedTerm[] = [];
  const dropped: { verbatimText: string; reason: string }[] = [];
  let whitespaceFixCount = 0;

  for (const f of findings) {
    if (!f.verbatimText) {
      dropped.push({ verbatimText: "(empty)", reason: "missing verbatimText" });
      continue;
    }

    let searchAfter = 0;
    let pos = findTermPosition(reportText, f.verbatimText, searchAfter);

    // Skip already-claimed start positions so duplicates can each find their own
    // occurrence (e.g. same finding appears in FINDINGS and IMPRESSION).
    while (pos && usedPositions.has(pos.startIndex)) {
      searchAfter = pos.startIndex + 1;
      pos = findTermPosition(reportText, f.verbatimText, searchAfter);
    }

    if (!pos) {
      dropped.push({
        verbatimText: f.verbatimText,
        reason: "no exact or whitespace-normalized match in source",
      });
      continue;
    }

    usedPositions.add(pos.startIndex);
    if (pos.correctionType === "whitespace") whitespaceFixCount++;

    parsedTerms.push({
      term: reportText.substring(pos.startIndex, pos.endIndex),
      normalizedName: f.normalizedName || f.verbatimText,
      assertion: f.assertion === "negated" ? "negated" : "asserted",
      confidence: 1,
      startIndex: pos.startIndex,
      endIndex: pos.endIndex,
      context: f.context || "",
      isAnomaly: true,
      correctionType: pos.correctionType,
      resolutionNote:
        pos.correctionType === "whitespace"
          ? "Matched after normalizing whitespace/line breaks"
          : undefined,
    });
  }

  if (dropped.length > 0) {
    console.warn(`⚠ Dropped ${dropped.length} unresolvable findings:`);
    console.table(
      dropped.map((d) => ({
        text: d.verbatimText.slice(0, 50),
        reason: d.reason,
      }))
    );
  }
  if (whitespaceFixCount > 0) {
    console.log(`🔧 ${whitespaceFixCount} terms matched via whitespace normalization`);
  }
  console.log(`✅ ${parsedTerms.length} terms resolved to positions`);

  const assertedCount = parsedTerms.filter((t) => t.assertion === "asserted").length;
  const negatedCount = parsedTerms.filter((t) => t.assertion === "negated").length;
  console.log(`   ${assertedCount} asserted | ${negatedCount} negated`);

  console.table(
    parsedTerms.map((t) => ({
      term: t.term.slice(0, 40),
      normalized: t.normalizedName.slice(0, 30),
      assertion: t.assertion,
      pos: `${t.startIndex}-${t.endIndex}`,
      match: t.correctionType ?? "exact",
    }))
  );
  console.groupEnd();

  parsedTerms.sort((a, b) => a.startIndex - b.startIndex);

  return {
    reportId: crypto.randomUUID(),
    reportText,
    parsedTerms,
    parserModel: MODEL_NAME,
    parseTimeMs: elapsed,
    totalTokensUsed: totalTokens,
    estimatedCostUsd: cost,
  };
}

/**
 * Estimate the cost of an Anthropic parse call (without actually making it).
 * Used by the cost guard in parsingOrchestrator.ts.
 */
export function estimateAnthropicCost(reportText: string): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
} {
  const promptTokens = Math.ceil(ANTHROPIC_PARSER_PROMPT.length / 4);
  const reportTokens = Math.ceil(reportText.length / 4);
  // Tool schema overhead (~300 tokens for the schema itself)
  const schemaTokens = 300;
  const estimatedInputTokens = promptTokens + reportTokens + schemaTokens;
  // Output is structured JSON; budget ~30% of input as the output ceiling.
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.3);
  const estimatedCostUsd =
    estimatedInputTokens * INPUT_COST_PER_TOKEN +
    estimatedOutputTokens * OUTPUT_COST_PER_TOKEN;

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd };
}
