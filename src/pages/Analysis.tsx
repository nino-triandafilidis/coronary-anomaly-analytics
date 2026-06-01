import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  getStoredParsedReports,
  getStoredParsedTerms,
  type StoredParsedReport,
} from "@/lib/parsedReportStorage";
import type { ReviewDecisionRecord, ParsedTerm } from "@/data/parseTypes";
import {
  PAPER_FEATURES,
  resolveParsedTermPaperFeature,
  shouldIncludeInNormalizedFrequency,
} from "@/data/paperFeatures";
import {
  buildInterarterialCourseLengthHistogram,
  cleanInterarterialCourseLengthMeasurements,
  type CourseLengthHistogramBin,
} from "@/data/interarterialCourseLengths";
import {
  buildIntramuralCourseLengthHistogram,
  cleanIntramuralCourseLengthMeasurements,
} from "@/data/intramuralCourseLengths";
import { getReportAnomalousLeftSubtypes } from "@/data/anomalousLeftSubtypes";
import {
  canonicalFeature,
  getAnalysisFeatureName,
  normalizeCoronaryNarrowingFeature,
  reportIncidence,
} from "@/data/featureCanonical";

const ADDED_TERMS_PLACEHOLDER = 0;
const TABLE_PAGE_SIZE = 10;

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

