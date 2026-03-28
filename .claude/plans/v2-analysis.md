# V2 Redesign Analysis: CT Angiogram Analyzer

## Current System Summary

The app is a Vite + React + TypeScript frontend that does rule-based anomaly detection entirely in-browser. `anomalyDetection.ts` does dictionary matching against a hardcoded list of 18 terms (with aliases) in `anomalyDatabase.ts`. Severity is derived from frequency: rarer findings = higher severity. There are 3 hardcoded sample CT angiogram reports. A Python pipeline (`mimic_pipeline.py`) can extract 300 MIMIC-IV radiology reports and run scispaCy NER to build `anomaly_frequencies.json`, which the app loads at startup to override the mock database.

There is no backend. No authentication. No user state persistence. No LLM integration. The entire app runs as static files.

---

## 1. Ambiguities to Resolve

### 1.1 What exactly does "parse anomalies" mean for the LLM?

The current system detects named entities by dictionary lookup (exact term matching). The plan says "LLM-based parsing" but does not define what the LLM output should contain. Is it:

- **(A) Entity extraction only:** Return a list of medical finding terms found in the text, similar to NER (term, position, category). This is a direct replacement for `detectAnomalies()`.
- **(B) Structured clinical interpretation:** Return anomalies with severity, clinical significance, relationships between findings (e.g., "pulmonary embolism causing pulmonary hypertension"), and whether they are incidental or primary.
- **(C) Full report summarization:** Parse the entire report into a structured object: findings per anatomical region, impression items, measurements, follow-up recommendations.

**Why it matters:** Option A is the simplest swap and cheapest per call. Option C is where LLMs actually shine over dictionary matching, but it requires a much more complex schema and UI to display. The architecture, cost, and timeline differ dramatically between these.

**Recommendation:** Start with A, design the schema to be extensible toward B/C.

### 1.2 What does the verifier check?

"Another LLM judges correctness" -- correctness of what?

- **(A) Hallucination check:** Did the parser invent anomalies that are not actually in the report text? (Verifiable by checking extracted terms against source text.)
- **(B) Clinical accuracy check:** Are the extracted findings clinically reasonable given the report context? (e.g., flagging "pulmonary embolism" when the report says "no evidence of pulmonary embolism.")
- **(C) Completeness check:** Did the parser miss findings that are present in the report?

**Why it matters:** Option A can be done deterministically without a second LLM call (string matching against source text). Option B is where LLMs add real value but is harder to evaluate. Option C requires the verifier to independently parse the report, making it almost as expensive as running two full parses.

The negation problem (option B) is the most critical. The current dictionary system already has this flaw -- it highlights "pulmonary embolism" even in "No evidence of pulmonary embolism." If the LLM parser is smart enough to handle negation, the verifier's main job should be catching the remaining edge cases.

**Recommendation:** Implement negation-aware parsing in the parser prompt. Use the verifier specifically for hallucination detection (A) and negation errors (subset of B). Skip completeness checks initially -- they double the cost for marginal value.

### 1.3 What does "highlight terms -> user accepts/rejects/adds -> upload" mean?

The current flow is: upload report -> see highlights -> view frequency panel. The new flow adds user interaction, but the spec is ambiguous:

- Does "upload" at the end mean uploading the user's accept/reject decisions to a database?
- Or does it mean the user uploads a report, sees LLM-parsed highlights, edits them, and then the final accepted set is what gets stored?
- What happens to rejected anomalies? Are they logged for model improvement?
- When a user "adds" an anomaly, what do they provide? Just a term? A term + category + severity?

**Why it matters:** This determines whether you need a backend database for user decisions, what the data model looks like, and whether this is a supervised-learning feedback loop or just a UX convenience.

### 1.4 What does "scrap 300-report MIMIC database" mean concretely?

- Delete the `mimic_pipeline.py` script and `public/mimic_reports_300.json`?
- Remove the `/dataset` page entirely?
- Or keep the page but replace MIMIC data with 10 LLM-parsed reports?

**Why it matters:** The MIMIC pipeline and dataset page represent real work. If the goal is "I don't trust the MIMIC NER output quality," the fix might be improving the pipeline rather than scrapping it. If the goal is "I want to demo with clean CT angiogram reports only (not general radiology)," that is a different problem -- MIMIC radiology reports are not all CT angiograms.

