// Mock anomaly frequency database
// This module can later be replaced with a real hospital database, vector DB, or SQL DB

export interface AnomalyEntry {
  term: string;
  aliases: string[];       // Alternative names for the same condition
  frequency: number;        // Absolute count in historical reports
  totalReports: number;     // Total reports in the database
  category: string;         // Clinical category
  severity: "low" | "moderate" | "high" | "critical";
}

const TOTAL_REPORTS = 300;

export const anomalyDatabase: AnomalyEntry[] = [
  {
    term: "Pulmonary embolism",
    aliases: ["PE", "pulmonary thromboembolism"],
    frequency: 42,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "critical",
  },
  {
    term: "Coronary artery stenosis",
    aliases: ["coronary stenosis", "coronary narrowing", "coronary artery disease"],
    frequency: 87,
    totalReports: TOTAL_REPORTS,
    category: "Cardiac",
    severity: "high",
  },
  {
    term: "Aortic aneurysm",
    aliases: ["aortic dilatation", "aortic ectasia"],
    frequency: 23,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "critical",
  },
  {
    term: "Carotid plaque",
    aliases: ["carotid atherosclerosis", "carotid artery plaque"],
    frequency: 65,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "moderate",
  },
  {
    term: "Dissection",
    aliases: ["aortic dissection", "arterial dissection"],
    frequency: 8,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "critical",
  },
  {
    term: "Pericardial effusion",
    aliases: ["pericardial fluid"],
    frequency: 31,
    totalReports: TOTAL_REPORTS,
    category: "Cardiac",
    severity: "moderate",
  },
  {
    term: "Pleural effusion",
    aliases: ["pleural fluid"],
    frequency: 58,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "moderate",
  },
  {
    term: "Calcification",
    aliases: ["calcified plaque", "vascular calcification", "coronary calcification"],
    frequency: 112,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "low",
  },
  {
    term: "Thrombus",
    aliases: ["blood clot", "intraluminal thrombus", "mural thrombus"],
    frequency: 35,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "high",
  },
  {
    term: "Lymphadenopathy",
    aliases: ["enlarged lymph nodes", "lymph node enlargement"],
    frequency: 47,
    totalReports: TOTAL_REPORTS,
    category: "Systemic",
    severity: "moderate",
  },
  {
    term: "Atelectasis",
    aliases: ["lung collapse", "partial lung collapse"],
    frequency: 73,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "low",
  },
  {
    term: "Cardiomegaly",
    aliases: ["enlarged heart", "cardiac enlargement"],
    frequency: 54,
    totalReports: TOTAL_REPORTS,
    category: "Cardiac",
    severity: "moderate",
  },
  {
    term: "Pulmonary nodule",
    aliases: ["lung nodule", "pulmonary mass"],
    frequency: 39,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "high",
  },
  {
    term: "Mitral valve calcification",
    aliases: ["mitral annular calcification"],
    frequency: 28,
    totalReports: TOTAL_REPORTS,
    category: "Cardiac",
    severity: "moderate",
  },
  {
    term: "Aortic valve calcification",
    aliases: ["aortic valve stenosis", "aortic sclerosis"],
    frequency: 34,
    totalReports: TOTAL_REPORTS,
    category: "Cardiac",
    severity: "moderate",
  },
  {
    term: "Pulmonary hypertension",
    aliases: ["elevated pulmonary pressure"],
    frequency: 19,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "high",
  },
  {
    term: "Stenosis",
    aliases: ["luminal narrowing", "vessel narrowing"],
    frequency: 96,
    totalReports: TOTAL_REPORTS,
    category: "Vascular",
    severity: "high",
  },
  {
    term: "Consolidation",
    aliases: ["lung consolidation", "airspace consolidation"],
    frequency: 41,
    totalReports: TOTAL_REPORTS,
    category: "Pulmonary",
    severity: "moderate",
  },
];

export function getAnomalyByTerm(term: string): AnomalyEntry | undefined {
  const lower = term.toLowerCase();
  return anomalyDatabase.find(
    (entry) =>
      entry.term.toLowerCase() === lower ||
      entry.aliases.some((alias) => alias.toLowerCase() === lower)
  );
}

export function getFrequencyPercentage(entry: AnomalyEntry): string {
  return ((entry.frequency / entry.totalReports) * 100).toFixed(1);
}
