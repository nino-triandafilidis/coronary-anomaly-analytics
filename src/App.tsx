import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { setAnomalyDatabase, type AnomalyEntry } from "@/data/anomalyDatabase";
import Index from "./pages/Index";
import Dataset from "./pages/Dataset";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function useAnomalyFrequencies() {
  useEffect(() => {
    fetch("/anomaly_frequencies.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((data: { totalReports?: number; entries?: AnomalyEntry[] }) => {
        if (data?.entries?.length) {
          setAnomalyDatabase(data.entries);
        }
      })
      .catch(() => {
        /* use mock database */
      });
  }, []);
}

const App = () => {
  useAnomalyFrequencies();
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dataset" element={<Dataset />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