### 1.5 What is the "database" in the new system?

The current system has two data concepts:
1. The anomaly database (18 terms with frequency/severity) -- used for highlighting and tooltips.
2. The report corpus (3 samples + 300 MIMIC) -- used for the dataset page.

With 10 new reports parsed by LLMs, what persists?
- Just the 10 parsed reports as static JSON?
- A live database that grows as users upload and annotate reports?
- A Supabase/Postgres instance?

---

## 2. Technical Risks

### 2.1 LLM Output Consistency for Medical NER

**Risk: High.** LLMs are non-deterministic. The same report parsed twice may yield different anomaly lists. This is especially problematic for:

- **Term normalization:** One run might return "coronary artery stenosis," another "coronary stenosis," another "stenosis of the coronary artery." The current dictionary system uses aliases to handle this. LLMs need explicit instructions to normalize, and even then they drift.
- **Boundary detection:** The current system returns `startIndex`/`endIndex` for exact text positions. Getting an LLM to reliably return character-level offsets is notoriously unreliable. The LLM will often return approximate positions or just the term text without offsets.
- **Negation handling:** "No evidence of dissection" -- will the LLM correctly exclude this? Sometimes yes, sometimes no. This is the single most important quality dimension for medical NER and the hardest to get consistent.

**Mitigation:** Use structured output (JSON mode / function calling) with Gemini. Set temperature to 0. Include few-shot examples in the prompt that explicitly demonstrate negation exclusion. Run a test suite of known reports and measure consistency across 10 runs.

### 2.2 Parser-Verifier Cost Multiplication

**Risk: Medium.** Every report costs 2x LLM calls. At development scale (10 reports) this is negligible. At user-facing scale, if someone uploads 50 reports in a session, that is 100 LLM calls.

More critically: if the parser and verifier disagree, what happens? A third call to adjudicate? A fallback to the parser's output? Surfacing the disagreement to the user?

**Mitigation:** Make the verifier optional and async. Show parser results immediately. Run the verifier in the background. Flag uncertain results with a visual indicator. Let users toggle the verifier on/off.

### 2.3 Gemini Model Selection

**Risk: Medium.**

- **Gemini 2.0 Flash:** Cheapest option. $0.10/1M input tokens, $0.40/1M output tokens. Supports structured output (JSON mode, function calling). Good enough for entity extraction from short medical texts. Main risk: may miss subtle findings or handle negation poorly.
- **Gemini 2.0 Pro:** $1.25/1M input tokens, $5.00/1M output tokens. Better reasoning. 12.5x more expensive on input, 12.5x on output. Likely overkill for straightforward NER.
- **Gemini 1.5 Flash/Pro:** Older, but well-documented. 1.5 Flash is $0.075/1M input.

The plan says Gemini primary with Claude/OpenAI backup at ~$100 each. This implies a total budget of roughly $300 across all providers.

**Key question:** Structured output support varies by model. Gemini 2.0 Flash supports `response_mime_type: "application/json"` and function calling. But the reliability of JSON schema adherence varies. Test this early.

### 2.4 Mock Data Fidelity vs Real LLM Behavior

**Risk: High.** The plan says to develop the UI independently in Loveable with mock data. This is standard practice, but the gap between mock data and real LLM output is large for this use case:

- Mock data will have clean, consistent schemas. Real LLM output will have variations, missing fields, unexpected formats.
- Mock data will not have the latency of a real LLM call (1-5 seconds per report). The UI needs loading states, error handling, and timeout behavior that mock data will not exercise.
- Mock data will not have the verifier disagreement case, partial failures, or rate limiting.

**Mitigation:** Define the schema contract FIRST, before writing any code. Generate mock data BY RUNNING the real LLM on 3-5 reports, then freeze that output as mock data. This ensures the mock matches reality.

### 2.5 Loveable's Capabilities and Limitations

**Risk: Medium-High.** Loveable generates React + Tailwind + shadcn/ui code (the current project already uses `lovable-tagger` in devDependencies, so this is the existing tool). Loveable is good at:
- Layout, styling, component composition
- Standard CRUD interactions
- Static or simple data flows

Loveable is weaker at:
- Complex interactive text annotation (highlight + click to accept/reject + inline editing)
- Bidirectional data flow between a text viewer with highlights and a side panel
- Real-time state management where user edits to annotations must update highlights in the text viewer
- Integration with external APIs (LLM calls, authentication, error handling)

