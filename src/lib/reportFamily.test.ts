import { describe, it, expect } from "vitest";
import { classifyReportFamily, familyPreamble } from "@/lib/reportFamily";

describe("classifyReportFamily", () => {
  it("F1 when EXTRACORONARY CARDIOVASCULAR is present", () => {
    const t = `FINDINGS:\nCORONARY ARTERIES:\nLeft Main: Patent.\nEXTRACORONARY CARDIOVASCULAR\nHeart: Normal in size.`;
    expect(classifyReportFamily(t)).toBe("F1_extracoronary_cv");
  });

  it("F2 when REMAINING CHEST is present", () => {
    const t = `FINDINGS:\nCORONARY ARTERIES:\nLeft main: Anomalous origin.\nREMAINING CHEST:\nLung parenchyma: clear.`;
    expect(classifyReportFamily(t)).toBe("F2_remaining_chest");
  });

  it("F2 also when only REMAINING CARDIOVASCULAR STRUCTURES is present", () => {
    const t = `CORONARY ARTERIES:\nRight: anomalous.\nREMAINING CARDIOVASCULAR STRUCTURES:\nHeart: normal.`;
    expect(classifyReportFamily(t)).toBe("F2_remaining_chest");
  });

  it("F3 when Visualized lungs is present", () => {
    const t = `FINDINGS:\nVisualized lungs: Clear.\nCORONARY ARTERIES:\nProximal LAD: Normal.`;
    expect(classifyReportFamily(t)).toBe("F3_visualized_lungs");
  });

  it("F4 when SEGMENTAL ANALYSIS is present", () => {
    const t = `CORONARY ARTERIES:\nRight: anomalous.\nEXTRACORONARY SEGMENTAL ANALYSIS:\nSitus: solitus.`;
    expect(classifyReportFamily(t)).toBe("F4_segmental_analysis");
  });

  it("F5 when no signature header matches", () => {
    const t = `CLINICAL INDICATION: eval coronaries.\nCORONARY ARTERY ANGIOGRAM FINDINGS:\nRCA: aberrant origin.`;
    expect(classifyReportFamily(t)).toBe("F5_other_prose");
  });

  it("priority: EXTRACORONARY CARDIOVASCULAR wins over a stray segmental mention", () => {
    const t = `EXTRACORONARY CARDIOVASCULAR\nSEGMENTAL ANALYSIS mentioned in passing.`;
    expect(classifyReportFamily(t)).toBe("F1_extracoronary_cv");
  });

  it("preamble is empty only for F5", () => {
    expect(familyPreamble("F5_other_prose")).toBe("");
    expect(familyPreamble("F2_remaining_chest").length).toBeGreaterThan(0);
  });
});
