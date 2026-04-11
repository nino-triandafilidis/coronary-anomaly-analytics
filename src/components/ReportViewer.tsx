import { Fragment, useRef, useState, useCallback, useEffect } from "react";
import type { DetectedAnomaly } from "@/lib/anomalyDetection";
import { getSeverity } from "@/data/anomalyDatabase";
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

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-clinical-danger/15 border-clinical-danger/30 text-clinical-danger";
      case "high": return "bg-highlight/30 border-highlight-hover/40 text-highlight-foreground";
      case "moderate": return "bg-primary/10 border-primary/20 text-primary";
      default: return "bg-muted border-border text-muted-foreground";
    }
  };

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
        // Negated terms are shown as a dashed underline with no background fill
        // so the radiologist can see at a glance which findings are *ruled out*.
        // Asserted terms keep the existing solid yellow highlight.
        const markClass = isNegated
          ? "relative cursor-pointer px-0.5 text-muted-foreground/90 underline decoration-muted-foreground/60 decoration-dashed underline-offset-4 transition-colors hover:decoration-muted-foreground"
          : "relative cursor-pointer rounded-sm bg-highlight/40 px-0.5 transition-colors hover:bg-highlight-hover/50";

        const isAssertedFreq = !isNegated;
        const freq = isAssertedFreq
          ? seg.anomaly.entry.frequencyAsserted
          : seg.anomaly.entry.frequencyNegated;
        const freqLabel = isAssertedFreq ? "asserted in" : "ruled out in";

        return (
          <Tooltip key={`${i}-${scrollKey}`}>
            <TooltipTrigger asChild>
              <mark className={markClass}>{seg.text}</mark>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="max-w-xs px-4 py-3">
              <p className="text-sm font-semibold text-popover-foreground">
                {seg.anomaly.entry.term}
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${severityColor(
                      getSeverity(seg.anomaly.entry)
                    )}`}
                  >
                    {getSeverity(seg.anomaly.entry)}
                  </span>
                  <span
                    className={
                      "inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                      (isNegated
                        ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                        : "border-primary/30 bg-primary/10 text-primary")
                    }
                  >
                    {seg.anomaly.assertion}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {freqLabel}{" "}
                  <span className="font-semibold text-foreground">{freq}</span> of{" "}
                  {seg.anomaly.entry.totalReports} reports
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
