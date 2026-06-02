import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  MoveRight,
  Search,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  contributorsToCsv,
  distinctReportCount,
  groupContributorsByPhrasing,
  type ProvenanceContributor,
  type ProvenanceSource,
} from "@/lib/provenance";

type AssertionSide = "asserted" | "negated";

const ROWS_PER_GROUP = 6;

interface ProvenancePanelProps {
  source: ProvenanceSource | null;
  onClose: () => void;
  onOpenReport: (contributor: ProvenanceContributor) => void;
}

function filterBySide(
  contributors: ProvenanceContributor[],
  splitByAssertion: boolean,
  side: AssertionSide
): ProvenanceContributor[] {
  if (!splitByAssertion) return contributors;
  return contributors.filter((c) => (c.assertion ?? "asserted") === side);
}

// Chars of surrounding quote to keep before the matched term so the green stays
// visible without pushing the row past a few lines.
const SNIPPET_LEAD = 56;

function HighlightedSnippet({ text, match }: { text: string; match: string }) {
  const clean = text.replace(/\s+/g, " ").trim();
  const needle = match.replace(/\s+/g, " ").trim();
  const index = needle ? clean.toLowerCase().indexOf(needle.toLowerCase()) : -1;

  // Nothing distinct to highlight inside a longer quote (report-level evidence,
  // or a context that doesn't contain the span): show the quote plainly rather
  // than a lone green term.
  if (index < 0 || clean.toLowerCase() === needle.toLowerCase()) {
    return <span className="line-clamp-3">{clean}</span>;
  }

  // Window the quote around the match so the green term is visible even when the
  // sentence is long; trim the lead to a word boundary and mark it with an ellipsis.
  let start = Math.max(0, index - SNIPPET_LEAD);
  if (start > 0) {
    const space = clean.indexOf(" ", start);
    if (space >= 0 && space < index) start = space + 1;
  }
  const lead = (start > 0 ? "… " : "") + clean.slice(start, index);

  return (
    <span className="line-clamp-3">
      {lead}
      <mark className="bg-transparent font-semibold text-emerald-700 dark:text-emerald-400">
        {clean.slice(index, index + needle.length)}
      </mark>
      {clean.slice(index + needle.length)}
    </span>
  );
}

export function ProvenancePanel({ source, onClose, onOpenReport }: ProvenancePanelProps) {
  const open = source !== null;
  const [side, setSide] = useState<AssertionSide>("asserted");
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const assertedCount = useMemo(
    () => (source?.contributors ?? []).filter((c) => (c.assertion ?? "asserted") === "asserted").length,
    [source]
  );
  const negatedCount = useMemo(
    () => (source?.contributors ?? []).filter((c) => c.assertion === "negated").length,
    [source]
  );

  // Reset transient state and pick a sensible default side whenever the source
  // changes (i.e. a different number/bar was clicked).
  useEffect(() => {
    if (!source) return;
    setQuery("");
    setExpandedGroups(new Set());
    const defaultSide: AssertionSide =
      source.splitByAssertion && assertedCount === 0 && negatedCount > 0 ? "negated" : "asserted";
    setSide(defaultSide);
    const defaults = filterBySide(source.contributors, source.splitByAssertion, defaultSide);
    const topGroup = groupContributorsByPhrasing(defaults)[0];
    setOpenGroups(new Set(topGroup ? [topGroup.key] : []));
  }, [source, assertedCount, negatedCount]);

  const visibleContributors = useMemo(() => {
    if (!source) return [];
    const bySide = filterBySide(source.contributors, source.splitByAssertion, side);
    const q = query.trim().toLowerCase();
    if (!q) return bySide;
    return bySide.filter(
      (c) =>
        c.reportId.toLowerCase().includes(q) ||
        c.matchedText.toLowerCase().includes(q) ||
        (c.context ?? "").toLowerCase().includes(q)
    );
  }, [source, side, query]);

  const groups = useMemo(
    () => groupContributorsByPhrasing(visibleContributors),
    [visibleContributors]
  );

  if (!source) return null;

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const expandGroup = (key: string) =>
    setExpandedGroups((prev) => new Set(prev).add(key));

  const downloadCsv = () => {
    const csv = contributorsToCsv(source.title, visibleContributors);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${source.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-reports.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const shownReports = distinctReportCount(visibleContributors);

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px] lg:max-w-[680px]"
      >
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-border px-5 pb-4 pt-5">
          <div className="pr-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Source reports
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">
              {source.title}
            </h2>
            {source.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{source.subtitle}</p>
            )}
          </div>

          {source.splitByAssertion && (
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {([
                ["asserted", "Asserted", assertedCount],
                ["negated", "Negated", negatedCount],
              ] as const).map(([value, label, count]) => {
                const active = side === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSide(value)}
                    className={
                      "flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors " +
                      (active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    <span
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (value === "asserted" ? "bg-emerald-600" : "bg-muted-foreground/60")
                      }
                    />
                    {label}
                    <span
                      className={
                        "rounded-full px-1.5 text-xs font-semibold tabular-nums " +
                        (active && value === "asserted"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-muted-foreground/10 text-muted-foreground")
                      }
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by report ID or matched text"
              className="pl-9"
            />
          </div>
        </div>

        {/* Grouped report list. A plain overflow container (not Radix ScrollArea,
            whose display:table viewport grows to content width) so long snippets
            stay within the panel and wrap. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0.5 p-3">
            {groups.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No contributing reports{query ? " match this filter" : ""}.
              </p>
            )}

            {groups.map((group) => {
              const isOpen = openGroups.has(group.key);
              const isExpanded = expandedGroups.has(group.key);
              const visibleRows = isExpanded
                ? group.contributors
                : group.contributors.slice(0, ROWS_PER_GROUP);
              const hiddenCount = group.contributors.length - visibleRows.length;

              return (
                <Fragment key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      “{group.phrase}”
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                      ×{group.count}
                    </span>
                  </button>

                  {isOpen &&
                    visibleRows.map((contributor, rowIndex) => (
                      <button
                        key={`${group.key}-${contributor.reportId}-${rowIndex}`}
                        type="button"
                        onClick={() => onOpenReport(contributor)}
                        className="group flex w-full items-start gap-3 rounded-md py-2 pl-9 pr-2 text-left transition-colors hover:bg-accent"
                      >
                        <span className="max-w-[96px] shrink-0 truncate font-mono text-xs font-semibold text-foreground">
                          {contributor.reportId}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="break-words text-xs leading-relaxed text-muted-foreground">
                            <HighlightedSnippet
                              text={contributor.context?.trim() || contributor.matchedText}
                              match={contributor.matchedText}
                            />
                          </span>
                          {contributor.normalizedName &&
                            contributor.normalizedName.trim().toLowerCase() !==
                              contributor.matchedText.trim().toLowerCase() && (
                              <span className="break-words text-[11px] leading-snug text-muted-foreground/70">
                                normalized: {contributor.normalizedName}
                              </span>
                            )}
                        </span>
                        <MoveRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}

                  {isOpen && hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => expandGroup(group.key)}
                      className="rounded-md py-1.5 pl-9 pr-2 text-left text-xs font-medium text-primary hover:underline"
                    >
                      + {hiddenCount} more report{hiddenCount === 1 ? "" : "s"} with this wording
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {visibleContributors.length} occurrence{visibleContributors.length === 1 ? "" : "s"} ·{" "}
            {shownReports} report{shownReports === 1 ? "" : "s"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={visibleContributors.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
