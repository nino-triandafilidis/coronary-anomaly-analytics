// Dev-only seed: writes synthetic parsed reports into parsed_reports/ so the
// Analysis page and the provenance drill-down (#63) have data to render.
// parsed_reports/ is gitignored. Run: node scripts/seed_parsed_reports.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const txtDir = path.join(root, "parsed_reports", "txt");
const jsonDir = path.join(root, "parsed_reports", "json");
const originalJsonDir = path.join(root, "parsed_reports", "original_json");

function sentenceAround(text, index, length) {
  const start = text.lastIndexOf(".", index) + 1;
  let end = text.indexOf(".", index + length);
  if (end < 0) end = text.length;
  return text.slice(start, end + 1).trim();
}

function buildTerms(text, specs) {
  return specs.flatMap((spec) => {
    const startIndex = text.indexOf(spec.term);
    if (startIndex < 0) return [];
    const endIndex = startIndex + spec.term.length;
    return [
      {
        term: spec.term,
        normalizedName: spec.normalizedName,
        assertion: spec.assertion ?? "asserted",
        confidence: 1,
        startIndex,
        endIndex,
        context: sentenceAround(text, startIndex, spec.term.length),
        isAnomaly: spec.isAnomaly ?? true,
      },
    ];
  });
}

// term phrasings deliberately vary ("interarterial course" / "inter-arterial
// course" / "IA course") to exercise the group-by-phrasing panel.
const reports = [
  {
    id: "CTA-001",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Anomalous right coronary artery arising from the left sinus with an interarterial course between the aorta and pulmonary trunk. Proximal vessel shows mild narrowing. A myocardial bridge is present in the mid LAD with systolic compression. No coronary fistula.`,
    terms: [
      { term: "interarterial course", normalizedName: "interarterial course" },
      { term: "myocardial bridge", normalizedName: "myocardial bridge" },
      { term: "coronary fistula", normalizedName: "coronary fistula", assertion: "negated" },
    ],
    bridges: [{ vessel: "LAD", segment: "mid", grade: 1, evidence: "myocardial bridge is present in the mid LAD with systolic compression" }],
    ia: [{ value: 6, raw: "interarterial segment measuring 6 mm", vessel: "RCA" }],
  },
  {
    id: "CTA-002",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Anomalous left coronary artery from the right sinus with an inter-arterial course. There is an intramural course at the ostium with a slit-like ostium. Myocardial bridge mid LAD, moderate systolic compression.`,
    terms: [
      { term: "inter-arterial course", normalizedName: "interarterial course" },
      { term: "intramural course", normalizedName: "intramural course" },
      { term: "slit-like ostium", normalizedName: "slit-like ostium" },
      { term: "Myocardial bridge", normalizedName: "myocardial bridge" },
    ],
    bridges: [{ vessel: "LAD", segment: "mid", grade: 2, evidence: "Myocardial bridge mid LAD, moderate systolic compression" }],
    ia: [{ value: 9, raw: "inter-arterial course over 9 mm", vessel: "LCA" }],
    im: [{ value: 4, raw: "intramural segment 4 mm", vessel: "LCA" }],
    subtypes: [{ subtype: "intramural_interarterial_left", raw: "intramural inter-arterial left coronary artery", vessel: "LCA" }],
  },
  {
    id: "CTA-003",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Right coronary artery with an IA course and an acute angle of takeoff. Intramural course noted. No myocardial bridge. Right dominance.`,
    terms: [
      { term: "IA course", normalizedName: "interarterial course" },
      { term: "acute angle of takeoff", normalizedName: "acute angle of takeoff" },
      { term: "intramural course", normalizedName: "intramural course" },
      { term: "myocardial bridge", normalizedName: "myocardial bridge", assertion: "negated" },
      { term: "Right dominance", normalizedName: "right dominance" },
    ],
    im: [{ value: 7, raw: "intramural course 7 mm", vessel: "RCA" }],
  },
  {
    id: "CTA-004",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Intraconal anomalous left coronary artery with an intraseptal course below the pulmonary valve. Two myocardial bridges in the LAD, the deeper one with severe compression. Interarterial course not present.`,
    terms: [
      { term: "intraseptal course", normalizedName: "intraseptal course" },
      { term: "myocardial bridges", normalizedName: "myocardial bridge" },
      { term: "Interarterial course", normalizedName: "interarterial course", assertion: "negated" },
    ],
    bridges: [
      { vessel: "LAD", segment: "mid", grade: 1, evidence: "myocardial bridge in the LAD" },
      { vessel: "LAD", segment: "distal", grade: 3, evidence: "deeper one with severe compression" },
    ],
    subtypes: [{ subtype: "intraconal_left", raw: "intraconal anomalous left coronary artery", vessel: "LCA" }],
  },
  {
    id: "CTA-005",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Anomalous RCA with interarterial course and intramural course; high-grade proximal narrowing. Myocardial bridge mid LAD with grade 2 compression. Codominance.`,
    terms: [
      { term: "interarterial course", normalizedName: "interarterial course" },
      { term: "intramural course", normalizedName: "intramural course" },
      { term: "Myocardial bridge", normalizedName: "myocardial bridge" },
      { term: "Codominance", normalizedName: "codominance" },
    ],
    bridges: [{ vessel: "LAD", segment: "mid", grade: 2, evidence: "Myocardial bridge mid LAD with grade 2 compression" }],
    ia: [{ value: 12, raw: "interarterial course 12 mm", vessel: "RCA" }],
    im: [{ value: 5, raw: "intramural course 5 mm", vessel: "RCA" }],
  },
  {
    id: "CTA-006",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Left circumflex anomalous origin with a retroaortic course. No interarterial course. Three myocardial bridges in the LAD. Left dominance.`,
    terms: [
      { term: "retroaortic course", normalizedName: "retroaortic course" },
      { term: "interarterial course", normalizedName: "interarterial course", assertion: "negated" },
      { term: "myocardial bridges", normalizedName: "myocardial bridge" },
      { term: "Left dominance", normalizedName: "left dominance" },
    ],
    bridges: [
      { vessel: "LAD", segment: "proximal", grade: 1, evidence: "bridge proximal LAD" },
      { vessel: "LAD", segment: "mid", grade: 1, evidence: "bridge mid LAD" },
      { vessel: "LAD", segment: "distal", grade: 1, evidence: "bridge distal LAD" },
    ],
  },
  {
    id: "CTA-007",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Anomalous RCA, interarterial course, intramural course with ellipticity at the ostium. No myocardial bridge identified.`,
    terms: [
      { term: "interarterial course", normalizedName: "interarterial course" },
      { term: "intramural course", normalizedName: "intramural course" },
      { term: "ellipticity", normalizedName: "ellipticity" },
      { term: "myocardial bridge", normalizedName: "myocardial bridge", assertion: "negated" },
    ],
    ia: [{ value: 8, raw: "interarterial course 8 mm", vessel: "RCA" }],
    im: [{ value: 14, raw: "intramural course 14 mm", vessel: "RCA" }],
  },
  {
    id: "CTA-008",
    text: `CTA CORONARY ARTERIES.\nFINDINGS: Intramural inter-arterial left coronary artery. IA course confirmed. Myocardial bridge mid LAD, mild. Round ostium.`,
    terms: [
      { term: "IA course", normalizedName: "interarterial course" },
      { term: "Myocardial bridge", normalizedName: "myocardial bridge" },
      { term: "Round ostium", normalizedName: "round ostium" },
    ],
    bridges: [{ vessel: "LAD", segment: "mid", grade: 1, evidence: "Myocardial bridge mid LAD, mild" }],
    subtypes: [{ subtype: "intramural_interarterial_left", raw: "Intramural inter-arterial left coronary artery", vessel: "LCA" }],
    ia: [{ value: 11, raw: "IA course 11 mm", vessel: "LCA" }],
  },
];

function toParseResult(report) {
  const bridges = (report.bridges ?? []).map((b, i) => ({
    bridgeIndex: i + 1,
    vessel: b.vessel,
    segment: b.segment,
    grade: b.grade ?? null,
    lengthMm: null,
    depthMm: null,
    evidenceText: b.evidence ?? "",
  }));
  const grades = bridges.map((b) => b.grade).filter((g) => g === 1 || g === 2 || g === 3);
  return {
    reportId: report.id,
    reportText: report.text,
    parsedTerms: buildTerms(report.text, report.terms),
    myocardialBridgeSummary: {
      bridgeCount: bridges.length,
      highestGrade: grades.length ? Math.max(...grades) : null,
      bridges,
    },
    interarterialCourseLengths: (report.ia ?? []).map((m) => ({ value: m.value, unit: "mm", rawText: m.raw, vessel: m.vessel })),
    intramuralCourseLengths: (report.im ?? []).map((m) => ({ value: m.value, unit: "mm", rawText: m.raw, vessel: m.vessel })),
    anomalousLeftSubtypes: (report.subtypes ?? []).map((s) => ({ subtype: s.subtype, vessel: s.vessel, rawText: s.raw })),
    parserModel: "seed-script",
    parseTimeMs: 0,
    totalTokensUsed: 0,
    estimatedCostUsd: 0,
  };
}

async function main() {
  await fs.mkdir(txtDir, { recursive: true });
  await fs.mkdir(jsonDir, { recursive: true });
  await fs.mkdir(originalJsonDir, { recursive: true });

  const storedAt = "2026-06-01T00:00:00.000Z";
  for (const report of reports) {
    const parseResult = toParseResult(report);
    const payload = {
      id: report.id,
      textFile: `parsed_reports/txt/${report.id}.txt`,
      jsonFile: `parsed_reports/json/${report.id}.json`,
      originalJsonFile: `parsed_reports/original_json/${report.id}.json`,
      storedAt,
      reviewed: true,
      text: report.text,
      parseResult,
      reviewDecisions: [],
    };
    await fs.writeFile(path.join(txtDir, `${report.id}.txt`), report.text, "utf8");
    await fs.writeFile(path.join(jsonDir, `${report.id}.json`), JSON.stringify(payload, null, 2), "utf8");
    await fs.writeFile(path.join(originalJsonDir, `${report.id}.json`), JSON.stringify(payload, null, 2), "utf8");
  }
  console.log(`Seeded ${reports.length} parsed reports into parsed_reports/`);
}

main();
