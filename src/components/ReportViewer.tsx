import { Fragment, useRef, useState, useCallback, useEffect } from "react";
import type { DetectedAnomaly } from "@/data/anomalyDatabase";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReportViewerProps {
  text: string;
  anomalies: DetectedAnomaly[];
}

export function ReportViewer({ text, anomalies }: ReportViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollKey, setScrollKey] = useState(0);

  const handleScroll = useCallback(() => {
    setScrollKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Build segments of text with/without highlighting
  const segments: { text: string; anomaly?: DetectedAnomaly }[] = [];
  let lastIndex = 0;

  for (const anomaly of anomalies) {
    if (anomaly.startIndex > lastIndex) {
      segments.push({ text: text.substring(lastIndex, anomaly.startIndex) });
    }
    segments.push({ text: text.substring(anomaly.startIndex, anomaly.endIndex), anomaly });
    lastIndex = anomaly.endIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex) });
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-border bg-card p-6 font-mono text-sm leading-7 whitespace-pre-wrap text-card-foreground overflow-auto max-h-[70vh]"
    >
      {segments.map((seg, i) => {
        if (!seg.anomaly) {
          return <Fragment key={i}>{seg.text}</Fragment>;
        }

        const isNegated = seg.anomaly.assertion === "negated";
        // Asserted (now "pertinent positive") highlights use the same emerald
        // shade as the accepted-state badge in TermReview so the colour stays
        // stable when the user moves from review → results. Negated terms keep
        // the dashed underline with no fill.
        // bg-transparent overrides the user-agent default yellow background
        // on <mark> for the negated case (we want muted text + dashed
        // underline only, no fill). The asserted case sets its own bg-emerald.
        const markClass = isNegated
          ? "relative cursor-pointer bg-transparent px-0.5 text-muted-foreground/90 underline decoration-muted-foreground/60 decoration-dashed underline-offset-4 transition-colors hover:decoration-muted-foreground"
          : "relative cursor-pointer rounded-sm bg-emerald-200/60 px-0.5 transition-colors hover:bg-emerald-300/60 dark:bg-emerald-700/30 dark:hover:bg-emerald-700/50";

        const { history } = seg.anomaly;
        const count = isNegated ? history.countNegated : history.countAsserted;
        const hasHistory = count > 0;

        return (
          <Tooltip key={`${i}-${scrollKey}`}>
            <TooltipTrigger asChild>
              <mark className={markClass}>{seg.text}</mark>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="max-w-xs px-4 py-3">
              <p className="text-sm font-semibold text-popover-foreground">
                {seg.anomaly.normalizedName}
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                      (isNegated
                        ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                        : "border-primary/30 bg-primary/10 text-primary")
                    }
                  >
                    {isNegated ? "Pertinent negative" : "Pertinent positive"}
                  </span>
                </div>
                {hasHistory ? (
                  <p className="text-xs text-muted-foreground">
                    {isNegated ? "pertinent negative in" : "pertinent positive in"}{" "}
                    <span className="font-semibold text-foreground">{count}</span> of{" "}
                    {history.totalSaved} saved report{history.totalSaved !== 1 ? "s" : ""}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground/80">
                    No historical data
                    {history.totalSaved > 0 && (
                      <> · {history.totalSaved} saved report{history.totalSaved !== 1 ? "s" : ""}</>
                    )}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
