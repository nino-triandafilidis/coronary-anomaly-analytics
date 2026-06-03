import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Database,
  Filter,
  ListChecks,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  BRIDGE_PROFILE_GRADE_BUCKETS,
  BRIDGE_PROFILE_LENGTH_BUCKETS,
  computeBridgeProfile,
  type BridgeProfileGradeKey,
  type BridgeProfileLengthKey,
} from "@/data/bridgeProfile";
import {
  FILTERING_FEATURES,
  buildReportFeatureSet,
  combinationKey,
  computeCombinationRows,
  reportHasEveryFeature,
  type CombinationRow,
  type FilteringEvidence,
  type FilteringFeature,
  type FilteringFeatureId,
  type ReportFeatureSet,
} from "@/data/filteringFeatures";
import {
  deriveReportLaterality,
  type LateralityFilter,
} from "@/data/laterality";
import {
  getStoredParsedReports,
  type StoredParsedReport,
} from "@/lib/parsedReportStorage";

type FilteringMode = "single" | "multi" | "bridge-profile";
type CohortScope = LateralityFilter;

const REPORTS_PER_PAGE = 10;
const NO_BRIDGE_FILTER = "none";
const BRIDGE_GRADE_PREFIX = "bridge:grade:";
const BRIDGE_LENGTH_PREFIX = "bridge:length:";

const MODE_COPY: Record<FilteringMode, string> = {
  single: "Filter reports that contain every selected feature.",
  multi: "Explore report groups across selected feature combinations.",
  "bridge-profile": "Profile myocardial bridge grade and length for the filtered report cohort.",
};

function reportTitle(report: StoredParsedReport): string {
  return report.parseResult.reportId || report.id;
}

function EvidenceContextSnippet({
  evidence,
}: {
  evidence: FilteringEvidence[] | undefined;
}) {
  const first = evidence?.[0];
  if (!first) return <>Asserted in report</>;

  const context = first.context || first.text;
  const keyword = first.text;
  const index = context.toLowerCase().indexOf(keyword.toLowerCase());

  if (!keyword || index < 0) return <>{context}</>;

  const contextRadius = 44;
  const beforeStart = Math.max(0, index - contextRadius);
  const afterEnd = Math.min(context.length, index + keyword.length + contextRadius);
  const prefix = beforeStart > 0 ? "..." : "";
  const suffix = afterEnd < context.length ? "..." : "";
  const before = context.slice(beforeStart, index).trimStart();
  const highlighted = context.slice(index, index + keyword.length);
  const after = context.slice(index + keyword.length, afterEnd).trimEnd();

  return (
    <>
      {prefix}
      {before}
      <mark className="rounded-sm bg-amber-200/80 px-0.5 text-foreground ring-1 ring-amber-300 dark:bg-amber-500/30 dark:ring-amber-400/40">
        {highlighted}
      </mark>
      {after}
      {suffix}
    </>
  );
}

function normalizedEvidence(evidence: FilteringEvidence[] | undefined): string {
  const first = evidence?.[0];
  if (!first) return "Asserted in report";
  return first.normalizedName || first.text;
}

function featureLabelMap(features: FilteringFeature[]): Map<FilteringFeatureId, FilteringFeature> {
  return new Map(features.map((feature) => [feature.id, feature]));
}

