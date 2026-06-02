import { describe, expect, it } from "vitest";
import {
  contributorsToCsv,
  distinctReportCount,
  groupContributorsByPhrasing,
  normalizePhrase,
  type ProvenanceContributor,
} from "@/lib/provenance";

const c = (
  reportId: string,
  matchedText: string,
  extra: Partial<ProvenanceContributor> = {}
): ProvenanceContributor => ({ reportId, matchedText, ...extra });

describe("normalizePhrase", () => {
  it("lowercases, trims, strips wrapping quotes, collapses whitespace", () => {
    expect(normalizePhrase('  “Interarterial   Course” ')).toBe("interarterial course");
  });
});

describe("groupContributorsByPhrasing", () => {
  it("groups case- and whitespace-insensitively and counts each group", () => {
    const groups = groupContributorsByPhrasing([
      c("R1", "interarterial course"),
      c("R2", "Interarterial  course"),
      c("R3", "IA course"),
    ]);
    expect(groups).toHaveLength(2);
    const top = groups[0];
    expect(top.count).toBe(2);
    expect(normalizePhrase(top.phrase)).toBe("interarterial course");
  });

  it("sorts groups by descending count", () => {
    const groups = groupContributorsByPhrasing([
      c("R1", "alpha"),
      c("R2", "beta"),
      c("R3", "beta"),
    ]);
    expect(groups.map((g) => g.phrase)).toEqual(["beta", "alpha"]);
  });

  it("picks the most frequent original casing as the display phrase", () => {
    const groups = groupContributorsByPhrasing([
      c("R1", "IA course"),
      c("R2", "ia course"),
      c("R3", "ia course"),
    ]);
    expect(groups[0].phrase).toBe("ia course");
  });
});

describe("distinctReportCount", () => {
  it("counts unique report ids, not occurrences", () => {
    expect(
      distinctReportCount([c("R1", "x"), c("R1", "y"), c("R2", "z")])
    ).toBe(2);
  });
});

describe("contributorsToCsv", () => {
  it("emits a header and escapes embedded quotes", () => {
    const csv = contributorsToCsv("interarterial course", [
      c("R1", 'says "hi"', { assertion: "asserted", context: "a, b" }),
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("feature,report_id,assertion,matched_text,context");
    expect(row).toBe(
      '"interarterial course","R1","asserted","says ""hi""","a, b"'
    );
  });
});