The proposed "highlight terms -> user accepts/rejects/adds" flow is essentially a text annotation tool. This is one of the harder UI patterns to build well. The current `ReportViewer.tsx` does read-only highlighting with tooltips. Adding accept/reject/add buttons per highlight, plus an "add new annotation" mode where the user selects text, is a significant step up in complexity.

**Mitigation:** Build the annotation interaction manually in the existing codebase rather than relying on Loveable to generate it. Use Loveable for layout and non-interactive components.

---

## 3. Architecture Gaps

### 3.1 Where Does the LLM Backend Live?

The current app is entirely client-side. LLM API calls require an API key that cannot be exposed in the browser. Options:

- **(A) Supabase Edge Function:** The project does not currently use Supabase, but Loveable projects often deploy there. Edge functions can hold secrets and proxy LLM calls. Cold start latency: 50-200ms. Runtime limit: 150s on free tier. Good enough for single-report parsing.
- **(B) Vercel/Netlify Serverless Function:** If deploying to either platform. Similar constraints. Vercel has a 10s default timeout (extendable to 60s on Pro).
- **(C) Standalone Python backend (Flask/FastAPI):** Runs locally or on a VM. Most flexible. Can reuse the existing Python pipeline code. But adds deployment complexity and means maintaining two codebases.
- **(D) Direct client-side API call:** Some LLM providers allow CORS-enabled API calls with restricted API keys. Gemini supports this. Security risk: API key is visible in browser network tab. Acceptable only for personal/demo use, not production.

**Recommendation:** For a demo/personal project, option D (direct Gemini call from browser with a restricted API key) is fastest to implement. For anything shared, option A (Supabase Edge Function) fits the existing stack.

### 3.2 Frontend-to-LLM Communication

Regardless of where the backend lives, the frontend needs:

1. A function that sends report text and receives parsed anomalies (replacing `detectAnomalies()`).
2. Loading state management (LLM calls take 1-5 seconds).
3. Error handling: API key invalid, rate limited, model unavailable, malformed response.
4. Cost tracking: count tokens per call, accumulate per session, alert at threshold.

The current `Index.tsx` calls `detectAnomalies(text)` synchronously. This needs to become async with loading/error states. React Query (`@tanstack/react-query`, already in dependencies) is the right tool for this.

### 3.3 Schema Contract Between Parser and UI

**This is the most critical missing piece.** Without a defined schema, the frontend and LLM backend cannot be developed independently.

Proposed schema for parser output:

```typescript
interface ParsedAnomaly {
  id: string;                      // Unique per extraction
  term: string;                    // Normalized name (e.g., "Pulmonary embolism")
  mentionText: string;             // Exact text from report (e.g., "pulmonary embolism")
  startIndex: number;              // Character offset in report text
  endIndex: number;                // Character offset end
  category: string;                // Anatomical/system category
  isNegated: boolean;              // True if finding is explicitly denied
  confidence: number;              // 0-1, parser's confidence
  severity?: string;               // Optional: parser's severity assessment
  context?: string;                // Optional: surrounding sentence for verifier
}

interface ParseResult {
  reportId: string;
  anomalies: ParsedAnomaly[];
  modelUsed: string;               // "gemini-2.0-flash" etc.
  tokenUsage: { input: number; output: number };
  parseTimeMs: number;
}

interface VerifyResult {
  reportId: string;
  decisions: {
    anomalyId: string;
    verdict: "confirmed" | "rejected" | "uncertain";
    reason?: string;
  }[];
  tokenUsage: { input: number; output: number };
}
```

**Key design decision:** Should `startIndex`/`endIndex` come from the LLM or be computed client-side? LLMs are unreliable at returning exact character offsets. Better approach: have the LLM return `mentionText`, then find its position in the source text client-side (reusing the existing `indexOf` logic from `anomalyDetection.ts`).

### 3.4 How Are User Accept/Reject Decisions Stored?

Options:
- **(A) Browser localStorage:** Simple, no backend needed. Lost on browser clear. Fine for personal demo.
- **(B) Supabase Postgres table:** Persistent. Enables analytics on annotation patterns. Requires auth if multi-user.
- **(C) Exported JSON file:** User downloads their annotations. No persistence across sessions but portable.

