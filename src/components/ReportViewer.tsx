import { useState, useCallback, Fragment } from "react";
import type { DetectedAnomaly } from "@/lib/anomalyDetection";
import { getFrequencyPercentage } from "@/data/anomalyDatabase";

interface ReportViewerProps {
  text: string;
  anomalies: DetectedAnomaly[];
}

export function ReportViewer({ text, anomalies }: ReportViewerProps) {
  const [hoveredAnomaly, setHoveredAnomaly] = useState<DetectedAnomaly | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(
    (anomaly: DetectedAnomaly, e: React.MouseEvent) => {
      setHoveredAnomaly(anomaly);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredAnomaly(null);
  }, []);

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
    <div className="relative">
      <div className="rounded-lg border border-border bg-card p-6 font-mono text-sm leading-7 whitespace-pre-wrap text-card-foreground">
        {segments.map((seg, i) =>
          seg.anomaly ? (
            <mark
              key={i}
              className="relative cursor-pointer rounded-sm bg-highlight/40 px-0.5 transition-colors hover:bg-highlight-hover/50"
              onMouseEnter={(e) => handleMouseEnter(seg.anomaly!, e)}
              onMouseLeave={handleMouseLeave}
            >
              {seg.text}
            </mark>
          ) : (
            <Fragment key={i}>{seg.text}</Fragment>
          )
        )}
      </div>

      {/* Tooltip */}
      {hoveredAnomaly && (
        <div
          className="pointer-events-none fixed z-50 animate-fade-in"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="rounded-lg border border-border bg-popover px-4 py-3 shadow-lg">
            <p className="text-sm font-semibold text-popover-foreground">
              {hoveredAnomaly.entry.term}
            </p>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${severityColor(hoveredAnomaly.entry.severity)}`}>
                  {hoveredAnomaly.entry.severity}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {hoveredAnomaly.entry.category}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Found in{" "}
                <span className="font-semibold text-foreground">
                  {hoveredAnomaly.entry.frequency}
                </span>{" "}
                of {hoveredAnomaly.entry.totalReports} reports (
                <span className="font-semibold text-foreground">
                  {getFrequencyPercentage(hoveredAnomaly.entry)}%
                </span>
                )
              </p>
            </div>
            {/* Arrow */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-popover" />
          </div>
        </div>
      )}
    </div>
  );
}
