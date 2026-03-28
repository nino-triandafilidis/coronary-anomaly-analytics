# CT Angiogram Analyzer v2 -- Plan

## 1. Vision

Replace the rule-based dictionary matching in the CT Angiogram Analyzer with LLM-powered report parsing (Gemini primary, Claude/OpenAI fallback). Users upload a CT angiogram report, an LLM extracts anomaly terms, the user reviews and curates those terms in a new interactive review UI, then confirms to persist. The existing post-upload experience (highlighted report + frequency panel) stays intact. The database resets from 300 MIMIC reports to 10 hand-picked reports re-parsed through the new LLM pipeline. UI development happens independently in Loveable using mock data so both tracks can progress in parallel.

---

## 2. Architecture

### Backend -- LLM Parsing Service

```
src/lib/llmParser.ts          -- Gemini API client (prompt, parse response)
src/lib/llmVerifier.ts         -- Second LLM call to judge/verify parse output
src/lib/parsingOrchestrator.ts -- Coordinates parser + verifier, retries, cost guard
src/lib/anomalyDetection.ts    -- KEEP as fallback; new code path calls orchestrator
```

- **Parser LLM** sends the report text + a structured prompt, returns JSON array of anomaly terms with positions.
- **Verifier LLM** (can be a different model/provider) receives the report + parser output and returns accept/reject per term + reasoning.
- API keys stored in `.env` (gitignored), loaded via `import.meta.env.VITE_*`.

### Frontend -- UI Changes

```
Index.tsx  -- gains a new intermediate state: "review" between input and results
src/components/TermReviewPanel.tsx   -- NEW: accept/reject/add terms before confirm
src/components/ReportViewer.tsx      -- extended with per-term accept/reject controls
src/components/ReportInput.tsx       -- unchanged (upload/paste stays the same)
src/components/FrequencyPanel.tsx    -- unchanged (post-confirm stays the same)
```

### Data Flow

```
                         CURRENT (v1)
                         ============
 Upload/Paste --> detectAnomalies() --> Results View
                  (dictionary match)    (highlight + frequency)

                         NEW (v2)
                         ========
 Upload/Paste --> LLM Parser --> Verifier --> Term Review UI --> Confirm --> Results View
                  (Gemini)      (Claude?)    (accept/reject/     (save)    (highlight +
                                              add terms)                    frequency)
```

**State machine in Index.tsx:**
```
"input" --> "parsing" --> "review" --> "results"
   ^                        |
   +--- "New Report" -------+
```

---

## 3. Workstreams

### WS1: LLM Parsing Backend

**Goal:** Replace `detectAnomalies()` in `src/lib/anomalyDetection.ts` with LLM-based extraction.

- [ ] **1.1** Design the parser prompt -- structured output schema (JSON array of `{ term, category, startIndex, endIndex, confidence }`). Test with 2-3 sample reports in Gemini playground first (free, no code needed).
- [ ] **1.2** Create `src/lib/llmParser.ts` -- Gemini API client. Accept report text, return parsed terms. Use `@google/generative-ai` SDK. Enforce JSON-mode output.
- [ ] **1.3** Create `src/lib/llmVerifier.ts` -- second LLM call (Claude or OpenAI) that takes report + parser output and returns per-term `{ term, verdict: "accept"|"reject", reason }`.
- [ ] **1.4** Create `src/lib/parsingOrchestrator.ts` -- coordinates parser + verifier. Contains retry logic, timeout, and cost guard ($1 threshold check before execution).
- [ ] **1.5** Wire orchestrator into `Index.tsx` as the new code path. Keep `detectAnomalies()` as an offline fallback if API is unavailable.
- [ ] **1.6** Benchmark configurations: test at least 3 parser+verifier combos across the 10 seed reports, log cost per report, accuracy. Configurations to try:
  - Gemini parser + Claude verifier
  - Gemini parser + OpenAI verifier
  - Gemini parser + Gemini verifier (cheapest, but less diversity)
- [ ] **1.7** Add `.env.example` with required keys: `VITE_GEMINI_API_KEY`, `VITE_OPENAI_API_KEY`, `VITE_ANTHROPIC_API_KEY`.

### WS2: UI Redesign -- Term Review Flow

**Goal:** After LLM parsing, show an interactive review screen before saving.

- [ ] **2.1** Add `"review"` state to `Index.tsx` state machine (between parse and results).
- [ ] **2.2** Build `TermReviewPanel.tsx`:
  - List all LLM-detected terms with checkboxes (pre-checked = verifier accepted).
  - Each term shows: term text, category, confidence score, verifier verdict.
  - Buttons per term: Accept / Reject.
  - "Accept All" button at top.
  - "Add Term" input at bottom: user types a term, selects a span in the report to add manually.
  - "Confirm & Save" button finalizes the curated list.
- [ ] **2.3** Extend `ReportViewer.tsx` for review mode: highlighted terms are clickable to toggle accept/reject. Color-code: green = accepted, red = rejected, yellow = pending.
- [ ] **2.4** On "Confirm & Save": persist accepted terms to `anomalyDatabase`, transition to results view (existing flow).
- [ ] **2.5** Wire the review panel into the `Index.tsx` grid layout (report left, review panel right, same as current results layout).

