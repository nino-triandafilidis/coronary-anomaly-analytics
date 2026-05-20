/**
 * Single-call CTA parser using OpenAI GPT.
 *
 * Keeps the existing one-call workflow: the model receives the same system
 * prompt and is forced to call `record_findings`, producing the same
 * ParseResult shape consumed by the review UI.
 *
 * Position resolution against the source text uses the shared two-pass
 * matcher in src/lib/positionResolver.ts (exact + whitespace-normalized).
 *
 * The prompt is in src/lib/prompts/ctaParser.prompt.ts.
 */

import type { ParsedTerm, ParseResult, Assertion } from "@/data/parseTypes";
import { CTA_PARSER_PROMPT } from "@/lib/prompts/ctaParser.prompt";
import { findTermPosition } from "@/lib/positionResolver";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL_NAME = "gpt-5.4";
const MAX_TOKENS = 8192;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_REQUEST_TIMEOUT_MS = 120_000;

// Pricing placeholder per 1M tokens. Update these if your OpenAI account shows
// different GPT-5.4 rates.
const INPUT_COST_PER_TOKEN = 10.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 30.0 / 1_000_000;

// ---------------------------------------------------------------------------
// Tool schema: forces structured JSON output
// ---------------------------------------------------------------------------

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      description: "Every clinically relevant term in the report.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          verbatimText: {
            type: "string",
            description:
              "Exact substring of the report text, character-for-character, " +
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
} as const;

const RECORD_FINDINGS_TOOL = {
  type: "function",
  name: "record_findings",
  description:
    "Record every clinically relevant term extracted from the CTA report, " +
    "with assertion status and verbatim source text.",
  parameters: FINDINGS_SCHEMA,
  strict: true,
} as const;

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

interface OpenAIUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface OpenAIFunctionCall {
  type: "function_call";
  name: string;
  arguments: string;
}

interface OpenAIResponse {
  output?: Array<OpenAIFunctionCall | { type: string; [key: string]: unknown }>;
  usage?: OpenAIUsage;
  error?: { message?: string };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a CTA report with GPT in a single forced function call.
 * Position-resolves all returned terms against the source text and drops
 * any that cannot be located (these are reported in the console but never
 * reach the UI, so we never paint highlights at incorrect offsets).
 */
export async function parseWithOpenAI(reportText: string): Promise<ParseResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_OPENAI_API_KEY is not set. Copy .env.example to .env and add your OpenAI API key."
    );
  }

  const startTime = performance.now();

  console.group("[OpenAIParser] Calling GPT...");
  console.log("Model:", MODEL_NAME);
  console.log("Report length:", reportText.length, "chars");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    OPENAI_REQUEST_TIMEOUT_MS
  );

  let rawResponse: Response;
  try {
    rawResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        instructions: CTA_PARSER_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `REPORT:\n\n${reportText}`,
              },
            ],
          },
        ],
        tools: [RECORD_FINDINGS_TOOL],
        tool_choice: { type: "function", name: "record_findings" },
        parallel_tool_calls: false,
        max_output_tokens: MAX_TOKENS,
      }),
    });
  } catch (err) {
    console.groupEnd();
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `OpenAI parser timed out after ${OPENAI_REQUEST_TIMEOUT_MS / 1000} seconds. Please retry or use a shorter report.`
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const response = (await rawResponse.json()) as OpenAIResponse;
  if (!rawResponse.ok) {
    console.groupEnd();
    throw new Error(
      `OpenAI parser failed: ${response.error?.message ?? rawResponse.statusText}`
    );
  }

  const elapsed = Math.round(performance.now() - startTime);
  const functionCall = response.output?.find(
    (item): item is OpenAIFunctionCall =>
      item.type === "function_call" && item.name === "record_findings"
  );

  if (!functionCall) {
    console.error("GPT did not return a record_findings function call:", response.output);
    console.groupEnd();
    throw new Error(
      "OpenAI parser: response contained no record_findings function call. " +
        "This is unexpected with forced tool_choice."
    );
  }

  let toolInput: ToolInput;
  try {
    toolInput = JSON.parse(functionCall.arguments) as ToolInput;
  } catch (err) {
    console.error("Could not parse GPT function-call arguments:", functionCall.arguments);
    console.groupEnd();
    throw err;
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const totalTokens = response.usage?.total_tokens ?? inputTokens + outputTokens;
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  console.log(
    `${elapsed}ms | ${inputTokens}+${outputTokens} tokens | $${cost.toFixed(5)}`
  );

  const findings = Array.isArray(toolInput?.findings) ? toolInput.findings : [];

  console.log(`GPT returned ${findings.length} findings`);

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
    console.warn(`Dropped ${dropped.length} unresolvable findings:`);
    console.table(
      dropped.map((d) => ({
        text: d.verbatimText.slice(0, 50),
        reason: d.reason,
      }))
    );
  }
  if (whitespaceFixCount > 0) {
    console.log(`${whitespaceFixCount} terms matched via whitespace normalization`);
  }
  console.log(`${parsedTerms.length} terms resolved to positions`);

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
 * Estimate the cost of an OpenAI parse call (without actually making it).
 * Used by the cost guard in parsingOrchestrator.ts.
 */
export function estimateOpenAICost(reportText: string): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
} {
  const promptTokens = Math.ceil(CTA_PARSER_PROMPT.length / 4);
  const reportTokens = Math.ceil(reportText.length / 4);
  // Function schema overhead (~300 tokens for the schema itself)
  const schemaTokens = 300;
  const estimatedInputTokens = promptTokens + reportTokens + schemaTokens;
  // Output is structured JSON; budget ~30% of input as the output ceiling.
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.3);
  const estimatedCostUsd =
    estimatedInputTokens * INPUT_COST_PER_TOKEN +
    estimatedOutputTokens * OUTPUT_COST_PER_TOKEN;

  return { estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd };
}
