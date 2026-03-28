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
// Report mimic-235 -- CTA Chest — Extensive PE with Pulmonary Nodules
// ---------------------------------------------------------------------------

const r1 = sampleReports[0].text;

const report235Terms: ParsedTerm[] = [
  {
    term: "DVT",
    normalizedName: "Deep Vein Thrombosis",
    category: "Vascular",
    confidence: 0.95,
    startIndex: idx(r1, "DVT"),
    endIndex: idx(r1, "DVT") + "DVT".length,
    context: "status post robotic radical cystectomy on ___ with post op LLE DVT has been on lovenox, now presenting with new oxygen requirement and worsening dyspnea on exertion x 1 day",
    isAnomaly: true,
  },
  {
    term: "atherosclerotic calcifications",
    normalizedName: "Atherosclerotic Calcifications",
    category: "Vascular",
    confidence: 0.92,
    startIndex: idx(r1, "atherosclerotic calcifications"),
    endIndex: idx(r1, "atherosclerotic calcifications") + "atherosclerotic calcifications".length,
    context: "Moderate atherosclerotic calcifications are noted throughout the thoracic aorta.",
    isAnomaly: true,
  },
  {
    term: "extensive thrombus",
    normalizedName: "Pulmonary Artery Thrombus",
    category: "Pulmonary",
    confidence: 0.98,
    startIndex: idx(r1, "extensive thrombus"),
    endIndex: idx(r1, "extensive thrombus") + "extensive thrombus".length,
    context: "There is extensive thrombus seen extending from the right main pulmonary artery into the right upper, middle, and lower lobes.",
    isAnomaly: true,
  },
  {
    term: "thrombi",
    normalizedName: "Pulmonary Thrombi",
    category: "Pulmonary",
    confidence: 0.96,
    startIndex: idx(r1, "thrombi"),
    endIndex: idx(r1, "thrombi") + "thrombi".length,
    context: "Additionally, there are smaller thrombi seen in the segmental branches of the left upper and lower lobes.",
    isAnomaly: true,
  },
  {
    term: "thyroid nodule",
    normalizedName: "Thyroid Nodule",
    category: "Systemic",
    confidence: 0.84,
    startIndex: idx(r1, "thyroid nodule"),
    endIndex: idx(r1, "thyroid nodule") + "thyroid nodule".length,
    context: "Rim calcified 9 mm thyroid nodule is unchanged (3:2).",
    isAnomaly: true,
  },
  {
    term: "valvular calicifications",
    normalizedName: "Valvular Calcifications",
    category: "Cardiac",
    confidence: 0.88,
    startIndex: idx(r1, "valvular calicifications"),
    endIndex: idx(r1, "valvular calicifications") + "valvular calicifications".length,
    context: "Aortic and mitral valvular calicifications R presents.",
    isAnomaly: true,
  },
  {
    term: "pulmonary nodules",
    normalizedName: "Pulmonary Nodules",
    category: "Pulmonary",
    confidence: 0.93,
    startIndex: idx(r1, "pulmonary nodules"),
    endIndex: idx(r1, "pulmonary nodules") + "pulmonary nodules".length,
    context: "Several pulmonary nodules are noted, as seen previously, with the largest measuring up to 1 cm in the right middle lobe (series 2: Image 59), all of which appear unchanged from prior exam.",
    isAnomaly: true,
  },
  {
    term: "hiatal\nhernia",
    normalizedName: "Hiatal Hernia",
    category: "Systemic",
    confidence: 0.82,
    startIndex: idx(r1, "hiatal\nhernia"),
    endIndex: idx(r1, "hiatal\nhernia") + "hiatal\nhernia".length,
    context: "There is a small hiatal hernia.",
    isAnomaly: true,
  },
  {
    term: "Degenerative changes",
    normalizedName: "Degenerative Changes",
    category: "Musculoskeletal",
    confidence: 0.85,
    startIndex: idx(r1, "Degenerative changes"),
    endIndex: idx(r1, "Degenerative changes") + "Degenerative changes".length,
    context: "Degenerative changes are noted in the thoracic spine.",
    isAnomaly: true,
  },
  {
    term: "soft tissue nodules",
    normalizedName: "Breast Nodules",
    category: "Systemic",
    confidence: 0.87,
    startIndex: idx(r1, "soft tissue nodules"),
    endIndex: idx(r1, "soft tissue nodules") + "soft tissue nodules".length,
    context: "2 soft tissue nodules are identified within the left breast measuring 11 and 7 mm, similar to the previous CT.",
    isAnomaly: true,
  },
  {
    term: "pulmonary embolism",
    normalizedName: "Pulmonary Embolism",
    category: "Pulmonary",
    confidence: 0.98,
    startIndex: idx(r1, "pulmonary embolism"),
    endIndex: idx(r1, "pulmonary embolism") + "pulmonary embolism".length,
    context: "Extensive pulmonary embolism with thrombus seen extending from the right main pulmonary artery into the segmental and subsegmental right upper, middle, and lower lobe pulmonary arteries.",
    isAnomaly: true,
  },
  {
    term: "pulmonary emboli",
    normalizedName: "Pulmonary Emboli",
    category: "Pulmonary",
    confidence: 0.96,
    startIndex: idx(r1, "pulmonary emboli", idx(r1, "pulmonary embolism") + 1),
    endIndex: idx(r1, "pulmonary emboli", idx(r1, "pulmonary embolism") + 1) + "pulmonary emboli".length,
    context: "Additionally, there are smaller pulmonary emboli seen in the segmental and subsegmental branches of the left upper and lower lobes.",
    isAnomaly: true,
  },
  {
    term: "spiculated",
    normalizedName: "Spiculated Nodule",
    category: "Pulmonary",
    confidence: 0.94,
    startIndex: idx(r1, "spiculated"),
    endIndex: idx(r1, "spiculated") + "spiculated".length,
    context: "Several pulmonary nodules are noted, as noted previously, with the largest appearing spiculated and measuring up to 1 cm in the right middle lobe, suspicious for malignancy on the previous PET-CT.",
    isAnomaly: true,
  },
  {
    term: "breast nodules",
    normalizedName: "Breast Nodules",
    category: "Systemic",
    confidence: 0.86,
    startIndex: idx(r1, "breast nodules"),
    endIndex: idx(r1, "breast nodules") + "breast nodules".length,
    context: "Re- demonstration of 2 left breast nodules for which correlation with mammography and ultrasound is suggested.",
    isAnomaly: true,
  },
  // --- False positive: borderline finding, uncertain ---
  {
    term: "hepatic cyst",
    normalizedName: "Hepatic Cyst",
    category: "Systemic",
    confidence: 0.58,
    startIndex: idx(r1, "hepatic cyst"),
    endIndex: idx(r1, "hepatic cyst") + "hepatic cyst".length,
    context: "Limited images of the upper abdomen are remarkable for a a 1.1 cm hypodense structure in the liver dome, likely day hepatic cyst.",
    isAnomaly: false,
  },
  // --- False positive: normal anatomy description ---
  {
    term: "right main pulmonary\nartery",
    normalizedName: "Right Main Pulmonary Artery",
    category: "Pulmonary",
    confidence: 0.52,
    startIndex: idx(r1, "right main pulmonary\nartery"),
    endIndex: idx(r1, "right main pulmonary\nartery") + "right main pulmonary\nartery".length,
    context: "There is extensive thrombus seen extending from the right main pulmonary artery into the right upper, middle, and lower lobes.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Report mimic-130 -- CT Chest — CAD, Pulmonary Edema, Mitral Regurgitation
// ---------------------------------------------------------------------------

const r2 = sampleReports[1].text;

const report130Terms: ParsedTerm[] = [
  {
    term: "coronary artery disease",
    normalizedName: "Coronary Artery Disease",
    category: "Cardiac",
    confidence: 0.96,
    startIndex: idx(r2, "coronary artery disease"),
    endIndex: idx(r2, "coronary artery disease") + "coronary artery disease".length,
    context: "History of coronary artery disease, hypertension, hyperlipidemia who presents with shortness of breath, echo with severe mitral regurgitation, preoperative exam, question opacity in the right upper lobe.",
    isAnomaly: true,
  },
  {
    term: "hypertension",
    normalizedName: "Hypertension",
    category: "Vascular",
    confidence: 0.91,
    startIndex: idx(r2, "hypertension"),
    endIndex: idx(r2, "hypertension") + "hypertension".length,
    context: "History of coronary artery disease, hypertension, hyperlipidemia who presents with shortness of breath.",
    isAnomaly: true,
  },
  {
    term: "severe mitral regurgitation",
    normalizedName: "Mitral Regurgitation",
    category: "Cardiac",
    confidence: 0.97,
    startIndex: idx(r2, "severe mitral regurgitation"),
    endIndex: idx(r2, "severe mitral regurgitation") + "severe mitral regurgitation".length,
    context: "echo with severe mitral regurgitation, preoperative exam, question opacity in the right upper lobe.",
    isAnomaly: true,
  },
  {
    term: "coronary artery calcifications",
    normalizedName: "Coronary Artery Calcifications",
    category: "Cardiac",
    confidence: 0.95,
    startIndex: idx(r2, "coronary artery calcifications"),
    endIndex: idx(r2, "coronary artery calcifications") + "coronary artery calcifications".length,
    context: "There are dense coronary artery calcifications as well as mild aortic valvular calcifications.",
    isAnomaly: true,
  },
  {
    term: "aortic\nvalvular calcifications",
    normalizedName: "Aortic Valvular Calcifications",
    category: "Cardiac",
    confidence: 0.90,
    startIndex: idx(r2, "aortic\nvalvular calcifications"),
    endIndex: idx(r2, "aortic\nvalvular calcifications") + "aortic\nvalvular calcifications".length,
    context: "There are dense coronary artery calcifications as well as mild aortic valvular calcifications.",
    isAnomaly: true,
  },
  {
    term: "Pulmonary artery is enlarged",
    normalizedName: "Pulmonary Artery Enlargement",
    category: "Pulmonary",
    confidence: 0.93,
    startIndex: idx(r2, "Pulmonary artery is enlarged"),
    endIndex: idx(r2, "Pulmonary artery is enlarged") + "Pulmonary artery is enlarged".length,
    context: "Pulmonary artery is enlarged, specifically the right main branch measures 2.5 cm.",
    isAnomaly: true,
  },
  {
    term: "ground-glass opacity",
    normalizedName: "Ground-Glass Opacity",
    category: "Pulmonary",
    confidence: 0.96,
    startIndex: idx(r2, "ground-glass opacity"),
    endIndex: idx(r2, "ground-glass opacity") + "ground-glass opacity".length,
    context: "Large areas of confluent, relatively central ground-glass opacity, involve contiguous, central right upper lobe and lower lobes.",
    isAnomaly: true,
  },
  {
    term: "subpleural opacity",
    normalizedName: "Subpleural Opacity",
    category: "Pulmonary",
    confidence: 0.85,
    startIndex: idx(r2, "subpleural opacity"),
    endIndex: idx(r2, "subpleural opacity") + "subpleural opacity".length,
    context: "Left upper lobe subpleural opacity (4:46) is noted.",
    isAnomaly: true,
  },
  {
    term: "paraseptal emphysema",
    normalizedName: "Paraseptal Emphysema",
    category: "Pulmonary",
    confidence: 0.89,
    startIndex: idx(r2, "paraseptal emphysema"),
    endIndex: idx(r2, "paraseptal emphysema") + "paraseptal emphysema".length,
    context: "There are areas of scarring and paraseptal emphysema in the right middle lobe and lingula.",
    isAnomaly: true,
  },
  {
    term: "atherosclerotic disease",
    normalizedName: "Atherosclerotic Disease",
    category: "Vascular",
    confidence: 0.87,
    startIndex: idx(r2, "atherosclerotic disease"),
    endIndex: idx(r2, "atherosclerotic disease") + "atherosclerotic disease".length,
    context: "limited views demonstrate atherosclerotic disease at the origins of the celiac artery and SMA.",
    isAnomaly: true,
  },
  {
    term: "ground-glass opacities",
    normalizedName: "Ground-Glass Opacities",
    category: "Pulmonary",
    confidence: 0.97,
    startIndex: idx(r2, "ground-glass opacities"),
    endIndex: idx(r2, "ground-glass opacities") + "ground-glass opacities".length,
    context: "Diffuse confluent ground-glass opacities predominantly in the right upper lobe and right lower lobe most likely represent residual pulmonary edema, localized to the right lung because of direction of jet in mitral regurgitation.",
    isAnomaly: true,
  },
  {
    term: "pulmonary edema",
    normalizedName: "Pulmonary Edema",
    category: "Pulmonary",
    confidence: 0.95,
    startIndex: idx(r2, "pulmonary edema"),
    endIndex: idx(r2, "pulmonary edema") + "pulmonary edema".length,
    context: "Diffuse confluent ground-glass opacities predominantly in the right upper lobe and right lower lobe most likely represent residual pulmonary edema.",
    isAnomaly: true,
  },
  {
    term: "pulmonary hypertension",
    normalizedName: "Pulmonary Hypertension",
    category: "Pulmonary",
    confidence: 0.78,
    startIndex: idx(r2, "pulmonary hypertension"),
    endIndex: idx(r2, "pulmonary hypertension") + "pulmonary hypertension".length,
    context: "Possible pulmonary hypertension.",
    isAnomaly: true,
  },
  {
    term: "coronary artery disease",
    normalizedName: "Coronary Artery Disease",
    category: "Cardiac",
    confidence: 0.93,
    startIndex: idx(r2, "coronary artery disease", idx(r2, "Moderate")),
    endIndex: idx(r2, "coronary artery disease", idx(r2, "Moderate")) + "coronary artery disease".length,
    context: "Moderate coronary artery disease.",
    isAnomaly: true,
  },
  // --- False positive: borderline finding, uncertain ---
  {
    term: "scarring",
    normalizedName: "Pulmonary Scarring",
    category: "Pulmonary",
    confidence: 0.62,
    startIndex: idx(r2, "scarring"),
    endIndex: idx(r2, "scarring") + "scarring".length,
    context: "There are areas of scarring and paraseptal emphysema in the right middle lobe and lingula.",
    isAnomaly: false,
  },
  // --- False positive: anatomy reference ---
  {
    term: "mediastinal\nnodes",
    normalizedName: "Mediastinal Lymph Nodes",
    category: "Systemic",
    confidence: 0.55,
    startIndex: idx(r2, "mediastinal\nnodes"),
    endIndex: idx(r2, "mediastinal\nnodes") + "mediastinal\nnodes".length,
    context: "There are prominent mediastinal nodes, for example, 9 mm node (2:16), subcarinal node measures 8 mm in short axis.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Report mimic-256 -- CT Chest — Pulmonary Nodules, Coronary Calcification
// ---------------------------------------------------------------------------

const r3 = sampleReports[2].text;

const report256Terms: ParsedTerm[] = [
  {
    term: "calcified nodule\nin the right lobe of the thyroid",
    normalizedName: "Calcified Thyroid Nodule",
    category: "Systemic",
    confidence: 0.86,
    startIndex: idx(r3, "calcified nodule\nin the right lobe of the thyroid"),
    endIndex: idx(r3, "calcified nodule\nin the right lobe of the thyroid") + "calcified nodule\nin the right lobe of the thyroid".length,
    context: "Circumferentially calcified nodule in the right lobe of the thyroid measuring 8 mm in diameter.",
    isAnomaly: true,
  },
  {
    term: "soft tissue nodules in the left\nbreast",
    normalizedName: "Breast Nodules",
    category: "Systemic",
    confidence: 0.85,
    startIndex: idx(r3, "soft tissue nodules in the left\nbreast"),
    endIndex: idx(r3, "soft tissue nodules in the left\nbreast") + "soft tissue nodules in the left\nbreast".length,
    context: "2 subcentimeter soft tissue nodules in the left breast (6, 164 and 140).",
    isAnomaly: true,
  },
  {
    term: "hiatus hernia",
    normalizedName: "Hiatus Hernia",
    category: "Systemic",
    confidence: 0.80,
    startIndex: idx(r3, "hiatus hernia"),
    endIndex: idx(r3, "hiatus hernia") + "hiatus hernia".length,
    context: "Small sliding hiatus hernia.",
    isAnomaly: true,
  },
  {
    term: "aortic annular\ncalcifications",
    normalizedName: "Aortic Annular Calcifications",
    category: "Cardiac",
    confidence: 0.91,
    startIndex: idx(r3, "aortic annular\ncalcifications"),
    endIndex: idx(r3, "aortic annular\ncalcifications") + "aortic annular\ncalcifications".length,
    context: "Moderate aortic annular calcifications.",
    isAnomaly: true,
  },
  {
    term: "coronary artery calcifications",
    normalizedName: "Coronary Artery Calcifications",
    category: "Cardiac",
    confidence: 0.90,
    startIndex: idx(r3, "coronary artery calcifications"),
    endIndex: idx(r3, "coronary artery calcifications") + "coronary artery calcifications".length,
    context: "Mild coronary artery calcifications.",
    isAnomaly: true,
  },
  {
    term: "calcification of the aortic arch",
    normalizedName: "Aortic Arch Calcification",
    category: "Vascular",
    confidence: 0.89,
    startIndex: idx(r3, "calcification of the aortic arch"),
    endIndex: idx(r3, "calcification of the aortic arch") + "calcification of the aortic arch".length,
    context: "Moderate calcification of the aortic arch and supra-aortic vessels.",
    isAnomaly: true,
  },
  {
    term: "pleural-parenchymal scarring",
    normalizedName: "Pleural-Parenchymal Scarring",
    category: "Pulmonary",
    confidence: 0.83,
    startIndex: idx(r3, "pleural-parenchymal scarring"),
    endIndex: idx(r3, "pleural-parenchymal scarring") + "pleural-parenchymal scarring".length,
    context: "Biapical pleural-parenchymal scarring.",
    isAnomaly: true,
  },
  {
    term: "spiculated\nirregular part solid nodules",
    normalizedName: "Spiculated Part-Solid Nodules",
    category: "Pulmonary",
    confidence: 0.97,
    startIndex: idx(r3, "spiculated\nirregular part solid nodules"),
    endIndex: idx(r3, "spiculated\nirregular part solid nodules") + "spiculated\nirregular part solid nodules".length,
    context: "There are 2 spiculated irregular part solid nodules with associated bronchiolectasis the largest in the right upper lobe (6, 146) with the nodule and solid component measuring 10.5 mm.",
    isAnomaly: true,
  },
  {
    term: "bronchiolectasis",
    normalizedName: "Bronchiolectasis",
    category: "Pulmonary",
    confidence: 0.88,
    startIndex: idx(r3, "bronchiolectasis"),
    endIndex: idx(r3, "bronchiolectasis") + "bronchiolectasis".length,
    context: "There are 2 spiculated irregular part solid nodules with associated bronchiolectasis the largest in the right upper lobe.",
    isAnomaly: true,
  },
  {
    term: "part solid nodule measuring 7 mm",
    normalizedName: "Part-Solid Nodule",
    category: "Pulmonary",
    confidence: 0.92,
    startIndex: idx(r3, "part solid nodule measuring 7 mm"),
    endIndex: idx(r3, "part solid nodule measuring 7 mm") + "part solid nodule measuring 7 mm".length,
    context: "Smaller irregular bubbly part solid nodule measuring 7 mm in average diameter in the left lower lobe (6, 186).",
    isAnomaly: true,
  },
  {
    term: "pulmonary nodules measuring 3 mm",
    normalizedName: "Pulmonary Nodules",
    category: "Pulmonary",
    confidence: 0.84,
    startIndex: idx(r3, "pulmonary nodules measuring 3 mm"),
    endIndex: idx(r3, "pulmonary nodules measuring 3 mm") + "pulmonary nodules measuring 3 mm".length,
    context: "Few small pulmonary nodules measuring 3 mm in diameter seen in the left lower lobe (6, 181) and (6, 118) which are indeterminate.",
    isAnomaly: true,
  },
  {
    term: "centrilobular emphysematous changes",
    normalizedName: "Centrilobular Emphysema",
    category: "Pulmonary",
    confidence: 0.87,
    startIndex: idx(r3, "centrilobular emphysematous changes"),
    endIndex: idx(r3, "centrilobular emphysematous changes") + "centrilobular emphysematous changes".length,
    context: "Mild centrilobular emphysematous changes.",
    isAnomaly: true,
  },
  {
    term: "calcified granulomas",
    normalizedName: "Calcified Granulomas",
    category: "Pulmonary",
    confidence: 0.79,
    startIndex: idx(r3, "calcified granulomas"),
    endIndex: idx(r3, "calcified granulomas") + "calcified granulomas".length,
    context: "A few punctate calcified granulomas.",
    isAnomaly: true,
  },
  {
    term: "Spondylotic changes",
    normalizedName: "Spondylotic Changes",
    category: "Musculoskeletal",
    confidence: 0.82,
    startIndex: idx(r3, "Spondylotic changes"),
    endIndex: idx(r3, "Spondylotic changes") + "Spondylotic changes".length,
    context: "Spondylotic changes of the thoracic spine.",
    isAnomaly: true,
  },
  {
    term: "lung\nadenocarcinoma spectrum",
    normalizedName: "Lung Adenocarcinoma Spectrum",
    category: "Pulmonary",
    confidence: 0.94,
    startIndex: idx(r3, "lung\nadenocarcinoma spectrum"),
    endIndex: idx(r3, "lung\nadenocarcinoma spectrum") + "lung\nadenocarcinoma spectrum".length,
    context: "These nodules do not have the typical appearance of metastasis, but are concerning for lesions in the lung adenocarcinoma spectrum.",
    isAnomaly: true,
  },
  // --- False positive: incidental/benign finding ---
  {
    term: "lung cysts",
    normalizedName: "Lung Cysts",
    category: "Pulmonary",
    confidence: 0.55,
    startIndex: idx(r3, "lung cysts"),
    endIndex: idx(r3, "lung cysts") + "lung cysts".length,
    context: "Incidental lung cysts.",
    isAnomaly: false,
  },
  // --- False positive: anatomy reference ---
  {
    term: "left subclavian vein",
    normalizedName: "Left Subclavian Vein",
    category: "Vascular",
    confidence: 0.48,
    startIndex: idx(r3, "left subclavian vein"),
    endIndex: idx(r3, "left subclavian vein") + "left subclavian vein".length,
    context: "There is attenuation of the left subclavian vein as it crosses between the clavicle and the first rib with mildly prominent collateral vessels.",
    isAnomaly: false,
  },
];

// ---------------------------------------------------------------------------
// Exported mock parse results
// ---------------------------------------------------------------------------

export const mockParseResults: ParseResult[] = [
  {
    reportId: "mimic-235",
    reportText: r1,
    parsedTerms: report235Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.93,
    parseTimeMs: 2134,
    totalTokensUsed: 4182,
    estimatedCostUsd: 0.0015,
  },
  {
    reportId: "mimic-130",
    reportText: r2,
    parsedTerms: report130Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.90,
    parseTimeMs: 1987,
    totalTokensUsed: 3856,
    estimatedCostUsd: 0.0014,
  },
  {
    reportId: "mimic-256",
    reportText: r3,
    parsedTerms: report256Terms,
    parserModel: "gemini-2.5-flash",
    verifierModel: "gemini-2.5-flash",
    verifierAgreement: 0.91,
    parseTimeMs: 2267,
    totalTokensUsed: 4521,
    estimatedCostUsd: 0.0016,
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
