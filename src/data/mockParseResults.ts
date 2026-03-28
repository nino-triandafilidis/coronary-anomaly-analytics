// Simulates LLM parser output for each sample report.
// Used to develop the term-review UI flow without live API calls.

import { sampleReports } from "./sampleReports";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedTerm {
  term: string;           // The exact text span found in the report
  normalizedName: string; // Canonical/normalized name (e.g. "Pulmonary Embolism")
  category: string;       // e.g. "Pulmonary", "Cardiac", "Vascular"
  confidence: number;     // 0-1, LLM's confidence score
  startIndex: number;     // Position in report text
  endIndex: number;       // Position in report text
  context: string;        // Surrounding sentence for context
  isAnomaly: boolean;     // LLM's assessment: is this a clinical finding/anomaly?
}

export interface ParseResult {
  reportId: string;
  reportText: string;
  parsedTerms: ParsedTerm[];
  parserModel: string;    // e.g. "gemini-2.5-flash"
  verifierModel: string;  // e.g. "gemini-2.5-flash"
  verifierAgreement: number; // 0-1, how much verifier agreed with parser
  parseTimeMs: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
}

export type TermStatus = "pending" | "accepted" | "rejected" | "added";

export interface ReviewableTerm extends ParsedTerm {
  status: TermStatus;
}

// ---------------------------------------------------------------------------
// Helper: find the index of a substring within report text
// ---------------------------------------------------------------------------

function idx(text: string, sub: string, after = 0): number {
  return text.indexOf(sub, after);
}

// ---------------------------------------------------------------------------
// Report 001 -- Chest Pain Evaluation
// ---------------------------------------------------------------------------

const r1 = sampleReports[0].text;