export default function Filtering() {
  const [reports, setReports] = useState<StoredParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cohortScope, setCohortScope] = useState<CohortScope>("overall");
  const [mode, setMode] = useState<FilteringMode>("single");
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<FilteringFeatureId[]>([]);
  const [selectedCombinationKey, setSelectedCombinationKey] = useState<string | null>(null);
  const [selectedBridgeCell, setSelectedBridgeCell] = useState<{
    gradeKey: BridgeProfileGradeKey;
    lengthKey: BridgeProfileLengthKey;
  } | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    featureSet: ReportFeatureSet;
    featureIds: FilteringFeatureId[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setLoadError(null);
      try {
        const nextReports = await getStoredParsedReports();
        if (!cancelled) setReports(nextReports);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load parsed reports.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  const featuresById = useMemo(() => featureLabelMap(FILTERING_FEATURES), []);
  const featureGroups = useMemo(() => {
    const groups = new Map<string, FilteringFeature[]>();
    FILTERING_FEATURES.forEach((feature) => {
      const list = groups.get(feature.category) ?? [];
      list.push(feature);
      groups.set(feature.category, list);
    });
    return [...groups.entries()];
  }, []);

  const featureSets = useMemo<ReportFeatureSet[]>(() => {
    return reports
      .map((report) => ({ report, side: deriveReportLaterality(report) }))
      .filter(({ side }) => {
        if (cohortScope === "overall") return true;
        return cohortScope === "right" ? side.right : side.left;
      })
      .map(({ report, side }) => buildReportFeatureSet(report, side));
  }, [cohortScope, reports]);

  const singleMatches = useMemo(
    () =>
      selectedFeatureIds.length === 0
        ? []
        : featureSets.filter((featureSet) =>
            reportHasEveryFeature(featureSet, selectedFeatureIds)
          ),
    [featureSets, selectedFeatureIds]
  );

  const combinationRows = useMemo(
    () => computeCombinationRows(featureSets, selectedFeatureIds),
    [featureSets, selectedFeatureIds]
  );

  const allSelectedKey = useMemo(
    () => combinationKey(selectedFeatureIds),
    [selectedFeatureIds]
  );

  useEffect(() => {
    if (mode !== "multi" || selectedFeatureIds.length === 0) {
      setSelectedCombinationKey(null);
      return;
    }

    const allSelectedRow = combinationRows.find((row) => row.key === allSelectedKey);
    const nextKey = allSelectedRow?.key ?? combinationRows[0]?.key ?? null;
    setSelectedCombinationKey((current) =>
      allSelectedRow
        ? allSelectedRow.key
        : current && combinationRows.some((row) => row.key === current)
          ? current
          : nextKey
    );
  }, [allSelectedKey, combinationRows, mode, selectedFeatureIds.length]);

  const selectedCombination = useMemo(
    () => combinationRows.find((row) => row.key === selectedCombinationKey) ?? null,
    [combinationRows, selectedCombinationKey]
  );
  const bridgeProfileCohort = useMemo(
    () =>
      selectedFeatureIds.length === 0
        ? featureSets
        : featureSets.filter((featureSet) =>
            reportHasEveryFeature(featureSet, selectedFeatureIds)
          ),
    [featureSets, selectedFeatureIds]
  );
  const bridgeProfile = useMemo(
    () => computeBridgeProfile(bridgeProfileCohort),
    [bridgeProfileCohort]
  );

  const toggleFeature = (featureId: FilteringFeatureId) => {
    setSelectedFeatureIds((current) =>
      current.includes(featureId)
        ? current.filter((id) => id !== featureId)
        : [...current, featureId]
    );
  };

  const selectExclusiveBridgeFeature = (
    prefix: typeof BRIDGE_GRADE_PREFIX | typeof BRIDGE_LENGTH_PREFIX,
    value: string
  ) => {
    setSelectedFeatureIds((current) => {
      const next = current.filter((id) => !id.startsWith(prefix));
      return value === NO_BRIDGE_FILTER ? next : [...next, value as FilteringFeatureId];
    });
  };

  const clearFeatures = () => setSelectedFeatureIds([]);

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
              <p className="text-[11px] text-muted-foreground">Filtering Page</p>
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

      <main className="container mx-auto px-4 py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Feature Filtering</h2>
            <p className="mt-1 text-sm text-muted-foreground">{MODE_COPY[mode]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ControlBlock label="Cohort">
              <ToggleGroup
                type="single"
                value={cohortScope}
                onValueChange={(value) => {
                  if (value) setCohortScope(value as CohortScope);
                }}
                variant="outline"
                size="sm"
                className="justify-start"
              >
                <ToggleGroupItem value="overall">Overall</ToggleGroupItem>
                <ToggleGroupItem value="right">Right (R-AAOCA)</ToggleGroupItem>
                <ToggleGroupItem value="left">Left (L-AAOCA)</ToggleGroupItem>
              </ToggleGroup>
            </ControlBlock>
            <ControlBlock label="Mode">
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => {
                  if (value) setMode(value as FilteringMode);
                }}
                variant="outline"
                size="sm"
                className="justify-start"
              >
                <ToggleGroupItem value="single">
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                  Filter: Single
                </ToggleGroupItem>
                <ToggleGroupItem value="multi">
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                  Filter: Multi
                </ToggleGroupItem>
                <ToggleGroupItem value="bridge-profile">
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                  Bridge Profile
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="mt-1 text-xs text-muted-foreground">
                Filter modes retrieve reports; Bridge Profile summarizes bridge grade x length.
              </p>
            </ControlBlock>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Features</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFeatures}
                  disabled={selectedFeatureIds.length === 0}
                >
                  Clear
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedFeatureIds.length} selected across {featureSets.length} reports.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {featureGroups.map(([category, features]) => (
                <div key={category}>
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    {category}
                  </p>
                  {category === "Myocardial Bridge" ? (
                    <BridgeDropdownFilters
                      features={features}
                      selectedFeatureIds={selectedFeatureIds}
                      onSelect={selectExclusiveBridgeFeature}
                    />
                  ) : (
                    <div className="space-y-2 rounded-md border border-border border-l-primary bg-muted/20 p-3">
                      {features.map((feature) => {
                        const checked = selectedFeatureIds.includes(feature.id);
                        return (
                          <label
                            key={feature.id}
                            className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm transition hover:bg-accent"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleFeature(feature.id)}
                              aria-label={feature.label}
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground">
                              {feature.label}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {feature.shortLabel}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-5">
            {selectedFeatureIds.length === 0 ? (
              <EmptyState
                icon={Filter}
                title="Select features to begin"
                body="Choose one or more feature filters from the left panel."
              />
            ) : mode === "single" ? (
              <SingleCombinationView
                matches={singleMatches}
                selectedFeatureIds={selectedFeatureIds}
                featuresById={featuresById}
                loading={loading}
                loadError={loadError}
                onPreview={(featureSet, featureIds) =>
                  setPreviewSelection({ featureSet, featureIds })
                }
              />
            ) : mode === "bridge-profile" ? (
              <BridgeProfileView
                profile={bridgeProfile}
                selectedCell={selectedBridgeCell}
                featuresById={featuresById}
                loading={loading}
                loadError={loadError}
                onSelectCell={setSelectedBridgeCell}
                onPreview={(featureSet, featureIds) =>
                  setPreviewSelection({ featureSet, featureIds })
                }
              />
            ) : (
              <MultiCombinationView
                rows={combinationRows}
                selectedFeatureIds={selectedFeatureIds}
                selectedRow={selectedCombination}
                selectedKey={selectedCombinationKey}
                allSelectedKey={allSelectedKey}
                featuresById={featuresById}
                loading={loading}
                loadError={loadError}
                onSelectRow={setSelectedCombinationKey}
                onPreview={(featureSet, featureIds) =>
                  setPreviewSelection({ featureSet, featureIds })
                }
              />
            )}
          </div>
        </div>

        <ReportPreviewDialog
          preview={previewSelection}
          featuresById={featuresById}
          onOpenChange={(open) => {
            if (!open) setPreviewSelection(null);
          }}
        />
      </main>
    </div>
  );
}

function BridgeDropdownFilters({
  features,
  selectedFeatureIds,
  onSelect,
}: {
  features: FilteringFeature[];
  selectedFeatureIds: FilteringFeatureId[];
  onSelect: (
    prefix: typeof BRIDGE_GRADE_PREFIX | typeof BRIDGE_LENGTH_PREFIX,
    value: string
  ) => void;
}) {
  const gradeFeatures = features.filter((feature) =>
    feature.id.startsWith(BRIDGE_GRADE_PREFIX)
  );
  const lengthFeatures = features.filter((feature) =>
    feature.id.startsWith(BRIDGE_LENGTH_PREFIX)
  );
  const selectedGrade =
    selectedFeatureIds.find((id) => id.startsWith(BRIDGE_GRADE_PREFIX)) ??
    NO_BRIDGE_FILTER;
  const selectedLength =
    selectedFeatureIds.find((id) => id.startsWith(BRIDGE_LENGTH_PREFIX)) ??
    NO_BRIDGE_FILTER;

  return (
    <div className="grid gap-3 rounded-md border border-border border-l-primary bg-muted/20 p-3">
      <BridgeSelect
        label="Bridge grade"
        value={selectedGrade}
        placeholder="No grade filter"
        features={gradeFeatures}
        onValueChange={(value) => onSelect(BRIDGE_GRADE_PREFIX, value)}
      />
      <BridgeSelect
        label="Bridge length"
        value={selectedLength}
        placeholder="No length filter"
        features={lengthFeatures}
        onValueChange={(value) => onSelect(BRIDGE_LENGTH_PREFIX, value)}
      />
    </div>
  );
}

function BridgeSelect({
  label,
  value,
  placeholder,
  features,
  onValueChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  features: FilteringFeature[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BRIDGE_FILTER}>{placeholder}</SelectItem>
          {features.map((feature) => (
            <SelectItem key={feature.id} value={feature.id}>
              {feature.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ControlBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function bridgeGradeFeatureId(key: BridgeProfileGradeKey): FilteringFeatureId {
  if (key === "grade1") return "bridge:grade:1";
  if (key === "grade2") return "bridge:grade:2";
  if (key === "grade3") return "bridge:grade:3";
  return "bridge:grade:unknown";
}

function bridgeLengthFeatureId(key: BridgeProfileLengthKey): FilteringFeatureId {
  if (key === "0-5") return "bridge:length:0-5";
  if (key === "5-10") return "bridge:length:5-10";
  if (key === "10-15") return "bridge:length:10-15";
  if (key === "15-20") return "bridge:length:15-20";
  if (key === "gt20") return "bridge:length:gt20";
  return "bridge:length:unknown";
}

function BridgeProfileView({
  profile,
  selectedCell,
  featuresById,
  loading,
  loadError,
  onSelectCell,
  onPreview,
}: {
  profile: ReturnType<typeof computeBridgeProfile<ReportFeatureSet>>;
  selectedCell: {
    gradeKey: BridgeProfileGradeKey;
    lengthKey: BridgeProfileLengthKey;
  } | null;
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  loading: boolean;
  loadError: string | null;
  onSelectCell: (cell: {
    gradeKey: BridgeProfileGradeKey;
    lengthKey: BridgeProfileLengthKey;
  }) => void;
  onPreview: (featureSet: ReportFeatureSet, featureIds: FilteringFeatureId[]) => void;
}) {
  if (loadError) {
    return <EmptyState icon={Database} title="Could not load reports" body={loadError} />;
  }

  if (loading) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Loading bridge profile"
        body="Bridge grade and length distribution is being prepared."
      />
    );
  }

  if (profile.summary.matchingReports === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No matching reports"
        body="No report matches the current cohort and selected filters."
      />
    );
  }

  const selectedReports = selectedCell
    ? profile.cells[selectedCell.gradeKey][selectedCell.lengthKey].reports
    : [];
  const selectedFeatureIds = selectedCell
    ? [bridgeGradeFeatureId(selectedCell.gradeKey), bridgeLengthFeatureId(selectedCell.lengthKey)]
    : [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cohort Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Matching reports" value={profile.summary.matchingReports} />
            <SummaryMetric label="Reports with bridge" value={profile.summary.reportsWithBridge} />
            <SummaryMetric
              label="Reports without bridge"
              value={profile.summary.reportsWithoutBridge}
            />
            <SummaryMetric
              label="Unknown bridge grade"
              value={profile.summary.unknownBridgeGrade}
            />
            <SummaryMetric
              label="Unknown bridge length"
              value={profile.summary.unknownBridgeLength}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Grade x Length Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <BridgeProfileMatrix
            profile={profile}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        </CardContent>
      </Card>

      {selectedCell && (
        <ReportList
          reports={selectedReports}
          selectedFeatureIds={selectedFeatureIds}
          featuresById={featuresById}
          emptyTitle="No reports in this bridge bucket"
          emptyBody="This grade and length cell has no matching reports."
          onPreview={onPreview}
        />
      )}
    </>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function BridgeProfileMatrix({
  profile,
  selectedCell,
  onSelectCell,
}: {
  profile: ReturnType<typeof computeBridgeProfile<ReportFeatureSet>>;
  selectedCell: {
    gradeKey: BridgeProfileGradeKey;
    lengthKey: BridgeProfileLengthKey;
  } | null;
  onSelectCell: (cell: {
    gradeKey: BridgeProfileGradeKey;
    lengthKey: BridgeProfileLengthKey;
  }) => void;
}) {
  const template = `minmax(130px,1fr) repeat(${BRIDGE_PROFILE_LENGTH_BUCKETS.length}, minmax(78px,1fr))`;
  const maxCount = Math.max(
    1,
    ...BRIDGE_PROFILE_GRADE_BUCKETS.flatMap((grade) =>
      BRIDGE_PROFILE_LENGTH_BUCKETS.map(
        (length) => profile.cells[grade.key][length.key].reports.length
      )
    )
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] space-y-2">
        <div className="grid items-end gap-2" style={{ gridTemplateColumns: template }}>
          <span />
          {BRIDGE_PROFILE_LENGTH_BUCKETS.map((length) => (
            <span
              key={length.key}
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
            >
              {length.label}
            </span>
          ))}
        </div>

        {BRIDGE_PROFILE_GRADE_BUCKETS.map((grade) => (
          <div
            key={grade.key}
            className="grid items-center gap-2"
            style={{ gridTemplateColumns: template }}
          >
            <span className="truncate pr-2 text-sm font-medium text-foreground">
              {grade.label}
            </span>
            {BRIDGE_PROFILE_LENGTH_BUCKETS.map((length) => {
              const count = profile.cells[grade.key][length.key].reports.length;
              const active =
                selectedCell?.gradeKey === grade.key &&
                selectedCell?.lengthKey === length.key;
              const alpha = count === 0 ? 0 : Math.max(0.12, count / maxCount);
              const onPrimary = alpha >= 0.5;
              return (
                <button
                  key={length.key}
                  type="button"
                  onClick={() => onSelectCell({ gradeKey: grade.key, lengthKey: length.key })}
                  className={
                    "flex h-12 items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition hover:ring-2 hover:ring-ring/60 " +
                    (active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border") +
                    (count === 0
                      ? " bg-muted/40 text-muted-foreground"
                      : onPrimary
                        ? " text-primary-foreground"
                        : " text-foreground")
                  }
                  style={
                    count > 0
                      ? { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` }
                      : undefined
                  }
                >
                  {count}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleCombinationView({
  matches,
  selectedFeatureIds,
  featuresById,
  loading,
  loadError,
  onPreview,
}: {
  matches: ReportFeatureSet[];
  selectedFeatureIds: FilteringFeatureId[];
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  loading: boolean;
  loadError: string | null;
  onPreview: (featureSet: ReportFeatureSet, featureIds: FilteringFeatureId[]) => void;
}) {
  if (loadError) {
    return <EmptyState icon={Database} title="Could not load reports" body={loadError} />;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Matching Reports</CardTitle>
          <p className="text-xs text-muted-foreground">
            Reports must contain every selected feature.
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums text-foreground">
            {loading ? "..." : matches.length}
          </div>
        </CardContent>
      </Card>

      <ReportList
        reports={matches}
        selectedFeatureIds={selectedFeatureIds}
        featuresById={featuresById}
        emptyTitle="No matching reports"
        emptyBody="No report in this cohort contains every selected feature."
        onPreview={onPreview}
      />
    </>
  );
}

function MultiCombinationView({
  rows,
  selectedFeatureIds,
  selectedRow,
  selectedKey,
  allSelectedKey,
  featuresById,
  loading,
  loadError,
  onSelectRow,
  onPreview,
}: {
  rows: CombinationRow[];
  selectedFeatureIds: FilteringFeatureId[];
  selectedRow: CombinationRow | null;
  selectedKey: string | null;
  allSelectedKey: string;
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  loading: boolean;
  loadError: string | null;
  onSelectRow: (key: string) => void;
  onPreview: (featureSet: ReportFeatureSet, featureIds: FilteringFeatureId[]) => void;
}) {
  if (loadError) {
    return <EmptyState icon={Database} title="Could not load reports" body={loadError} />;
  }

  return (
    <>
      {selectedFeatureIds.length < 2 && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Multi Combination works with one feature, but selecting two or more makes the combination structure more useful.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Feature Combinations</CardTitle>
          <p className="text-xs text-muted-foreground">
            Selected features define the combination space. Click a combination to view matching reports.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading combinations...
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No combinations"
              body="No reports are available for the selected cohort."
              compact
            />
          ) : (
            <UpSetRows
              rows={rows}
              selectedFeatureIds={selectedFeatureIds}
              selectedKey={selectedKey}
              allSelectedKey={allSelectedKey}
              featuresById={featuresById}
              onSelectRow={onSelectRow}
            />
          )}
        </CardContent>
      </Card>

      <ReportList
        reports={selectedRow?.reports ?? []}
        selectedFeatureIds={selectedRow?.featureIds ?? []}
        featuresById={featuresById}
        emptyTitle="No reports selected"
        emptyBody="Click a combination row to inspect matching reports."
        onPreview={onPreview}
      />
    </>
  );
}

function UpSetRows({
  rows,
  selectedFeatureIds,
  selectedKey,
  allSelectedKey,
  featuresById,
  onSelectRow,
}: {
  rows: CombinationRow[];
  selectedFeatureIds: FilteringFeatureId[];
  selectedKey: string | null;
  allSelectedKey: string;
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  onSelectRow: (key: string) => void;
}) {
  const maxCount = Math.max(1, ...rows.map((row) => row.reports.length));
  const template = `minmax(190px,1fr) repeat(${selectedFeatureIds.length}, minmax(42px,52px)) minmax(120px,0.8fr)`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] space-y-2">
        <div className="grid items-end gap-2" style={{ gridTemplateColumns: template }}>
          <span className="text-xs font-medium text-muted-foreground">Combination</span>
          {selectedFeatureIds.map((id) => (
            <span
              key={id}
              title={featuresById.get(id)?.label}
              className="pb-1 text-center text-[11px] font-medium text-muted-foreground"
            >
              {featuresById.get(id)?.shortLabel ?? id}
            </span>
          ))}
          <span className="pb-1 text-right text-xs font-medium text-muted-foreground">
            Reports
          </span>
        </div>

        {rows.map((row) => {
          const present = new Set(row.featureIds);
          const active = row.key === selectedKey;
          const isAllSelected = row.key === allSelectedKey;
          const width = `${Math.max(8, (row.reports.length / maxCount) * 100)}%`;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelectRow(row.key)}
              className={
                "grid w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition hover:bg-accent " +
                (active ? "border-primary bg-primary/5" : "border-border bg-card")
              }
              style={{ gridTemplateColumns: template }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.featureIds.length === 0
                    ? "None of selected features"
                    : row.featureIds.map((id) => featuresById.get(id)?.label ?? id).join(" + ")}
                </span>
                {isAllSelected && (
                  <span className="mt-1 block text-xs text-primary">All selected features</span>
                )}
              </span>
              {selectedFeatureIds.map((id) => (
                <span key={id} className="relative flex h-8 items-center justify-center">
                  <span
                    className={
                      "h-3 w-3 rounded-full border " +
                      (present.has(id)
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30 bg-background")
                    }
                  />
                </span>
              ))}
              <span className="flex items-center justify-end gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width }} />
                </span>
                <span className="w-8 text-right text-sm font-semibold tabular-nums text-foreground">
                  {row.reports.length}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportList({
  reports,
  selectedFeatureIds,
  featuresById,
  emptyTitle,
  emptyBody,
  onPreview,
}: {
  reports: ReportFeatureSet[];
  selectedFeatureIds: FilteringFeatureId[];
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  emptyTitle: string;
  emptyBody: string;
  onPreview: (featureSet: ReportFeatureSet, featureIds: FilteringFeatureId[]) => void;
}) {
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const allExpanded = reports.length > 0 && reports.every((item) => expandedReportIds.has(item.report.id));
  const pageCount = Math.max(1, Math.ceil(reports.length / REPORTS_PER_PAGE));
  const page = Math.min(currentPage, pageCount);
  const visibleReports = reports.slice(
    (page - 1) * REPORTS_PER_PAGE,
    page * REPORTS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [reports]);

  const toggleReport = (reportId: string) => {
    setExpandedReportIds((current) => {
      const next = new Set(current);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  const toggleAllReports = () => {
    setExpandedReportIds((current) => {
      if (reports.length > 0 && reports.every((item) => current.has(item.report.id))) {
        return new Set();
      }
      return new Set(reports.map((item) => item.report.id));
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Report List</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {reports.length} report{reports.length === 1 ? "" : "s"} in the current selection.
            </p>
          </div>
          {reports.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={toggleAllReports}>
              {allExpanded ? "Collapse all reports" : "Expand all reports"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <EmptyState icon={Database} title={emptyTitle} body={emptyBody} compact />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {visibleReports.map((featureSet) => {
              const matchedIds = selectedFeatureIds.filter((id) => featureSet.present.has(id));
              const expanded = expandedReportIds.has(featureSet.report.id);
              return (
                <div
                  key={featureSet.report.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {reportTitle(featureSet.report)}
                    </p>
                    {expanded ? (
                      <div className="mt-2 grid gap-1.5">
                        {matchedIds.map((id) => (
                          <div
                            key={id}
                            className="rounded-md border border-border bg-muted/20 px-2.5 py-2"
                          >
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {featuresById.get(id)?.label ?? id}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {featuresById.get(id)?.shortLabel ?? id}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-medium text-muted-foreground">
                              {normalizedEvidence(featureSet.evidence.get(id))}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              <EvidenceContextSnippet evidence={featureSet.evidence.get(id)} />
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {matchedIds.map((id) => (
                          <Badge key={id} variant="secondary" className="font-medium">
                            {featuresById.get(id)?.label ?? id}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleReport(featureSet.report.id)}
                    >
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {expanded ? "Hide context" : "Show context"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onPreview(featureSet, matchedIds)}
                    >
                      Preview
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {reports.length > REPORTS_PER_PAGE && (
          <ReportPagination
            page={page}
            pageCount={pageCount}
            onPageChange={setCurrentPage}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ReportPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (item) =>
      item === 1 ||
      item === pageCount ||
      (item >= page - 1 && item <= page + 1)
  );

  return (
    <Pagination className="mt-4">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onPageChange(Math.max(1, page - 1));
            }}
          />
        </PaginationItem>
        {pages.map((item, index) => (
          <Fragment key={item}>
            {index > 0 && item - pages[index - 1] > 1 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}
            <PaginationItem>
              <PaginationLink
                href="#"
                isActive={item === page}
                onClick={(event) => {
                  event.preventDefault();
                  onPageChange(item);
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          </Fragment>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page === pageCount}
            className={page === pageCount ? "pointer-events-none opacity-50" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onPageChange(Math.min(pageCount, page + 1));
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function ReportPreviewDialog({
  preview,
  featuresById,
  onOpenChange,
}: {
  preview: { featureSet: ReportFeatureSet; featureIds: FilteringFeatureId[] } | null;
  featuresById: Map<FilteringFeatureId, FilteringFeature>;
  onOpenChange: (open: boolean) => void;
}) {
  const featureSet = preview?.featureSet ?? null;
  const report = featureSet?.report ?? null;
  const text = report?.parseResult.reportText || report?.text || "";
  const markerRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const searchRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const evidenceEntries = useMemo(
    () =>
      preview
        ? preview.featureIds.flatMap((featureId) =>
            (preview.featureSet.evidence.get(featureId) ?? []).map((evidence, index) => ({
              id: `${featureId}-${index}`,
              featureId,
              evidence,
            }))
          )
        : [],
    [preview]
  );
  const searchMatches = useMemo(() => findSearchMatches(text, searchTerm), [text, searchTerm]);

  useEffect(() => {
    setSearchTerm("");
    setActiveSearchIndex(-1);
  }, [report?.id]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      setActiveSearchIndex(-1);
      return;
    }
    if (activeSearchIndex >= searchMatches.length) {
      setActiveSearchIndex(0);
    }
  }, [activeSearchIndex, searchMatches.length]);

  const scrollToFeature = (featureId: FilteringFeatureId) => {
    const entry = evidenceEntries.find((item) => item.featureId === featureId);
    if (!entry) return;
    markerRefs.current[entry.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };
  const jumpToNextSearchMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIndex =
      activeSearchIndex < 0 ? 0 : (activeSearchIndex + 1) % searchMatches.length;
    setActiveSearchIndex(nextIndex);
    window.requestAnimationFrame(() => {
      searchRefs.current[String(nextIndex)]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  return (
    <Dialog open={!!preview} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 pr-8">
            <div>
              <DialogTitle className="leading-snug">
                {report ? reportTitle(report) : "Report preview"}
              </DialogTitle>
              {report && (
                <p className="mt-1 text-xs text-muted-foreground">{report.id}</p>
              )}
            </div>
            {preview && (
              <div className="flex flex-wrap gap-1.5">
                {preview.featureIds.length === 0 ? (
                  <Badge variant="outline">No selected features present</Badge>
                ) : (
                  preview.featureIds.map((id) => (
                    <Badge key={id} variant="secondary" className="font-medium">
                      {featuresById.get(id)?.label ?? id}
                    </Badge>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {preview && report && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Matched Evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {preview.featureIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This combination captures reports without any selected feature present.
                  </p>
                ) : (
                  preview.featureIds.map((id) => {
                    const evidence = featureSet?.evidence.get(id) ?? [];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => scrollToFeature(id)}
                        className="w-full rounded-md border border-border p-3 text-left transition hover:border-primary hover:bg-accent"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {featuresById.get(id)?.label ?? id}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {normalizedEvidence(evidence)}
                        </p>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle className="text-base">Report Text</CardTitle>
                  <div className="flex min-w-0 items-center gap-2 md:w-[360px]">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") jumpToNextSearchMatch();
                        }}
                        placeholder="Search report"
                        className="h-9 pl-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={jumpToNextSearchMatch}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <HighlightedReportText
                  text={text}
                  entries={evidenceEntries}
                  markerRefs={markerRefs}
                  searchMatches={searchMatches}
                  activeSearchIndex={activeSearchIndex}
                  searchRefs={searchRefs}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function findSearchMatches(text: string, query: string): { start: number; end: number }[] {
  const needle = query.trim();
  if (!needle) return [];
  const matches: { start: number; end: number }[] = [];
  const haystack = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let start = 0;

  while (start < haystack.length) {
    const index = haystack.indexOf(lowerNeedle, start);
    if (index < 0) break;
    matches.push({ start: index, end: index + lowerNeedle.length });
    start = index + lowerNeedle.length;
  }

  return matches;
}

function HighlightedReportText({
  text,
  entries,
  markerRefs,
  searchMatches,
  activeSearchIndex,
  searchRefs,
}: {
  text: string;
  entries: {
    id: string;
    featureId: FilteringFeatureId;
    evidence: FilteringEvidence;
  }[];
  markerRefs: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
  searchMatches: { start: number; end: number }[];
  activeSearchIndex: number;
  searchRefs: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
}) {
  if (!text) {
    return (
      <div className="max-h-[64vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-4 font-mono text-sm leading-7 text-foreground">
        No report text available.
      </div>
    );
  }

  const evidenceRanges = entries
    .map((entry) => {
      let start = entry.evidence.startIndex;
      let end = entry.evidence.endIndex;
      const hasValidOffsets =
        start !== undefined &&
        end !== undefined &&
        start >= 0 &&
        end > start &&
        end <= text.length;

      if (!hasValidOffsets) {
        const index = text.toLowerCase().indexOf(entry.evidence.text.toLowerCase());
        if (index < 0) return null;
        start = index;
        end = index + entry.evidence.text.length;
      }

      return { ...entry, start: start as number, end: end as number };
    })
    .filter((range): range is (typeof entries)[number] & { start: number; end: number } => !!range)
    .sort((a, b) => a.start - b.start);

  const nonOverlapping = evidenceRanges.reduce<typeof evidenceRanges>((acc, range) => {
    const previous = acc[acc.length - 1];
    if (previous && range.start < previous.end) return acc;
    acc.push(range);
    return acc;
  }, []);

  const highlightRanges = [
    ...nonOverlapping.map((entry) => ({
      id: entry.id,
      start: entry.start,
      end: entry.end,
      type: "evidence" as const,
    })),
    ...searchMatches.map((match, index) => ({
      id: String(index),
      start: match.start,
      end: match.end,
      type: "search" as const,
      active: index === activeSearchIndex,
    })),
  ]
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || (a.type === "search" ? -1 : 1));

  const mergedRanges = highlightRanges.reduce<typeof highlightRanges>((acc, range) => {
    const previous = acc[acc.length - 1];
    if (previous && range.start < previous.end) return acc;
    acc.push(range);
    return acc;
  }, []);

  const segments: {
    text: string;
    range?: (typeof mergedRanges)[number];
  }[] = [];
  let cursor = 0;

  for (const range of mergedRanges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start) });
    }
    segments.push({ text: text.slice(range.start, range.end), range });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return (
    <div className="max-h-[64vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-4 font-mono text-sm leading-7 text-foreground">
      {segments.map((segment, index) =>
        segment.range ? (
          <mark
            key={`${segment.range.type}-${segment.range.id}-${index}`}
            ref={(node) => {
              if (segment.range!.type === "evidence") {
                markerRefs.current[segment.range!.id] = node;
              } else {
                searchRefs.current[segment.range!.id] = node;
              }
            }}
            className={
              segment.range.type === "search"
                ? segment.range.active
                  ? "rounded-sm bg-primary px-0.5 text-primary-foreground ring-2 ring-primary/40"
                  : "rounded-sm bg-sky-200/80 px-0.5 text-foreground ring-1 ring-sky-300 dark:bg-sky-500/30 dark:ring-sky-400/40"
                : "rounded-sm bg-amber-200/80 px-0.5 text-foreground ring-1 ring-amber-300 dark:bg-amber-500/30 dark:ring-amber-400/40"
            }
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  compact = false,
}: {
  icon: typeof Filter;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center " +
        (compact ? "px-4 py-8" : "px-6 py-20")
      }
    >
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
