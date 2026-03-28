import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Heart, Loader2 } from "lucide-react";
import { ReportInput } from "@/components/ReportInput";
import { ReportViewer } from "@/components/ReportViewer";
import { FrequencyPanel } from "@/components/FrequencyPanel";
import { TermReview } from "@/components/TermReview";
import { detectAnomalies, getUniqueAnomalies, type DetectedAnomaly } from "@/lib/anomalyDetection";
import { getAnomalyDatabase, type AnomalyEntry } from "@/data/anomalyDatabase";
import { orchestrateParse, CostLimitError } from "@/lib/parsingOrchestrator";
import type { ParseResult, ReviewableTerm } from "@/data/mockParseResults";

type Stage = "upload" | "parsing" | "review" | "results";

const Index = () => {
  const [stage, setStage] = useState<Stage>("upload");
  const [reportText, setReportText] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedAnomaly[]>([]);
  const [unique, setUnique] = useState<AnomalyEntry[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [reviewTerms, setReviewTerms] = useState<ReviewableTerm[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleReport = async (text: string) => {
    setReportText(text);
    setParseError(null);
    setStage("parsing");

    try {
      // Try LLM pipeline (falls back to mock if no API key)
      const result = await orchestrateParse(text, { runVerifier: true });
      setParseResult(result);
      setReviewTerms(null);
      setStage("review");
    } catch (err) {
      if (err instanceof CostLimitError) {
        setParseError(`Cost limit exceeded: ${err.message}`);
        setStage("upload");
        return;
      }

      // Fallback to rule-based detection
      console.warn("LLM parse failed, falling back to rule-based detection:", err);
      const results = detectAnomalies(text);
      setDetected(results);
      setUnique(getUniqueAnomalies(results));
      setParseResult(null);
      setStage("results");
    }
  };

  const handleReviewConfirm = (accepted: ReviewableTerm[]) => {
    setReviewTerms(accepted);
    const db = getAnomalyDatabase();
    const dbLookup = new Map(db.map((e) => [e.term.toLowerCase(), e]));

    const mapped: DetectedAnomaly[] = accepted.map((t) => {
      const match =
        dbLookup.get(t.normalizedName.toLowerCase()) ??
        db.find((e) =>
          e.aliases.some((a) => a.toLowerCase() === t.normalizedName.toLowerCase())
        );

      const entry: AnomalyEntry = match ?? {
        term: t.normalizedName,
        aliases: [],
        frequency: 0,
        totalReports: 300,
        category: t.category,
      };

      return {
        term: t.term,
        entry,
        startIndex: t.startIndex,
        endIndex: t.endIndex,
      };
    });

    setDetected(mapped);
    setUnique(getUniqueAnomalies(mapped));
    setStage("results");
  };

  const handleReset = () => {
    setStage("upload");
    setReportText(null);
    setDetected([]);
    setUnique([]);
    setParseResult(null);
    setReviewTerms(null);
    setParseError(null);
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
          <Link
            to="/dataset"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Heart className="h-3.5 w-3.5 text-clinical-danger" />
            <span>300 reports in database</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {stage === "upload" && (
          <div className="mx-auto max-w-2xl animate-fade-in">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-semibold text-foreground">
                Upload CT Angiogram Report
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a report or paste text to detect anomalies and view historical frequency data.
              </p>
              {parseError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>
              )}
            </div>
            <ReportInput onReportSubmit={handleReport} />
          </div>
        )}

        {stage === "parsing" && (
          <div className="mx-auto max-w-md animate-fade-in text-center py-20">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Analyzing Report</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Running AI parser and verifier — check browser console for detailed logs
            </p>
          </div>
        )}

        {stage === "review" && parseResult && (
          <TermReview
            parseResult={parseResult}
            initialTerms={reviewTerms ?? undefined}
            onConfirm={handleReviewConfirm}
            onBack={handleReset}
          />
        )}

        {stage === "results" && reportText && (
          <div className="animate-fade-in">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Analysis Results</h2>
                <p className="text-xs text-muted-foreground">
                  {detected.length} anomaly mention{detected.length !== 1 ? "s" : ""} detected ·{" "}
                  {unique.length} unique condition{unique.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {parseResult && (
                  <button
                    onClick={() => setStage("review")}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    ← Back to Review
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  ← New Report
                </button>
              </div>
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
