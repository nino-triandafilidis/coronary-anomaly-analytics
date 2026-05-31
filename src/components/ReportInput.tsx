import { useRef, useState } from "react";
import { Upload, FileText, ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseFile,
  isSupportedFile,
  getSupportedExtensions,
} from "@/lib/fileParser";
import { storeUploadedReportFile } from "@/lib/parsedReportStorage";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

export interface ReportSubmission {
  text: string;
  sourceName: string;
  uploadId?: string;
  uploadedFile?: string;
}

interface ReportInputProps {
  onReportSubmit: (reports: ReportSubmission[]) => void;
}

export function ReportInput({ onReportSubmit }: ReportInputProps) {
  const [text, setText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parseProgress, setParseProgress] = useState<{
    loaded: number;
    total: number;
    fileIndex: number;
    fileTotal: number;
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptList = getSupportedExtensions().join(",");

  const validateFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large", {
        description: `${file.name}: maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB. This file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
      });
      return false;
    }

    if (!isSupportedFile(file)) {
      toast.error("Unsupported file type", {
        description: `${file.name}: please use ${acceptList} files.`,
      });
      return false;
    }

    return true;
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const validFiles = files.filter(validateFile);
    if (validFiles.length === 0) return;

    setLoading(true);
    setParseProgress(null);

    try {
      const reports: ReportSubmission[] = [];

      for (const [index, file] of validFiles.entries()) {
        const uploadId = crypto.randomUUID();
        setParseProgress({
          loaded: 0,
          total: 0,
          fileIndex: index + 1,
          fileTotal: validFiles.length,
          fileName: file.name,
        });

        console.time(`[ReportInput] store uploaded file ${file.name}`);
        const uploaded = await storeUploadedReportFile(file, uploadId);
        console.timeEnd(`[ReportInput] store uploaded file ${file.name}`);
        console.log(
          `[ReportInput] Stored uploaded report before parsing: ${uploaded.storedFile}`
        );

        const { text: content } = await parseFile(file, (loaded, total) => {
          setParseProgress({
            loaded,
            total,
            fileIndex: index + 1,
            fileTotal: validFiles.length,
            fileName: file.name,
          });
        });

        const trimmed = content.trim();
        if (!trimmed) {
          toast.error("Empty file", {
            description: `${file.name} contains no text and was skipped.`,
          });
          continue;
        }

        reports.push({
          text: trimmed,
          sourceName: file.name,
          uploadId,
          uploadedFile: uploaded.storedFile,
        });
      }

      if (reports.length === 0) return;

      setText(reports.length === 1 ? reports[0].text : "");
      onReportSubmit(reports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read file.";
      console.error("[ReportInput] Could not read uploaded file(s):", err);
      toast.error("Could not read file", { description: message });
    } finally {
      setLoading(false);
      setParseProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const handleAnalyze = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("No content", {
        description: "Paste report text or upload a file first.",
      });
      return;
    }
    onReportSubmit([{ text: trimmed, sourceName: "Pasted report" }]);
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        } ${loading ? "pointer-events-none opacity-70" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              Reading {parseProgress?.fileTotal && parseProgress.fileTotal > 1 ? "files" : "file"}...
            </p>
            {parseProgress != null && (
              <p className="text-xs text-muted-foreground">
                {parseProgress.fileTotal > 1 && (
                  <>
                    File {parseProgress.fileIndex} of {parseProgress.fileTotal}:{" "}
                  </>
                )}
                {parseProgress.fileName}
                {parseProgress.total > 0 && (
                  <>
                    {" "}
                    - Page {parseProgress.loaded} of {parseProgress.total}
                  </>
                )}
              </p>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptList}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Drop report files here (.txt, .pdf, or .docx)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">or</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <FileText className="mr-2 h-4 w-4" />
          Browse Files
        </Button>
      </div>

      {/* Text Area */}
      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or paste CT angiogram report text here..."
          className="min-h-[160px] resize-y font-mono text-sm leading-relaxed"
        />
        <div className="absolute bottom-2 right-2">
          <ClipboardPaste className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center">
        <Button onClick={handleAnalyze} disabled={!text.trim()}>
          Analyze Report
        </Button>
      </div>
    </div>
  );
}
