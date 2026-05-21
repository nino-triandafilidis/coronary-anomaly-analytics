import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, BarChart3, Loader2, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface CompareFeature {
  feature_id?: string | null;
  mapped_feature_id?: string | null;
  canonical?: string | null;
  canonical_label?: string | null;
  matched_text?: string | null;
}

interface CompareResult {
  detected_features?: CompareFeature[];
  raw_keyword_hits?: CompareFeature[];
}

interface CompareReport {
  id: string;
  jsonFile: string;
  parsedAt: string;
  result: CompareResult;
}

interface RunSummary {
  total: number;
  saved: number;
  failed: number;
  results: Array<{ id: string; status: "saved" | "failed"; error?: string }>;
}

interface KeywordRow {
  name: string;
  count: number;
}

const controlledVocabulary = [
  {
    category: "Anomalous vessel",
    items: [
      ["R-AAOCA", "right coronary artery anomalous origin"],
      ["L-AAOCA", "left main coronary artery anomalous origin"],
      ["LAD-AAOCA", "left anterior descending anomalous origin"],
      ["LCX-AAOCA", "left circumflex anomalous origin"],
      ["ST-AAOCA", "single trunk"],
    ],
  },
  {
    category: "Sinus of origin",
    items: [
      ["LS", "left sinus / left sinus of Valsalva"],
      ["RS", "right sinus / right sinus of Valsalva"],
      ["NS", "nonfacing sinus / noncoronary sinus"],
      ["HO", "high origin"],
      ["LR", "left-right juxtacommissural"],
      ["LN", "left-nonfacing juxtacommissural"],
      ["RN", "right-nonfacing juxtacommissural"],
      ["AS", "anterior sinus (bicuspid aortic valve)"],
      ["PS", "posterior sinus (bicuspid aortic valve)"],
    ],
  },
  {
    category: "Proximal course",
    items: [
      ["IA", "interarterial"],
      ["IM", "intramural"],
      ["IS", "intraseptal"],
      ["PP", "prepulmonic"],
      ["RA", "retroaortic"],
      ["Pulmonary-facing", "interarterial subtype"],
      ["RVOT-facing", "interarterial subtype"],
    ],
  },
  {
    category: "Ostial location - circumferential",
    items: [
      ["Sinus 1 / sinus 2 / sinus 3", "circumferential sinus location"],
      ["Segment a / segment b / segment c", "circumferential segment location"],
      ["JC", "juxtacommissural"],
    ],
  },
  {
    category: "Ostial location - height",
    items: [
      ["Level I", "within sinus"],
      ["Level II", "between commissure and sinutubular junction"],
      ["Level III", "just above sinutubular junction, <5 mm or <20%"],
      ["Level IV", ">=5 mm or >=20% above sinutubular junction"],
    ],
  },
  {
    category: "Ostial relationship",
    items: [
      ["Type 1", "separate ostia"],
      ["Type 2", "adjacent ostia"],
      ["Type 3", "single ostium with intramural bifurcation"],
      ["Type 4", "single coronary trunk"],
    ],
  },
  {
    category: "Ostial morphology",
    items: [
      ["Round", "round ostial morphology"],
      ["Oval", "oval ostial morphology"],
      ["Slit-like", "slit-like ostial morphology"],
      ["Hypoplastic / pinhole", "hypoplastic or pinhole ostium"],
    ],
  },
  {
    category: "Proximal course details, quantitative",
    items: [
      ["Intramural segment length", "measurement in mm"],
      ["Ellipticity / ellipticity index", "major/minor axis ratio"],
      ["%CSA narrowing", "cross-sectional area narrowing"],
      ["Effective lumen diameter narrowing", "percentage narrowing"],
      ["Acute angle of takeoff", "<45 degrees"],
    ],
  },
  {
    category: "Coronary dominance",
    items: [
      ["RD / Right dominance", "right dominance"],
      ["LD / Left dominance", "left dominance"],
      ["CD / Codominance", "codominance"],
    ],
  },
] as const;

