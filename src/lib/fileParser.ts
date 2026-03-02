/**
 * Modular file parser for report uploads.
 * Supports .txt, .pdf, and .docx with clear error handling.
 */

import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// PDF.js worker: use CDN so the worker loads in browser (Vite doesn't serve node_modules worker)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.mjs`;
}

const SUPPORTED_TYPES = {
  "text/plain": "txt",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

const EXT_TO_TYPE: Record<string, keyof typeof SUPPORTED_TYPES> = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type SupportedFormat = "txt" | "pdf" | "docx";

export function getSupportedExtensions(): string[] {
  return [".txt", ".pdf", ".docx"];
}

export function isSupportedFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const type = file.type?.toLowerCase();
  return (
    ext in EXT_TO_TYPE ||
    (type !== "" && type in SUPPORTED_TYPES)
  );
}

export function getFormatFromFile(file: File): SupportedFormat | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const key = ext in EXT_TO_TYPE ? EXT_TO_TYPE[ext] : (file.type in SUPPORTED_TYPES ? file.type as keyof typeof SUPPORTED_TYPES : null);
  return key ? SUPPORTED_TYPES[key] : null;
}

/**
 * Extract text from a plain text file (sync from string).
 */
export function parseTxt(content: string): string {
  return content;
}

/**
 * Extract text from PDF buffer. Returns concatenated text from all pages.
 * Optional onProgress for multi-page progress (0-1).
 */
export async function parsePdf(
  arrayBuffer: ArrayBuffer,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  });
  if (onProgress) {
    loadingTask.onProgress?.((p: { loaded: number; total: number }) => {
      if (p.total > 0) onProgress(p.loaded, p.total);
    });
  }
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pageTexts.push(text);
    if (onProgress && numPages > 0) {
      onProgress(i, numPages);
    }
  }
  return pageTexts.join("\n\n");
}

/**
 * Extract raw text from a .docx file (ArrayBuffer).
 */
export async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export interface ParseResult {
  text: string;
  format: SupportedFormat;
}

/**
 * Parse a File into plain text. Dispatches by format.
 * For PDF, onProgress(loaded, total) can report page progress (loaded/total pages).
 */
export async function parseFile(
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<ParseResult> {
  const format = getFormatFromFile(file);
  if (!format) {
    throw new Error(`Unsupported file type: ${file.name}. Use .txt, .pdf, or .docx.`);
  }

  if (format === "txt") {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    return { text, format };
  }

  const arrayBuffer = await file.arrayBuffer();

  if (format === "pdf") {
    const text = await parsePdf(arrayBuffer, onProgress);
    return { text, format };
  }

  if (format === "docx") {
    const text = await parseDocx(arrayBuffer);
    return { text, format };
  }

  throw new Error(`Unsupported file type: ${file.name}. Use .txt, .pdf, or .docx.`);
}