The decision depends on whether this is a personal tool or a multi-user application.

### 3.5 How Are the 10 New Reports Created/Sourced?

This is underspecified. Options:
- **(A) Hand-pick 10 reports from the existing 300 MIMIC reports.** Fastest. But MIMIC radiology reports include chest X-rays, abdominal CTs, etc. -- not just CT angiograms. Would need to filter for CT angiogram-specific reports.
- **(B) Use the 3 existing sample reports + 7 new ones.** The 3 samples in `sampleReports.ts` are well-crafted CT angiogram reports. Sourcing 7 more requires either finding real de-identified reports or writing synthetic ones.
- **(C) Use an LLM to generate synthetic CT angiogram reports.** Fast, controllable, but creates a circular dependency: you are testing LLM parsing on LLM-generated text. The parser will perform artificially well because the text matches LLM "style."
- **(D) Use reports from a public radiology dataset other than MIMIC.** OpenI, RadReport, etc. Requires checking licensing.

**Recommendation:** Option B. Keep the 3 existing samples. Find 7 real de-identified CT angiogram reports from MIMIC (filter for "CT angiography" in the note text) or another source. Do not use LLM-generated reports for testing an LLM parser.

---

## 4. Cost Analysis

### 4.1 Token Usage per Report

A typical CT angiogram report (from `sampleReports.ts`) is 1,200-1,800 characters, which is roughly **400-600 tokens**. The prompt (system instructions + few-shot examples for the parser) will add **300-800 tokens** depending on the number of examples. Total input per parser call: **700-1,400 tokens**.

Output (list of anomalies in JSON): typically **200-500 tokens** depending on findings count.

Verifier input: original report + parser output = **1,000-2,000 tokens**. Verifier output: **100-300 tokens**.

### 4.2 Per-Report Cost

**Gemini 2.0 Flash** (cheapest viable option):
- Input: $0.10 / 1M tokens
- Output: $0.40 / 1M tokens

Parser call: ~1,000 input + ~350 output = $0.0001 + $0.00014 = **$0.00024**
Verifier call: ~1,500 input + ~200 output = $0.00015 + $0.00008 = **$0.00023**
Total per report (parser + verifier): **~$0.0005** (less than a tenth of a cent)

**Gemini 2.0 Pro:**
- Input: $1.25 / 1M tokens
- Output: $5.00 / 1M tokens

Parser: $0.00125 + $0.00175 = **$0.003**
Verifier: $0.001875 + $0.001 = **$0.002875**
Total per report: **~$0.006**

### 4.3 At 10 Reports (Initial Testing)

| Model | Parser only | Parser + Verifier |
|-------|-----------|-------------------|
| Gemini 2.0 Flash | $0.0024 | $0.005 |
| Gemini 2.0 Pro | $0.03 | $0.06 |

At testing scale, cost is essentially zero. Even running each report 10 times for consistency testing costs under $0.50 with Flash.

### 4.4 At Scale (100+ Reports)

| Model | 100 reports | 500 reports | 1000 reports |
|-------|-----------|------------|-------------|
| Flash (parser+verifier) | $0.05 | $0.25 | $0.50 |
| Pro (parser+verifier) | $0.60 | $3.00 | $6.00 |

**Bottom line:** Cost is not a real concern at any foreseeable scale with Gemini Flash. The $1 alert threshold will likely never trigger from report parsing alone. The $100 budgets for Claude/OpenAI backup are generous for this use case.

The real cost risk is not per-report parsing but development iteration: repeatedly refining prompts, testing with long reports, or accidentally running the verifier in a loop. A simple counter (requests-this-session) is sufficient.

### 4.5 Claude/OpenAI Backup Cost Comparison

For context, if using Claude 3.5 Sonnet or GPT-4o as backup:
- Claude 3.5 Sonnet: $3/1M input, $15/1M output. Parser call: ~$0.008 per report. 10x more than Gemini Pro.
- GPT-4o: $2.50/1M input, $10/1M output. Parser call: ~$0.006 per report.
- GPT-4o-mini: $0.15/1M input, $0.60/1M output. Parser call: ~$0.00036 per report. Comparable to Gemini Flash.

If using Claude or OpenAI as backup, use their cheaper models (Claude 3.5 Haiku / GPT-4o-mini) for cost parity with Gemini Flash.

