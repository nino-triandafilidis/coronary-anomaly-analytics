# Loveable Prompt: Add Term Review Stage to CT Angiogram Analyzer

## Overview

Add a **Term Review** stage between the upload step and the results view. After a report is analyzed, parsed terms (simulating LLM output) are shown in a review panel where the user can accept, reject, or manually add terms before seeing the final results. This is the core new interaction in the app.

**Important**: Do NOT modify any backend/API code. Do NOT add any API calls. All data comes from the existing mock data file at `src/data/mockParseResults.ts`. Do NOT create or modify the mock data file itself.

---

## 0. Design Principles (apply throughout)

This project follows Stanford CS147 HCI design principles (see `design-guidelines.md` in repo root). Apply these throughout all UI work:

### Visual Information Design
- **Gestalt Proximity**: Group related controls tightly. Term cards should cluster accept/reject buttons, confidence, and category together. Separate the term list from bulk actions with whitespace, not just borders.
- **Gestalt Similarity**: All accept buttons should look identical across all term cards. All category badges should use consistent shape/size — only color varies. This signals "these are the same type of thing."
- **Gestalt Common Region**: Use cards as bounded regions to group each term's info (name + category + confidence + actions). The left report panel and right term panel should feel like distinct regions.
- **Visual Hierarchy**: The report text is primary (largest area). The term list is secondary. Bulk actions sit above individual cards. The "Confirm & Save" button is the dominant CTA — make it the highest-contrast element. Confidence scores are tertiary info (smallest, most muted).
- **Whitespace**: Use generous padding inside term cards and between the two columns. Don't pack elements tightly — breathing room makes the review feel calm and clinical, not overwhelming.
- **Color with Purpose**: Color must encode meaning, not decorate. Green = accepted, red = rejected, yellow/amber = pending, blue = user-added. Don't use color for anything else in the review panel. Limit the palette to these 4 semantic colors + the existing neutral tones.
- **Typography**: Use no more than 3 levels of type hierarchy in the review panel: (1) section headers, (2) term names, (3) metadata (confidence, context, category). Keep it consistent.

### Conceptual Model & Affordances (Norman)
- **Mental Model**: The review stage should feel like "reviewing a colleague's work" — the AI suggested these terms, and the user is the expert reviewer who approves, corrects, or adds. This is NOT a configuration screen; it's a review/approval workflow.
- **Affordances**: Accept/reject buttons must look immediately clickable (filled or outlined with clear hover states). The "Add Term" action should afford input (show a + icon that suggests "add something here").
- **Signifiers**: Use checkmark icon for accept, X icon for reject — universal signifiers. Show clear visual state changes when a term is accepted (green border/highlight) or rejected (strikethrough + fade). The user should never wonder "did my click register?"
- **Feedback**: Every accept/reject action must produce immediate visual feedback — the card should visibly change state (color, border, opacity) with a subtle transition (150-200ms). The "Confirm N terms" button text should update its count live as terms are accepted/rejected. When "Accept All" is clicked, all cards should transition simultaneously.
- **Mapping**: The highlighted terms in the report text (left panel) should map spatially to the term cards (right panel). When the user hovers a term card, the corresponding highlight in the report should emphasize. This creates natural spatial mapping between the two views.
- **Constraints**: Disable "Confirm & Save" when 0 terms are accepted — this is a logical constraint that prevents a meaningless action. Don't let the user submit an empty review.

