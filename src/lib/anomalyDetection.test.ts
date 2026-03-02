import { describe, it, expect } from "vitest";
import { detectAnomalies, getUniqueAnomalies } from "./anomalyDetection";

describe("anomalyDetection", () => {
  it("does not match 'PE' inside words like PERFORMED or PERSPECTIVE", () => {
    const text = "Study was PERFORMED. No PE seen. PERSPECTIVE is limited.";
    const detected = detectAnomalies(text);
    const peMatches = detected.filter(
      (d) => d.entry.term === "Pulmonary embolism" && d.term.toLowerCase() === "pe"
    );
    // "PE" as standalone (uppercase) may match if we add it; lowercase "pe" in words must not
    const inWordMatches = detected.filter(
      (d) =>
        (d.term === "pe" || d.term === "PE") &&
        text.substring(d.startIndex - 1, d.endIndex + 1).match(/[a-zA-Z]/)
    );
    expect(inWordMatches.length).toBe(0);
  });

  it("matches specific 'coronary artery stenosis' over generic 'stenosis'", () => {
    const text = "Findings: coronary artery stenosis in the LAD.";
    const detected = detectAnomalies(text);
    const stenosisMatches = detected.filter((d) =>
      d.entry.term.toLowerCase().includes("stenosis")
    );
    // Should prefer the longer specific term
    const hasCoronaryStenosis = detected.some(
      (d) => d.entry.term === "Coronary artery stenosis"
    );
    const genericOnly = detected.filter((d) => d.entry.term === "Stenosis");
    expect(hasCoronaryStenosis).toBe(true);
    // Generic "Stenosis" should not appear as a separate overlapping match
    expect(genericOnly.length).toBe(0);
  });

  it("detects anomalies and returns unique entries", () => {
    const text = "Pulmonary embolism and pleural effusion.";
    const detected = detectAnomalies(text);
    expect(detected.length).toBeGreaterThanOrEqual(2);
    const unique = getUniqueAnomalies(detected);
    expect(unique.length).toBe(2);
  });
});
