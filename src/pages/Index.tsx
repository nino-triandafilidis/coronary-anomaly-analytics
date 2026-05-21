import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, GitCompare, Heart, Loader2, BookmarkCheck } from "lucide-react";
import { ReportInput } from "@/components/ReportInput";
import { ReportViewer } from "@/components/ReportViewer";
import { FrequencyPanel } from "@/components/FrequencyPanel";
import { TermReview } from "@/components/TermReview";
import {
  getHistoryForTerm,
  type DetectedAnomaly,
} from "@/data/anomalyDatabase";
import { orchestrateParse, CostLimitError } from "@/lib/parsingOrchestrator";
import type {
  ParseResult,
  ReviewableTerm,
  ReviewDecisionRecord,
} from "@/data/parseTypes";
import {
  saveReport,
  getReportCount,
  deriveTitleFromText,
} from "@/lib/reportDatabase";
import {
  getStoredParsedReports,
  storeParsedReportFiles,
  updateStoredParsedReport,
} from "@/lib/parsedReportStorage";
import { useToast } from "@/hooks/use-toast";

type Stage = "upload" | "parsing" | "review" | "results";

function waitForBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

const Index = () => {
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("upload");
  const [reportText, setReportText] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedAnomaly[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [reviewTerms, setReviewTerms] = useState<ReviewableTerm[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dbCount, setDbCount] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);

  const refreshParsedReportCount = async () => {
    try {
      const reports = await getStoredParsedReports();
      setDbCount(reports.length);
    } catch (err) {
      console.warn("[Index] Failed to load parsed report count:", err);
      setDbCount(getReportCount());
    }
  };

  useEffect(() => {
    refreshParsedReportCount();
  }, []);

  const handleReport = async (text: string) => {
    setReportText(text);
    setParseError(null);
    setSavedId(null);
    setStage("parsing");

    try {
      await waitForBrowserPaint();
      const result = await orchestrateParse(text);
      await storeParsedReportFiles(text, result);
      await refreshParsedReportCount();
      setParseResult(result);
      setReviewTerms(null);
      setStage("review");
    } catch (err) {
      // No silent rule-based fallback. The dictionary detector has no negation
      // logic and was previously masking real LLM failures (e.g. highlighting
      // "pleural effusion" inside the literal phrase "no pleural effusion").
      // Surface the failure to the user instead.
      const message =
        err instanceof CostLimitError
          ? `Cost limit exceeded: ${err.message}`
          : err instanceof Error
            ? `Parse failed: ${err.message}`
            : "Parse failed: unknown error. Check the browser console.";
      console.error("[Index] orchestrateParse failed:", err);
      setParseError(message);
      setStage("upload");
    }
  };

  const stripReviewStatus = (term: ReviewableTerm) => {
    const { status: _status, ...parsedTerm } = term;
    return parsedTerm;
  };

  const handleReviewConfirm = async (
    accepted: ReviewableTerm[],
    reviewDecisions: ReviewDecisionRecord[]
  ) => {
    if (!parseResult) return;

    const nextParseResult: ParseResult = {
      ...parseResult,
      parsedTerms: accepted.map(stripReviewStatus),
    };

    try {
      await updateStoredParsedReport(
        nextParseResult.reportId,
        nextParseResult,
        true,
        reviewDecisions
      );
      setParseResult(nextParseResult);
      toast({
        title: "Saved",
        description: `Updated ${nextParseResult.reportId}.json`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update parsed JSON.";
      toast({ title: "Could not save", description: message });
      throw err;
    }

    setReviewTerms(accepted);
    setSavedId(null);

    // Historical frequency comes from the saved-report corpus (localStorage),
    // not a static reference set. Computed at confirm time so the tooltips
    // reflect whatever was in the DB at the moment of review — the current
    // report hasn't been saved yet, so it never inflates its own counts.
    const mapped: DetectedAnomaly[] = accepted.map((t) => ({
      term: t.term,
      normalizedName: t.normalizedName,
      startIndex: t.startIndex,
      endIndex: t.endIndex,
      assertion: t.assertion,
      history: getHistoryForTerm(t.normalizedName),
    }));

    setDetected(mapped);
    setStage("results");
  };

  const handleSaveToDatabase = () => {
    if (!parseResult || !reportText || !reviewTerms) return;

    const id = parseResult.reportId || `report-${Date.now()}`;
    // Don't save the same parse result twice
    if (savedId === id) return;

    saveReport({
      id,
      title: deriveTitleFromText(reportText),
      text: reportText,
      parsedTerms: reviewTerms,
      parserModel: parseResult.parserModel,
      verifierModel: parseResult.verifierModel,
      verifierAgreement: parseResult.verifierAgreement,
      parseTimeMs: parseResult.parseTimeMs,
      totalTokensUsed: parseResult.totalTokensUsed,
      estimatedCostUsd: parseResult.estimatedCostUsd,
      savedAt: new Date().toISOString(),
    });

    setSavedId(id);
    setDbCount(getReportCount());
    toast({ title: "Saved to database", description: deriveTitleFromText(reportText) });
  };

  const handleReset = () => {
    setStage("upload");
    setReportText(null);
    setDetected([]);
    setParseResult(null);
    setReviewTerms(null);
    setParseError(null);
    setSavedId(null);
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
          <div className="flex items-center gap-4">
            <Link
              to="/analysis"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span>Analysis Page</span>
            </Link>
            <Link
              to="/comparison"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <GitCompare className="h-3.5 w-3.5 text-primary" />
              <span>Comparison Page</span>
            </Link>
            <Link
              to="/dataset"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Heart className="h-3.5 w-3.5 text-clinical-danger" />
              <span>
                {dbCount} report{dbCount !== 1 ? "s" : ""} in database
              </span>
            </Link>
          </div>
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

        {stage === "results" && reportText && (() => {
          const assertedCount = detected.filter((d) => d.assertion === "asserted").length;
          const negatedCount = detected.filter((d) => d.assertion === "negated").length;
          const uniqueAsserted = new Set(
            detected.filter((d) => d.assertion === "asserted").map((d) => d.normalizedName)
          ).size;
          const uniqueNegated = new Set(
            detected.filter((d) => d.assertion === "negated").map((d) => d.normalizedName)
          ).size;
          const alreadySaved = !!savedId;
          return (
            <div className="animate-fade-in">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Analysis Results</h2>
                  <p className="text-xs text-muted-foreground">
                    {assertedCount} pertinent positive{assertedCount !== 1 ? "s" : ""} ·{" "}
                    {negatedCount} pertinent negative{negatedCount !== 1 ? "s" : ""} ·{" "}
                    {uniqueAsserted + uniqueNegated} unique condition
                    {uniqueAsserted + uniqueNegated !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Save to database */}
                  {parseResult && reviewTerms && (
                    <button
                      onClick={handleSaveToDatabase}
                      disabled={alreadySaved}
                      className={
                        "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors " +
                        (alreadySaved
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 cursor-default"
                          : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10")
                      }
                    >
                      <BookmarkCheck className="h-3.5 w-3.5" />
                      {alreadySaved ? "Saved" : "Save to database"}
                    </button>
                  )}
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
                <FrequencyPanel detected={detected} />
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
};

export default Index;
