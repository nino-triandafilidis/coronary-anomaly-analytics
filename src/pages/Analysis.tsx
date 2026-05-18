import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, FileText, Highlighter, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getStoredParsedReports,
  getStoredParsedTerms,
  type StoredParsedReport,
} from "@/lib/parsedReportStorage";

const ADDED_TERMS_PLACEHOLDER = 0;

export default function Analysis() {
  const [reports, setReports] = useState<StoredParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const reportCount = reports.length;
  const reviewedReportCount = reports.filter((report) => report.reviewed).length;
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
          <Link to="/">
            <Button variant="ghost" size="sm">
              Back to Analyzer
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
      </main>
    </div>
  );
}
