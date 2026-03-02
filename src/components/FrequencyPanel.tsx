import type { AnomalyEntry } from "@/data/anomalyDatabase";
import { getFrequencyPercentage } from "@/data/anomalyDatabase";

interface FrequencyPanelProps {
  anomalies: AnomalyEntry[];
}

export function FrequencyPanel({ anomalies }: FrequencyPanelProps) {
  if (anomalies.length === 0) return null;

  const severityDot = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-clinical-danger";
      case "high": return "bg-clinical-warning";
      case "moderate": return "bg-primary";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">
        Detected Anomalies
        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          {anomalies.length}
        </span>
      </h3>
      <div className="space-y-2">
        {anomalies.map((entry) => {
          const pct = parseFloat(getFrequencyPercentage(entry));
          return (
            <div key={entry.term} className="group">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${severityDot(entry.severity)}`} />
                  <span className="font-medium text-card-foreground">{entry.term}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {entry.frequency}/{entry.totalReports}
                </span>
              </div>
              <div className="mt-1 ml-4 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
