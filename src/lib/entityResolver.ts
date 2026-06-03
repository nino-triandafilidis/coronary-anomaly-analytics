/**
 * LLM entity-linking resolver (#66).
 *
 * Maps a free-text finding (normalizedName + context) to exactly one paper
 * entity id, or "none", using the generated entity catalog as the label space
 * and golden examples as few-shot anchors.
 *
 * Decided approach (#66): a post-extraction pass, resolved once per distinct
 * normalizedName and cached, NOT folded into the parser. Contract: resolve the
 * clinical concept from the name AND its context, not the surface name.
 *
 * The module is split so the logic is testable without a network call:
 *   - buildResolverInstructions() / RESOLVER_TOOL_SCHEMA: the prompt + output
 *     contract (pure).
 *   - parseResolverOutput(): map raw model output to validated ids (pure).
 *   - resolveDistinctEntities(): dedup + cache + batch orchestration, taking an
 *     injected `resolveBatch` so tests pass a fake and the app/script pass the
 *     real OpenAI client.
 *   - createOpenAIResolver(): the real browser client (Responses API), mirroring
 *     src/lib/openaiParser.ts.
 */

import { buildEntityCatalog, NONE_LABEL, RESOLVER_LABELS } from "@/data/entityCatalog";
import { RESOLVER_GOLDEN_SET } from "@/data/resolverGoldenSet";

const RESOLVER_LABEL_SET = new Set<string>(RESOLVER_LABELS);

export interface ResolverInput {
  normalizedName: string;
  context?: string;
}

/** Canonical cache / map key for a finding: case- and whitespace-insensitive. */
export function resolverKey(normalizedName: string): string {
  return normalizedName.trim().toLowerCase().replace(/\s+/g, " ");
}

// Few-shot anchors, drawn from the golden set: a spread of plain collapses plus
// the boundary calls (normal-vs-anomalous, intramuscular-vs-intramural, the
// context-over-surface-name STJ case, a dictation typo, a negated mapping).
const FEW_SHOT_NAMES = new Set(
  [
    "Right Dominant Coronary Circulation",
    "Origin of Left Main Coronary Artery from Left Coronary Cusp",
    "Intramuscular course of left main coronary artery, 27 mm",
    "sinotubular junction",
    "Interatrial Course of Proximal RCA Between Aorta and Right Ventricle",
    "Mild Coronary Plaque",
    "Anomalous Origin of Left Circumflex Artery",
  ].map(resolverKey)
);

export const RESOLVER_FEW_SHOTS = RESOLVER_GOLDEN_SET.filter((ex) =>
  FEW_SHOT_NAMES.has(resolverKey(ex.normalizedName))
);

/**
 * Build the resolver system prompt: the contract, the entity catalog (generated
 * from PAPER_FEATURES), the `none` label, and the few-shot anchors.
 */
export function buildResolverInstructions(): string {
  const examples = RESOLVER_FEW_SHOTS.map(
    (ex) => `- "${ex.normalizedName}" (context: "${ex.context}") -> ${ex.expected}`
  ).join("\n");

  return [
    "You label one coronary CTA finding with exactly one entity id from the list",
    'below, or "none". Decide the clinical concept from the finding\'s name AND its',
    "context; do not match on surface words alone.",
    "",
    "ENTITIES (id — definition [category]):",
    buildEntityCatalog(),
    `${NONE_LABEL} — normal anatomy, or anything outside this set`,
    "",
    "EXAMPLES:",
    examples,
    "",
    "For each input finding, given with its 0-based index, return its single best",
    "entity id from the list above. Use the index to align your answers.",
  ].join("\n");
}

/** Strict output schema: one {index, id} per input, id constrained to the labels. */
export const RESOLVER_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      description: "One entry per input finding.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: {
            type: "integer",
            minimum: 0,
            description: "0-based index of the input finding this answer is for.",
          },
          id: {
            type: "string",
            enum: RESOLVER_LABELS,
            description: 'The single best entity id, or "none".',
          },
        },
        required: ["index", "id"],
      },
    },
  },
  required: ["results"],
};

