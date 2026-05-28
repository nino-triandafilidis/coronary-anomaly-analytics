import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  FileText,
  Highlighter,
  PlusCircle,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  getStoredParsedReports,
  getStoredParsedTerms,
  type StoredParsedReport,
} from "@/lib/parsedReportStorage";
import type { ReviewDecision, ReviewDecisionRecord } from "@/data/parseTypes";

const ADDED_TERMS_PLACEHOLDER = 0;
const truncateLabel = (value: string, maxLength = 34) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

interface DecisionOccurrence extends ReviewDecisionRecord {
  reportId: string;
  reportText: string;
}

interface DecisionSummary {
  name: string;
  count: number;
  occurrences: DecisionOccurrence[];
}

interface NormalizedFeatureRow {
  name: string;
  count: number;
  pertinentPositive: number;
  pertinentNegative: number;
  keep: number;
  skip: number;
}

type FeatureSortKey = keyof NormalizedFeatureRow;
type FeatureSortDirection = "asc" | "desc";

const reviewChartConfig = {
  reviewed: {
    label: "Reviewed",
    color: "hsl(var(--primary))",
  },
  notReviewed: {
    label: "Not reviewed",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

const assertionChartConfig = {
  positive: {
    label: "Pertinent positive",
    color: "hsl(142 70% 45%)",
  },
  negative: {
    label: "Pertinent negative",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

const termFrequencyChartConfig = {
  count: {
    label: "Count",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export default function Analysis() {
  const [reports, setReports] = useState<StoredParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [featureSearch, setFeatureSearch] = useState("");
  const [featureSort, setFeatureSort] = useState<{
    key: FeatureSortKey;
    direction: FeatureSortDirection;
  }>({ key: "count", direction: "desc" });
  const [selectedDecision, setSelectedDecision] = useState<{
    title: string;
    decision: ReviewDecision;
    occurrences: DecisionOccurrence[];
  } | null>(null);

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        setReports(await getStoredParsedReports());
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load parsed reports.");
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const highlightedTermCount = useMemo(() => {
    const uniqueNames = new Set<string>();

    reports.forEach((report) => {
      getStoredParsedTerms(report).forEach((term) => {
        const name = term.normalizedName?.trim();
        if (name) uniqueNames.add(name);
      });
    });

    return uniqueNames.size;
  }, [reports]);

  const allTerms = useMemo(
    () => reports.flatMap((report) => getStoredParsedTerms(report)),
    [reports]
  );
  const allReviewDecisions = useMemo<DecisionOccurrence[]>(
    () =>
      reports.flatMap((report) =>
        (report.reviewDecisions ?? []).map((decision) => ({
          ...decision,
          reportId: report.id,
          reportText: report.text,
        }))
      ),
    [reports]
  );

  const reportCount = reports.length;
  const reviewedReportCount = reports.filter((report) => report.reviewed).length;
  const notReviewedReportCount = reportCount - reviewedReportCount;
  const assertedTermCount = allTerms.filter((term) => term.assertion === "asserted").length;
  const negatedTermCount = allTerms.filter((term) => term.assertion === "negated").length;
  const reviewPieData = [
    {
      name: "Reviewed",
      value: reviewedReportCount,
      fill: "var(--color-reviewed)",
    },
    {
      name: "Not reviewed",
      value: notReviewedReportCount,
      fill: "var(--color-notReviewed)",
    },
  ];
  const assertionPieData = [
    {
      name: "Pertinent positive",
      value: assertedTermCount,
      fill: "var(--color-positive)",
    },
    {
      name: "Pertinent negative",
      value: negatedTermCount,
      fill: "var(--color-negative)",
    },
  ];
  const topNormalizedTerms = useMemo(() => {
    const counts = new Map<string, number>();

    allTerms.forEach((term) => {
      const name = term.normalizedName?.trim();
      if (!name) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });

    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [allTerms]);
  const summarizeReviewDecisions = (decision: ReviewDecision): DecisionSummary[] => {
    const rows = new Map<string, DecisionSummary>();

    allReviewDecisions
      .filter((record) => record.decision === decision)
      .forEach((record) => {
        const name = record.normalizedName?.trim() || record.term?.trim();
        if (!name) return;

        const existing = rows.get(name) ?? { name, count: 0, occurrences: [] };
        existing.count += 1;
        existing.occurrences.push(record);
        rows.set(name, existing);
      });

    return Array.from(rows.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10);
  };
  const topKeepDecisions = useMemo(
    () => summarizeReviewDecisions("keep"),
    [allReviewDecisions]
  );
  const topSkipDecisions = useMemo(
    () => summarizeReviewDecisions("skip"),
    [allReviewDecisions]
  );
  const normalizedFeatureRows = useMemo(() => {
    const rows = new Map<
      string,
      NormalizedFeatureRow
    >();

    allTerms.forEach((term) => {
      const name = term.normalizedName?.trim();
      if (!name) return;

      const existing =
        rows.get(name) ??
        {
          name,
          count: 0,
          pertinentPositive: 0,
          pertinentNegative: 0,
          keep: 0,
          skip: 0,
        };

      existing.count += 1;
      if (term.assertion === "asserted") existing.pertinentPositive += 1;
      if (term.assertion === "negated") existing.pertinentNegative += 1;
      rows.set(name, existing);
    });

    allReviewDecisions.forEach((record) => {
      const name = record.normalizedName?.trim() || record.term?.trim();
      if (!name) return;

      const existing =
        rows.get(name) ??
        {
          name,
          count: 0,
          pertinentPositive: 0,
          pertinentNegative: 0,
          keep: 0,
          skip: 0,
        };

      if (record.decision === "keep") existing.keep += 1;
      if (record.decision === "skip") existing.skip += 1;
      rows.set(name, existing);
    });

    return Array.from(rows.values());
  }, [allReviewDecisions, allTerms]);
  const filteredFeatureRows = useMemo(() => {
    const query = featureSearch.trim().toLowerCase();
    const rows = query
      ? normalizedFeatureRows.filter((row) => row.name.toLowerCase().includes(query))
      : normalizedFeatureRows;

    return [...rows].sort((a, b) => {
      const aValue = a[featureSort.key];
      const bValue = b[featureSort.key];
      const direction = featureSort.direction === "asc" ? 1 : -1;

      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue) * direction;
      }

      const numericDiff = Number(aValue) - Number(bValue);
      if (numericDiff !== 0) return numericDiff * direction;
      return a.name.localeCompare(b.name);
    });
  }, [featureSearch, featureSort, normalizedFeatureRows]);
  const handleFeatureSort = (key: FeatureSortKey) => {
    setFeatureSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };
  const summaryCards = [
    {
      title: "Number of Parsed Reports",
      value: reportCount,
      icon: FileText,
    },
    {
      title: "Number of Reviewed Reports",
      value: reviewedReportCount,
      icon: CheckCircle2,
    },
    {
      title: "Number of Unique Highlighted Terms",
      value: highlightedTermCount,
      icon: Highlighter,
    },
    {
      title: "Number of Added Terms",
      value: ADDED_TERMS_PLACEHOLDER,
      icon: PlusCircle,
    },
  ];

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
              <p className="text-[11px] text-muted-foreground">Analysis Page</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
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

      <main className="container mx-auto grid gap-8 px-4 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="rounded-lg border border-border bg-card p-3">
            <p className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">
              Navigation
            </p>
            <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              <a
                href="#summary-cards"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Dataset Snapshot
              </a>
              <a
                href="#overview-charts"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Term Distributions
              </a>
              <a
                href="#top-review-words"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Review Decisions
              </a>
              <a
                href="#frequency-table"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Feature Counts
              </a>
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          <section id="summary-cards" className="scroll-mt-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Summary Cards</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Overview of parsed reports and highlighted terminology.
              </p>
              {loadError && (
                <p className="mt-3 text-sm text-destructive">{loadError}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <Icon className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-semibold text-foreground">
                        {loading ? "..." : card.value}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

        <section id="overview-charts" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Overview Charts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Distribution views for review status and highlighted terminology.
            </p>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Normalized Highlighted Terms</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={termFrequencyChartConfig}
                  className="h-[420px] w-full max-w-none aspect-auto justify-start"
                >
                  <BarChart
                    data={topNormalizedTerms}
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
                      tickFormatter={(value: string) => truncateLabel(value, 52)}
                    />
                    <ChartTooltip content={<NormalizedTermTooltip />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div id="top-review-words" className="grid scroll-mt-6 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={reviewChartConfig} className="mx-auto h-[260px] max-w-[360px]">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={reviewPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                      >
                        {reviewPieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
                    <span>Reviewed: {loading ? "..." : reviewedReportCount}</span>
                    <span>Not reviewed: {loading ? "..." : notReviewedReportCount}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pertinent Positive / Negative</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={assertionChartConfig} className="mx-auto h-[260px] max-w-[360px]">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={assertionPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                      >
                        {assertionPieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
                    <span>Positive: {loading ? "..." : assertedTermCount}</span>
                    <span>Negative: {loading ? "..." : negatedTermCount}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DecisionWordList
                title="Top 10 Keeped Words"
                emptyLabel="No kept words recorded yet."
                rows={topKeepDecisions}
                onSelect={(row) =>
                  setSelectedDecision({
                    title: row.name,
                    decision: "keep",
                    occurrences: row.occurrences,
                  })
                }
              />
              <DecisionWordList
                title="Top 10 Skipped Words"
                emptyLabel="No skipped words recorded yet."
                rows={topSkipDecisions}
                onSelect={(row) =>
                  setSelectedDecision({
                    title: row.name,
                    decision: "skip",
                    occurrences: row.occurrences,
                  })
                }
              />
            </div>
          </div>
        </section>

        <section id="frequency-table" className="mt-10 scroll-mt-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Normalized Feature Table</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Per-feature counts across parsed JSON files.
              </p>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={featureSearch}
                onChange={(event) => setFeatureSearch(event.target.value)}
                placeholder="Search normalized features"
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[320px]">
                      <FeatureSortButton
                        label="Name"
                        sortKey="name"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <FeatureSortButton
                        label="Count"
                        sortKey="count"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <FeatureSortButton
                        label="Pertinent Positive"
                        sortKey="pertinentPositive"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <FeatureSortButton
                        label="Pertinent Negative"
                        sortKey="pertinentNegative"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <FeatureSortButton
                        label="Keep"
                        sortKey="keep"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <FeatureSortButton
                        label="Skip"
                        sortKey="skip"
                        activeSort={featureSort}
                        onSort={handleFeatureSort}
                        align="right"
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeatureRows.length > 0 ? (
                    filteredFeatureRows.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.pertinentPositive}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.pertinentNegative}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.keep}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.skip}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No normalized feature match.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
        </div>
      </main>

      <Dialog open={!!selectedDecision} onOpenChange={(open) => !open && setSelectedDecision(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDecision?.title} - {selectedDecision?.decision === "keep" ? "Keep" : "Skip"} Context
            </DialogTitle>
          </DialogHeader>

          {selectedDecision && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedDecision.occurrences.length} occurrence
                {selectedDecision.occurrences.length !== 1 ? "s" : ""} across reviewed files.
              </p>
              {selectedDecision.occurrences.map((occurrence, index) => (
                <div
                  key={`${occurrence.reportId}-${occurrence.startIndex}-${occurrence.endIndex}-${index}`}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{occurrence.reportId}</p>
                      <p className="text-xs text-muted-foreground">
                        Position {occurrence.startIndex}-{occurrence.endIndex} ·{" "}
                        {occurrence.assertion === "negated"
                          ? "pertinent negative"
                          : "pertinent positive"}
                      </p>
                    </div>
                    <Link
                      to={`/dataset?reportId=${encodeURIComponent(
                        occurrence.reportId
                      )}&returnTo=${encodeURIComponent("/analysis#top-review-words")}`}
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4" />
                        Preview
                      </Button>
                    </Link>
                  </div>
                  <ContextSnippet occurrence={occurrence} />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureSortButton({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: FeatureSortKey;
  activeSort: { key: FeatureSortKey; direction: FeatureSortDirection };
  onSort: (key: FeatureSortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeSort.key === sortKey;
  const Icon = activeSort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={
        "inline-flex w-full items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground " +
        (align === "right" ? "justify-end" : "justify-start")
      }
    >
      <span>{label}</span>
      {isActive && <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}

function NormalizedTermTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { name?: string; count?: number } }>;
}) {
  const item = payload?.[0]?.payload;

  if (!active || !item) {
    return null;
  }

  return (
    <div className="max-w-sm rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="mt-1 text-muted-foreground">Count: {item.count ?? 0}</p>
    </div>
  );
}

function DecisionWordList({
  title,
  emptyLabel,
  rows,
  onSelect,
}: {
  title: string;
  emptyLabel: string;
  rows: DecisionSummary[];
  onSelect: (row: DecisionSummary) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <ol className="space-y-2">
            {rows.map((row, index) => (
              <li key={`${title}-${row.name}`}>
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="break-words text-foreground">{row.name}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {row.count}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ContextSnippet({ occurrence }: { occurrence: DecisionOccurrence }) {
  const text = occurrence.reportText;
  const start = Math.max(0, occurrence.startIndex);
  const end = Math.min(text.length, occurrence.endIndex);

  if (!text || start >= end) {
    return (
      <p className="rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-card-foreground">
        {occurrence.context || occurrence.term}
      </p>
    );
  }

  const contextStart = Math.max(0, start - 180);
  const contextEnd = Math.min(text.length, end + 180);
  const before = text.slice(contextStart, start);
  const match = text.slice(start, end);
  const after = text.slice(end, contextEnd);

  return (
    <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-card-foreground">
      {contextStart > 0 ? "..." : ""}
      {before}
      <mark className="rounded bg-amber-200 px-0.5 text-foreground dark:bg-amber-700/40">
        {match}
      </mark>
      {after}
      {contextEnd < text.length ? "..." : ""}
    </p>
  );
}
