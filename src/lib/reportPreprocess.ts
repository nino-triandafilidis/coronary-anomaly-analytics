/**
 * Deterministic pre-processing applied before the LLM extraction call.
 *
 * Two jobs, both of which are reliable enough not to spend a model on:
 *   1. stripBoilerplate — delete lines that are always non-findings
 *      (PHI-masking footer, signatures/consult lines, dose/technique, the
 *      per-vessel calcium-score numeric table, reference-norm paragraphs).
 *   2. fenceDistractorSections — wrap the templated extracoronary survey
 *      (REMAINING CHEST, OTHER, MISC, ...) in markers so the model treats it
 *      as context, not as findings.
 *
 * IMPORTANT: the output is used ONLY as the text the model reads. Character
 * offsets for highlighting are always resolved against the ORIGINAL report
 * text (see openaiParser.ts), so stripping and fencing here can never move a
 * finding's offsets. Stripping removes whole lines and fencing inserts marker
 * lines between sections, so any in-scope finding the model returns is still a
 * contiguous substring of the original.
 */

import type { ReportFamily } from "@/lib/reportFamily";

export const FENCE_OPEN = "<<OUT_OF_SCOPE — context only, do not extract findings here>>";
export const FENCE_CLOSE = "<<END_OUT_OF_SCOPE>>";

export interface PreprocessResult {
  /** Text to send to the model (boilerplate stripped, distractors fenced). */
  extractionText: string;
  /** Count of lines removed by stripBoilerplate (for logging). */
  strippedLines: number;
  /** Section headers that were fenced (for logging). */
  fencedSections: string[];
}

// ---------------------------------------------------------------------------
// 1. Boilerplate stripping (line-based, family-independent)
// ---------------------------------------------------------------------------

/** Lines matching any of these are always dropped before extraction. */
const BOILERPLATE_LINE = [
  // PHI-masking footer (present on every report)
  /All dates have been shifted by a fixed per-patient offset for PHI masking/i,
  /Accession numbers and numeric identifiers have been replaced/i,
  // Signatures / consult / dictation
  /^\s*(Signed|Electronic Signature|Interpreted by|Dictated by|Final Report)/i,
  /Physician to Physician Radiology Consult Line/i,
  /A direct message to Dr\..*was placed/i,
  /secure chat/i,
  /^\s*ACCESSION NUMBER\s*:?/i,
  /^\s*SHS-\w+/,
  // Dose / technique metadata
  /\b(DLP|CTDIvol|CTDi)\b/,
  /Based on a \d+ cm (body )?phantom/i,
  /Estimated (cumulative |radiation )?dose/i,
  /\bmGy(-cm)?\b/,
  // Per-vessel calcium-score numeric table + reference norms
  /Number of lesions\s*=/i,
  /calcium score\s*=\s*\d/i,
  /REFERENCE NORMS/i,
  /Mayo Clin Proc/i,
];

function stripBoilerplate(text: string): { text: string; strippedLines: number } {
  const lines = text.split("\n");
  let stripped = 0;
  const kept = lines.filter((ln) => {
    if (BOILERPLATE_LINE.some((re) => re.test(ln))) {
      stripped++;
      return false;
    }
    return true;
  });
  return { text: kept.join("\n"), strippedLines: stripped };
}

// ---------------------------------------------------------------------------
// 2. Distractor-section fencing (header-based)
// ---------------------------------------------------------------------------

/**
 * Section headers whose entire block is templated extracoronary survey. Fenced
 * for every family except F4, where the segmental-analysis content is kept in
 * scope (it can carry coronary-relevant anatomy).
 */
const DISTRACTOR_HEADERS = [
  /^REMAINING CHEST\b/i,
  /^OTHER\b\s*:?\s*$/i,
  /^MISC\b/i,
  /^Bony Structures\b/i,
];

/**
 * Lines (not full sections) that are templated extracoronary normals. Used to
 * detect a distractor block start even when it is not under one of the headers
 * above, e.g. F2's REMAINING CARDIOVASCULAR STRUCTURES sub-lines.
 */
const SURVEY_LINE =
  /^\s*(Lymph nodes|Other mediastinal structures|Lung parenchyma|Airways|Pleura|Chest wall|Musculoskeletal|Upper abdomen|Visualized abdomen|Bones|Medical devices|Visualized lungs)\b/i;

/**
 * A line that looks like a top-level section header (ALL-CAPS-ish, short,
 * optionally trailing colon). Used to find where a fenced block ends.
 */
function isHeaderLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  const head = s.split(":")[0].trim();
  return (
    head.length >= 2 &&
    head.length <= 45 &&
    head === head.toUpperCase() &&
    /[A-Z]/.test(head) &&
    head.split(/\s+/).length <= 6
  );
}

function fenceDistractorSections(
  text: string,
  family: ReportFamily
): { text: string; fencedSections: string[] } {
  if (family === "F4_segmental_analysis") {
    return { text, fencedSections: [] };
  }

  const lines = text.split("\n");
  const out: string[] = [];
  const fenced: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isDistractorStart =
      DISTRACTOR_HEADERS.some((re) => re.test(line.trim())) || SURVEY_LINE.test(line);

    if (!isDistractorStart) {
      out.push(line);
      i++;
      continue;
    }

    // Fence from here until the next in-scope header (or end of report).
    fenced.push(line.trim().split(":")[0].trim());
    out.push(FENCE_OPEN);
    while (i < lines.length) {
      const cur = lines[i];
      const startsNewInScope =
        isHeaderLine(cur) &&
        !DISTRACTOR_HEADERS.some((re) => re.test(cur.trim())) &&
        !SURVEY_LINE.test(cur);
      // Stop the fence when a non-distractor top-level header appears, but not
      // on the very first line of the block.
      if (cur !== line && startsNewInScope) break;
      out.push(cur);
      i++;
    }
    out.push(FENCE_CLOSE);
  }

  return { text: out.join("\n"), fencedSections: fenced };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function prepareForExtraction(
  text: string,
  family: ReportFamily
): PreprocessResult {
  const stripped = stripBoilerplate(text);
  const fenced = fenceDistractorSections(stripped.text, family);
  return {
    extractionText: fenced.text,
    strippedLines: stripped.strippedLines,
    fencedSections: fenced.fencedSections,
  };
}