### Nielsen's Heuristics (apply these specifically)
1. **Visibility of System Status**: Show parse metadata at the top of the review panel (model used, time taken, cost, token count). Show a running count of accepted/rejected/pending terms. The user should always know the state of their review.
2. **Match Between System and Real World**: Use medical/clinical language, not tech jargon. Say "anomalies" not "entities." Say "Review AI Findings" not "Parsed Term Review." The category names (Pulmonary, Cardiac, Vascular) are already domain-appropriate — keep them.
3. **User Control and Freedom**: Clicking accept on an already-accepted term should toggle it back to pending (undo). Same for reject. Provide a "Back" button to return to upload. Provide "Back to Review" from results. The user must never feel trapped.
4. **Consistency and Standards**: All term cards must behave identically. The accept/reject button pattern must be the same in every card. Follow the app's existing shadcn/ui patterns.
5. **Error Prevention**: Default all terms to "pending" — force the user to make an explicit choice rather than auto-accepting AI output. This prevents errors of omission.
6. **Recognition Over Recall**: Show the context snippet on each term card so the user doesn't have to scroll the report to remember what each term referred to. Show `isAnomaly: false` warnings inline, not in a separate legend.
7. **Aesthetic and Minimalist Design**: Don't overload term cards. Show only: term name, category badge, confidence %, context snippet, accept/reject buttons. Hide secondary info (exact position indices, model details) behind tooltips or the header metadata.
8. **Help Users Recover from Errors**: If the user rejects a term and then changes their mind, they can click reject again to toggle back. If they confirm and see wrong results, "Back to Review" preserves their previous state.

### Interaction Patterns
- **Progressive Disclosure**: Show the term list as the primary interaction. Parse metadata (model, tokens, cost) shown in a compact header — don't overwhelm with technical details on first glance.
- **Bulk + Individual Control Pattern**: "Accept All" / "Reject All" for speed, individual buttons for precision. This is a common pattern in email (select all / individual checkboxes) — leverage existing user knowledge.
- **Cards Pattern**: Each term as a card is appropriate for this density of content. Cards create clear boundaries (Common Region) and can show multiple attributes without visual confusion.

---

## 1. New Application Flow

Update `src/pages/Index.tsx` to support three states instead of two:

| State | When | What's Shown |
|-------|------|-------------|
| **upload** | Initial / after reset | Existing `ReportInput` component (no changes) |
| **review** | After a report is submitted | NEW `TermReview` component showing parsed terms |
| **results** | After user clicks "Confirm & Save" | Existing `ReportViewer` + `FrequencyPanel` (uses only accepted terms) |

### State management in Index.tsx

Add a `stage` state: `"upload" | "review" | "results"`.

When the user submits a report:
1. Try to match it against mock data using `findMockParseResultByText(text)` from `src/data/mockParseResults.ts`.
2. If a mock match is found, transition to the **review** stage with the parsed terms.
3. If no mock match is found, fall back to the existing `detectAnomalies(text)` flow and skip directly to **results** (current behavior).

When the user confirms the review:
1. Collect only the terms with status `"accepted"` or `"added"`.
2. Convert them into `DetectedAnomaly[]` format (map `normalizedName` to the anomaly database lookup).
3. Transition to the **results** stage with that data.

Add a "Back to Review" link in the results stage (next to the existing "New Report" link) so the user can go back and adjust terms.

---

## 2. New Component: `TermReview`

Create `src/components/TermReview.tsx`.

### Props

```typescript
import type { ParseResult, ReviewableTerm, TermStatus } from "@/data/mockParseResults";

interface TermReviewProps {
  parseResult: ParseResult;
  onConfirm: (acceptedTerms: ReviewableTerm[]) => void;
  onBack: () => void;
}
```

### Layout

The component should have two columns on large screens (`lg:grid-cols-[1fr_320px]`), stacking on mobile:

**Left column: Report text with highlights**
- Display the full report text in a card.
- Highlight the positions of each parsed term using the `startIndex` / `endIndex` values.
- Color the highlights based on the term's current status:
  - `pending`: `bg-yellow-100 dark:bg-yellow-900/30`
  - `accepted`: `bg-green-100 dark:bg-green-900/30`
  - `rejected`: `bg-red-100/50 dark:bg-red-900/20` with `line-through` text
  - `added`: `bg-blue-100 dark:bg-blue-900/30`
- When the user hovers over a highlight, show a tooltip with the term's `normalizedName`, `category`, and `confidence`.

