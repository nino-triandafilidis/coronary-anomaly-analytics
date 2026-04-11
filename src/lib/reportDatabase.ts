/**
 * Client-side report database backed by localStorage.
 *
 * Reports are stored as a JSON array under STORAGE_KEY. Each entry is a
 * SavedReport — the ParseResult + accepted terms from the TermReview stage,
 * plus a title derived from the report text and the save timestamp.
 *
 * localStorage is synchronous, so all helpers are plain functions (no async).
 */

import type { ParsedTerm } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedReport {
  id: string;
  title: string;
  text: string;
  parsedTerms: ParsedTerm[];
  parserModel: string;
  verifierModel: string;
  verifierAgreement: number;
  parseTimeMs: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
  /** ISO timestamp of when the user saved this report to the database. */
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = "anomaly-insight:reports";

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export function getSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedReport[]) : [];
  } catch {
    return [];
  }
}

/** Upsert a report (by id). Newest entries are stored first. */
export function saveReport(report: SavedReport): void {
  const reports = getSavedReports();
  const idx = reports.findIndex((r) => r.id === report.id);
  if (idx >= 0) {
    reports[idx] = report;
  } else {
    reports.unshift(report);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function deleteReport(id: string): void {
  const reports = getSavedReports().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function getReportCount(): number {
  return getSavedReports().length;
}

// ---------------------------------------------------------------------------
// Title inference
// ---------------------------------------------------------------------------

/**
 * Derive a short human-readable title from the raw report text.
 * Tries common radiology header patterns before falling back to the first
 * non-trivial line.
 */
export function deriveTitleFromText(text: string): string {
  // "CTA CORONARY ARTERIES: 8/8/2025 3:22 PM"
  const ctaLine = text.match(/^CTA [A-Z ]+:\s*(.+)$/m);
  if (ctaLine) return `CTA — ${ctaLine[1].trim().slice(0, 60)}`;

  // "EXAMINATION:  CT CHEST W/CONTRAST"
  const examLine = text.match(/^EXAMINATION:\s*(.+)$/im);
  if (examLine) return examLine[1].trim().slice(0, 70);

  // "HISTORY:  Shortness of breath, evaluate for PE"
  const historyLine = text.match(/^HISTORY:\s*(.+)$/im);
  if (historyLine) return historyLine[1].trim().slice(0, 70);

  // First non-empty, meaningful line
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 3);
  if (firstLine) return firstLine.slice(0, 70);

  return `Parsed Report — ${new Date().toLocaleDateString()}`;
}
