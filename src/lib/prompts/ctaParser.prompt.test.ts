import { describe, expect, it } from "vitest";
import { CTA_PARSER_PROMPT, CTA_PARSER_SECTIONS } from "./ctaParser.prompt";
import { buildPrompt } from "./promptSection";
import { ORIGINAL_CTA_PARSER_PROMPT } from "./__fixtures__/originalCtaParserPrompt";

describe("CTA_PARSER_PROMPT", () => {
  it("is byte-identical to the pre-refactor prompt", () => {
    expect(CTA_PARSER_PROMPT).toBe(ORIGINAL_CTA_PARSER_PROMPT);
  });

  it("is the section list joined by buildPrompt", () => {
    expect(CTA_PARSER_PROMPT).toBe(buildPrompt(CTA_PARSER_SECTIONS));
  });
});

describe("CTA_PARSER_SECTIONS", () => {
  it("has unique, non-empty ids", () => {
    const ids = CTA_PARSER_SECTIONS.map((section) => section.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no stray edge newlines in section bodies or titles", () => {
    for (const section of CTA_PARSER_SECTIONS) {
      expect(section.body.length).toBeGreaterThan(0);
      expect(section.body.startsWith("\n")).toBe(false);
      expect(section.body.endsWith("\n")).toBe(false);
      if (section.title !== undefined) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.title.includes("\n")).toBe(false);
      }
    }
  });
});
