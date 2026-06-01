import { describe, expect, it } from "vitest";
import { joinPdfTextItems } from "./pdfText";

describe("joinPdfTextItems", () => {
  it("preserves PDF line endings while keeping spaces between inline items", () => {
    expect(
      joinPdfTextItems([
        { str: "CLINICAL", hasEOL: false },
        { str: "HISTORY:", hasEOL: true },
        { str: "Anomalous", hasEOL: false },
        { str: "coronary", hasEOL: true },
        { str: "COMPARISON:", hasEOL: false },
        { str: "None", hasEOL: false },
      ])
    ).toBe("CLINICAL HISTORY:\nAnomalous coronary\nCOMPARISON: None");
  });

  it("ignores non-text PDF items", () => {
    expect(joinPdfTextItems([{ type: "beginMarkedContent" }, { str: "Text" }])).toBe(
      "Text"
    );
  });
});
