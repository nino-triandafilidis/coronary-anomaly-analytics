import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  Highlighter,
  PlusCircle,
  Search,
} from "lucide-react";
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
  getStoredParsedReports,
  getStoredParsedTerms,
  type StoredParsedReport,
} from "@/lib/parsedReportStorage";
import type { ReviewDecisionRecord } from "@/data/parseTypes";
import {
  PAPER_FEATURES,
  resolveParsedTermPaperFeature,
  shouldIncludeInNormalizedFrequency,
} from "@/data/paperFeatures";

const ADDED_TERMS_PLACEHOLDER = 0;

function getAnalysisFeatureName(record: {
  normalizedName?: string;
  term?: string;
}): string {
  return (record.normalizedName?.trim() || record.term?.trim() || "").replace(/\s+/g, " ");
}

function normalizeCoronaryNarrowingFeature(record: {
  normalizedName?: string;
  term?: string;
  context?: string;
}): string | null {
  const featureName = getAnalysisFeatureName(record);
  const haystack = `${featureName} ${record.context ?? ""}`.toLowerCase();

  const hasNarrowingConcept =
    /\bnarrow(?:ing|ed)?\b/.test(haystack) ||
    /\bstenos(?:is|ed)\b/.test(haystack) ||
    /\bcompression\b/.test(haystack) ||
    /\bcompressed\b/.test(haystack);
  if (!hasNarrowingConcept) return null;

  const vessel = (() => {
    if (/\bleft\s+main\b|\blmca\b|\bleft\s+main\s+coronary\s+artery\b/.test(haystack)) {
      return "left main coronary artery";
    }
    if (/\bleft\s+circumflex\b|\bcircumflex\b|\blcx\b/.test(haystack)) {
      return "left circumflex artery";
    }
    if (/\bright\s+coronary\b|\brca\b/.test(haystack)) {
      return "right coronary artery";
    }
    if (/\bleft\s+anterior\s+descending\b|\blad\b/.test(haystack)) {
      return "left anterior descending artery";
    }
    if (/\bleft\s+coronary\s+artery\b|\blca\b/.test(haystack)) {
      return "left coronary artery";
    }
    if (/\bcoronary\s+arter(?:y|ies)\b/.test(haystack)) {
      return "coronary artery";
    }
    return null;
  })();
  if (!vessel) return null;

  const location = (() => {
    if (/\bostium\b|\bostial\b/.test(haystack)) return "ostial ";
    if (/\bproximal(?:ly)?\b/.test(haystack)) return "proximal ";
    if (/\bmid\b/.test(haystack)) return "mid ";
    if (/\bdistal(?:ly)?\b/.test(haystack)) return "distal ";
    return "";
  })();

  const severity = (() => {
    if (/\bsevere(?:ly)?\b/.test(haystack)) return "severe ";
    if (/\bmoderate(?:ly)?\b/.test(haystack)) return "moderate ";
    if (/\bmild(?:ly)?\b/.test(haystack)) return "mild ";
    if (/\bsignificant(?:ly)?\b/.test(haystack)) return "significant ";
    if (/\bslight(?:ly)?\b/.test(haystack)) return "slight ";
    if (/\bminimal(?:ly)?\b/.test(haystack)) return "minimal ";
    return "";
  })();

  const concept = /\bcompression\b|\bcompressed\b/.test(haystack)
    ? "compression"
    : /\bstenos(?:is|ed)\b/.test(haystack)
      ? "stenosis"
      : "narrowing";

  return `${severity}${location}${concept} of ${vessel}`.replace(/\s+/g, " ").trim();
}

interface NormalizedFeatureRow {
  name: string;
  count: number;
  keep: number;
  skip: number;
}

interface CoronaryNarrowingRow {
  name: string;
  count: number;
}

interface PaperFeatureRow {
  id: string;
  category: string;
  canonical: string;
  aliases: string[];
  trackingRole: "feature" | "measurement" | "reference";
  asserted: number;
  negated: number;
  total: number;
}

type BridgeDashboardCategory = "notPresent" | "grade1" | "grade2" | "grade3";
type BridgeCountCategory = "notPresent" | "one" | "two" | "threePlus";

interface BridgeDashboardStats {
  totalPatients: number;
  bridgePatients: number;
  multipleBridgePatients: number;
  categories: Record<BridgeDashboardCategory, number>;
  bridgeCounts: Record<BridgeCountCategory, number>;
}

interface HorizontalBarDatum {
  label: string;
  value: number;
}

