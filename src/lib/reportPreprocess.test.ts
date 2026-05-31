import { describe, it, expect } from "vitest";
import {
  prepareForExtraction,
  FENCE_OPEN,
  FENCE_CLOSE,
} from "@/lib/reportPreprocess";

const F2_REPORT = `NARRATIVE:
CLINICAL HISTORY: 71 years of age, Male, ANOMALOUS LMCA TAKE OFF FROM RIGHT SINUS.
PROCEDURE COMMENTS:
Estimated cumulative dose or total dose-length-product (DLP) is: 347 mGy-cm.
FINDINGS:
CORONARY ARTERIES:
Left main: Anomalous origin of the left main arises from the right coronary cusp.
Right: Atherosclerotic calcifications with no significant narrowing.
REMAINING CHEST:
Lymph nodes: No supraclavicular lymphadenopathy.
Lung parenchyma: Right basilar atelectasis.
Bones: No aggressive osseous lesions.
IMPRESSION:
1. Anomalous origin of the left main arising from right cusp.
Signed
ACCESSION NUMBER:
SHS-48933
All dates have been shifted by a fixed per-patient offset for PHI masking`;

describe("prepareForExtraction — boilerplate stripping", () => {
  it("removes the PHI-masking footer, dose line, signature and accession", () => {
    const { extractionText, strippedLines } = prepareForExtraction(
      F2_REPORT,
      "F2_remaining_chest"
    );
    expect(extractionText).not.toContain("PHI masking");
    expect(extractionText).not.toContain("DLP");
    expect(extractionText).not.toContain("SHS-48933");
    expect(extractionText).not.toMatch(/^Signed$/m);
    expect(strippedLines).toBeGreaterThanOrEqual(4);
  });

  it("keeps the coronary findings and impression in scope", () => {
    const { extractionText } = prepareForExtraction(F2_REPORT, "F2_remaining_chest");
    expect(extractionText).toContain(
      "Anomalous origin of the left main arises from the right coronary cusp"
    );
    expect(extractionText).toContain("IMPRESSION:");
  });

  it("strips the per-vessel calcium-score numeric table", () => {
    const t = `FINDINGS:\nCALCIUM SCORE:\nLAD: Number of lesions = 0; volume (mm^3) = 0; calcium score = 0.\nCORONARY ARTERY ANGIOGRAM FINDINGS:\nRCA: aberrant origin.`;
    const { extractionText } = prepareForExtraction(t, "F5_other_prose");
    expect(extractionText).not.toContain("Number of lesions");
    expect(extractionText).toContain("aberrant origin");
  });
});

describe("prepareForExtraction — distractor fencing", () => {
  it("fences the REMAINING CHEST survey block", () => {
    const { extractionText, fencedSections } = prepareForExtraction(
      F2_REPORT,
      "F2_remaining_chest"
    );
    expect(extractionText).toContain(FENCE_OPEN);
    expect(extractionText).toContain(FENCE_CLOSE);
    // The atelectasis survey line is inside a fence, the anomaly line is not.
    const fenceStart = extractionText.indexOf(FENCE_OPEN);
    const fenceEnd = extractionText.indexOf(FENCE_CLOSE);
    const atel = extractionText.indexOf("Right basilar atelectasis");
    const anomaly = extractionText.indexOf("Anomalous origin of the left main");
    expect(atel).toBeGreaterThan(fenceStart);
    expect(atel).toBeLessThan(fenceEnd);
    expect(anomaly).toBeLessThan(fenceStart);
    expect(fencedSections.length).toBeGreaterThan(0);
  });

  it("closes the fence when IMPRESSION starts so the impression stays extractable", () => {
    const { extractionText } = prepareForExtraction(F2_REPORT, "F2_remaining_chest");
    const fenceEnd = extractionText.indexOf(FENCE_CLOSE);
    const impression = extractionText.indexOf("IMPRESSION:");
    expect(impression).toBeGreaterThan(fenceEnd);
  });

  it("does NOT fence segmental analysis for F4 (it can carry coronary anatomy)", () => {
    const f4 = `CORONARY ARTERIES:\nRight: anomalous RCA from left sinus.\nEXTRACORONARY SEGMENTAL ANALYSIS:\nCavae: left SVC drains to the coronary sinus.\nOTHER\nBones: No aggressive osseous lesions.`;
    const { extractionText } = prepareForExtraction(f4, "F4_segmental_analysis");
    expect(extractionText).not.toContain(FENCE_OPEN);
    expect(extractionText).toContain("left SVC drains to the coronary sinus");
  });
});
