import type { ParseResult, ParsedTerm } from "@/data/mockParseResults";

export interface StoredParsedReport {
  id: string;
  textFile: string;
  jsonFile: string;
  originalJsonFile?: string;
  storedAt: string;
  updatedAt?: string;
  reviewed: boolean;
  text: string;
  parseResult: ParseResult;
}

export async function storeParsedReportFiles(
  text: string,
  parseResult: ParseResult
): Promise<StoredParsedReport> {
  const response = await fetch("/api/parsed-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportId: parseResult.reportId,
      text,
      parseResult,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to store parsed report files.");
  }

  return response.json();
}

export async function getStoredParsedReports(): Promise<StoredParsedReport[]> {
  const response = await fetch("/api/parsed-reports");
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load parsed report files.");
  }
  const body = (await response.json()) as { reports?: StoredParsedReport[] };
  return (body.reports ?? []).map((report) => ({
    ...report,
    reviewed: report.reviewed ?? false,
  }));
}

export async function deleteStoredParsedReport(reportId: string): Promise<void> {
  const response = await fetch(`/api/parsed-reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete parsed report files.");
  }
}

export async function updateStoredParsedReport(
  reportId: string,
  parseResult: ParseResult,
  reviewed?: boolean
): Promise<StoredParsedReport> {
  const response = await fetch(`/api/parsed-reports/${encodeURIComponent(reportId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parseResult, reviewed }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update parsed report file.");
  }

  return response.json();
}

export async function restoreStoredParsedReport(
  reportId: string
): Promise<StoredParsedReport> {
  const response = await fetch(
    `/api/parsed-reports/${encodeURIComponent(reportId)}/restore`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to restore parsed report file.");
  }

  return response.json();
}

export function getStoredParsedTerms(report: StoredParsedReport): ParsedTerm[] {
  return report.parseResult.parsedTerms ?? [];
}