### WS3: Mock Data & Loveable Prompt

**Goal:** Enable independent UI development in Loveable without a live LLM backend.

- [ ] **3.1** Create `src/mocks/mockParserResponse.ts` -- hardcoded LLM parser output for 2-3 sample reports. Same schema as real parser output.
- [ ] **3.2** Create `src/mocks/mockVerifierResponse.ts` -- hardcoded verifier verdicts matching the parser output.
- [ ] **3.3** Add a `VITE_USE_MOCK=true` env flag. When set, `parsingOrchestrator.ts` returns mock data instead of calling APIs.
- [ ] **3.4** Write the Loveable prompt (see Section 6 below).
- [ ] **3.5** Export mock data as standalone JSON files that Loveable can import without the rest of the codebase.

### WS4: Database Reset & New Reports

**Goal:** Replace the 300-report MIMIC dataset with 10 fresh reports parsed via LLM.

- [ ] **4.1** Select 10 CT angiogram reports from MIMIC-IV (diverse pathology mix: PE, stenosis, aneurysm, dissection, effusions, calcification, normal variants).
- [ ] **4.2** Run each through the LLM parser + verifier pipeline, manually review.
- [ ] **4.3** Replace `public/mimic_reports_300.json` with `public/seed_reports_10.json`.
- [ ] **4.4** Replace `public/anomaly_frequencies.json` with frequencies computed from the 10 LLM-parsed reports.
- [ ] **4.5** Update `TOTAL_REPORTS` constant in `anomalyDatabase.ts` from 300 to 10.
- [ ] **4.6** Update the header link text in `Index.tsx` ("300 reports in database" --> dynamic count).
- [ ] **4.7** Remove or archive `scripts/mimic_pipeline.py` (the scispaCy NER pipeline is no longer the primary path).

### WS5: Cost Controls

**Goal:** No surprise bills. Anything above $1 requires explicit permission.

- [ ] **5.1** Add a cost estimator in `parsingOrchestrator.ts`: estimate tokens (input + output) before each call, compute cost from known pricing, block if cumulative session cost exceeds $1.
- [ ] **5.2** Show a cost warning modal in the UI before the first LLM call: "This parse will cost approximately $X.XX. Proceed?"
- [ ] **5.3** Log cumulative cost per session in browser `localStorage` for transparency.
- [ ] **5.4** For the 10-report benchmark (WS1.6), pre-estimate total cost and confirm before running.

---

## 4. Dependencies

```
WS1 (LLM Backend)  -----> WS2 (UI Review Flow)    Shared interface: ParsedTerm schema
         |                        |
         v                        v
WS4 (DB Reset)             WS3 (Mocks & Loveable)
         |                        |
         v                        v
WS5 (Cost Controls)        Independent UI in Loveable
```

- **WS3 can start immediately** -- mock data only needs the agreed-upon ParsedTerm schema, not a working backend.
- **WS1 and WS2** share the `ParsedTerm` interface. Define this first (1 hour task), then both can proceed in parallel.
- **WS4 depends on WS1** being functional (need the parser to re-parse the 10 reports).
- **WS5 runs alongside WS1** -- cost guard logic lives inside the orchestrator.

**Suggested execution order:**
1. Define `ParsedTerm` interface + mock data (unblocks WS2 and WS3)
2. WS1 (LLM backend) + WS3 (Loveable prompt) in parallel
3. WS2 (review UI) -- can use mocks while WS1 is in progress
4. WS4 (database reset) once WS1 parser is stable
5. WS5 (cost controls) woven into WS1 as it develops

---

## 5. Open Questions

| # | Question | Impact | Default if unresolved |
|---|----------|--------|-----------------------|
| 1 | Which Gemini model? (gemini-1.5-flash vs gemini-1.5-pro vs gemini-2.0-flash) | Cost + accuracy tradeoff. Flash is ~10x cheaper. | Start with gemini-2.0-flash, upgrade if accuracy is poor. |
| 2 | Should the verifier be a different provider or just a different prompt to the same model? | Diversity vs cost. Cross-provider catches more blind spots. | Use Claude as verifier (different provider = better coverage). |
| 3 | Where do confirmed anomaly terms persist? Currently in-memory + static JSON. | Need persistence for a growing database. | Keep JSON files in `public/` for now. Add a backend (Supabase, SQLite) later. |
| 4 | Should the 10 seed reports come from MIMIC-IV or be new synthetic/sourced reports? | MIMIC = real but restricted. Synthetic = shareable. | Use MIMIC-IV subset (already have access). |
| 5 | Does the Loveable UI need to call a real API endpoint, or is client-side mock sufficient? | Determines if we need a proxy server. | Client-side mock is sufficient for now. |
| 6 | How should the parser handle negated findings ("no evidence of PE")? | Major accuracy factor. | Include negation detection in the prompt; tag terms as `negated: true/false`. |
| 7 | Should the cost modal be per-report or per-session? | UX friction vs safety. | Per-session with cumulative tracking. Show once at start, warn again if approaching $1. |

