import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, FileText, Highlighter, PlusCircle, Search } from "lucide-react";
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

const ADDED_TERMS_PLACEHOLDER = 0;
const PLACEHOLDER_WORDS = Array.from({ length: 10 }, (_, index) => `Placeholder ${index + 1}`);

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
  const normalizedFeatureRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        name: string;
        count: number;
        pertinentPositive: number;
        pertinentNegative: number;
        keep: number;
        skip: number;
      }
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

    return Array.from(rows.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [allTerms]);
  const filteredFeatureRows = useMemo(() => {
    const query = featureSearch.trim().toLowerCase();
    if (!query) return normalizedFeatureRows;
    return normalizedFeatureRows.filter((row) => row.name.toLowerCase().includes(query));
  }, [featureSearch, normalizedFeatureRows]);
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
                Summary Cards
              </a>
              <a
                href="#overview-charts"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Overview Charts
              </a>
              <a
                href="#frequency-table"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Freq Table
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

          <div className="grid gap-4 lg:grid-cols-2">
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
                <CardTitle className="text-base">Top 10 Normalized Highlighted Terms</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={termFrequencyChartConfig} className="h-[320px]">
                  <BarChart
                    data={topNormalizedTerms}
                    layout="vertical"
                    margin={{ left: 12, right: 20 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: string) =>
                        value.length > 24 ? `${value.slice(0, 24)}...` : value
                      }
                    />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <PlaceholderWordList title="Top 10 Keeped Words" words={PLACEHOLDER_WORDS} />
              <PlaceholderWordList title="Top 10 Skipped Words" words={PLACEHOLDER_WORDS} />
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
                    <TableHead className="min-w-[320px]">Name</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Pertinent Positive</TableHead>
                    <TableHead className="text-right">Pertinent Negative</TableHead>
                    <TableHead className="text-right">Keep</TableHead>
                    <TableHead className="text-right">Skip</TableHead>
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
    </div>
  );
}

function PlaceholderWordList({ title, words }: { title: string; words: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {words.map((word, index) => (
            <li
              key={`${title}-${index}`}
              className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{word}</span>
              <span className="text-xs text-muted-foreground/60">--</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
