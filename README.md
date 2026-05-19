# Coronary Anomaly Analytics

Clinical analytics tool for pediatric cardiologists at Stanford Children's Hospital.

User uploads a CT angiogram report, and the system uses LLM-powered named entity recognition to extract clinical findings (pertinent positives and pertinent negatives) and track how often each finding appears across the cardiologist's saved reports.

## How it works

1. **Upload** a CT angiogram report (paste text or upload PDF)
2. **Parse** with a single OpenAI GPT-5.4 function call — extracts clinical terms with exact text positions and asserted/negated status in one shot
3. **Review UI** — two-column layout: highlighted report on the left, term cards on the right. Cardiologist accepts, rejects, or manually adds terms
4. **Save** confirmed terms to the per-browser report database (localStorage). Aggregated counts across saved reports feed the frequency view; terms not yet seen show "No historical data".

### Parsing pipeline

```mermaid
flowchart TD
    A[CT Angiogram Report] --> B[Cost guard\nestimate vs $1 ceiling]
    B -->|under limit| C[OpenAI GPT-5.4\nsingle function call]
    B -->|over limit| H[CostLimitError]
    C --> D{Position resolution\nper finding}
    D -->|Exact match| E[Resolved term]
    D -->|Whitespace fix| E
    D -->|No match| F[Discarded\nlogged to console]
    E --> G[ParseResult\nasserted + negated]
    G --> R[Review UI]
    R --> S{Cardiologist}
    S -->|Accept / Add| DB[Saved report\nlocalStorage]
    S -->|Reject| X[Excluded]
```

The legacy 3-call Gemini pipeline (parser → resolver → verifier) and the rule-based dictionary detector were removed — they were either silently masking real LLM failures or duplicating work the single GPT call now does in one pass.

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- OpenAI GPT-5.4 — Responses API function calling for forced JSON output
- localStorage for the per-browser saved-report database

## Getting started

```bash
# Install dependencies
npm install

# Copy env template and add your OpenAI API key
cp .env.example .env
# Edit .env -> set VITE_OPENAI_API_KEY=your_key_here

# Start dev server
npm run dev
```

If the API key is missing or the call fails, the UI surfaces the error rather than falling back to canned data.

## Project structure

```
src/
  lib/
    openaiParser.ts         # Single GPT-5.4 function call -> ParseResult
    parsingOrchestrator.ts  # Cost guard + thin wrapper over the parser
    positionResolver.ts     # Exact + whitespace-tolerant span lookup
    reportDatabase.ts       # localStorage-backed saved reports
    fileParser.ts           # PDF / DOCX → text extraction
    prompts/
      ctaParser.prompt.ts
  components/
    TermReview.tsx          # Two-column review UI with highlights + term cards
    ReportViewer.tsx        # Read-only highlighted report (results stage)
    FrequencyPanel.tsx      # Pertinent positives / negatives frequency bars
  pages/
    Index.tsx               # Upload → parsing → review → results flow
    Dataset.tsx             # Saved-report browser
  data/
    mockParseResults.ts     # ParseResult / ParsedTerm / ReviewableTerm types
    anomalyDatabase.ts      # getHistoryForTerm: counts from saved reports + DetectedAnomaly type
    sampleReports.ts        # Sample CTA reports for demos (sourced from real_cta/*.pdf)
scripts/
  generate_sample_pdf.py    # Creates a test PDF from a report
real_cta/                   # Source PDFs for the demo samples
```

## Design principles

The UI follows CS147 HCI design principles documented in [design-guidelines.md](./design-guidelines.md):
- Gestalt principles for visual grouping of related findings
- Norman's conceptual model for the upload → review → confirm flow
- Nielsen's 10 usability heuristics throughout the interface

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_OPENAI_API_KEY` | Yes | OpenAI API key for the GPT-5.4 parser |
