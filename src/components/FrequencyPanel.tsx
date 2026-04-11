import { useMemo } from "react";
import type { AnomalyEntry } from "@/data/anomalyDatabase";
import type { DetectedAnomaly } from "@/lib/anomalyDetection";
import { getSeverity } from "@/data/anomalyDatabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FrequencyPanelProps {
  /** Every anomaly the user accepted in this report (asserted + negated). */
  detected: DetectedAnomaly[];
}

interface GroupedAnomaly {
  entry: AnomalyEntry;
  /** Database frequency for the active tab (asserted or negated). */
  frequency: number;
}

function dedupeByEntry(anomalies: DetectedAnomaly[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const out: DetectedAnomaly[] = [];
  for (const a of anomalies) {
    const key = a.entry.term;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function severityDot(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-clinical-danger";
    case "high":
      return "bg-clinical-warning";
    case "moderate":
      return "bg-primary";
    default:
      return "bg-muted-foreground";
  }
}

/**
 * Render a list of anomaly cards with the relevant frequency bar.
 * `tab` controls which database frequency we surface (asserted vs negated).
 */
function AnomalyList({
  anomalies,
  tab,
}: {
  anomalies: GroupedAnomaly[];
  tab: "asserted" | "negated";
}) {
  if (anomalies.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No {tab} findings in this report.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {anomalies.map(({ entry, frequency }) => {
        const pct = entry.totalReports > 0 ? (frequency / entry.totalReports) * 100 : 0;
        return (
          <div key={entry.term} className="group">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${severityDot(getSeverity(entry))}`}
                />
                <span className="font-medium text-card-foreground">{entry.term}</span>
              </div>
              <span className="tabular-nums text-muted-foreground">
                {frequency}/{entry.totalReports}
              </span>
            </div>
            <div className="mt-1 ml-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  "h-full rounded-full transition-all duration-500 " +
                  (tab === "negated" ? "bg-muted-foreground/50" : "bg-primary/60")
                }
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FrequencyPanel({ detected }: FrequencyPanelProps) {
  const { asserted, negated } = useMemo(() => {
    const assertedAnoms = dedupeByEntry(detected.filter((a) => a.assertion === "asserted"));
    const negatedAnoms = dedupeByEntry(detected.filter((a) => a.assertion === "negated"));
    return {
      asserted: assertedAnoms
        .map<GroupedAnomaly>((a) => ({ entry: a.entry, frequency: a.entry.frequencyAsserted }))
        .sort((a, b) => b.frequency - a.frequency),
      negated: negatedAnoms
        .map<GroupedAnomaly>((a) => ({ entry: a.entry, frequency: a.entry.frequencyNegated }))
        .sort((a, b) => b.frequency - a.frequency),
    };
  }, [detected]);

  if (detected.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">
        Detected Anomalies
        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          {asserted.length + negated.length}
        </span>
      </h3>

      <Tabs defaultValue="asserted" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="asserted" className="text-xs">
            Asserted
            <span className="ml-1.5 text-muted-foreground">({asserted.length})</span>
          </TabsTrigger>
          <TabsTrigger value="negated" className="text-xs">
            Negated
            <span className="ml-1.5 text-muted-foreground">({negated.length})</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="asserted" className="mt-3">
          <AnomalyList anomalies={asserted} tab="asserted" />
        </TabsContent>
        <TabsContent value="negated" className="mt-3">
          <AnomalyList anomalies={negated} tab="negated" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
