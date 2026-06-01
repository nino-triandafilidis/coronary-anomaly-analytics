/**
 * Minimal prompt scaffolding: a prompt is an ordered list of named sections,
 * joined into the final string. Carving the CTA parser prompt into sections
 * lets each block be edited or reordered in isolation (see ctaParser.prompt.ts).
 */

export interface PromptSection {
  /** Stable identifier for the block; used to locate and reorder sections. */
  id: string;
  /** Optional header line rendered above the body verbatim, e.g. "TASK". */
  title?: string;
  /** Section text. Rendered after the title line when a title is present. */
  body: string;
}

/**
 * Join sections into a single prompt string. A titled section renders as
 * `${title}\n${body}`; sections are separated by one blank line. This mirrors
 * the shape of the original hand-written prompt, so the assembled output is
 * byte-identical to it (locked by ctaParser.prompt.test.ts).
 */
export function buildPrompt(sections: readonly PromptSection[]): string {
  return sections
    .map((section) =>
      section.title ? `${section.title}\n${section.body}` : section.body
    )
    .join("\n\n");
}
