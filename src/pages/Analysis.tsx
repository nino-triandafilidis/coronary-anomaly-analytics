import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { deriveAaocaUmbrella, AAOCA_UMBRELLA_IDS } from "@/data/aaocaUmbrella";
import {
  deriveReportLaterality,
  reportMatchesFilter,
  type LateralityFilter,
  type LeftSubtypeFilter,
} from "@/data/laterality";
import {
  RISK_FLAGS,
  SPONSOR_FLAG,
  countCooccurrence,
  detectReportRiskFlags,
  flagPrevalence,
  type CooccurrenceCounts,
  type FlagPrevalence,
  type RiskFlag,
  type RiskFlagKey,
} from "@/data/riskCooccurrence";
import {
  canonicalFeature,
  normalizeCoronaryNarrowingFeature,
  reportIncidence,
} from "@/data/featureCanonical";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import {
  distinctReportCount,
  type ProvenanceContributor,
  type ProvenanceSource,
} from "@/lib/provenance";

const TABLE_PAGE_SIZE = 10;

const ANOMALOUS_LEFT_SUBTYPE_FEATURE_IDS = {
  intraconal_left: "anomalous_left_intraconal",
  intramural_interarterial_left: "anomalous_left_intramural_interarterial",
} as const;

// The sentence around [start, end) in the report text, for when a term carries
// no usable context of its own.
function sentenceContext(text: string, start: number, end: number): string {
  const from = text.lastIndexOf(".", Math.max(0, start - 1)) + 1;
  let to = text.indexOf(".", end);
  if (to < 0) to = text.length;
  return text.slice(from, to + 1).replace(/\s+/g, " ").trim();
}

// One report's contribution to a term-level aggregate, keeping the verbatim span
// and the surrounding quote (derived from the report text when the parsed term
// lacks a context that actually contains the span) plus offsets for the
// Dataset deep-link focus.
function termContributor(
  report: StoredParsedReport,
  term: ParsedTerm
): ProvenanceContributor {
  const matchedText = (term.term?.trim() || term.normalizedName?.trim() || "").replace(
    /\s+/g,
    " "
  );
  let context = (term.context ?? "").replace(/\s+/g, " ").trim();
  const hasMatch =
    matchedText.length > 0 && context.toLowerCase().includes(matchedText.toLowerCase());
  if (!hasMatch) {
    const reportText = report.parseResult?.reportText ?? report.text ?? "";
    if (
      reportText &&
      Number.isFinite(term.startIndex) &&
      Number.isFinite(term.endIndex) &&
      term.endIndex > term.startIndex
    ) {
      context = sentenceContext(reportText, term.startIndex, term.endIndex);
    }
  }
  return {
    reportId: report.id,
    matchedText,
    normalizedName: term.normalizedName?.trim() || undefined,
    context: context || undefined,
    assertion: term.assertion,
    startIndex: term.startIndex,
    endIndex: term.endIndex,
  };
}

function occurrenceSubtitle(contributors: ProvenanceContributor[]): string {
  const reports = distinctReportCount(contributors);
  return `${contributors.length} occurrence${contributors.length === 1 ? "" : "s"} · ${reports} report${reports === 1 ? "" : "s"}`;
}

function reportCountSubtitle(reports: number): string {
  return `${reports} report${reports === 1 ? "" : "s"}`;
}

// Collect contributors per aggregate key, mirroring the same term->key selector
// reportIncidence() uses for the count. The backing tables count per-report
// incidence (a feature counts once per report per assertion), so dedupe by
// (report, assertion) here: otherwise a report that mentions a feature twice
// would render duplicate rows and inflate the panel's asserted/negated badges
// past the report count shown in the table.
function contributorsByFeature(
  reports: StoredParsedReport[],
  selectKey: (term: ParsedTerm) => string | null
): Map<string, ProvenanceContributor[]> {
  const map = new Map<string, ProvenanceContributor[]>();
  const seen = new Map<string, Set<string>>();
  reports.forEach((report) => {
    getStoredParsedTerms(report).forEach((term) => {
      const key = selectKey(term);
      if (!key) return;
      let seenForKey = seen.get(key);
      if (!seenForKey) {
        seenForKey = new Set<string>();
        seen.set(key, seenForKey);
      }
      const dedupeKey = `${report.id}|${term.assertion}`;
      if (seenForKey.has(dedupeKey)) return;
      seenForKey.add(dedupeKey);
      const list = map.get(key) ?? [];
      list.push(termContributor(report, term));
      map.set(key, list);
    });
  });
  return map;
}

function buildBinContributors(
  reports: StoredParsedReport[],
  getMeasurements: (
    report: StoredParsedReport
  ) => { value: number; rawText: string; vessel?: string }[],
  binSizeMm = 5
): Map<string, ProvenanceContributor[]> {
  const map = new Map<string, ProvenanceContributor[]>();
  reports.forEach((report) => {
    getMeasurements(report).forEach((measurement) => {
      const binStart = Math.floor(measurement.value / binSizeMm) * binSizeMm;
      const label = `${binStart}-${binStart + binSizeMm} mm`;
      const list = map.get(label) ?? [];
      list.push({
        reportId: report.id,
        matchedText: measurement.rawText?.trim() || `${measurement.value} mm`,
        context: measurement.vessel
          ? `${measurement.rawText ?? ""} (${measurement.vessel})`.trim()
          : measurement.rawText,
      });
      map.set(label, list);
    });
  });
  return map;
}

interface NormalizedFeatureRow {
  key: string;
  name: string;
  count: number;
  keep: number;
  skip: number;
}

interface CoronaryNarrowingRow {
  key: string;
  name: string;
  count: number;
}

interface PaperFeatureRow {
  id: string;
  category: string;
  canonical: string;
  aliases: string[];
  trackingRole: "feature" | "measurement" | "reference";
  shortLabel?: string;
  description?: string;
  asserted: number;
  negated: number;
  total: number;
}

type BridgeDashboardCategory = "notPresent" | "grade1" | "grade2" | "grade3";
type BridgeCountCategory = "notPresent" | "one" | "two" | "threePlus";
type BridgeGradeKey = "grade1" | "grade2" | "grade3";
type BridgePresentCountKey = "one" | "two" | "threePlus";
type BridgeCellMatrix = Record<
  BridgePresentCountKey,
  Record<BridgeGradeKey, ProvenanceContributor[]>