const keywordChartConfig = {
  count: {
    label: "Occurrences",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const getKeywordName = (feature: CompareFeature): string | null => {
  const value =
    feature.feature_id?.trim() ||
    feature.mapped_feature_id?.trim() ||
    feature.canonical?.trim() ||
    feature.canonical_label?.trim() ||
    feature.matched_text?.trim();

  return value || null;
};

export default function Comparison() {
  const [reports, setReports] = useState<CompareReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  const loadCompareReports = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/compare-reports");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load comparison JSON files.");
      }
      setReports(body.reports ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load comparison JSON files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompareReports();
  }, []);

  const keywordRows = useMemo<KeywordRow[]>(() => {
    const counts = new Map<string, number>();

    reports.forEach((report) => {
      const features =
        report.result.raw_keyword_hits && report.result.raw_keyword_hits.length > 0
          ? report.result.raw_keyword_hits
          : report.result.detected_features ?? [];

      features.forEach((feature) => {
        const name = getKeywordName(feature);
        if (!name) return;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    });

    return Array.from(counts, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [reports]);

  const topKeywordRows = keywordRows.slice(0, 20);

  const handleRunComparison = async () => {
    setRunning(true);
    setLoadError(null);
    setRunSummary(null);

    try {
      const response = await fetch("/api/compare-reports/run", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to run comparison parser.");
      }
      setRunSummary(body);
      await loadCompareReports();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to run comparison parser.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-card-foreground">
                CT Angiogram Analyzer
              </h1>
              <p className="text-[11px] text-muted-foreground">Comparison Page</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/analysis">
              <Button variant="ghost" size="sm">
                Analysis Page
              </Button>
            </Link>
            <Link to="/dataset">
              <Button variant="ghost" size="sm">
                Reports in Database
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">
                Back to Analyzer
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Paper Prompt Comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Query every txt report with the paper parser prompt and save matching JSON files.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Comparison keywords are sourced from{" "}
              <a
                href="https://www.jacc.org/doi/10.1016/j.jcmg.2026.02.005"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                JACC Cardiovascular Imaging
              </a>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadCompareReports} disabled={loading || running}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleRunComparison} disabled={running}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-2 h-4 w-4" />
              )}
              Run Comparison Query
            </Button>
          </div>
        </section>

        {loadError && (
          <p className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        )}

        {runSummary && (
          <div className="mb-6 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            Saved {runSummary.saved} of {runSummary.total} comparison JSON files
            {runSummary.failed > 0 ? `; ${runSummary.failed} failed.` : "."}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Controlled Vocabulary Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {controlledVocabulary.map((group) => (
                <div key={group.category} className="rounded-md border border-border p-3">
                  <h3 className="text-sm font-semibold text-foreground">{group.category}</h3>
                  <div className="mt-3 space-y-2">
                    {group.items.map(([shortName, fullName]) => (
                      <div key={`${group.category}-${shortName}`} className="text-sm">
                        <span className="font-medium text-foreground">{shortName}</span>
                        <span className="text-muted-foreground"> / {fullName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Compared Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{loading ? "..." : reports.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Unique Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{loading ? "..." : keywordRows.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Keyword Occurrences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {loading ? "..." : keywordRows.reduce((total, row) => total + row.count, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keyword Occurrences from Compare JSON</CardTitle>
          </CardHeader>
          <CardContent>
            {topKeywordRows.length > 0 ? (
              <ChartContainer
                config={keywordChartConfig}
                className="h-[520px] w-full max-w-none aspect-auto justify-start"
              >
                <BarChart
                  data={topKeywordRows}
                  layout="vertical"
                  margin={{ left: 24, right: 48 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={360}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: string) =>
                      value.length > 52 ? `${value.slice(0, 52)}...` : value
                    }
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                No comparison keywords yet.
              </p>
            )}
          </CardContent>
        </Card>

        {keywordRows.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">All Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {keywordRows.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="break-words text-foreground">{row.name}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