**Right column: Term list panel**
- Header showing count: "12 terms found" with parse metadata (model name, time, cost).
- Bulk action buttons at the top: "Accept All" and "Reject All" as small outlined buttons.
- Scrollable list of term cards (one per parsed term), each containing:
  - **Term chip/badge**: The `normalizedName` text.
  - **Category badge**: Small colored badge using the category. Use these colors:
    - Pulmonary: `bg-blue-100 text-blue-800`
    - Cardiac: `bg-red-100 text-red-800`
    - Vascular: `bg-purple-100 text-purple-800`
    - Systemic: `bg-orange-100 text-orange-800`
    - Anatomy: `bg-gray-100 text-gray-600`
  - **Confidence**: Subtle percentage text, e.g. "97%" in muted-foreground.
  - **Context**: The `context` string in small muted text, truncated to 2 lines.
  - **isAnomaly indicator**: If `isAnomaly` is false, show a small warning icon or "(likely not anomaly)" text in muted-foreground to help the user decide.
  - **Accept / Reject buttons**: Two icon buttons (checkmark and X) on the right side of each card.
    - Accepted terms: checkmark highlighted in green, card has a subtle green left border.
    - Rejected terms: X highlighted in red, card faded out with strikethrough on the term name.
    - Pending terms: neither button highlighted.
- "Add Term" button at the bottom of the list. When clicked, show an inline form with:
  - Text input for the term name
  - A category dropdown (Pulmonary, Cardiac, Vascular, Systemic, Other)
  - "Add" button to confirm
  - Added terms appear in the list with `status: "added"` and a blue left border accent.
- **"Confirm & Save" button**: Large primary button at the very bottom. Disabled if zero terms are accepted/added. Shows count: "Confirm 8 terms".

### Behavior

- Initialize all parsed terms as `ReviewableTerm` objects with `status: "pending"`.
- Terms with `isAnomaly: false` should default to `status: "pending"` (not auto-rejected), but visually hint that they may not be real anomalies.
- "Accept All" sets all pending terms to `"accepted"` (does not change already-rejected terms).
- "Reject All" sets all pending terms to `"rejected"` (does not change already-accepted terms).
- Clicking accept on an already-accepted term toggles it back to pending.
- Clicking reject on an already-rejected term toggles it back to pending.
- When the user clicks "Confirm & Save", call `onConfirm` with all terms that have status `"accepted"` or `"added"`.

---

## 3. Wiring into Index.tsx

Update `src/pages/Index.tsx`:

```typescript
import { TermReview } from "@/components/TermReview";
import { findMockParseResultByText, type ParseResult, type ReviewableTerm } from "@/data/mockParseResults";
```

Add states:
```typescript
const [stage, setStage] = useState<"upload" | "review" | "results">("upload");
const [parseResult, setParseResult] = useState<ParseResult | null>(null);
```

Update `handleReport`:
```typescript
const handleReport = (text: string) => {
  const mockResult = findMockParseResultByText(text);
  if (mockResult) {
    setReportText(text);
    setParseResult(mockResult);
    setStage("review");
  } else {
    // Fallback: existing rule-based detection
    const results = detectAnomalies(text);
    setReportText(text);
    setDetected(results);
    setUnique(getUniqueAnomalies(results));
    setStage("results");
  }
};
```

Add a `handleReviewConfirm` that takes the accepted `ReviewableTerm[]`, maps them to `DetectedAnomaly[]` / `AnomalyEntry[]`, and transitions to `"results"`.

Update the JSX to render based on `stage`:
- `"upload"`: existing upload UI
- `"review"`: `<TermReview parseResult={parseResult} onConfirm={handleReviewConfirm} onBack={handleReset} />`
- `"results"`: existing results UI, plus a "Back to Review" button

Update `handleReset` to go back to `"upload"` and clear all state.

---

## 4. Style Guidelines