type FeatureSortKey = keyof NormalizedFeatureRow;
type FeatureSortDirection = "asc" | "desc";

export default function Analysis() {
  const [reports, setReports] = useState<StoredParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [featureSearch, setFeatureSearch] = useState("");
  const [featureSort, setFeatureSort] = useState<{
    key: FeatureSortKey;
    direction: FeatureSortDirection;
  }>({ key: "count", direction: "desc" });
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
        const name = getAnalysisFeatureName(term);
        if (name) uniqueNames.add(name);
      });
    });

    return uniqueNames.size;
  }, [reports]);

  const allTerms = useMemo(
    () => reports.flatMap((report) => getStoredParsedTerms(report)),
    [reports]
  );
  const allReviewDecisions = useMemo<ReviewDecisionRecord[]>(
    () => reports.flatMap((report) => report.reviewDecisions ?? []),
    [reports]
  );

  const reportCount = reports.length;
  const reviewedReportCount = reports.filter((report) => report.reviewed).length;
  const paperFeatureRows = useMemo<PaperFeatureRow[]>(() => {
    const rows = new Map(
      PAPER_FEATURES.map((paperFeature) => [
        paperFeature.id,
        {
          ...paperFeature,
          asserted: 0,
          negated: 0,
          total: 0,
        },
      ])
    );

    allTerms.forEach((term) => {
      const paperFeature = resolveParsedTermPaperFeature(term);
      if (!paperFeature) return;

      const row = rows.get(paperFeature.id);
      if (!row) return;

      row[term.assertion] += 1;
      row.total += 1;
    });

    return Array.from(rows.values());
  }, [allTerms]);
  const maxPaperFeatureCount = useMemo(
    () => Math.max(1, ...paperFeatureRows.map((row) => row.total)),
    [paperFeatureRows]
  );
  const normalizedFeatureRows = useMemo(() => {
    const rows = new Map<
      string,
      NormalizedFeatureRow
    >();

    allTerms.forEach((term) => {
      if (!shouldIncludeInNormalizedFrequency(term)) return;

      const name = getAnalysisFeatureName(term);
      if (!name) return;

      const existing =
        rows.get(name) ??
        {
          name,
          count: 0,
          keep: 0,
          skip: 0,
        };

      existing.count += 1;
      rows.set(name, existing);
    });

    allReviewDecisions.forEach((record) => {
      if (!shouldIncludeInNormalizedFrequency(record)) return;

      const name = getAnalysisFeatureName(record);
      if (!name) return;

      const existing =
        rows.get(name) ??
        {
          name,
          count: 0,
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
  const coronaryNarrowingRows = useMemo<CoronaryNarrowingRow[]>(() => {
    const rows = new Map<string, CoronaryNarrowingRow>();

    allTerms.forEach((term) => {
      const normalizedName = normalizeCoronaryNarrowingFeature(term);
      if (!normalizedName) return;

      const existing = rows.get(normalizedName) ?? { name: normalizedName, count: 0 };
      existing.count += 1;
      rows.set(normalizedName, existing);
    });

    return Array.from(rows.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [allTerms]);
  const bridgeDashboardStats = useMemo<BridgeDashboardStats>(() => {
    const categories: BridgeDashboardStats["categories"] = {
      notPresent: 0,
      grade1: 0,
      grade2: 0,
      grade3: 0,
    };
    const bridgeCounts: BridgeDashboardStats["bridgeCounts"] = {
      notPresent: 0,
      one: 0,
      two: 0,
      threePlus: 0,
    };
    let bridgePatients = 0;
    let multipleBridgePatients = 0;

    reports.forEach((report) => {
      const summary = report.parseResult.myocardialBridgeSummary;
      const bridgeCount = summary?.bridgeCount ?? 0;
      const bridgeGrades =
        summary?.bridges
          ?.map((bridge) => bridge.grade)
          .filter((grade): grade is 1 | 2 | 3 => grade === 1 || grade === 2 || grade === 3) ??
        [];
      const highestGrade =
        summary?.highestGrade === 1 ||
        summary?.highestGrade === 2 ||
        summary?.highestGrade === 3
          ? summary.highestGrade
          : bridgeGrades.length > 0
            ? Math.max(...bridgeGrades)
            : null;

      if (bridgeCount <= 0 || !highestGrade) {
        categories.notPresent += 1;
        bridgeCounts.notPresent += 1;
        return;
      }

      bridgePatients += 1;
      if (bridgeCount > 1) multipleBridgePatients += 1;
      if (bridgeCount === 1) bridgeCounts.one += 1;
      else if (bridgeCount === 2) bridgeCounts.two += 1;
      else bridgeCounts.threePlus += 1;
      categories[`grade${highestGrade}` as BridgeDashboardCategory] += 1;
    });

    return {
      totalPatients: reports.length,
      bridgePatients,
      multipleBridgePatients,
      categories,
      bridgeCounts,
    };
  }, [reports]);
  const bridgeCountChartData = useMemo<HorizontalBarDatum[]>(
    () => [
      { label: "Not Present", value: bridgeDashboardStats.bridgeCounts.notPresent },
      { label: "1", value: bridgeDashboardStats.bridgeCounts.one },
      { label: "2", value: bridgeDashboardStats.bridgeCounts.two },
      { label: "3+", value: bridgeDashboardStats.bridgeCounts.threePlus },
    ],
    [bridgeDashboardStats]
  );
  const bridgeGradeChartData = useMemo<HorizontalBarDatum[]>(
    () => [
      { label: "Not Present", value: bridgeDashboardStats.categories.notPresent },
      { label: "Grade 1", value: bridgeDashboardStats.categories.grade1 },
      { label: "Grade 2", value: bridgeDashboardStats.categories.grade2 },
      { label: "Grade 3", value: bridgeDashboardStats.categories.grade3 },
    ],
    [bridgeDashboardStats]
  );
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
                href="#paper-features"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Paper Features
              </a>
              <a
                href="#coronary-narrowing"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Coronary Narrowing
              </a>
              <a
                href="#myocardial-bridges"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Myocardial Bridges
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

        <section id="paper-features" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Paper Features Overview</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete paper-tracked AAOCA feature dictionary with occurrence counts across parsed reports.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paper reference:{" "}
              <a
                href="https://www.jacc.org/doi/10.1016/j.jcmg.2026.02.005"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                https://www.jacc.org/doi/10.1016/j.jcmg.2026.02.005
              </a>
            </p>
          </div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[190px]">Category</TableHead>
                    <TableHead className="min-w-[210px]">Canonical keyword</TableHead>
                    <TableHead className="min-w-[260px]">Aliases</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="min-w-[150px]">Total occurrences</TableHead>
                    <TableHead className="text-right">Asserted</TableHead>
                    <TableHead className="text-right">Negated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paperFeatureRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell className="font-medium">{row.canonical}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.aliases.length > 0 ? row.aliases.join(" / ") : "-"}
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {row.trackingRole}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{
                                width: loading
                                  ? "0%"
                                  : `${(row.total / maxPaperFeatureCount) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-foreground">
                            {loading ? "..." : row.total}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {loading ? "..." : row.asserted}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {loading ? "..." : row.negated}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section id="coronary-narrowing" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Coronary Narrowing Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Narrowing-related findings resolved to the specific coronary artery or segment.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Narrowing By Coronary Artery</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[360px]">Resolved narrowing feature</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coronaryNarrowingRows.length > 0 ? (
                    coronaryNarrowingRows.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No vessel-specific coronary narrowing features found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section id="myocardial-bridges" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Myocardial Bridge Distribution
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Patient-level bridge count and highest grade distributions.
            </p>
          </div>

          <div className="grid gap-4">
            <HorizontalBarChart
              title="Bridge Count"
              subtitle={`${bridgeDashboardStats.bridgePatients} patients with bridges; ${bridgeDashboardStats.multipleBridgePatients} with more than one`}
              data={bridgeCountChartData}
              loading={loading}
            />
            <HorizontalBarChart
              title="Highest Bridge Grade"
              subtitle="If multiple bridges are present, only the highest grade is counted"
              data={bridgeGradeChartData}
              loading={loading}
            />
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
                        <TableCell className="text-right tabular-nums">{row.keep}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.skip}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
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

function HorizontalBarChart({
  title,
  subtitle,
  data,
  loading,
}: {
  title: string;
  subtitle: string;
  data: HorizontalBarDatum[];
  loading: boolean;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const width = loading ? 0 : Math.max(3, (item.value / maxValue) * 100);
            return (
              <div key={item.label} className="grid grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-3">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="h-7 overflow-hidden rounded-md bg-muted">
                  <div
                    className="h-full rounded-md bg-primary transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-right text-sm font-medium tabular-nums text-foreground">
                  {loading ? "..." : item.value}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