---

## 5. Recommended Priorities

### Phase 1: Schema and Contract (1-2 days)

1. **Define the ParsedAnomaly schema** (section 3.3 above). This unblocks all other work.
2. **Run Gemini Flash on the 3 existing sample reports** with a draft prompt. Inspect the raw output. Iterate the prompt until the output matches the schema.
3. **Freeze the output as mock data** (`src/data/mockLlmOutput.ts`). This becomes the contract for the UI.

**Justification:** Everything else depends on knowing what the LLM actually returns. Do not design UI or write backend code against an assumed schema.

### Phase 2: Parser Backend (2-3 days)

4. **Implement the LLM parser as a standalone module** (`src/lib/llmParser.ts` or `scripts/llm_parser.py`). Direct Gemini API call. Structured output. Temperature 0.
5. **Build a simple test harness** that runs the parser on all 3 sample reports and compares output to expected results (a snapshot test).
6. **Add negation detection** to the prompt. Test with adversarial cases ("no evidence of X", "ruled out Y", "without Z").

**Justification:** The parser is the core value-add. Get it working and reliable before touching UI.

### Phase 3: UI Annotation Flow (3-5 days)

7. **Replace synchronous `detectAnomalies()` with an async LLM call** in `Index.tsx`. Add loading state, error handling.
8. **Build the accept/reject/add UI** in `ReportViewer.tsx`. Each highlighted term gets accept/reject buttons. Add a "select text to add anomaly" mode.
9. **Wire up the annotation state** -- track which anomalies are accepted, rejected, or user-added.

**Justification:** This is the most complex UI work. Do it in the existing codebase, not Loveable, because the interaction model (text annotation with inline controls) is non-trivial and needs tight integration with the existing highlighting logic.

### Phase 4: Verifier and Polish (2-3 days)

10. **Implement the verifier** as a second LLM call. Run it async after parser results are shown.
11. **Add cost tracking** -- count tokens per session, display in UI, warn at threshold.
12. **Source 7 additional CT angiogram reports** for the test corpus.
13. **Decide on persistence** (localStorage vs Supabase) and implement.

**Justification:** The verifier is a nice-to-have that depends on the parser working well. Cost tracking is important but not blocking. Persistence can be deferred.

### Phase 5: Cleanup (1 day)

14. **Decide what to do with MIMIC data.** Either remove the pipeline and dataset page, or keep them as a separate feature.
15. **Update `anomalyDatabase.ts`** to work with LLM-parsed data instead of static frequency tables.

---

## 6. Questions for the User

1. **What should the LLM extract?** Just entity names and positions (replacing dictionary matching), or structured clinical interpretation (severity, relationships, significance)?

2. **What should the verifier specifically check?** Hallucinated findings? Negation errors? Completeness? All of the above? (Each has different cost and complexity implications.)

3. **When you say "upload" in the new flow (highlight -> accept/reject/add -> upload), upload to where?** A database? A file export? Or do you mean the user uploads a report and then annotates it?

4. **Is this a personal tool or will others use it?** This determines whether API keys can live in the browser (personal) or need a backend proxy (shared). It also determines persistence requirements.

5. **Do you want to keep the MIMIC dataset page (`/dataset`) or remove it entirely?** The 300 radiology reports are general radiology, not CT angiograms specifically.

6. **For the 10 new reports: are you sourcing real de-identified reports, or is generating synthetic reports acceptable?** Synthetic reports will make the LLM parser look artificially good.

7. **What Gemini model do you want to start with?** Gemini 2.0 Flash is 12.5x cheaper than Pro and likely sufficient for NER-style extraction. Pro is better for complex clinical reasoning.

8. **Where should the backend live?** Options: direct browser API call (simple, insecure), Supabase Edge Function (fits Loveable stack), standalone Python server (most flexible), or Vercel serverless function. Your GCP setup suggests you may already have Cloud Functions available.

9. **What is the target for the $1 cost flag?** Per report? Per session? Per day? Per user? (At Gemini Flash pricing, you would need to parse ~2,000 reports to hit $1.)

10. **Should the Loveable-developed UI be a separate project/repo or a redesign of the existing codebase?** Developing in Loveable means generating a new project that would need to be reconciled with the existing code, tests, and configuration.
