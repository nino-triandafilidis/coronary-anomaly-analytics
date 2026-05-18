import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Analysis() {
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

      <main className="container mx-auto px-4 py-8" />
    </div>
  );
}
