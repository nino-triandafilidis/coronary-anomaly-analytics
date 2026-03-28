

## Plan: Add Term Review Flow

### Overview
Insert a `review` stage between `upload` and `results`. When a sample report matches mock parse data, the user reviews AI-identified terms before confirming. Non-matching text falls back to current rule-based detection.

**Files changed:** 2 (create `TermReview.tsx`, modify `Index.tsx`). No other files touched.

---

### 1. Create `src/components/TermReview.tsx`

A two-column review interface where the cardiologist approves/rejects AI-parsed terms.

**State:**
- `terms: ReviewableTerm[]` — initialized from `parseResult.parsedTerms` with `status: "pending"`
- `hoveredTermIndex: number | null` — coordinates highlight emphasis between panels
- Add-term form fields: `newTermName`, `newTermCategory`

**Left column — Report text with highlights:**
- Render report text with `<span>` segments at each term's `startIndex`/`endIndex`
- Highlight color reflects status: amber (pending), green (accepted), red+faded+strikethrough (rejected), blue (added)
- Hovered term gets `ring-2 ring-primary` emphasis
- Tooltip on highlight: normalizedName, category, confidence %

**Right column — Term review panel:**
- Header: "Review AI Findings" + term count, model metadata (gemini-2.5-flash, parse time, cost)
- Live status counts: "N accepted · N rejected · N pending"
- Bulk actions: "Accept All" (sets pending→accepted), "Reject All" (sets pending→rejected) — neither overrides explicit choices
- ScrollArea with term cards, each showing:
  - normalizedName, category badge (color-coded by category), confidence %, context snippet (2-line clamp)
  - `isAnomaly: false` warning: "(likely not anomaly)"
  - Accept/reject icon buttons with toggle behavior (accepted→pending, rejected→pending)
  - Left border color + opacity reflects status; `transition-all duration-150`
  - `onMouseEnter`/`onMouseLeave` sets `hoveredTermIndex`
- "Add Term" section: text input + category select + Add button → appends with `status: "added"`, blue border
- "Confirm N terms" primary CTA — disabled when N=0, count updates live

**On confirm:** calls `onConfirm(terms.filter(t => t.status === "accepted" || t.status === "added"))`

---

### 2. Modify `src/pages/Index.tsx`

**New state:**
- `stage: "upload" | "review" | "results"` (replaces implicit `!reportText` check)
- `parseResult: ParseResult | null`
- `reviewTerms: ReviewableTerm[] | null` (preserved for "Back to Review")

**On report submit:**
1. Call `findMockParseResultByText(text)`
2. If match → set `reportText`, `parseResult`, transition to `"review"`
3. If no match → existing `detectAnomalies(text)` flow → skip to `"results"`

**On review confirm:**
1. Receive accepted/added `ReviewableTerm[]`
2. Map each to `DetectedAnomaly` by looking up `normalizedName` in `getAnomalyDatabase()` (case-insensitive). Unmatched terms get a synthetic entry with frequency 0.
3. Set `detected`/`unique`, transition to `"results"`

**Results view changes:**
- Add "Back to Review" link (only when `parseResult` exists) that returns to `"review"` with state preserved
- "New Report" resets all state to `"upload"`

**Render logic:** `stage === "upload"` → ReportInput, `stage === "review"` → TermReview, `stage === "results"` → ReportViewer + FrequencyPanel

