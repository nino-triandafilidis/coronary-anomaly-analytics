import { useMemo } from "react";
import type { DetectedAnomaly } from "@/data/anomalyDatabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FrequencyPanelProps {
  /** Every anomaly the user accepted in this report (asserted + negated). */
  detected: DetectedAnomaly[];
}

interface GroupedAnomaly {
  normalizedName: string;
  /** How many of the saved reports contain this term in the active assertion. */
  count: number;
  /** Total saved reports in the corpus at lookup time. */
  totalSaved: number;
}

/** Dedupe by normalized name so a finding mentioned twice in the report shows once. */
function dedupeByName(anomalies: DetectedAnomaly[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const out: DetectedAnomaly[] = [];
  for (const a of anomalies) {
    const key = a.normalizedName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function AnomalyList({
  anomalies,
  tab,
}: {
  anomalies: GroupedAnomaly[];
  tab: "asserted" | "negated";
}) {
  if (anomalies.length === 0) {
    const label = tab === "asserted" ? "pertinent positive" : "pertinent negative";
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No {label} findings in this report.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {anomalies.map(({ normalizedName, count, totalSaved }) => {
        const hasHistory = count > 0;
        const pct = hasHistory && totalSaved > 0 ? (count / totalSaved) * 100 : 0;
        return (
          <div key={normalizedName} className="group">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-card-foreground truncate">
                {normalizedName}
              </span>
              {hasHistory ? (
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {count}/{totalSaved}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 italic shrink-0">
                  No historical data
                </span>
              )}
            </div>
            {hasHistory && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    "h-full rounded-full transition-all duration-500 " +
                    (tab === "negated" ? "bg-muted-foreground/50" : "bg-primary/60")
                  }
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FrequencyPanel({ detected }: FrequencyPanelProps) {
  const { asserted, negated } = useMemo(() => {
    const assertedAnoms = dedupeByName(detected.filter((a) => a.assertion === "asserted"));
    const negatedAnoms = dedupeByName(detected.filter((a) => a.assertion === "negated"));
    return {
      asserted: assertedAnoms
        .map<GroupedAnomaly>((a) => ({
          normalizedName: a.normalizedName,
          count: a.history.countAsserted,
          totalSaved: a.history.totalSaved,
        }))
        // Sort: terms with history first (by count desc), then no-history terms.
        .sort((a, b) => b.count - a.count),
      negated: negatedAnoms
        .map<GroupedAnomaly>((a) => ({
          normalizedName: a.normalizedName,
          count: a.history.countNegated,
          totalSaved: a.history.totalSaved,
        }))
        .sort((a, b) => b.count - a.count),
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
            Pertinent positive
            <span className="ml-1.5 text-muted-foreground">({asserted.length})</span>
          </TabsTrigger>
          <TabsTrigger value="negated" className="text-xs">
            Pertinent negative
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
