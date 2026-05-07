import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  FileText,
  CheckCircle2,
  MinusCircle,
  Trash2,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSavedReports, deleteReport, type SavedReport } from "@/lib/reportDatabase";
import type { ParsedTerm } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// ParsedFindingsPanel — read-only pertinent positives + negatives list
// ---------------------------------------------------------------------------

function ParsedFindingsPanel({ terms }: { terms: ParsedTerm[] }) {
  const asserted = terms.filter((t) => t.assertion === "asserted");
  const negated = terms.filter((t) => t.assertion === "negated");

  if (terms.length === 0) {
    return <p className="text-xs text-muted-foreground">No parsed findings.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {asserted.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Pertinent positives ({asserted.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {asserted.map((t, i) => (
              <div key={i} className="rounded-md border border-border bg-card px-3 py-2">
                <span className="text-sm font-medium text-card-foreground">
                  {t.normalizedName}
                </span>
                {t.context && (
                  <p className="mt-1 text-[11px] text-muted-foreground italic line-clamp-2">
                    "{t.context}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {negated.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MinusCircle className="h-3.5 w-3.5" />
            Pertinent negatives ({negated.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {negated.map((t, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40 decoration-dashed">
                  {t.normalizedName}
                </span>
                {t.context && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70 italic line-clamp-2">
                    "{t.context}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dataset() {
  const [reports, setReports] = useState<SavedReport[]>(() => getSavedReports());
  const [previewReport, setPreviewReport] = useState<SavedReport | null>(null);

  const handleDelete = (id: string) => {
    deleteReport(id);
    setReports(getSavedReports());
    if (previewReport?.id === id) setPreviewReport(null);
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
                Dataset · Parsed Reports
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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              Parsed report database
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reports saved from the analyzer after human term review.
              Run a report, accept findings, then click{" "}
              <span className="font-medium text-foreground">Save to database</span>.
            </p>
          </div>
          <span className="mt-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {reports.length} report{reports.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Empty state */}
        {reports.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-24 text-center">
            <Database className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No reports saved yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Upload a report, run the AI parser, review the findings, then save.
              </p>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm">
                Go to Analyzer
              </Button>
            </Link>
          </div>
        )}

        {/* Report grid */}
        {reports.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => {
              const asserted = report.parsedTerms.filter((t) => t.assertion === "asserted");
              const negated = report.parsedTerms.filter((t) => t.assertion === "negated");
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setPreviewReport(report)}
                  className="group flex flex-col items-start rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
                >
                  <FileText className="mb-2 h-8 w-8 text-muted-foreground group-hover:text-primary" />
                  <span className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                    {report.title}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {new Date(report.savedAt).toLocaleString()}
                  </span>
                  <div className="mt-3 flex items-center gap-2">
                    {asserted.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        {asserted.length} pertinent positive{asserted.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {negated.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <MinusCircle className="h-3 w-3" />
                        {negated.length} pertinent negative{negated.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <span className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {report.text.slice(0, 120)}…
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Preview dialog */}
        <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
          <DialogContent className="max-h-[90vh] max-w-5xl">
            <DialogHeader>
              <div className="flex items-start justify-between gap-4 pr-8">
                <DialogTitle className="leading-snug">
                  {previewReport?.title ?? "Report preview"}
                </DialogTitle>
                {previewReport && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete report?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove "{previewReport.title}" from the local database. This
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(previewReport.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </DialogHeader>

            {previewReport && (
              <ScrollArea className="max-h-[74vh]">
                <div className="grid gap-5 pr-4 lg:grid-cols-[1fr_300px]">
                  {/* Report text */}
                  <div className="rounded-lg border border-border bg-card p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-card-foreground overflow-auto max-h-[65vh]">
                    {previewReport.text}
                  </div>

                  {/* Right panel */}
                  <div className="flex flex-col gap-3">
                    {/* Model metadata */}
                    <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <span className="font-medium text-foreground">Model</span>{" "}
                          {previewReport.parserModel}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">Time</span>{" "}
                          {previewReport.parseTimeMs}ms
                        </span>
                        <span>
                          <span className="font-medium text-foreground">Cost</span>{" "}
                          ${previewReport.estimatedCostUsd.toFixed(4)}
                        </span>
                        <span>
                          <span className="font-medium text-foreground">Saved</span>{" "}
                          {new Date(previewReport.savedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Parsed findings */}
                    <ParsedFindingsPanel terms={previewReport.parsedTerms} />
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
