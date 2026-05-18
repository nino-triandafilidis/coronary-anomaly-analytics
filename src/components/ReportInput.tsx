import { useState, useRef } from "react";
import { Upload, FileText, ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  parseFile,
  isSupportedFile,
  getSupportedExtensions,
} from "@/lib/fileParser";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

interface ReportInputProps {
  onReportSubmit: (text: string) => void;
}

export function ReportInput({ onReportSubmit }: ReportInputProps) {
  const [text, setText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ loaded: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptList = getSupportedExtensions().join(",");

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large", {
        description: `Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
      });
      return;
    }

    if (!isSupportedFile(file)) {
      toast.error("Unsupported file type", {
        description: `Please use ${acceptList} files.`,
      });
      return;
    }

    setLoading(true);
    setParseProgress(null);
    try {
      const onProgress = (loaded: number, total: number) => {
        setParseProgress({ loaded, total });
      };
      const { text: content } = await parseFile(file, onProgress);
      const trimmed = content.trim();
      if (!trimmed) {
        toast.error("Empty file", {
          description: "The file contains no text. Paste or upload a report with content.",
        });
        setLoading(false);
        setParseProgress(null);
        return;
      }
      setText(trimmed);
      onReportSubmit(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read file.";
      toast.error("Could not read file", { description: message });
    } finally {
      setLoading(false);
      setParseProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleAnalyze = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("No content", {
        description: "Paste report text or upload a file first.",
      });
      return;
    }
    onReportSubmit(trimmed);
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
            <p className="text-sm font-medium text-foreground">Reading file…</p>
            {parseProgress != null && parseProgress.total > 0 && (
              <p className="text-xs text-muted-foreground">
                Page {parseProgress.loaded} of {parseProgress.total}
              </p>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptList}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Drop a report file here (.txt, .pdf, or .docx)
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