>;

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

interface SummaryStats {
  mean: number;
  median: number;
  standardDeviation: number;
}

type FeatureSortKey = keyof NormalizedFeatureRow;
type FeatureSortDirection = "asc" | "desc";

function summarizeNumericValues(values: number[]): SummaryStats | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;

  const sorted = [...finiteValues].sort((a, b) => a - b);
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  const variance =
    finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finiteValues.length;

  return {
    mean,
    median,
    standardDeviation: Math.sqrt(variance),
  };
}

export default function Analysis() {
  const [reports, setReports] = useState<StoredParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [featureSearch, setFeatureSearch] = useState("");
  const [coronarySearch, setCoronarySearch] = useState("");
  const [featureSort, setFeatureSort] = useState<{
    key: FeatureSortKey;
    direction: FeatureSortDirection;
  }>({ key: "count", direction: "desc" });
  const [lateralityFilter, setLateralityFilter] = useState<LateralityFilter>("overall");
  const [leftSubtype, setLeftSubtype] = useState<LeftSubtypeFilter>("all");
  const [coronaryPage, setCoronaryPage] = useState(1);
  const [featurePage, setFeaturePage] = useState(1);
  const [activeProvenance, setActiveProvenance] = useState<ProvenanceSource | null>(null);
  const navigate = useNavigate();
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

  const reportsWithSide = useMemo(
    () => reports.map((report) => ({ report, side: deriveReportLaterality(report) })),
    [reports]
  );
  const rightReportCount = useMemo(
    () => reportsWithSide.filter(({ side }) => side.right).length,
    [reportsWithSide]
  );
  const leftReportCount = useMemo(
    () => reportsWithSide.filter(({ side }) => side.left).length,
    [reportsWithSide]
  );

  // --- Risk-feature co-occurrence (issue: origin & risk on the right cohort). ---
  // Fixed to R-AAOCA cases vs the L-AAOCA control, independent of the page-level
  // laterality filter: the whole point is the right-versus-control contrast.
  const riskCohorts = useMemo(() => {
    const detect = (predicate: (side: ReturnType<typeof deriveReportLaterality>) => boolean) =>
      reportsWithSide
        .filter(({ side }) => predicate(side))
        .map(({ report, side }) => ({ report, ...detectReportRiskFlags(report, side) }));
    return { right: detect((side) => side.right), left: detect((side) => side.left) };
  }, [reportsWithSide]);
  const riskCounts = useMemo<CooccurrenceCounts>(
    () => countCooccurrence(riskCohorts.right.map((d) => ({ reportId: d.reportId, flags: d.flags }))),
    [riskCohorts]
  );
  const riskLeftCounts = useMemo<CooccurrenceCounts>(
    () => countCooccurrence(riskCohorts.left.map((d) => ({ reportId: d.reportId, flags: d.flags }))),
    [riskCohorts]
  );
  const riskRightPrevalence = useMemo(
    () => flagPrevalence(riskCounts.diagonal, riskCounts.total),
    [riskCounts]
  );
  const riskLeftPrevalence = useMemo(
    () => flagPrevalence(riskLeftCounts.diagonal, riskLeftCounts.total),
    [riskLeftCounts]
  );
  // Cell -> contributing reports, mirroring the count above so the drill-down can
  // never diverge from the number on screen. Diagonal cells key on the flag; pair
  // cells on "a|b" with a,b in RISK_FLAGS order.
  const riskContributors = useMemo(() => {
    const map = new Map<string, ProvenanceContributor[]>();
    const order = RISK_FLAGS.map((flag) => flag.key);
    const add = (key: string, report: StoredParsedReport, term: ParsedTerm) => {
      const list = map.get(key) ?? [];
      list.push(termContributor(report, term));
      map.set(key, list);
    };
    riskCohorts.right.forEach(({ report, flags, evidence }) => {
      const present = order.filter((key) => flags.has(key));
      present.forEach((key, i) => {
        const term = evidence.get(key);
        if (!term) return;
        add(key, report, term);
        for (let j = i + 1; j < present.length; j += 1) {
          add(`${key}|${present[j]}`, report, term);
        }
      });
    });
    return map;
  }, [riskCohorts]);
  const filteredReports = useMemo(
    () =>
      reportsWithSide
        .filter(({ side }) => reportMatchesFilter(side, lateralityFilter, leftSubtype))
        .map(({ report }) => report),
    [reportsWithSide, lateralityFilter, leftSubtype]
  );

  const allReviewDecisions = useMemo<ReviewDecisionRecord[]>(
    () => filteredReports.flatMap((report) => report.reviewDecisions ?? []),
    [filteredReports]
  );
  const interarterialCourseLengthMeasurements = useMemo(
    () =>
      filteredReports.flatMap((report) =>
        cleanInterarterialCourseLengthMeasurements(
          report.parseResult.interarterialCourseLengths
        )
      ),
    [filteredReports]
  );
  const interarterialCourseLengthStats = useMemo(
    () =>
      summarizeNumericValues(
        interarterialCourseLengthMeasurements.map((measurement) => measurement.value)
      ),
    [interarterialCourseLengthMeasurements]
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
      filteredReports.flatMap((report) =>
        cleanIntramuralCourseLengthMeasurements(
          report.parseResult.intramuralCourseLengths
        )
      ),
    [filteredReports]
  );
  const intramuralCourseLengthStats = useMemo(
    () =>
      summarizeNumericValues(
        intramuralCourseLengthMeasurements.map((measurement) => measurement.value)
      ),
    [intramuralCourseLengthMeasurements]
  );
  const intramuralCourseLengthHistogram = useMemo(
    () =>
      buildIntramuralCourseLengthHistogram(
        intramuralCourseLengthMeasurements.map((measurement) => measurement.value)
      ),
    [intramuralCourseLengthMeasurements]
  );

  const reportCount = reports.length;
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

    filteredReports.forEach((report) => {
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
        getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes).map(
          (entry) => anomalousLeftSubtypeFeatureIds[entry.subtype]
        )
      );

      reportSubtypeIds.forEach((featureId) => {
        const row = rows.get(featureId);
        if (!row) return;

        row.asserted += 1;
        row.total += 1;
      });
    });

    // The umbrella diagnosis rows (R/L/ST-AAOCA) are driven by the deterministic
    // umbrella classifier rather than raw term incidence, so each row counts the
    // same set its laterality card does: cohort mislabels drop out and the reports
    // whose anomaly the parser captured only as constituents are recovered (#105).
    AAOCA_UMBRELLA_IDS.forEach((id) => {
      const row = rows.get(id);
      if (row) {
        row.asserted = 0;
        row.negated = 0;
        row.total = 0;
      }
    });
    filteredReports.forEach((report) => {
      const { umbrella } = deriveAaocaUmbrella(report);
      if (!umbrella) return;
      const row = rows.get(umbrella);
      if (row) {
        row.asserted += 1;
        row.total += 1;
      }
    });

    return Array.from(rows.values());
  }, [filteredReports]);
  const maxPaperFeatureCount = useMemo(
    () => Math.max(1, ...paperFeatureRows.map((row) => row.total)),
    [paperFeatureRows]
  );
  const paperFeatureCategoryChartData = useMemo<HorizontalBarDatum[]>(() => {
    const categoryCounts = new Map(
      Array.from(new Set(PAPER_FEATURES.map((paperFeature) => paperFeature.category))).map(
        (category) => [category, 0]
      )
    );

    filteredReports.forEach((report) => {
      const parsedTerms = getStoredParsedTerms(report);
      const reportSubtypes = new Set(
        getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes).map(
          (entry) => entry.subtype
        )
      );

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
  }, [filteredReports]);
  const normalizedFeatureRows = useMemo(() => {
    // Per-report incidence, keyed by canonical feature so synonyms collapse into
    // one row instead of fragmenting the count across wording variants.
    const tallies = reportIncidence(filteredReports, getStoredParsedTerms, (term) =>
      shouldIncludeInNormalizedFrequency(term) ? canonicalFeature(term) : null
    );

    const byKey = new Map<string, NormalizedFeatureRow>();
    tallies.forEach((tally) => {
      byKey.set(tally.key, { key: tally.key, name: tally.label, count: tally.reports, keep: 0, skip: 0 });
    });

    allReviewDecisions.forEach((record) => {
      if (!shouldIncludeInNormalizedFrequency(record)) return;
      const feature = canonicalFeature(record as ParsedTerm);
      if (!feature) return;

      const existing =
        byKey.get(feature.key) ?? { key: feature.key, name: feature.label, count: 0, keep: 0, skip: 0 };
      if (record.decision === "keep") existing.keep += 1;
      if (record.decision === "skip") existing.skip += 1;
      byKey.set(feature.key, existing);
    });

    return Array.from(byKey.values());
  }, [allReviewDecisions, filteredReports]);
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
    const tallies = reportIncidence(filteredReports, getStoredParsedTerms, (term) => {
      const narrowing = normalizeCoronaryNarrowingFeature(term);
      return narrowing
        ? { key: `narrowing:${narrowing.toLowerCase()}`, label: narrowing, category: "Coronary narrowing" }
        : null;
    });

    return tallies
      .map((tally) => ({ key: tally.key, name: tally.label, count: tally.reports }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [filteredReports]);
  const filteredCoronaryNarrowingRows = useMemo(() => {
    const query = coronarySearch.trim().toLowerCase();
    return query
      ? coronaryNarrowingRows.filter((row) =>
          [row.name, String(row.count)].some((value) =>
            value.toLowerCase().includes(query)
          )
        )
      : coronaryNarrowingRows;
  }, [coronaryNarrowingRows, coronarySearch]);

  const coronaryPageCount = Math.max(
    1,
    Math.ceil(filteredCoronaryNarrowingRows.length / TABLE_PAGE_SIZE)
  );
  const safeCoronaryPage = Math.min(coronaryPage, coronaryPageCount);
  const paginatedCoronaryRows = filteredCoronaryNarrowingRows.slice(
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
  }, [featureSearch, featureSort, lateralityFilter, leftSubtype]);
  useEffect(() => {
    setCoronaryPage(1);
  }, [coronaryNarrowingRows, coronarySearch]);
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

    filteredReports.forEach((report) => {
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
      totalPatients: filteredReports.length,
      bridgePatients,
      multipleBridgePatients,
      categories,
      bridgeCounts,
    };
  }, [filteredReports]);
  const bridgeCountStats = useMemo(
    () =>
      summarizeNumericValues(
        filteredReports.map((report) => report.parseResult.myocardialBridgeSummary?.bridgeCount ?? 0)
      ),
    [filteredReports]
  );
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

  // --- Provenance: contributing reports behind each aggregate (issue #63). ---
  // Each map mirrors the count logic above (same filteredReports, same term->key
  // selector reportIncidence uses) so the drill-down can't diverge from the
  // number on screen; it just keeps the per-report linkage the counts drop.
  const paperFeatureContributors = useMemo(() => {
    const subtypeIds = Object.values(ANOMALOUS_LEFT_SUBTYPE_FEATURE_IDS) as string[];
    return contributorsByFeature(filteredReports, (term) => {
      const paperFeature = resolveParsedTermPaperFeature(term);
      return paperFeature && !subtypeIds.includes(paperFeature.id) ? paperFeature.id : null;
    });
  }, [filteredReports]);
  const subtypeContributors = useMemo(() => {
    const map = new Map<string, ProvenanceContributor[]>();
    filteredReports.forEach((report) => {
      const seen = new Set<string>();
      getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes).forEach((entry) => {
        const featureId = ANOMALOUS_LEFT_SUBTYPE_FEATURE_IDS[entry.subtype];
        if (seen.has(featureId)) return;
        seen.add(featureId);
        const list = map.get(featureId) ?? [];
        list.push({
          reportId: report.id,
          matchedText: (entry.rawText?.trim() || entry.subtype.replace(/_/g, " ")).replace(/\s+/g, " "),
          context: entry.rawText,
        });
        map.set(featureId, list);
      });
    });
    return map;
  }, [filteredReports]);
  const categoryContributors = useMemo(() => {
    // Mirrors paperFeatureCategoryChartData: one contributor per report per
    // category it has a tracked feature in (report-level, so the count matches).
    const map = new Map<string, ProvenanceContributor[]>();
    filteredReports.forEach((report) => {
      const parsedTerms = getStoredParsedTerms(report);
      const reportSubtypes = getReportAnomalousLeftSubtypes(report.parseResult.anomalousLeftSubtypes);
      const repByCategory = new Map<string, ParsedTerm>();
      parsedTerms.forEach((term) => {
        const paperFeature = resolveParsedTermPaperFeature(term);
        if (!paperFeature || repByCategory.has(paperFeature.category)) return;
        repByCategory.set(paperFeature.category, term);
      });
      const categories = new Set(repByCategory.keys());
      if (reportSubtypes.length > 0) categories.add("Anomalous vessel");
      categories.forEach((category) => {
        const list = map.get(category) ?? [];
        const rep = repByCategory.get(category);
        if (rep) {
          list.push(termContributor(report, rep));
        } else {
          const subtype = reportSubtypes[0];
          list.push({
            reportId: report.id,
            matchedText: (subtype?.rawText?.trim() || "anomalous coronary artery").replace(/\s+/g, " "),
            context: subtype?.rawText,
          });
        }
        map.set(category, list);
      });
    });
    return map;
  }, [filteredReports]);
  const coronaryContributors = useMemo(
    () =>
      contributorsByFeature(filteredReports, (term) => {
        const narrowing = normalizeCoronaryNarrowingFeature(term);
        return narrowing ? `narrowing:${narrowing.toLowerCase()}` : null;
      }),
    [filteredReports]
  );
  const featureTableContributors = useMemo(
    () =>
      contributorsByFeature(filteredReports, (term) =>
        shouldIncludeInNormalizedFrequency(term) ? canonicalFeature(term)?.key ?? null : null
      ),
    [filteredReports]
  );
  const bridgeContributors = useMemo(() => {
    const grade: Record<BridgeDashboardCategory, ProvenanceContributor[]> = {
      notPresent: [],
      grade1: [],
      grade2: [],
      grade3: [],
    };
    const count: Record<BridgeCountCategory, ProvenanceContributor[]> = {
      notPresent: [],
      one: [],
      two: [],
      threePlus: [],
    };
    const matrix: BridgeCellMatrix = {
      one: { grade1: [], grade2: [], grade3: [] },
      two: { grade1: [], grade2: [], grade3: [] },
      threePlus: { grade1: [], grade2: [], grade3: [] },
    };
    filteredReports.forEach((report) => {
      const summary = report.parseResult.myocardialBridgeSummary;
      const bridgeCount = summary?.bridgeCount ?? 0;
      const bridges = summary?.bridges ?? [];
      const bridgeGrades = bridges
        .map((bridge) => bridge.grade)
        .filter((g): g is 1 | 2 | 3 => g === 1 || g === 2 || g === 3);
      const highestGrade =
        summary?.highestGrade === 1 ||
        summary?.highestGrade === 2 ||
        summary?.highestGrade === 3
          ? summary.highestGrade
          : bridgeGrades.length > 0
            ? (Math.max(...bridgeGrades) as 1 | 2 | 3)
            : null;
      if (bridgeCount <= 0 || !highestGrade) {
        const contributor: ProvenanceContributor = {
          reportId: report.id,
          matchedText: "no myocardial bridge reported",
        };
        grade.notPresent.push(contributor);
        count.notPresent.push(contributor);
        return;
      }
      const evidenceFor = (bridge?: (typeof bridges)[number]) =>
        bridge?.evidenceText?.trim() ||
        [bridge?.vessel, bridge?.segment].filter(Boolean).join(" ") ||
        `${bridgeCount} bridge${bridgeCount === 1 ? "" : "s"}`;
      const topBridge = bridges.find((bridge) => bridge.grade === highestGrade) ?? bridges[0];
      grade[`grade${highestGrade}` as BridgeDashboardCategory].push({
        reportId: report.id,
        matchedText: evidenceFor(topBridge),
        context: topBridge?.evidenceText,
      });
      const countKey: BridgePresentCountKey =
        bridgeCount === 1 ? "one" : bridgeCount === 2 ? "two" : "threePlus";
      count[countKey].push({
        reportId: report.id,
        matchedText: evidenceFor(bridges[0]),
        context: bridges[0]?.evidenceText,
      });
      matrix[countKey][`grade${highestGrade}` as BridgeGradeKey].push({
        reportId: report.id,
        matchedText: evidenceFor(topBridge),
        context: topBridge?.evidenceText,
      });
    });
    return { grade, count, matrix };
  }, [filteredReports]);
  const interarterialBinContributors = useMemo(
    () =>
      buildBinContributors(filteredReports, (report) =>
        cleanInterarterialCourseLengthMeasurements(report.parseResult.interarterialCourseLengths)
      ),
    [filteredReports]
  );
  const intramuralBinContributors = useMemo(
    () =>
      buildBinContributors(filteredReports, (report) =>
        cleanIntramuralCourseLengthMeasurements(report.parseResult.intramuralCourseLengths)
      ),
    [filteredReports]
  );

  const openProvenance = (source: ProvenanceSource) => {
    if (source.contributors.length === 0) return;
    setActiveProvenance(source);
  };
  const handleOpenReport = (contributor: ProvenanceContributor) => {
    const params = new URLSearchParams();
    params.set("reportId", contributor.reportId);
    params.set("returnTo", "/analysis");
    if (
      typeof contributor.startIndex === "number" &&
      typeof contributor.endIndex === "number" &&
      contributor.endIndex > contributor.startIndex
    ) {
      params.set("focusStart", String(contributor.startIndex));
      params.set("focusEnd", String(contributor.endIndex));
    }
    navigate(`/dataset?${params.toString()}`);
  };
  const openPaperFeatureRow = (row: PaperFeatureRow) => {
    const subtypeIds = Object.values(ANOMALOUS_LEFT_SUBTYPE_FEATURE_IDS) as string[];
    const isSubtype = subtypeIds.includes(row.id);
    const contributors = isSubtype
      ? subtypeContributors.get(row.id) ?? []
      : paperFeatureContributors.get(row.id) ?? [];
    openProvenance({
      title: row.canonical,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: !isSubtype,
      contributors,
    });
  };
  const openCategory = (label: string) => {
    const contributors = categoryContributors.get(label) ?? [];
    openProvenance({
      title: label,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: false,
      contributors,
    });
  };
  const openCoronaryRow = (key: string, name: string) => {
    const contributors = coronaryContributors.get(key) ?? [];
    openProvenance({ title: name, subtitle: reportCountSubtitle(distinctReportCount(contributors)), splitByAssertion: true, contributors });
  };
  const openFeatureRow = (key: string, name: string) => {
    const contributors = featureTableContributors.get(key) ?? [];
    openProvenance({ title: name, subtitle: reportCountSubtitle(distinctReportCount(contributors)), splitByAssertion: true, contributors });
  };
  const openBridgeGrade = (label: string) => {
    const key =
      label === "Not Present" ? "notPresent" : label === "Grade 1" ? "grade1" : label === "Grade 2" ? "grade2" : "grade3";
    const contributors = bridgeContributors.grade[key as BridgeDashboardCategory] ?? [];
    openProvenance({
      title: `Highest bridge grade — ${label}`,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: false,
      contributors,
    });
  };
  const openBridgeCount = (label: string) => {
    const key =
      label === "Not Present" ? "notPresent" : label === "1" ? "one" : label === "2" ? "two" : "threePlus";
    const contributors = bridgeContributors.count[key as BridgeCountCategory] ?? [];
    openProvenance({
      title: `Bridge count — ${label}`,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: false,
      contributors,
    });
  };
  const openBridgeCell = (
    countKey: BridgePresentCountKey,
    gradeKey: BridgeGradeKey,
    label: string
  ) => {
    const contributors = bridgeContributors.matrix[countKey][gradeKey] ?? [];
    openProvenance({
      title: `Bridge count × grade — ${label}`,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: false,
      contributors,
    });
  };
  const openRiskCell = (a: RiskFlagKey, b: RiskFlagKey, label: string) => {
    const order = RISK_FLAGS.map((flag) => flag.key);
    const key =
      a === b ? a : order.indexOf(a) < order.indexOf(b) ? `${a}|${b}` : `${b}|${a}`;
    const contributors = riskContributors.get(key) ?? [];
    openProvenance({
      title: `Origin & risk — ${label}`,
      subtitle: reportCountSubtitle(distinctReportCount(contributors)),
      splitByAssertion: false,
      contributors,
    });
  };
  const openLengthBin = (
    title: string,
    binContributors: Map<string, ProvenanceContributor[]>,
    label: string
  ) => {
    const contributors = binContributors.get(label) ?? [];
    openProvenance({
      title: `${title} — ${label}`,
      subtitle: occurrenceSubtitle(contributors),
      splitByAssertion: false,
      contributors,
    });
  };
  const handleFeatureSort = (key: FeatureSortKey) => {
    setFeatureSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };
  const handleLateralityChange = (value: string) => {
    if (value !== "overall" && value !== "right" && value !== "left") return;
    setLateralityFilter(value);
    if (value !== "left") setLeftSubtype("all");
  };
  const handleLeftSubtypeChange = (value: string) => {
    if (
      value !== "all" &&
      value !== "intraconal_left" &&
      value !== "intramural_interarterial_left"
    ) {
      return;
    }
    setLeftSubtype(value);
  };
  const summaryCards = [
    {
      title: "Number of Parsed Reports",
      value: reportCount,
      icon: FileText,
    },
    {
      title: "Number of Right (R-AAOCA) Reports",
      value: rightReportCount,
      icon: ArrowRight,
    },
    {
      title: "Number of Left (L-AAOCA) Reports",
      value: leftReportCount,
      icon: ArrowLeft,
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
            <Link to="/filtering">
              <Button variant="ghost" size="sm">
                Filtering Page
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
                href="#origin-risk"
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Origin and risk
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
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Laterality</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Filters every number and chart below by AAOCA form.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <ToggleGroup
                type="single"
                value={lateralityFilter}
                onValueChange={handleLateralityChange}
                variant="outline"
                size="sm"
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="overall">Overall</ToggleGroupItem>
                <ToggleGroupItem value="right">Right (R-AAOCA)</ToggleGroupItem>
                <ToggleGroupItem value="left">Left (L-AAOCA)</ToggleGroupItem>
              </ToggleGroup>
              {lateralityFilter === "left" && (
                <ToggleGroup
                  type="single"
                  value={leftSubtype}
                  onValueChange={handleLeftSubtypeChange}
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="all">All lefts</ToggleGroupItem>
                  <ToggleGroupItem value="intraconal_left">Intraconal</ToggleGroupItem>
                  <ToggleGroupItem value="intramural_interarterial_left">
                    Intramural / inter-arterial
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
          </div>

          <section id="summary-cards" className="scroll-mt-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Summary Cards</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cohort size and laterality breakdown across all parsed reports.
              </p>
              {loadError && (
                <p className="mt-3 text-sm text-destructive">{loadError}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
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

          <PaperFeatureCategoryChart
            data={paperFeatureCategoryChartData}
            featureRows={paperFeatureRows}
            loading={loading}
            onSelectRow={openPaperFeatureRow}
            onSelectCategory={openCategory}
          />

          <Card>
            <CardContent className="p-0 [&>div]:h-[32rem] [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background">
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
                    <TableRow
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => openPaperFeatureRow(row)}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell className="font-medium" title={row.description}>
                        {row.canonical}
                      </TableCell>
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

        <section id="origin-risk" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Origin and Risk (R-AAOCA)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              How the high-risk features cluster in the right-sided cohort, with the left cohort as a control.
              Slit-like ostium is foregrounded for the sponsor.
            </p>
          </div>

          <RiskCooccurrenceMatrix
            flags={RISK_FLAGS}
            counts={riskCounts}
            rightPrevalence={riskRightPrevalence}
            leftPrevalence={riskLeftPrevalence}
            leftTotal={riskLeftCounts.total}
            loading={loading}
            sponsorKey={SPONSOR_FLAG}
            onSelectCell={openRiskCell}
          />
        </section>

        <section id="coronary-narrowing" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Coronary Narrowing Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Narrowing-related findings resolved to the specific coronary artery or segment.
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base">Narrowing By Coronary Artery</CardTitle>
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={coronarySearch}
                  onChange={(event) => setCoronarySearch(event.target.value)}
                  placeholder="Search narrowing details"
                  className="pl-9"
                />
              </div>
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
                  {filteredCoronaryNarrowingRows.length > 0 ? (
                    paginatedCoronaryRows.map((row) => (
                      <TableRow
                        key={row.key}
                        className="cursor-pointer transition-colors hover:bg-accent/50"
                        onClick={() => openCoronaryRow(row.key, row.name)}
                      >
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
                        {coronarySearch
                          ? "No coronary narrowing details match your search."
                          : "No vessel-specific coronary narrowing features found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredCoronaryNarrowingRows.length > 0 && (
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
            stats={interarterialCourseLengthStats}
            statsUnit="mm"
            onSelectBin={(label) =>
              openLengthBin("Inter-arterial course length", interarterialBinContributors, label)
            }
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
            stats={intramuralCourseLengthStats}
            statsUnit="mm"
            onSelectBin={(label) =>
              openLengthBin("Intramural course length", intramuralBinContributors, label)
            }
          />
        </section>

        <section id="myocardial-bridges" className="mt-10 scroll-mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Myocardial Bridge Distribution
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Patient-level bridge count and highest grade distributions, and how the two relate.
            </p>
          </div>

          <div className="grid gap-4">
            <HorizontalBarChart
              title="Bridge Count"
              subtitle={`${bridgeDashboardStats.bridgePatients} patients with bridges; ${bridgeDashboardStats.multipleBridgePatients} with more than one`}
              data={bridgeCountChartData}
              loading={loading}
              stats={bridgeCountStats}
              onSelect={openBridgeCount}
            />
            <HorizontalBarChart
              title="Highest Bridge Grade"
              subtitle="If multiple bridges are present, only the highest grade is counted"
              data={bridgeGradeChartData}
              loading={loading}
              onSelect={openBridgeGrade}
            />
            <BridgeCountGradeMatrix
              matrix={bridgeContributors.matrix}
              bridgePatients={bridgeDashboardStats.bridgePatients}
              loading={loading}
              onSelectCell={openBridgeCell}
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
                      <TableRow
                        key={row.key}
                        className="cursor-pointer transition-colors hover:bg-accent/50"
                        onClick={() => openFeatureRow(row.key, row.name)}
                      >
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

      <ProvenancePanel
        source={activeProvenance}
        onClose={() => setActiveProvenance(null)}
        onOpenReport={(contributor) => {
          setActiveProvenance(null);
          handleOpenReport(contributor);
        }}
      />
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
  const [pageInput, setPageInput] = useState(String(page));

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  if (pageCount <= 1) return null;

  const jumpToPage = () => {
    const parsedPage = Number(pageInput);
    if (!Number.isFinite(parsedPage)) {
      setPageInput(String(page));
      return;
    }

    const nextPage = Math.min(pageCount, Math.max(1, Math.trunc(parsedPage)));
    setPageInput(String(nextPage));
    onPageChange(nextPage);
  };

  return (
    <Pagination className="flex-wrap gap-3 border-t border-border px-3 py-3">
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
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Go to page</span>
        <Input
          type="number"
          min={1}
          max={pageCount}
          step={1}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onBlur={jumpToPage}
          onKeyDown={(event) => {
            if (event.key === "Enter") jumpToPage();
          }}
          aria-label={`Go to page, valid range 1 to ${pageCount}`}
          className="h-8 w-16 px-2 text-center text-xs"
        />
        <span>of {pageCount}</span>
      </label>
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
  stats,
  statsUnit,
  onSelect,
}: {
  title: string;
  subtitle: string;
  data: HorizontalBarDatum[];
  loading: boolean;
  stats?: SummaryStats | null;
  statsUnit?: string;
  onSelect?: (label: string) => void;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <SummaryStatsDisplay stats={stats} unit={statsUnit} loading={loading} />
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {data.map((item) => {
            const width = loading ? 0 : Math.max(3, (item.value / maxValue) * 100);
            const disabled = !onSelect || item.value === 0;
            return (
              <button
                key={item.label}
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(item.label)}
                title={disabled ? undefined : "Show source reports"}
                className="grid w-full grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent/60 disabled:cursor-default"
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
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryStatsDisplay({
  stats,
  unit,
  loading,
}: {
  stats?: SummaryStats | null;
  unit?: string;
  loading: boolean;
}) {
  if (loading || !stats) return null;

  const formatValue = (value: number) => {
    const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground md:justify-end">
      <span className="rounded-md bg-muted px-2 py-1">
        Mean <span className="font-semibold tabular-nums text-foreground">{formatValue(stats.mean)}</span>
      </span>
      <span className="rounded-md bg-muted px-2 py-1">
        Median <span className="font-semibold tabular-nums text-foreground">{formatValue(stats.median)}</span>
      </span>
      <span className="rounded-md bg-muted px-2 py-1">
        SD <span className="font-semibold tabular-nums text-foreground">{formatValue(stats.standardDeviation)}</span>
      </span>
    </div>
  );
}

function BridgeCountGradeMatrix({
  matrix,
  bridgePatients,
  loading,
  onSelectCell,
}: {
  matrix: BridgeCellMatrix;
  bridgePatients: number;
  loading: boolean;
  onSelectCell?: (
    countKey: BridgePresentCountKey,
    gradeKey: BridgeGradeKey,
    label: string
  ) => void;
}) {
  const rows: { key: BridgePresentCountKey; label: string }[] = [
    { key: "one", label: "1 bridge" },
    { key: "two", label: "2 bridges" },
    { key: "threePlus", label: "3+ bridges" },
  ];
  const gradeKeys: BridgeGradeKey[] = ["grade1", "grade2", "grade3"];
  const gradeLabels: Record<BridgeGradeKey, string> = {
    grade1: "Grade 1",
    grade2: "Grade 2",
    grade3: "Grade 3",
  };

  const cellCount = (row: BridgePresentCountKey, grade: BridgeGradeKey) =>
    matrix[row][grade].length;
  const rowTotal = (row: BridgePresentCountKey) =>
    gradeKeys.reduce((sum, grade) => sum + cellCount(row, grade), 0);
  const colTotal = (grade: BridgeGradeKey) =>
    rows.reduce((sum, row) => sum + cellCount(row.key, grade), 0);
  const maxCell = Math.max(
    1,
    ...rows.flatMap((row) => gradeKeys.map((grade) => cellCount(row.key, grade)))
  );

  const gridCols = "grid grid-cols-[96px_repeat(3,minmax(0,1fr))_56px] gap-1.5";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bridge Count × Highest Grade</CardTitle>
        <p className="text-xs text-muted-foreground">
          How the two facets relate across the {bridgePatients} patients with a bridge. Shading
          scales with patient count; click a cell for source reports.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          <div className={gridCols}>
            <span />
            {gradeKeys.map((grade) => (
              <span
                key={grade}
                className="pb-1 text-center text-xs font-medium text-muted-foreground"
              >
                {gradeLabels[grade]}
              </span>
            ))}
            <span className="pb-1 text-right text-xs font-medium text-muted-foreground">Total</span>
          </div>

          {rows.map((row) => (
            <div key={row.key} className={`${gridCols} items-center`}>
              <span className="text-sm text-muted-foreground">{row.label}</span>
              {gradeKeys.map((grade) => {
                const value = cellCount(row.key, grade);
                const alpha = value === 0 ? 0 : Math.max(0.12, value / maxCell);
                const onPrimary = alpha >= 0.5;
                const disabled = loading || !onSelectCell || value === 0;
                return (
                  <button
                    key={grade}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onSelectCell?.(row.key, grade, `${row.label} · ${gradeLabels[grade]}`)
                    }
                    title={disabled ? undefined : "Show source reports"}
                    className={`flex h-12 items-center justify-center rounded-md text-sm font-medium tabular-nums transition enabled:hover:ring-2 enabled:hover:ring-ring/60 disabled:cursor-default ${
                      value === 0
                        ? "bg-muted/50 text-muted-foreground"
                        : onPrimary
                          ? "text-primary-foreground"
                          : "text-foreground"
                    }`}
                    style={
                      value === 0
                        ? undefined
                        : { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` }
                    }
                  >
                    {loading ? "…" : value}
                  </button>
                );
              })}
              <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                {loading ? "…" : rowTotal(row.key)}
              </span>
            </div>
          ))}

          <div className={`${gridCols} items-center pt-1`}>
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            {gradeKeys.map((grade) => (
              <span
                key={grade}
                className="text-center text-sm font-semibold tabular-nums text-foreground"
              >
                {loading ? "…" : colTotal(grade)}
              </span>
            ))}
            <span className="text-right text-sm font-semibold tabular-nums text-foreground">
              {loading ? "…" : bridgePatients}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PrevalenceBar({
  tone,
  pct,
  loading,
}: {
  tone: "right" | "left";
  pct: number;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 text-[10px] font-medium text-muted-foreground">
        {tone === "right" ? "R" : "L"}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={
            "h-full rounded-full " + (tone === "right" ? "bg-primary" : "bg-muted-foreground/50")
          }
          style={{ width: loading ? "0%" : `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
        {loading ? "…" : `${pct}%`}
      </span>
    </div>
  );
}

// Symmetric risk-feature co-occurrence on the right cohort, with the left cohort
// reduced to a control-prevalence column. Diagonal = reports with the feature,
// off-diagonal = reports with both; shading scales with the pair count. Mirrors
// BridgeCountGradeMatrix so the drill-down feels the same.
function RiskCooccurrenceMatrix({
  flags,
  counts,
  rightPrevalence,
  leftPrevalence,
  leftTotal,
  loading,
  sponsorKey,
  onSelectCell,
}: {
  flags: RiskFlag[];
  counts: CooccurrenceCounts;
  rightPrevalence: Record<RiskFlagKey, FlagPrevalence>;
  leftPrevalence: Record<RiskFlagKey, FlagPrevalence>;
  leftTotal: number;
  loading: boolean;
  sponsorKey: RiskFlagKey;
  onSelectCell: (a: RiskFlagKey, b: RiskFlagKey, label: string) => void;
}) {
  const value = (a: RiskFlagKey, b: RiskFlagKey) =>
    a === b ? counts.diagonal[a] : counts.pair[a][b];
  const maxPair = Math.max(
    1,
    ...flags.flatMap((row, i) =>
      flags.slice(i + 1).map((col) => counts.pair[row.key][col.key])
    )
  );
  const template = `minmax(132px,1.3fr) repeat(${flags.length}, minmax(42px,1fr)) minmax(150px,1.1fr)`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Risk-feature co-occurrence</CardTitle>
        <p className="text-xs text-muted-foreground">
          Right cohort (n = {counts.total}); left shown as a control (n = {leftTotal}). Diagonal = reports with the
          feature, off-diagonal = reports with both; click a cell for source reports. Fixed to the R-AAOCA cohort, so
          the laterality filter above does not change it.
        </p>
      </CardHeader>
      <CardContent>
        {counts.total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No R-AAOCA reports in the dataset yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-1.5">
              <div className="grid items-end gap-1.5" style={{ gridTemplateColumns: template }}>
                <span />
                {flags.map((col) => (
                  <span
                    key={col.key}
                    title={col.label}
                    className={
                      "pb-1 text-center text-[11px] " +
                      (col.key === sponsorKey
                        ? "rounded-t-md bg-[hsl(var(--highlight)/0.4)] font-semibold text-foreground"
                        : "font-medium text-muted-foreground")
                    }
                  >
                    {col.short}
                  </span>
                ))}
                <span className="pb-1 text-right text-[11px] font-medium text-muted-foreground">
                  Prevalence · R / L
                </span>
              </div>

              {flags.map((row, i) => {
                const isSponsorRow = row.key === sponsorKey;
                return (
                  <div
                    key={row.key}
                    className="grid items-center gap-1.5"
                    style={{ gridTemplateColumns: template }}
                  >
                    <span
                      title={row.label}
                      className={
                        "truncate pr-2 text-sm " +
                        (isSponsorRow ? "font-semibold text-foreground" : "font-medium text-muted-foreground")
                      }
                    >
                      {row.label}
                    </span>
                    {flags.map((col, j) => {
                      const v = value(row.key, col.key);
                      const isDiag = i === j;
                      const alpha = isDiag || v === 0 ? 0 : Math.max(0.12, v / maxPair);
                      const onPrimary = alpha >= 0.5;
                      const disabled = loading || v === 0;
                      return (
                        <button
                          key={col.key}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            onSelectCell(
                              row.key,
                              col.key,
                              isDiag ? row.label : `${row.label} × ${col.label}`
                            )
                          }
                          title={
                            disabled
                              ? undefined
                              : isDiag
                                ? `${row.label}: ${v} reports`
                                : "Show source reports"
                          }
                          className={
                            "flex h-11 items-center justify-center rounded-md text-sm font-medium tabular-nums transition enabled:hover:ring-2 enabled:hover:ring-ring/60 disabled:cursor-default " +
                            (isDiag
                              ? "bg-muted text-foreground"
                              : v === 0
                                ? "bg-muted/40 text-muted-foreground"
                                : onPrimary
                                  ? "text-primary-foreground"
                                  : "text-foreground")
                          }
                          style={
                            !isDiag && v > 0
                              ? { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` }
                              : undefined
                          }
                        >
                          {loading ? "…" : v === 0 ? "" : v}
                        </button>
                      );
                    })}
                    <div className="flex flex-col gap-1 pl-1">
                      <PrevalenceBar tone="right" pct={rightPrevalence[row.key].pct} loading={loading} />
                      <PrevalenceBar tone="left" pct={leftPrevalence[row.key].pct} loading={loading} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaperFeatureCategoryChart({
  data,
  featureRows,
  loading,
  onSelectRow,
  onSelectCategory,
}: {
  data: HorizontalBarDatum[];
  featureRows: PaperFeatureRow[];
  loading: boolean;
  onSelectRow?: (row: PaperFeatureRow) => void;
  onSelectCategory?: (label: string) => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  const toggleCategory = (label: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Paper Feature Categories</CardTitle>
        <p className="text-xs text-muted-foreground">
          Number of reports containing at least one tracked feature in each category.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const isExpanded = expandedCategories.has(item.label);
            const categoryFeatures = featureRows
              .filter((row) => row.category === item.label)
              .sort((a, b) => b.total - a.total || a.canonical.localeCompare(b.canonical));
            const width = loading ? 0 : (item.value / maxValue) * 100;

            return (
              <div key={item.label}>
                {(() => {
                  const drillDisabled = !onSelectCategory || item.value === 0;
                  const drillTitle = drillDisabled ? undefined : "Show source reports";
                  return (
                    <div className="grid w-full grid-cols-[minmax(150px,220px)_minmax(0,1fr)_48px] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => toggleCategory(item.label)}
                          aria-label={isExpanded ? "Collapse category" : "Expand category"}
                          className="shrink-0 rounded-sm transition-colors hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={drillDisabled}
                          onClick={() => onSelectCategory?.(item.label)}
                          title={drillTitle}
                          className="truncate text-left transition-colors enabled:hover:text-foreground disabled:cursor-default"
                        >
                          {item.label}
                        </button>
                      </span>
                      <button
                        type="button"
                        disabled={drillDisabled}
                        onClick={() => onSelectCategory?.(item.label)}
                        title={drillTitle}
                        className="h-7 overflow-hidden rounded-md bg-muted text-left disabled:cursor-default"
                      >
                        <div
                          className="h-full rounded-md bg-primary transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </button>
                      <button
                        type="button"
                        disabled={drillDisabled}
                        onClick={() => onSelectCategory?.(item.label)}
                        title={drillTitle}
                        className="text-right text-sm font-medium tabular-nums text-foreground transition-colors enabled:hover:text-primary disabled:cursor-default"
                      >
                        {loading ? "..." : item.value}
                      </button>
                    </div>
                  );
                })()}

                {isExpanded && !loading && (
                  <div className="mt-4 space-y-1.5">
                    {categoryFeatures.map((feat) => {
                      const featWidth = (feat.total / maxValue) * 100;
                      const disabled = !onSelectRow || feat.total === 0;
                      return (
                        <button
                          key={feat.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => onSelectRow?.(feat)}
                          title={disabled ? undefined : "Show source reports"}
                          className="grid w-full grid-cols-[minmax(150px,220px)_minmax(0,1fr)_48px] items-center gap-3 rounded-md py-0.5 text-left transition-colors enabled:hover:bg-accent/50 disabled:cursor-default"
                        >
                          <span
                            className="truncate pl-5 text-xs text-muted-foreground"
                            title={feat.description ?? feat.canonical}
                          >
                            {feat.canonical}
                          </span>
                          <div className="h-5 overflow-hidden rounded-md bg-muted/60">
                            <div
                              className="h-full rounded-md bg-primary/60 transition-all"
                              style={{ width: `${featWidth}%` }}
                            />
                          </div>
                          <span className="text-right text-xs tabular-nums text-muted-foreground">
                            {feat.total}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
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
  stats,
  statsUnit,
  onSelectBin,
}: {
  bins: CourseLengthHistogramBin[];
  measurementCount: number;
  loading: boolean;
  title: string;
  loadingLabel: string;
  emptyLabel: string;
  stats?: SummaryStats | null;
  statsUnit?: string;
  onSelectBin?: (label: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
          {loading
            ? "Loading measurements..."
            : `${measurementCount} explicit length measurement${measurementCount === 1 ? "" : "s"} across parsed reports${onSelectBin && bins.length > 0 ? " · click a bar for source reports" : ""}`}
          </p>
        </div>
        <SummaryStatsDisplay stats={stats} unit={statsUnit} loading={loading} />
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
              <BarChart
                data={bins}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                className={onSelectBin ? "cursor-pointer" : undefined}
                onClick={(state) => {
                  const label = (state as { activeLabel?: string } | null)?.activeLabel;
                  if (label) onSelectBin?.(label);
                }}
              >
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