type PaperFeatureOverviewMode =
  | "overall"
  | "intraconal_left"
  | "intramural_interarterial_left";

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
  const [paperFeatureOverviewMode, setPaperFeatureOverviewMode] =
    useState<PaperFeatureOverviewMode>("overall");
  const [coronaryPage, setCoronaryPage] = useState(1);
  const [featurePage, setFeaturePage] = useState(1);
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

  const allReviewDecisions = useMemo<ReviewDecisionRecord[]>(
    () => reports.flatMap((report) => report.reviewDecisions ?? []),
    [reports]
  );
  const interarterialCourseLengthMeasurements = useMemo(
    () =>
      reports.flatMap((report) =>
        cleanInterarterialCourseLengthMeasurements(
          report.parseResult.interarterialCourseLengths
        )
      ),
    [reports]
  );
  const interarterialCourseLengthHistogram = useMemo(
    () =>
      buildInterarterialCourseLengthHistogram(
        interarterialCourseLengthMeasurements.map((measurement) => measurement.value)
      ),
    [interarterialCourseLengthMeasurements]
  );
  const intramuralCourseLengthMeasurements = useMemo(
    () =>
      reports.flatMap((report) =>
        cleanIntramuralCourseLengthMeasurements(
          report.parseResult.intramuralCourseLengths
        )
      ),
    [reports]
  );
  const intramuralCourseLengthHistogram = useMemo(
    () =>
      buildIntramuralCourseLengthHistogram(
        intramuralCourseLengthMeasurements.map((measurement) => measurement.value)
      ),
    [intramuralCourseLengthMeasurements]
  );

  const reportCount = reports.length;
  const reviewedReportCount = reports.filter((report) => report.reviewed).length;
  const paperFeatureRows = useMemo<PaperFeatureRow[]>(() => {
    const anomalousLeftSubtypeFeatureIds = {
      intraconal_left: "anomalous_left_intraconal",
      intramural_interarterial_left: "anomalous_left_intramural_interarterial",
    } as const;
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

    reports.forEach((report) => {
      const parsedTerms = getStoredParsedTerms(report);

      // Per-report incidence: a feature counts once per report, not per mention.
      const assertedIds = new Set<string>();
      const negatedIds = new Set<string>();
      parsedTerms.forEach((term) => {
        const paperFeature = resolveParsedTermPaperFeature(term);
        if (!paperFeature || Object.values(anomalousLeftSubtypeFeatureIds).includes(
          paperFeature.id as typeof anomalousLeftSubtypeFeatureIds[keyof typeof anomalousLeftSubtypeFeatureIds]
        )) {
          return;
        }
        (term.assertion === "negated" ? negatedIds : assertedIds).add(paperFeature.id);
      });

      new Set([...assertedIds, ...negatedIds]).forEach((id) => {
        const row = rows.get(id);
        if (row) row.total += 1;
      });
      assertedIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.asserted += 1;
      });
      negatedIds.forEach((id) => {
        const row = rows.get(id);
        if (row) row.negated += 1;
      });

      const reportSubtypeIds = new Set(
        getReportAnomalousLeftSubtypes(
          report.parseResult.anomalousLeftSubtypes,
          parsedTerms
        ).map((entry) => anomalousLeftSubtypeFeatureIds[entry.subtype])
      );

      reportSubtypeIds.forEach((featureId) => {
        const row = rows.get(featureId);
        if (!row) return;

        row.asserted += 1;
        row.total += 1;
      });
    });

    return Array.from(rows.values());
  }, [reports]);
  const maxPaperFeatureCount = useMemo(
    () => Math.max(1, ...paperFeatureRows.map((row) => row.total)),
    [paperFeatureRows]
  );
  const anomalousLeftOverviewCards = useMemo(
    () => [
      {
        title: "Intraconal lefts",
        subtitle: "Intraconal / intraseptal / subpulmonic anomalous left courses",
        count:
          paperFeatureRows.find((row) => row.id === "anomalous_left_intraconal")
            ?.total ?? 0,
      },
      {
        title: "Intramural / inter-arterial lefts",
        subtitle: "Intramural and/or inter-arterial anomalous left courses",
        count:
          paperFeatureRows.find(
            (row) => row.id === "anomalous_left_intramural_interarterial"
          )?.total ?? 0,
      },
    ],
    [paperFeatureRows]
  );
  const paperFeatureCategoryChartData = useMemo<HorizontalBarDatum[]>(() => {
    const categoryCounts = new Map(
      Array.from(new Set(PAPER_FEATURES.map((paperFeature) => paperFeature.category))).map(
        (category) => [category, 0]
      )
    );

    reports.forEach((report) => {
      const parsedTerms = getStoredParsedTerms(report);
      const reportSubtypes = new Set(
        getReportAnomalousLeftSubtypes(
          report.parseResult.anomalousLeftSubtypes,
          parsedTerms
        ).map((entry) => entry.subtype)
      );
      if (
        paperFeatureOverviewMode !== "overall" &&
        !reportSubtypes.has(paperFeatureOverviewMode)
      ) {
        return;
      }

      const reportCategories = new Set(
        parsedTerms.flatMap((term) => {
          const paperFeature = resolveParsedTermPaperFeature(term);
          return paperFeature ? [paperFeature.category] : [];
        })
      );
      if (reportSubtypes.size > 0) reportCategories.add("Anomalous vessel");

      reportCategories.forEach((category) => {
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      });
    });

    return Array.from(categoryCounts, ([label, value]) => ({ label, value }));
  }, [paperFeatureOverviewMode, reports]);
  const normalizedFeatureRows = useMemo(() => {
    // Per-report incidence, keyed by canonical feature so synonyms collapse into
    // one row instead of fragmenting the count across wording variants.
    const tallies = reportIncidence(reports, getStoredParsedTerms, (term) =>
      shouldIncludeInNormalizedFrequency(term) ? canonicalFeature(term) : null
    );

    const byKey = new Map<string, NormalizedFeatureRow>();
    tallies.forEach((tally) => {
      byKey.set(tally.key, { name: tally.label, count: tally.reports, keep: 0, skip: 0 });
    });

    allReviewDecisions.forEach((record) => {
      if (!shouldIncludeInNormalizedFrequency(record)) return;
      const feature = canonicalFeature(record as ParsedTerm);
      if (!feature) return;

      const existing =
        byKey.get(feature.key) ?? { name: feature.label, count: 0, keep: 0, skip: 0 };
      if (record.decision === "keep") existing.keep += 1;
      if (record.decision === "skip") existing.skip += 1;
      byKey.set(feature.key, existing);
    });

    return Array.from(byKey.values());
  }, [allReviewDecisions, reports]);
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
    // Per-report incidence of each canonical narrowing concept.
    const tallies = reportIncidence(reports, getStoredParsedTerms, (term) => {
      const narrowing = normalizeCoronaryNarrowingFeature(term);
      return narrowing
        ? { key: `narrowing:${narrowing.toLowerCase()}`, label: narrowing, category: "Coronary narrowing" }
        : null;
    });

    return tallies
      .map((tally) => ({ name: tally.label, count: tally.reports }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [reports]);

  const coronaryPageCount = Math.max(
    1,
    Math.ceil(coronaryNarrowingRows.length / TABLE_PAGE_SIZE)
  );
  const safeCoronaryPage = Math.min(coronaryPage, coronaryPageCount);
  const paginatedCoronaryRows = coronaryNarrowingRows.slice(
    (safeCoronaryPage - 1) * TABLE_PAGE_SIZE,
    safeCoronaryPage * TABLE_PAGE_SIZE
  );
  const featurePageCount = Math.max(
    1,
    Math.ceil(filteredFeatureRows.length / TABLE_PAGE_SIZE)
  );
  const safeFeaturePage = Math.min(featurePage, featurePageCount);
  const paginatedFeatureRows = filteredFeatureRows.slice(
    (safeFeaturePage - 1) * TABLE_PAGE_SIZE,
    safeFeaturePage * TABLE_PAGE_SIZE
  );

  useEffect(() => {
    setFeaturePage(1);
  }, [featureSearch, featureSort]);
  useEffect(() => {
    setCoronaryPage(1);
  }, [coronaryNarrowingRows]);
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
                href="#interarterial-course-lengths"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                IA Course Lengths
              </a>
              <a
                href="#intramural-course-lengths"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Intramural Lengths
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
              Complete paper-tracked AAOCA feature dictionary with per-report incidence (reports containing the feature) across parsed reports.
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

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            {anomalousLeftOverviewCards.map((card) => (
              <Card key={card.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold tabular-nums text-foreground">
                    {loading ? "..." : card.count}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    reports with this subtype
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaperFeatureCategoryChart
            data={paperFeatureCategoryChartData}
            loading={loading}
            mode={paperFeatureOverviewMode}
            onModeChange={setPaperFeatureOverviewMode}
          />

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[190px]">Category</TableHead>
                    <TableHead className="min-w-[210px]">Canonical keyword</TableHead>
                    <TableHead className="min-w-[260px]">Aliases</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="min-w-[150px]">Reports</TableHead>
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
                    paginatedCoronaryRows.map((row) => (
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
              {coronaryNarrowingRows.length > 0 && (
                <TablePagination
                  page={safeCoronaryPage}
                  pageCount={coronaryPageCount}
                  onPageChange={setCoronaryPage}
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section id="interarterial-course-lengths" className="mt-10 scroll-mt-6">
          <CourseLengthHistogram
            bins={interarterialCourseLengthHistogram}
            measurementCount={interarterialCourseLengthMeasurements.length}
            loading={loading}
            title="Inter-arterial Course Length Distribution"
            loadingLabel="Loading inter-arterial course length values..."
            emptyLabel="No inter-arterial course length values found."
          />
        </section>

        <section id="intramural-course-lengths" className="mt-10 scroll-mt-6">
          <CourseLengthHistogram
            bins={intramuralCourseLengthHistogram}
            measurementCount={intramuralCourseLengthMeasurements.length}
            loading={loading}
            title="Intramural Course Length Distribution"
            loadingLabel="Loading intramural course length values..."
            emptyLabel="No intramural course length values found."
          />
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
                    paginatedFeatureRows.map((row) => (
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
              {filteredFeatureRows.length > 0 && (
                <TablePagination
                  page={safeFeaturePage}
                  pageCount={featurePageCount}
                  onPageChange={setFeaturePage}
                />
              )}
            </CardContent>
          </Card>
        </section>
        </div>
      </main>

    </div>
  );
}

function getPageList(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);

  if (start > 2) pages.push("ellipsis");
  for (let current = start; current <= end; current += 1) pages.push(current);
  if (end < pageCount - 1) pages.push("ellipsis");
  pages.push(pageCount);

  return pages;
}

function TablePagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <Pagination className="border-t border-border py-3">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page <= 1}
            className={
              page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
            }
            onClick={(event) => {
              event.preventDefault();
              if (page > 1) onPageChange(page - 1);
            }}
          />
        </PaginationItem>
        {getPageList(page, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                isActive={item === page}
                className="cursor-pointer"
                onClick={(event) => {
                  event.preventDefault();
                  onPageChange(item);
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page >= pageCount}
            className={
              page >= pageCount
                ? "pointer-events-none opacity-50"
                : "cursor-pointer"
            }
            onClick={(event) => {
              event.preventDefault();
              if (page < pageCount) onPageChange(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
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

function PaperFeatureCategoryChart({
  data,
  loading,
  mode,
  onModeChange,
}: {
  data: HorizontalBarDatum[];
  loading: boolean;
  mode: PaperFeatureOverviewMode;
  onModeChange: (mode: PaperFeatureOverviewMode) => void;
}) {
  const modes: { value: PaperFeatureOverviewMode; label: string }[] = [
    { value: "overall", label: "Overall" },
    { value: "intraconal_left", label: "Intraconal lefts" },
    {
      value: "intramural_interarterial_left",
      label: "Intramural / inter-arterial lefts",
    },
  ];
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Paper Feature Categories</CardTitle>
        <p className="text-xs text-muted-foreground">
          Number of reports containing at least one tracked feature in each category.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {modes.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={mode === option.value ? "default" : "outline"}
              onClick={() => onModeChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const width = loading ? 0 : (item.value / maxValue) * 100;
            return (
              <div
                key={item.label}
                className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_48px] items-center gap-3"
              >
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

function CourseLengthHistogram({
  bins,
  measurementCount,
  loading,
  title,
  loadingLabel,
  emptyLabel,
}: {
  bins: CourseLengthHistogramBin[];
  measurementCount: number;
  loading: boolean;
  title: string;
  loadingLabel: string;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Loading measurements..."
            : `${measurementCount} explicit length measurement${measurementCount === 1 ? "" : "s"} across parsed reports`}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {loadingLabel}
          </p>
        ) : bins.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  label={{ value: "Length bin (mm)", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  label={{ value: "Count", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  labelFormatter={(label) => `Length bin: ${label}`}
                  formatter={(value) => [value, "Count"]}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
