import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { Check, X, Plus, AlertTriangle, Clock, Cpu, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ParseResult,
  ReviewableTerm,
  ReviewDecisionRecord,
  TermStatus,
} from "@/data/parseTypes";

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TermReviewProps {
  parseResult: ParseResult;
  initialTerms?: ReviewableTerm[];
  onConfirm: (
    accepted: ReviewableTerm[],
    reviewDecisions: ReviewDecisionRecord[]
  ) => void | Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TermReview({
  parseResult,
  initialTerms,
  onConfirm,
  onBack,
  readOnly = false,
}: TermReviewProps) {
  const [terms, setTerms] = useState<ReviewableTerm[]>(() =>
    initialTerms ??
    parseResult.parsedTerms.map((t) => ({
      ...t,
      status: (readOnly ? "accepted" : "pending") as TermStatus,
    }))
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const statusBeforeAssertionToggle = useRef(new Map<number, TermStatus>());

  // --- Selection-based add-term state ---
  const reportRef = useRef<HTMLParagraphElement>(null);
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string;
    startIndex: number;
    endIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // --- Derived counts ---
  const counts = useMemo(() => {
    const c = { accepted: 0, rejected: 0, pending: 0, added: 0 };
    terms.forEach((t) => c[t.status]++);
    return c;
  }, [terms]);

  const keptCount = counts.accepted + counts.added;
  const reviewedCount = counts.accepted + counts.rejected + counts.added;

  // --- Actions ---
  const toggleStatus = useCallback(
    (idx: number, target: TermStatus) => {
      if (readOnly) return;
      setTerms((prev) =>
        prev.map((t, i) => {
          if (i !== idx) return t;
          return { ...t, status: t.status === target ? "pending" : target };
        })
      );
    },
    [readOnly]
  );

  const bulkAccept = () =>
    !readOnly &&
    setTerms((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "accepted" } : t))
    );

  const bulkReject = () =>
    !readOnly &&
    setTerms((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "rejected" } : t))
    );

  // --- Text selection handler ---
  useEffect(() => {
    if (readOnly) {
      setSelectionPopover(null);
      return;
    }

    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !reportRef.current) {
        return;
      }

      // Ensure selection is within the report panel
      const range = sel.getRangeAt(0);
      if (!reportRef.current.contains(range.commonAncestorContainer)) {
        return;
      }

      const selectedText = sel.toString().trim();
      if (!selectedText) return;

      // Compute startIndex/endIndex within the full report text
      const fullText = parseResult.reportText;
      // Walk text nodes to find the offset
      const startOffset = getTextOffset(reportRef.current, range.startContainer, range.startOffset);
      const endOffset = getTextOffset(reportRef.current, range.endContainer, range.endOffset);

      if (startOffset === -1 || endOffset === -1) return;

      // Verify the text matches
      const extracted = fullText.slice(startOffset, endOffset).trim();
      if (!extracted) return;

      // Position the popover near the selection
      const rect = range.getBoundingClientRect();
      setSelectionPopover({
        text: selectedText,
        startIndex: startOffset,
        endIndex: endOffset,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [parseResult.reportText, readOnly]);

  const addSelectedTerm = () => {
    if (readOnly || !selectionPopover) return;
    const added: ReviewableTerm = {
      term: selectionPopover.text,
      normalizedName: selectionPopover.text,
      // Manually-added terms default to asserted — the user is affirmatively
      // marking the span. They can flip it via the assertion toggle if they
      // intended a ruled-out finding the parser missed.
      assertion: "asserted",
      confidence: 1,
      startIndex: selectionPopover.startIndex,
      endIndex: selectionPopover.endIndex,
      context: "",
      isAnomaly: true,
      status: "added",
    };
    setTerms((prev) => [...prev, added]);
    setSelectionPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const toggleAssertion = useCallback((idx: number) => {
    if (readOnly) return;
    setTerms((prev) =>
      prev.map((t, i) => {
        if (i !== idx) return t;

        const nextAssertion = t.assertion === "negated" ? "asserted" : "negated";
        const originalAssertion = parseResult.parsedTerms[idx]?.assertion;
        const isBackToOriginal = originalAssertion === nextAssertion;

        if (t.status === "added") {
          return { ...t, assertion: nextAssertion };
        }

        if (!statusBeforeAssertionToggle.current.has(idx)) {
          statusBeforeAssertionToggle.current.set(idx, t.status);
        }

        const restoredStatus = statusBeforeAssertionToggle.current.get(idx) ?? "pending";
        if (isBackToOriginal) {
          statusBeforeAssertionToggle.current.delete(idx);
        }

        return {
          ...t,
          assertion: nextAssertion,
          status: isBackToOriginal ? restoredStatus : "accepted",
        };
      })
    );
  }, [parseResult.parsedTerms, readOnly]);

  const dismissPopover = () => {
    setSelectionPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleConfirm = async () => {
    if (readOnly) return;
    setConfirming(true);
    try {
      const reviewedAt = new Date().toISOString();
      const reviewDecisions: ReviewDecisionRecord[] = terms
        .filter((t) => t.status === "accepted" || t.status === "added" || t.status === "rejected")
        .map((term) => {
          const { status: _status, ...parsedTerm } = term;
          return {
            ...parsedTerm,
            decision: term.status === "rejected" ? "skip" : "keep",
            reviewedAt,
          };
        });

      await onConfirm(
        terms.filter((t) => t.status === "accepted" || t.status === "added"),
        reviewDecisions
      );
    } catch (err) {
      console.error("[TermReview] Confirm failed:", err);
    } finally {
      setConfirming(false);
    }
  };

  // --- Build highlighted text segments ---
  const segments = useMemo(() => {
    const positioned = terms
      .map((t, idx) => ({ ...t, _idx: idx }))
      .filter((t) => t.startIndex >= 0 && t.endIndex > t.startIndex)
      .sort((a, b) => a.startIndex - b.startIndex);

    const text = parseResult.reportText;
    const parts: { text: string; termIdx: number | null; status: TermStatus | null }[] = [];
    let cursor = 0;

    for (const t of positioned) {
      if (t.startIndex < cursor) continue;
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
            <h2 className="text-lg font-semibold text-foreground">
              {readOnly ? "Preview AI Findings" : "Review AI Findings"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? `${terms.length} terms extracted`
                : `${terms.length} terms extracted · approve or reject before continuing`}
            </p>
          </div>
          <button onClick={onBack} className="text-sm font-medium text-primary hover:underline">
            ← Back
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
          {/* LEFT — Report with highlights. min-w-0 (via minmax(0,1fr) above)
              lets the column shrink past its content width so the right
              column never gets pushed off-screen. */}
          <div className="relative min-w-0 rounded-lg border border-border bg-card p-5 overflow-auto max-h-[75vh]">
            <p
              ref={reportRef}
              className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-card-foreground"
            >
              {segments.map((seg, i) => {
                // Rejected terms drop the highlight entirely — the user has
                // already decided this span isn't a finding, so it should read
                // like the rest of the report. The card on the right keeps the
                // rejected badge so the choice is still visible.
                if (seg.termIdx === null || seg.status === "rejected") {
                  return <Fragment key={i}>{seg.text}</Fragment>;
                }
                const term = terms[seg.termIdx];
                const isHovered = hoveredIdx === seg.termIdx;
                // Negated terms get gray + dashed-underline regardless of
                // accept/reject status, so the user can see at a glance which
                // findings the radiologist ruled out. Accept/reject is still
                // visible via the matching card border on the right.
                const isNegated = term.assertion === "negated";
                const baseClass = isNegated
                  ? "cursor-pointer px-0.5 text-muted-foreground/90 underline decoration-muted-foreground/60 decoration-dashed underline-offset-4 transition-all duration-150"
                  : `cursor-pointer rounded-sm px-0.5 transition-all duration-150 ${STATUS_HIGHLIGHT[seg.status!]}`;
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span
                        data-term-index={seg.termIdx}
                        className={`${baseClass} ${isHovered ? "ring-2 ring-primary" : ""}`}
                        onMouseEnter={() => setHoveredIdx(seg.termIdx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => {
                          const card = document.querySelector(
                            `[data-term-card-index="${seg.termIdx}"]`
                          );
                          card?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        {seg.text}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p className="font-semibold">{term.normalizedName}</p>
                      <p className="text-muted-foreground">
                        <span
                          className={
                            term.assertion === "negated"
                              ? "text-muted-foreground"
                              : "text-emerald-600 dark:text-emerald-400"
                          }
                        >
                          {term.assertion === "negated" ? "pertinent negative" : "pertinent positive"}
                        </span>
                        {term.correctionType && term.correctionType !== "exact" && (
                          <> · <span className="text-amber-600 dark:text-amber-400">{term.correctionType === "whitespace" ? "whitespace fix" : term.correctionType === "resolved" ? "AI-resolved" : term.correctionType}</span></>
                        )}
                      </p>
                      {term.resolutionNote && (
                        <p className="text-muted-foreground/70 mt-0.5 italic">{term.resolutionNote}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </p>

            {/* Floating popover for text selection */}
            {!readOnly && selectionPopover && (
              <div
                className="fixed z-50"
                style={{
                  left: selectionPopover.x,
                  top: selectionPopover.y - 8,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
                  <p className="text-xs font-medium text-popover-foreground mb-2 max-w-[200px] truncate">
                    Add: "{selectionPopover.text}"
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={addSelectedTerm}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={dismissPopover}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Term review panel */}
          <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:h-[75vh] lg:max-h-[75vh]">
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

            {/* Bulk actions — only act on the pending pile, never on already-accepted/rejected terms */}
            {!readOnly && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={bulkAccept}
                disabled={counts.pending === 0}
              >
                <Check className="h-3.5 w-3.5" /> Accept Remaining ({counts.pending})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={bulkReject}
                disabled={counts.pending === 0}
              >
                <X className="h-3.5 w-3.5" /> Reject Remaining ({counts.pending})
              </Button>
            </div>
            )}

            {/* Term cards */}
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-2 pr-3">
                {terms.map((term, idx) => {
                  const isHovered = hoveredIdx === idx;
                  return (
                    <div
                      key={idx}
                      data-term-card-index={idx}
                      className={`rounded-md border border-border bg-card p-3 border-l-4 transition-all duration-150 ${STATUS_BORDER[term.status]} ${isHovered ? "ring-2 ring-primary" : ""}`}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => {
                        const span = document.querySelector(`[data-term-index="${idx}"]`);
                        span?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="min-w-0 break-words text-sm font-medium text-card-foreground">
                              {term.normalizedName}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAssertion(idx);
                              }}
                              disabled={readOnly}
                              title={
                                term.assertion === "negated"
                                  ? "Marked as pertinent negative — click to flip"
                                  : "Marked as pertinent positive — click to flip"
                              }
                              className={
                                "text-[10px] px-1.5 py-0 rounded uppercase tracking-wide font-medium transition-colors " +
                                (term.assertion === "negated"
                                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300")
                              }
                            >
                              {term.assertion === "negated" ? "Pertinent negative" : "Pertinent positive"}
                            </button>
                            {term.correctionType && term.correctionType !== "exact" && (
                              <span className="text-[10px] px-1 py-0 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {term.correctionType === "whitespace" ? "ws fix" : term.correctionType === "resolved" ? "resolved" : term.correctionType}
                              </span>
                            )}
                            {!term.isAnomaly && (
                              <span className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                likely not anomaly
                              </span>
                            )}
                          </div>
                        </div>
                        {!readOnly && (
                        <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto sm:shrink-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleStatus(idx, "accepted");
                            }}
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${term.status === "accepted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}
                            aria-label="Keep term"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Keep
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleStatus(idx, "rejected");
                            }}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-colors ${term.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"}`}
                            aria-label="Skip term"
                          >
                            <X className="h-3.5 w-3.5" />
                            Skip
                          </button>
                        </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Hint for adding terms */}
            {!readOnly && (
            <p className="text-[11px] text-muted-foreground text-center">
              Select text in the report to add a term
            </p>
            )}

            {/* Confirm CTA */}
            {!readOnly && (
            <Button
              onClick={handleConfirm}
              disabled={reviewedCount === 0 || confirming}
              className="w-full"
            >
              {confirming
                ? "Saving..."
                : `Confirm ${reviewedCount} reviewed term${reviewedCount !== 1 ? "s" : ""}`}
            </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Helper: compute character offset of a DOM position within a container
// ---------------------------------------------------------------------------

function getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += (node.textContent?.length ?? 0);
  }
  return -1;
}
