import { useState } from "react";
import { Activity, Heart } from "lucide-react";
import { ReportInput } from "@/components/ReportInput";
import { ReportViewer } from "@/components/ReportViewer";
import { FrequencyPanel } from "@/components/FrequencyPanel";
import { detectAnomalies, getUniqueAnomalies, type DetectedAnomaly } from "@/lib/anomalyDetection";
import type { AnomalyEntry } from "@/data/anomalyDatabase";

const Index = () => {
  const [reportText, setReportText] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedAnomaly[]>([]);
  const [unique, setUnique] = useState<AnomalyEntry[]>([]);

  const handleReport = (text: string) => {
    const results = detectAnomalies(text);
    setReportText(text);
    setDetected(results);
    setUnique(getUniqueAnomalies(results));
  };

  const handleReset = () => {
    setReportText(null);
    setDetected([]);
    setUnique([]);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-card-foreground leading-tight">
                CT Angiogram Analyzer
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Anomaly Frequency Analysis · Demo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5 text-clinical-danger" />
            <span>300 reports in database</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!reportText ? (
          /* Input State */
          <div className="mx-auto max-w-2xl animate-fade-in">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-semibold text-foreground">
                Upload CT Angiogram Report
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a report or paste text to detect anomalies and view historical frequency data.
              </p>
            </div>
            <ReportInput onReportSubmit={handleReport} />
          </div>
        ) : (
          /* Results State */
          <div className="animate-fade-in">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Analysis Results</h2>
                <p className="text-xs text-muted-foreground">
                  {detected.length} anomaly mention{detected.length !== 1 ? "s" : ""} detected ·{" "}
                  {unique.length} unique condition{unique.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="text-sm font-medium text-primary hover:underline"
              >
                ← New Report
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <ReportViewer text={reportText} anomalies={detected} />
              <FrequencyPanel anomalies={unique} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
