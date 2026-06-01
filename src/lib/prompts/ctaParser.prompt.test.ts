import { describe, expect, it } from "vitest";
import { CTA_PARSER_PROMPT, CTA_PARSER_SECTIONS } from "./ctaParser.prompt";
import { buildPrompt } from "./promptSection";

// Locks the section scaffolding from the carve-out PR: section bodies may change
// as we tune prompt content, but the set, order, and assembly of sections must
// not. If a content change here also changes structure, this test should fail.
const EXPECTED_SECTION_IDS = [
  "role",
  "task",
  "negated-filtering",
  "priority-paper-features",
  "anomalous-left-subtypes",
  "term-definition",
  "coronary-modifiers",
  "myocardial-bridge-summary",
  "interarterial-course-lengths",
  "intramural-course-lengths",
  "measurements",
  "exclusions",
  "assertion-decision",
  "partial-negation",
  "deduplication",
  "exact-text-rule",
  "output",
];

describe("CTA_PARSER_PROMPT", () => {
  it("keeps the section set and order intact", () => {
    expect(CTA_PARSER_SECTIONS.map((section) => section.id)).toEqual(
      EXPECTED_SECTION_IDS
    );
  });

  it("is the section list joined by buildPrompt", () => {
    expect(CTA_PARSER_PROMPT).toBe(buildPrompt(CTA_PARSER_SECTIONS));
  });

  it("carries no stray edge newlines in bodies or titles", () => {
    for (const section of CTA_PARSER_SECTIONS) {
      expect(section.body.length).toBeGreaterThan(0);
      expect(section.body.startsWith("\n")).toBe(false);
      expect(section.body.endsWith("\n")).toBe(false);
      if (section.title !== undefined) {
        expect(section.title.includes("\n")).toBe(false);
      }
    }
  });
});