/**
 * Map raw model output to a validated id per input, aligned by index. Unknown or
 * missing ids fall back to "none" so a bad model response never invents a label.
 */
export function parseResolverOutput(raw: unknown, batch: ResolverInput[]): string[] {
  const ids: string[] = batch.map(() => NONE_LABEL);
  const results = (raw as { results?: Array<{ index?: number; id?: string }> } | null)?.results;
  if (!Array.isArray(results)) return ids;

  for (const r of results) {
    const i = r?.index;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= batch.length) continue;
    ids[i] = r.id && RESOLVER_LABEL_SET.has(r.id) ? r.id : NONE_LABEL;
  }
  return ids;
}

/** Resolve one batch of findings to raw tool output (the parsed function args). */
export type ResolveBatch = (batch: ResolverInput[]) => Promise<unknown>;

export interface ResolveOptions {
  /** Reused across calls; keyed by resolverKey(normalizedName). */
  cache?: Map<string, string>;
  /** Findings per LLM call. */
  batchSize?: number;
}

/**
 * Resolve a list of findings to entity ids. Dedups by resolverKey so each
 * distinct wording is resolved once, skips anything already cached, batches the
 * rest through `resolveBatch`, and returns a map keyed by resolverKey.
 */
export async function resolveDistinctEntities(
  inputs: ResolverInput[],
  resolveBatch: ResolveBatch,
  opts: ResolveOptions = {}
): Promise<Map<string, string>> {
  const cache = opts.cache ?? new Map<string, string>();
  const batchSize = Math.max(1, opts.batchSize ?? 25);

  // Dedup by key, keeping the first context seen for each wording.
  const byKey = new Map<string, ResolverInput>();
  for (const input of inputs) {
    const key = resolverKey(input.normalizedName);
    if (key && !byKey.has(key)) byKey.set(key, input);
  }

  const uncached = [...byKey.entries()].filter(([key]) => !cache.has(key));
  for (let i = 0; i < uncached.length; i += batchSize) {
    const chunk = uncached.slice(i, i + batchSize);
    const batch = chunk.map(([, input]) => input);
    const ids = parseResolverOutput(await resolveBatch(batch), batch);
    chunk.forEach(([key], j) => cache.set(key, ids[j]));
  }

  const out = new Map<string, string>();
  for (const key of byKey.keys()) out.set(key, cache.get(key) ?? NONE_LABEL);
  return out;
}

// ---------------------------------------------------------------------------
// Real browser client (Responses API), mirroring src/lib/openaiParser.ts.
// Not unit-tested (network I/O); the logic above is.
// ---------------------------------------------------------------------------

const RESOLVER_TOOL = {
  type: "function",
  name: "record_resolutions",
  description: "Map each input finding to exactly one entity id, or none.",
  parameters: RESOLVER_TOOL_SCHEMA,
  strict: true,
};

export function createOpenAIResolver(opts?: { model?: string; maxOutputTokens?: number }): ResolveBatch {
  const model = opts?.model ?? "gpt-5.4";
  const maxOutputTokens = opts?.maxOutputTokens ?? 4096;
  const instructions = buildResolverInstructions();

  return async (batch) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VITE_OPENAI_API_KEY is not set. Copy .env.example to .env and add your OpenAI API key."
      );
    }

    const payload = batch
      .map((b, i) => `[${i}] name: ${b.normalizedName}\n    context: ${b.context ?? ""}`)
      .join("\n");

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: `FINDINGS:\n${payload}` }] }],
        tools: [RESOLVER_TOOL],
        tool_choice: { type: "function", name: "record_resolutions" },
        parallel_tool_calls: false,
        max_output_tokens: maxOutputTokens,
      }),
    });

    const json = (await res.json()) as {
      output?: Array<{ type: string; name?: string; arguments?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(`Entity resolver failed: ${json?.error?.message ?? res.statusText}`);
    }
    const call = json.output?.find(
      (o) => o.type === "function_call" && o.name === "record_resolutions"
    );
    if (!call?.arguments) {
      throw new Error("Entity resolver: response contained no record_resolutions function call.");
    }
    return JSON.parse(call.arguments);
  };
}