const report001Terms: ParsedTerm[] = [
  {
    term: "pulmonary embolism",
    normalizedName: "Pulmonary Embolism",
    category: "Pulmonary",
    confidence: 0.97,
    startIndex: idx(r1, "pulmonary embolism"),
    endIndex: idx(r1, "pulmonary embolism") + "pulmonary embolism".length,
    context: "A filling defect is identified in the right lower lobe segmental pulmonary artery, consistent with pulmonary embolism.",
    isAnomaly: true,
  },
  {
    term: "filling defect",
    normalizedName: "Filling Defect",
    category: "Pulmonary",
    confidence: 0.93,
    startIndex: idx(r1, "filling defect"),
    endIndex: idx(r1, "filling defect") + "filling defect".length,
    context: "A filling defect is identified in the right lower lobe segmental pulmonary artery, consistent with pulmonary embolism.",
    isAnomaly: true,
  },
  {
    term: "pulmonary hypertension",
    normalizedName: "Pulmonary Hypertension",
    category: "Pulmonary",
    confidence: 0.78,
    startIndex: idx(r1, "pulmonary hypertension"),
    endIndex: idx(r1, "pulmonary hypertension") + "pulmonary hypertension".length,
    context: "The main pulmonary artery diameter measures 32 mm, suggesting possible pulmonary hypertension.",
    isAnomaly: true,
  },
  {
    term: "Coronary artery stenosis",
    normalizedName: "Coronary Artery Stenosis",
    category: "Cardiac",
    confidence: 0.95,
    startIndex: idx(r1, "Coronary artery stenosis"),
    endIndex: idx(r1, "Coronary artery stenosis") + "Coronary artery stenosis".length,
    context: "Coronary artery stenosis of approximately 50% is seen in the proximal LAD.",
    isAnomaly: true,
  },
  {
    term: "calcification",
    normalizedName: "Coronary Calcification",
    category: "Vascular",
    confidence: 0.91,
    startIndex: idx(r1, "calcification is noted in the left anterior descending") - "Moderate ".length,
    endIndex: idx(r1, "calcification is noted in the left anterior descending") + "calcification".length,
    context: "Moderate calcification is noted in the left anterior descending artery (LAD).",
    isAnomaly: true,
  },
  {
    term: "cardiomegaly",
    normalizedName: "Cardiomegaly",
    category: "Cardiac",
    confidence: 0.94,
    startIndex: idx(r1, "cardiomegaly"),
    endIndex: idx(r1, "cardiomegaly") + "cardiomegaly".length,
    context: "The heart is mildly enlarged, consistent with cardiomegaly.",
    isAnomaly: true,
  },
  {
    term: "pericardial effusion",
    normalizedName: "Pericardial Effusion",
    category: "Cardiac",
    confidence: 0.96,
    startIndex: idx(r1, "pericardial effusion"),
    endIndex: idx(r1, "pericardial effusion") + "pericardial effusion".length,
    context: "A small pericardial effusion is present.",
    isAnomaly: true,
  },
  {
    term: "Aortic valve calcification",
    normalizedName: "Aortic Valve Calcification",
    category: "Cardiac",
    confidence: 0.90,
    startIndex: idx(r1, "Aortic valve calcification"),
    endIndex: idx(r1, "Aortic valve calcification") + "Aortic valve calcification".length,
    context: "Aortic valve calcification is noted.",
    isAnomaly: true,
  },
  {
    term: "atelectasis",
    normalizedName: "Atelectasis",
    category: "Pulmonary",
    confidence: 0.88,
    startIndex: idx(r1, "atelectasis"),
    endIndex: idx(r1, "atelectasis") + "atelectasis".length,
    context: "Bilateral dependent atelectasis is present.",
    isAnomaly: true,
  },
  {
    term: "pulmonary nodule",
    normalizedName: "Pulmonary Nodule",
    category: "Pulmonary",
    confidence: 0.92,
    startIndex: idx(r1, "pulmonary nodule"),
    endIndex: idx(r1, "pulmonary nodule") + "pulmonary nodule".length,
    context: "A 6mm pulmonary nodule is identified in the right upper lobe.",
    isAnomaly: true,
  },
  {
    term: "lymphadenopathy",
    normalizedName: "Lymphadenopathy",
    category: "Systemic",
    confidence: 0.86,
    startIndex: idx(r1, "lymphadenopathy"),
    endIndex: idx(r1, "lymphadenopathy") + "lymphadenopathy".length,
    context: "Mildly enlarged mediastinal lymph nodes, measuring up to 12mm in short axis, consistent with lymphadenopathy.",
    isAnomaly: true,
  },
  // --- False positive: negated finding ---
  {
    term: "No evidence of aortic aneurysm or dissection",
    normalizedName: "Aortic Dissection",
    category: "Vascular",
    confidence: 0.62,
    startIndex: idx(r1, "No evidence of aortic aneurysm or dissection"),
    endIndex: idx(r1, "No evidence of aortic aneurysm or dissection") + "No evidence of aortic aneurysm or dissection".length,
    context: "The thoracic aorta is normal in caliber. No evidence of aortic aneurysm or dissection.",
    isAnomaly: false,
  },
  // --- False positive: anatomy term ---
  {
    term: "right coronary artery",
    normalizedName: "Right Coronary Artery",
    category: "Anatomy",
    confidence: 0.64,
    startIndex: idx(r1, "right coronary artery"),
    endIndex: idx(r1, "right coronary artery") + "right coronary artery".length,
    context: "The right coronary artery shows mild calcification without significant stenosis.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Report 002 -- Aortic Evaluation
// ---------------------------------------------------------------------------

const r2 = sampleReports[1].text;

const report002Terms: ParsedTerm[] = [
  {
    term: "aortic aneurysm",
    normalizedName: "Abdominal Aortic Aneurysm",
    category: "Vascular",
    confidence: 0.98,
    startIndex: idx(r2, "aortic aneurysm"),
    endIndex: idx(r2, "aortic aneurysm") + "aortic aneurysm".length,
    context: "The infrarenal abdominal aortic aneurysm measures 5.2 cm in maximal diameter, increased from 4.8 cm on prior study.",
    isAnomaly: true,
  },
  {
    term: "mural thrombus",
    normalizedName: "Mural Thrombus",
    category: "Vascular",
    confidence: 0.95,
    startIndex: idx(r2, "mural thrombus"),
    endIndex: idx(r2, "mural thrombus") + "mural thrombus".length,
    context: "A mural thrombus is present within the aneurysm sac.",
    isAnomaly: true,
  },
  {
    term: "mildly ectatic",
    normalizedName: "Aortic Ectasia",
    category: "Vascular",
    confidence: 0.82,
    startIndex: idx(r2, "mildly ectatic"),
    endIndex: idx(r2, "mildly ectatic") + "mildly ectatic".length,
    context: "The thoracic aorta is mildly ectatic at 3.8 cm.",
    isAnomaly: true,
  },
  {
    term: "coronary calcification",
    normalizedName: "Coronary Calcification",
    category: "Vascular",
    confidence: 0.93,
    startIndex: idx(r2, "coronary calcification"),
    endIndex: idx(r2, "coronary calcification") + "coronary calcification".length,
    context: "Extensive coronary calcification is noted.",
    isAnomaly: true,
  },
  {
    term: "Coronary artery stenosis",
    normalizedName: "Coronary Artery Stenosis",
    category: "Cardiac",
    confidence: 0.84,
    startIndex: idx(r2, "Coronary artery stenosis"),
    endIndex: idx(r2, "Coronary artery stenosis") + "Coronary artery stenosis".length,
    context: "Coronary artery stenosis is suspected in the left circumflex artery.",
    isAnomaly: true,
  },
  {
    term: "Cardiomegaly",
    normalizedName: "Cardiomegaly",
    category: "Cardiac",
    confidence: 0.96,
    startIndex: idx(r2, "Cardiomegaly"),
    endIndex: idx(r2, "Cardiomegaly") + "Cardiomegaly".length,
    context: "Cardiomegaly is present.",
    isAnomaly: true,
  },
  {
    term: "pericardial effusion",
    normalizedName: "Pericardial Effusion",
    category: "Cardiac",
    confidence: 0.95,
    startIndex: idx(r2, "pericardial effusion"),
    endIndex: idx(r2, "pericardial effusion") + "pericardial effusion".length,
    context: "Moderate pericardial effusion identified.",
    isAnomaly: true,
  },
  {
    term: "Mitral valve calcification",
    normalizedName: "Mitral Valve Calcification",
    category: "Cardiac",
    confidence: 0.91,
    startIndex: idx(r2, "Mitral valve calcification"),
    endIndex: idx(r2, "Mitral valve calcification") + "Mitral valve calcification".length,
    context: "Mitral valve calcification is noted.",
    isAnomaly: true,
  },
  {
    term: "pleural effusion",
    normalizedName: "Pleural Effusion",
    category: "Pulmonary",
    confidence: 0.94,
    startIndex: idx(r2, "pleural effusion"),
    endIndex: idx(r2, "pleural effusion") + "pleural effusion".length,
    context: "Moderate bilateral pleural effusion is present.",
    isAnomaly: true,
  },
  {
    term: "atelectasis",
    normalizedName: "Compressive Atelectasis",
    category: "Pulmonary",
    confidence: 0.87,
    startIndex: idx(r2, "atelectasis"),
    endIndex: idx(r2, "atelectasis") + "atelectasis".length,
    context: "Compressive atelectasis at the lung bases bilaterally.",
    isAnomaly: true,
  },
  {
    term: "carotid plaque",
    normalizedName: "Carotid Plaque",
    category: "Vascular",
    confidence: 0.89,
    startIndex: idx(r2, "carotid plaque"),
    endIndex: idx(r2, "carotid plaque") + "carotid plaque".length,
    context: "Bilateral carotid plaque is noted at the carotid bifurcations.",
    isAnomaly: true,
  },
  // --- False positive: negated finding ---
  {
    term: "No filling defects to suggest pulmonary embolism",
    normalizedName: "Pulmonary Embolism",
    category: "Pulmonary",
    confidence: 0.61,
    startIndex: idx(r2, "No filling defects to suggest pulmonary embolism"),
    endIndex: idx(r2, "No filling defects to suggest pulmonary embolism") + "No filling defects to suggest pulmonary embolism".length,
    context: "No filling defects to suggest pulmonary embolism. The main pulmonary artery is within normal limits.",
    isAnomaly: false,
  },
  // --- False positive: anatomy term ---
  {
    term: "carotid bifurcations",
    normalizedName: "Carotid Bifurcation",
    category: "Anatomy",
    confidence: 0.63,
    startIndex: idx(r2, "carotid bifurcations"),
    endIndex: idx(r2, "carotid bifurcations") + "carotid bifurcations".length,
    context: "Bilateral carotid plaque is noted at the carotid bifurcations.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Report 003 -- Post-Surgical Follow-Up
// ---------------------------------------------------------------------------

const r3 = sampleReports[2].text;

const report003Terms: ParsedTerm[] = [
  {
    term: "stenosis",
    normalizedName: "Graft Stenosis (SVG-RCA)",
    category: "Cardiac",
    confidence: 0.94,
    startIndex: idx(r3, "stenosis at the proximal anastomosis") - "moderate ".length,
    endIndex: idx(r3, "stenosis at the proximal anastomosis") + "stenosis".length,
    context: "The saphenous vein graft (SVG) to the right coronary artery shows moderate stenosis at the proximal anastomosis.",
    isAnomaly: true,
  },
  {
    term: "Coronary artery stenosis",
    normalizedName: "Coronary Artery Stenosis (LCx)",
    category: "Cardiac",
    confidence: 0.96,
    startIndex: idx(r3, "Coronary artery stenosis"),
    endIndex: idx(r3, "Coronary artery stenosis") + "Coronary artery stenosis".length,
    context: "Coronary artery stenosis is present in the native left circumflex artery (approximately 70%).",
    isAnomaly: true,
  },
  {
    term: "diffuse calcification",
    normalizedName: "Diffuse Coronary Calcification",
    category: "Vascular",
    confidence: 0.90,
    startIndex: idx(r3, "diffuse calcification"),
    endIndex: idx(r3, "diffuse calcification") + "diffuse calcification".length,
    context: "Native coronary arteries demonstrate diffuse calcification.",
    isAnomaly: true,
  },
  {
    term: "aortic dilatation",
    normalizedName: "Ascending Aortic Dilatation",
    category: "Vascular",
    confidence: 0.88,
    startIndex: idx(r3, "aortic dilatation"),
    endIndex: idx(r3, "aortic dilatation") + "aortic dilatation".length,
    context: "The ascending aorta measures 4.1 cm, consistent with mild aortic dilatation.",
    isAnomaly: true,
  },
  {
    term: "Aortic valve calcification",
    normalizedName: "Aortic Valve Calcification",
    category: "Cardiac",
    confidence: 0.91,
    startIndex: idx(r3, "Aortic valve calcification"),
    endIndex: idx(r3, "Aortic valve calcification") + "Aortic valve calcification".length,
    context: "Aortic valve calcification is noted with mildly restricted leaflet motion, consistent with aortic sclerosis.",
    isAnomaly: true,
  },
  {
    term: "aortic sclerosis",
    normalizedName: "Aortic Sclerosis",
    category: "Cardiac",
    confidence: 0.85,
    startIndex: idx(r3, "aortic sclerosis"),
    endIndex: idx(r3, "aortic sclerosis") + "aortic sclerosis".length,
    context: "Aortic valve calcification is noted with mildly restricted leaflet motion, consistent with aortic sclerosis.",
    isAnomaly: true,
  },
  {
    term: "pericardial effusion",
    normalizedName: "Pericardial Effusion",
    category: "Cardiac",
    confidence: 0.80,
    startIndex: idx(r3, "pericardial effusion"),
    endIndex: idx(r3, "pericardial effusion") + "pericardial effusion".length,
    context: "Trace pericardial effusion. No intracardiac thrombus.",
    isAnomaly: true,
  },
  {
    term: "atelectasis",
    normalizedName: "Bibasilar Atelectasis",
    category: "Pulmonary",
    confidence: 0.86,
    startIndex: idx(r3, "atelectasis"),
    endIndex: idx(r3, "atelectasis") + "atelectasis".length,
    context: "Mild bibasilar atelectasis.",
    isAnomaly: true,
  },
  {
    term: "pulmonary nodules",
    normalizedName: "Pulmonary Nodules",
    category: "Pulmonary",
    confidence: 0.91,
    startIndex: idx(r3, "pulmonary nodules"),
    endIndex: idx(r3, "pulmonary nodules") + "pulmonary nodules".length,
    context: "Two small pulmonary nodules are identified: a 4mm nodule in the right middle lobe and a 3mm nodule in the left lower lobe.",
    isAnomaly: true,
  },
  {
    term: "consolidation",
    normalizedName: "Post-operative Consolidation",
    category: "Pulmonary",
    confidence: 0.76,
    startIndex: idx(r3, "consolidation in the left lower lobe") - "Patchy ".length,
    endIndex: idx(r3, "consolidation in the left lower lobe") + "consolidation".length,
    context: "Patchy consolidation in the left lower lobe, likely post-operative.",
    isAnomaly: true,
  },
  // --- False positive: negated finding ---
  {
    term: "No evidence of pulmonary embolism",
    normalizedName: "Pulmonary Embolism",
    category: "Pulmonary",
    confidence: 0.60,
    startIndex: idx(r3, "No evidence of pulmonary embolism"),
    endIndex: idx(r3, "No evidence of pulmonary embolism") + "No evidence of pulmonary embolism".length,
    context: "No evidence of pulmonary embolism. The pulmonary arteries are normal in caliber.",
    isAnomaly: false,
  },
  // --- False positive: normal structure, not anomaly ---
  {
    term: "LIMA",
    normalizedName: "LIMA Graft (Patent)",
    category: "Anatomy",
    confidence: 0.67,
    startIndex: idx(r3, "LIMA) graft to the LAD is patent"),
    endIndex: idx(r3, "LIMA) graft to the LAD is patent") + "LIMA".length,
    context: "The left internal mammary artery (LIMA) graft to the LAD is patent with good distal flow.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Exported mock parse results
// ---------------------------------------------------------------------------

export const mockParseResults: ParseResult[] = [
  {
    reportId: "report-001",
    reportText: r1,
    parsedTerms: report001Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.92,
    parseTimeMs: 1843,
    totalTokensUsed: 3274,
    estimatedCostUsd: 0.0012,
  },
  {
    reportId: "report-002",
    reportText: r2,
    parsedTerms: report002Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.89,
    parseTimeMs: 2105,
    totalTokensUsed: 3691,
    estimatedCostUsd: 0.0014,
  },
  {
    reportId: "report-003",
    reportText: r3,
    parsedTerms: report003Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.91,
    parseTimeMs: 1956,
    totalTokensUsed: 3418,
    estimatedCostUsd: 0.0013,
  },
];

/** Look up a mock parse result by report ID. */
export function getMockParseResult(reportId: string): ParseResult | undefined {
  return mockParseResults.find((r) => r.reportId === reportId);
}

/** Try to match arbitrary pasted text against a sample report (substring match). */
export function findMockParseResultByText(text: string): ParseResult | undefined {
  const trimmed = text.trim();
  return mockParseResults.find(
    (r) => r.reportText.includes(trimmed) || trimmed.includes(r.reportText)
  );
}
