import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { detectAnomalies, getUniqueAnomalies, type DetectedAnomaly } from "@/lib/anomalyDetection";
import type { AnomalyEntry } from "@/data/anomalyDatabase";
import { ReportViewer } from "@/components/ReportViewer";
import { FrequencyPanel } from "@/components/FrequencyPanel";

export interface MimicReport {
  id: string;
  subjectId: string;
  noteType: string;
  charttime: string;
  text: string;
  title: string;
}

export interface MimicReportsResponse {
  total: number;
  reports: MimicReport[];
}

export default function Dataset() {
  const [data, setData] = useState<MimicReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<MimicReport | null>(null);
  const [previewAnalyzed, setPreviewAnalyzed] = useState<{
    detected: DetectedAnomaly[];
    unique: AnomalyEntry[];
  } | null>(null);

  useEffect(() => {
    fetch("/mimic_reports_300.json")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load dataset");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openPreview = (report: MimicReport) => {
    setPreviewReport(report);
    const results = detectAnomalies(report.text);
    setPreviewAnalyzed({
      detected: results,
      unique: getUniqueAnomalies(results),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-card-foreground leading-tight">
                CT Angiogram Analyzer
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Dataset · MIMIC-IV-Note
              </p>
            </div>
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm">
              ← Analyzer
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground">
            Report dataset
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            First 300 radiology reports from MIMIC-IV-Note. Click a report to preview and run anomaly detection.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading dataset…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}. Run <code className="rounded bg-muted px-1 py-0.5">python scripts/mimic_pipeline.py</code> to generate <code className="rounded bg-muted px-1 py-0.5">public/mimic_reports_300.json</code>.
          </div>
        )}

        {data && !loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.reports.map((report, index) => (
              <button
                key={report.id}
                type="button"
                onClick={() => openPreview(report)}
                className="group flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <FileText className="mb-2 h-8 w-8 text-muted-foreground group-hover:text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {report.title}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {report.noteType} · {report.charttime.slice(0, 10)}
                </span>
                <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {report.text.slice(0, 120)}…
                </span>
              </button>
            ))}
          </div>
        )}

        <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
          <DialogContent className="max-h-[90vh] max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {previewReport?.title ?? "Report preview"}
              </DialogTitle>
            </DialogHeader>
            {previewReport && previewAnalyzed && (
              <ScrollArea className="max-h-[70vh]">
                <div className="grid gap-4 pr-4 lg:grid-cols-[1fr_280px]">
                  <div className="min-h-0">
                    <ReportViewer
                      text={previewReport.text}
                      anomalies={previewAnalyzed.detected}
                    />
                  </div>
                  <div>
                    <FrequencyPanel anomalies={previewAnalyzed.unique} />
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
