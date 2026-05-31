import type {
  ParseResult,
  ParsedTerm,
  ReviewDecisionRecord,
} from "@/data/parseTypes";

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
  reviewDecisions?: ReviewDecisionRecord[];
}

export interface StoredUploadedReportFile {
  uploadId: string;
  fileName: string;
  storedFile: string;
  storedAt: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function storeUploadedReportFile(
  file: File,
  uploadId: string
): Promise<StoredUploadedReportFile> {
  console.time(`[UploadedReportStorage] store ${file.name}`);
  const response = await fetch("/api/uploaded-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      fileName: file.name,
      mimeType: file.type,
      dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
    }),
  });

  if (!response.ok) {
    console.timeEnd(`[UploadedReportStorage] store ${file.name}`);
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to store uploaded report file.");
  }

  const storedFile = await response.json();
  console.timeEnd(`[UploadedReportStorage] store ${file.name}`);
  return storedFile;
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
    reviewDecisions: report.reviewDecisions ?? [],
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
  reviewed?: boolean,
  reviewDecisions?: ReviewDecisionRecord[]
): Promise<StoredParsedReport> {
  const response = await fetch(`/api/parsed-reports/${encodeURIComponent(reportId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parseResult, reviewed, reviewDecisions }),
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
