import { useState, useRef } from "react";
import { Upload, FileText, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sampleReports } from "@/data/sampleReports";

interface ReportInputProps {
  onReportSubmit: (text: string) => void;
}

export function ReportInput({ onReportSubmit }: ReportInputProps) {
  const [text, setText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setText(content);
        onReportSubmit(content);
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleAnalyze = () => {
    if (text.trim()) onReportSubmit(text.trim());
  };

  const loadSample = (index: number) => {
    const report = sampleReports[index];
    setText(report.text);
    onReportSubmit(report.text);
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Drop a .txt report file here
        </p>
        <p className="mt-1 text-xs text-muted-foreground">or</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fileInputRef.current?.click()}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleAnalyze} disabled={!text.trim()}>
          Analyze Report
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Load sample:</span>
          {sampleReports.map((report, i) => (
            <Button
              key={report.id}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary"
              onClick={() => loadSample(i)}
            >
              Patient {String.fromCharCode(65 + i)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