- Use the existing shadcn/ui components: `Card`, `Badge`, `Button`, `Input`, `Select`, `Tooltip`.
- Follow the existing design language -- compact, clinical, minimal.
- Use the existing Tailwind color tokens:
  - `clinical-danger` (red) for high severity / rejected states
  - `clinical-warning` (amber) for moderate / pending states
  - `clinical-success` (green) for accepted states
  - `primary` for the main accent color
- Confidence shown as a subtle percentage next to each term (e.g., `text-xs text-muted-foreground`).
- Rejected terms: strikethrough text, reduced opacity (`opacity-50`).
- Added terms: blue left border accent (`border-l-4 border-blue-400`).
- The review panel should feel like a professional medical term review workflow -- not playful, not consumer-y.
- Use `animate-fade-in` (already defined in the project) for stage transitions.

### Hover Cross-Highlighting (Spatial Mapping)
When the user hovers a term card in the right panel, the corresponding highlighted span in the report text (left panel) should pulse or intensify (e.g., increase background opacity, add a ring). This creates a spatial mapping between the abstract term list and its location in the report. Use a shared hover state (e.g., a `hoveredTermIndex` state in the parent) to coordinate.

### Transition & Feedback Details
- Accept/reject state changes: `transition-all duration-150` for smooth card color/border shifts.
- Stage transitions (upload → review → results): use the existing `animate-fade-in` class.
- "Confirm N terms" button: the count should update reactively as terms are toggled — this is immediate feedback per Nielsen H1.
- Bulk actions ("Accept All"): all cards should transition at once — stagger is unnecessary and slows down the workflow.

---

## 5. Files to Create or Modify

| File | Action |
|------|--------|
| `src/components/TermReview.tsx` | **Create** -- the new term review component |
| `src/pages/Index.tsx` | **Modify** -- add review stage, wire mock data |

Do NOT modify:
- `src/data/mockParseResults.ts` (already created, use as-is)
- `src/data/sampleReports.ts`
- `src/data/anomalyDatabase.ts`
- `src/lib/anomalyDetection.ts`
- Any shadcn/ui components

---

## 6. Type Imports Reference

The mock data file exports these types you will need:

```typescript
// from src/data/mockParseResults.ts
export interface ParsedTerm {
  term: string;
  normalizedName: string;
  category: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  context: string;
  isAnomaly: boolean;
}

export interface ParseResult {
  reportId: string;
  reportText: string;
  parsedTerms: ParsedTerm[];
  parserModel: string;
  verifierModel: string;
  verifierAgreement: number;
  parseTimeMs: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
}

export type TermStatus = "pending" | "accepted" | "rejected" | "added";

export interface ReviewableTerm extends ParsedTerm {
  status: TermStatus;
}
```

And these functions:

```typescript
export function findMockParseResultByText(text: string): ParseResult | undefined;
export function getMockParseResult(reportId: string): ParseResult | undefined;
```

---

## 7. Acceptance Criteria

- [ ] Uploading/pasting a sample report shows the Term Review panel (not jumping straight to results).
- [ ] Each parsed term is shown with its name, category, confidence, and context.
- [ ] User can accept or reject individual terms via icon buttons.
- [ ] "Accept All" and "Reject All" work correctly as bulk actions.
- [ ] User can add a new term manually via the "Add Term" form.
- [ ] "Confirm & Save" is disabled when zero terms are accepted/added.
- [ ] After confirming, the results page shows only the accepted/added terms.
- [ ] "Back to Review" from results returns to the review stage with state preserved.
- [ ] "New Report" resets everything back to the upload stage.
- [ ] If pasted text does not match any mock report, the app falls back to the existing rule-based detection and goes directly to results.
- [ ] The report text panel highlights terms at their correct positions with status-dependent colors.
- [ ] Terms with `isAnomaly: false` have a visual hint suggesting they may not be real anomalies.
- [ ] No API calls are made; all data comes from `mockParseResults.ts`.
- [ ] All existing functionality continues to work.
