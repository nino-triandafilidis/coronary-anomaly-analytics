import { useState, useMemo, useCallback, Fragment } from "react";
import { Check, X, Plus, AlertTriangle, Clock, Cpu, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParseResult, ReviewableTerm, TermStatus } from "@/data/mockParseResults";

// ---------------------------------------------------------------------------
// Category color mapping (uses semantic tokens where possible)
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  Pulmonary: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Cardiac: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  Vascular: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Systemic: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Anatomy: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400",
};

function categoryBadgeClass(category: string) {
  return CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Status → highlight colour mapping
// ---------------------------------------------------------------------------

const STATUS_HIGHLIGHT: Record<TermStatus, string> = {
  pending: "bg-amber-200/60 dark:bg-amber-700/30",
  accepted: "bg-emerald-200/60 dark:bg-emerald-700/30",
  rejected: "bg-red-200/40 line-through opacity-50 dark:bg-red-800/20",
  added: "bg-sky-200/60 dark:bg-sky-700/30",
};

const STATUS_BORDER: Record<TermStatus, string> = {
  pending: "border-l-amber-400",
  accepted: "border-l-emerald-500",
  rejected: "border-l-red-400 opacity-60",
  added: "border-l-sky-500",
};

const CATEGORIES = ["Pulmonary", "Cardiac", "Vascular", "Systemic", "Other"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TermReviewProps {
  parseResult: ParseResult;
  initialTerms?: ReviewableTerm[];
  onConfirm: (accepted: ReviewableTerm[]) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TermReview({ parseResult, initialTerms, onConfirm, onBack }: TermReviewProps) {
  const [terms, setTerms] = useState<ReviewableTerm[]>(() =>
    initialTerms ??
    parseResult.parsedTerms.map((t) => ({ ...t, status: "pending" as TermStatus }))
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // --- Derived counts ---
  const counts = useMemo(() => {
    const c = { accepted: 0, rejected: 0, pending: 0, added: 0 };
    terms.forEach((t) => c[t.status]++);
    return c;
  }, [terms]);

  const confirmedCount = counts.accepted + counts.added;

  // --- Actions ---
  const setStatus = useCallback((idx: number, status: TermStatus) => {
    setTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, status } : t)));
  }, []);

  const toggleStatus = useCallback(
    (idx: number, target: TermStatus) => {
      setTerms((prev) =>
        prev.map((t, i) => {
          if (i !== idx) return t;
          return { ...t, status: t.status === target ? "pending" : target };
        })
      );
    },
    []
  );

  const bulkAccept = () =>
    setTerms((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "accepted" } : t))
    );

  const bulkReject = () =>
    setTerms((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "rejected" } : t))
    );

  const addTerm = () => {
    const name = newName.trim();
    if (!name) return;
    const added: ReviewableTerm = {
      term: name,
      normalizedName: name,
      category: newCategory || "Other",
      confidence: 1,
      startIndex: -1,
      endIndex: -1,
      context: "",
      isAnomaly: true,
      status: "added",
    };
    setTerms((prev) => [...prev, added]);
    setNewName("");
    setNewCategory("");
  };

  const handleConfirm = () => {
    onConfirm(terms.filter((t) => t.status === "accepted" || t.status === "added"));
  };

  // --- Build highlighted text segments ---
  const segments = useMemo(() => {
    // Only terms with valid positions
    const positioned = terms
      .map((t, idx) => ({ ...t, _idx: idx }))
      .filter((t) => t.startIndex >= 0 && t.endIndex > t.startIndex)
      .sort((a, b) => a.startIndex - b.startIndex);

    const text = parseResult.reportText;
    const parts: { text: string; termIdx: number | null; status: TermStatus | null }[] = [];
    let cursor = 0;

    for (const t of positioned) {
      if (t.startIndex < cursor) continue; // overlapping, skip
      if (t.startIndex > cursor) {
        parts.push({ text: text.slice(cursor, t.startIndex), termIdx: null, status: null });
      }
      parts.push({ text: text.slice(t.startIndex, t.endIndex), termIdx: t._idx, status: t.status });
      cursor = t.endIndex;
    }
    if (cursor < text.length) {
      parts.push({ text: text.slice(cursor), termIdx: null, status: null });
    }
    return parts;
  }, [terms, parseResult.reportText]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review AI Findings</h2>
            <p className="text-xs text-muted-foreground">
              {terms.length} terms extracted · approve or reject before continuing
            </p>
          </div>
          <button onClick={onBack} className="text-sm font-medium text-primary hover:underline">
            ← Back
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* LEFT — Report with highlights */}
          <div className="rounded-lg border border-border bg-card p-5 overflow-auto max-h-[75vh]">
            <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-card-foreground">
              {segments.map((seg, i) => {
                if (seg.termIdx === null) {
                  return <Fragment key={i}>{seg.text}</Fragment>;
                }
                const term = terms[seg.termIdx];
                const isHovered = hoveredIdx === seg.termIdx;
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span
                        className={`cursor-pointer rounded-sm px-0.5 transition-all duration-150 ${STATUS_HIGHLIGHT[seg.status!]} ${isHovered ? "ring-2 ring-primary" : ""}`}
                        onMouseEnter={() => setHoveredIdx(seg.termIdx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        {seg.text}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p className="font-semibold">{term.normalizedName}</p>
                      <p className="text-muted-foreground">
                        {term.category} · {Math.round(term.confidence * 100)}% confidence
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </p>
          </div>

          {/* RIGHT — Term review panel */}
          <div className="flex flex-col gap-4">
            {/* Model metadata */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5" />
                  {parseResult.parserModel}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {parseResult.parseTimeMs}ms
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  ${parseResult.estimatedCostUsd.toFixed(4)}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-xs font-medium">
                <span className="text-emerald-600 dark:text-emerald-400">{counts.accepted} accepted</span>
                <span className="text-red-500 dark:text-red-400">{counts.rejected} rejected</span>
                <span className="text-amber-600 dark:text-amber-400">{counts.pending} pending</span>
                {counts.added > 0 && (
                  <span className="text-sky-600 dark:text-sky-400">{counts.added} added</span>
                )}
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={bulkAccept}>
                <Check className="h-3.5 w-3.5" /> Accept All
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={bulkReject}>
                <X className="h-3.5 w-3.5" /> Reject All
              </Button>
            </div>

            {/* Term cards */}
            <ScrollArea className="max-h-[45vh]">
              <div className="flex flex-col gap-2 pr-3">
                {terms.map((term, idx) => {
                  const isHovered = hoveredIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={`rounded-md border border-border bg-card p-3 border-l-4 transition-all duration-150 ${STATUS_BORDER[term.status]} ${isHovered ? "ring-2 ring-primary" : ""}`}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-card-foreground truncate">
                              {term.normalizedName}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 ${categoryBadgeClass(term.category)}`}
                            >
                              {term.category}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {term.context || term.term}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{Math.round(term.confidence * 100)}%</span>
                            {!term.isAnomaly && (
                              <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                likely not anomaly
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => toggleStatus(idx, "accepted")}
                            className={`rounded p-1 transition-colors ${term.status === "accepted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}
                            aria-label="Accept"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleStatus(idx, "rejected")}
                            className={`rounded p-1 transition-colors ${term.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"}`}
                            aria-label="Reject"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Add term */}
            <div className="rounded-lg border border-dashed border-border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Add a term manually</p>
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Term name…"
                  className="h-8 text-xs flex-1"
                />
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 px-2" onClick={addTerm} disabled={!newName.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Confirm CTA */}
            <Button onClick={handleConfirm} disabled={confirmedCount === 0} className="w-full">
              Confirm {confirmedCount} term{confirmedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