---

## 6. Loveable Prompt

The following prompt is designed to be pasted directly into Loveable to update the UI independently of the backend work.

---

```
PROJECT CONTEXT:
I have a CT Angiogram Analyzer built with React + TypeScript + Tailwind + shadcn/ui.
Currently, users upload a radiology report and see detected anomaly terms highlighted
in the report text with a frequency sidebar. I need to add a new intermediate "review"
step between upload and final results.

CURRENT FLOW:
  Upload/Paste Report --> Highlighted Results + Frequency Panel

NEW FLOW:
  Upload/Paste Report --> [NEW] Term Review Screen --> Highlighted Results + Frequency Panel

WHAT TO BUILD -- TERM REVIEW SCREEN:

After a report is uploaded, show a two-panel layout:
- LEFT: The report text with all detected anomaly terms highlighted. Each highlighted
  term is clickable.
- RIGHT: A "Term Review" panel listing all detected terms.

The Term Review panel should include:
1. A header showing: "Review Detected Terms" and a count (e.g., "14 terms found").
2. An "Accept All" button at the top (green, outlined).
3. A scrollable list of term cards. Each card shows:
   - The term text (e.g., "pulmonary embolism")
   - A category badge (e.g., "Pulmonary", "Cardiac", "Vascular")
   - A confidence score (e.g., "92%") shown as a small progress bar
   - Two icon buttons: checkmark (accept, green) and X (reject, red)
   - Terms start in "pending" state (neutral), and become green (accepted) or
     red-strikethrough (rejected) when the user acts.
4. An "Add Term" section at the bottom: a text input + "Add" button so the user can
   manually add a term the AI missed. Added terms appear in the list as pre-accepted.
5. A "Confirm & Save" primary button at the bottom that transitions to the final
   results view (existing highlighted report + frequency panel, but only with
   accepted terms).

Clicking a highlighted term in the left report panel should toggle its
accept/reject state and scroll to it in the right panel.

STYLING:
- Use shadcn/ui components (Card, Button, Badge, ScrollArea, Input).
- Color scheme: accepted terms = green highlight, rejected = red with strikethrough,
  pending = yellow/amber highlight.
- The layout should match the existing results view grid: report on left, panel on
  right (lg:grid-cols-[1fr_320px]).
- Keep the existing header and overall page structure.

MOCK DATA TO USE:
Use this hardcoded mock data to simulate the AI parsing response. No real API calls.

const MOCK_REPORT_TEXT = `CT ANGIOGRAPHY OF THE CHEST
Patient: [REDACTED] | Age: 67 | Sex: Male
Clinical Indication: Acute chest pain, rule out pulmonary embolism.

FINDINGS:
Pulmonary Arteries: A filling defect is identified in the right lower lobe segmental
pulmonary artery, consistent with pulmonary embolism. The main pulmonary artery
diameter measures 32 mm, suggesting possible pulmonary hypertension.

Coronary Arteries: Moderate calcification is noted in the left anterior descending
artery. Coronary artery stenosis of approximately 50% is seen in the proximal LAD.

Cardiac: The heart is mildly enlarged, consistent with cardiomegaly. A small
pericardial effusion is present. Aortic valve calcification is noted.

Lungs: Bilateral dependent atelectasis is present. A 6mm pulmonary nodule is
identified in the right upper lobe.`;

const MOCK_PARSED_TERMS = [
  { term: "pulmonary embolism", category: "Pulmonary", confidence: 0.97, startIndex: 227, endIndex: 246, status: "pending" },
  { term: "pulmonary hypertension", category: "Pulmonary", confidence: 0.82, startIndex: 342, endIndex: 364, status: "pending" },
  { term: "calcification", category: "Vascular", confidence: 0.91, startIndex: 396, endIndex: 409, status: "pending" },
  { term: "coronary artery stenosis", category: "Cardiac", confidence: 0.95, startIndex: 450, endIndex: 474, status: "pending" },
  { term: "cardiomegaly", category: "Cardiac", confidence: 0.94, startIndex: 556, endIndex: 568, status: "pending" },
  { term: "pericardial effusion", category: "Cardiac", confidence: 0.93, startIndex: 580, endIndex: 600, status: "pending" },
  { term: "aortic valve calcification", category: "Cardiac", confidence: 0.88, startIndex: 613, endIndex: 640, status: "pending" },
  { term: "atelectasis", category: "Pulmonary", confidence: 0.90, startIndex: 669, endIndex: 680, status: "pending" },
  { term: "pulmonary nodule", category: "Pulmonary", confidence: 0.87, startIndex: 697, endIndex: 713, status: "pending" },
];

COMPONENT INTERFACE:
The review screen should be a single React component <TermReviewScreen /> that accepts:
- reportText: string
- parsedTerms: Array<{ term, category, confidence, startIndex, endIndex, status }>
- onConfirm: (acceptedTerms: Array<...>) => void  // called when user clicks Confirm
- onBack: () => void  // called when user wants to re-upload

Make sure the component is self-contained and uses only shadcn/ui + Tailwind.
No external state management needed -- use local useState.
```

---

*End of plan.*
