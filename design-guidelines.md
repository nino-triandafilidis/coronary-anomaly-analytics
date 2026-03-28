# Design Guidelines

Design principles for building clinical interfaces in this project. Based on CS147 (HCI Design) at Stanford.

---

## Visual Design

### Gestalt Principles

- **Proximity** — group related elements by placing them close together. More effective than boxes or borders.
- **Similarity** — use consistent color, shape, and size to signal that elements are the same type.
- **Continuity** — align elements to create visual flow and implied connections.
- **Closure** — imply boundaries without drawing them. The brain fills in gaps.
- **Figure/Ground** — separate foreground from background for focus and layering (modals, cards).
- **Common Region** — elements within the same bounded area are grouped (panels, cards, sections).

### Visual Hierarchy

- **Size** — larger elements are read first.
- **Contrast** — high-contrast elements draw attention. Use sparingly for emphasis.
- **Position** — top-left gets scanned first (LTR). Place important content where eyes land naturally.
- **Typography** — 2-3 levels of typographic hierarchy max. Use weight and size to create levels.
- **Whitespace** — active design element. Creates breathing room, separates groups, directs focus.

### Color

- Use color to encode meaning (red = error/critical, green = success/confirmed, amber = pending/warning).
- Limit the palette. Restraint produces more professional results than variety.
- Ensure sufficient contrast for readability and accessibility.

### Typography

- Choose typefaces that match the clinical context.
- Establish a clear type scale with proportional sizes.
- Set intentional line length, line height, and letter spacing for readability.

---

## Conceptual Models (Norman)

- **Conceptual Model** — design so the user can immediately understand how the system works. The model should be obvious, not guessed.
- **Affordances** — visual properties that suggest how an element can be used. Buttons afford pressing. Sliders afford dragging.
- **Signifiers** — visible indicators of where and how to act. Underlined text signifies "clickable."
- **Mapping** — controls should spatially and logically correspond to their effects. Natural mapping reduces memorization.
- **Feedback** — every action produces an immediate, visible response. The user must always know: did my action register? What state is the system in?
- **Constraints** — limit possible actions to prevent errors. Gray out unavailable options. Use confirmation for destructive actions.

---

## Nielsen's 10 Usability Heuristics

1. **Visibility of System Status** — keep users informed. Loading indicators, progress bars, confirmation messages, active states.
2. **Match Between System and Real World** — use clinical language familiar to cardiologists, not system jargon. Present information in natural, logical order.
3. **User Control and Freedom** — provide undo, cancel, back. Never trap users in flows they can't escape.
4. **Consistency and Standards** — same word, icon, or action means the same thing everywhere. Follow platform conventions.
5. **Error Prevention** — prevent errors before they happen. Disable impossible actions, provide smart defaults.
6. **Recognition Rather Than Recall** — make options and actions visible. Don't force users to remember across screens.
7. **Flexibility and Efficiency of Use** — provide accelerators for experts (keyboard shortcuts, bulk actions) without burdening novices.
8. **Aesthetic and Minimalist Design** — every extra element competes with relevant information. Remove anything irrelevant or rarely needed.
9. **Help Users Recognize and Recover from Errors** — plain language, precise problem description, constructive suggestion.
10. **Help and Documentation** — task-focused, searchable, concrete steps. The system should be usable without it.

---

## Interaction Patterns

- **Navigation** — tab bars, breadcrumbs, sidebars. Trade off discoverability vs. screen real estate.
- **Input** — reduce input effort, prevent errors. Use smart defaults, autocomplete, inline validation.
- **Content** — cards, lists, grids, master-detail. Choose based on content density and type.
- **Feedback** — toasts, inline validation, skeleton screens, progress indicators. Supports heuristic #1.
- **Progressive Disclosure** — show only what's needed at each step. Reveal complexity gradually.

---

## Applying to This Project

- The upload → parse → review → confirm flow should follow a clear conceptual model with visible system status at each stage.
- The two-column review layout uses proximity and common region to group the report with its highlights, and terms with their actions.
- Color encodes term status: amber (pending), green (accepted), red (rejected), blue (manually added).
- Correction badges (whitespace fix, AI-resolved) provide transparency about system behavior (heuristic #1).
- Accept/reject buttons on each term card provide user control and freedom (heuristic #3).
- Bulk accept/reject provides efficiency for expert users (heuristic #7).
- The "Add Term" popover on text selection uses recognition over recall (heuristic #6).
- Frequency bars use size and color to encode severity, following Gestalt similarity and visual hierarchy.

---

*Based on Stanford CS147 course principles. References: Norman's "Design of Everyday Things," Nielsen's 10 Heuristics, Gestalt psychology, Shneiderman's Golden Rules.*
