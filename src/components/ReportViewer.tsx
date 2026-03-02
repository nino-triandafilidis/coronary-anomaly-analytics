import { Fragment, useRef, useState, useCallback, useEffect } from "react";
import type { DetectedAnomaly } from "@/lib/anomalyDetection";
import { getFrequencyPercentage, getSeverity } from "@/data/anomalyDatabase";
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
      {segments.map((seg, i) =>
        seg.anomaly ? (
          <Tooltip key={`${i}-${scrollKey}`}>
            <TooltipTrigger asChild>
              <mark className="relative cursor-pointer rounded-sm bg-highlight/40 px-0.5 transition-colors hover:bg-highlight-hover/50">
                {seg.text}
              </mark>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="max-w-xs px-4 py-3">
              <p className="text-sm font-semibold text-popover-foreground">
                {seg.anomaly.entry.term}
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${severityColor(getSeverity(seg.anomaly.entry))}`}>
                    {getSeverity(seg.anomaly.entry)}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {seg.anomaly.entry.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Found in{" "}
                  <span className="font-semibold text-foreground">
                    {seg.anomaly.entry.frequency}
                  </span>{" "}
                  of {seg.anomaly.entry.totalReports} reports (
                  <span className="font-semibold text-foreground">
                    {getFrequencyPercentage(seg.anomaly.entry)}%
                  </span>
                  )
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </div>
  );
}
