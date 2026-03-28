# Practical Design Skills for Project Mastery

## What This Document Is

This is a distilled summary of the **creative and execution-oriented** design skills taught in Stanford's CS147 (Introduction to Human-Computer Interaction Design), taught by Prof. James Landay.
---

## 1. Ideation & Concept Development: How to move from a fuzzy problem space to concrete, creative solution directions?

### Key Techniques

- **"How Might We" (HMW) Reframing:** Taking a user's pain point and reframing it as an open-ended design question. For example, "Users forget to take medication" becomes "How might we make medication-taking feel like a natural part of a daily ritual?" This is not just brainstorming -- it's a disciplined way to set the scope of your creative exploration. A good HMW is neither too broad (so it's meaningless) nor too narrow (so it pre-determines the solution).

- **Point of View (POV) Statements:** A structured sentence that captures *who* your user is, *what* their need is, and *why* (the insight). Format: "[User] needs [need] because [surprising insight]." The "because" clause is the hard part -- it should be a genuinely non-obvious insight, not a restatement of the need. The POV acts as a creative constraint that keeps your ideation grounded.

- **Divergent and Convergent Thinking:** The course teaches these as distinct, alternating phases. During divergent phases (brainstorming), you generate as many ideas as possible without judgment. During convergent phases, you select and refine. The key rule: never do both at the same time. Brainstorming sessions should defer judgment, encourage wild ideas, build on others' ideas, and aim for quantity. Then you converge by clustering, voting, and selecting.

- **Experience Prototyping:** Before building anything, you physically simulate the experience your design would create. For instance, if designing a navigation app, you might have a friend give you verbal turn-by-turn directions while you walk blindfolded. The point is to test your *assumptions about the need itself* before investing in any interface work.

### What to showcase in a project:
Show that your design concept emerged from a clear POV/HMW, not from "I thought it would be cool." Document the ideation funnel: many ideas narrowed to a few, with reasoning for why you converged on your chosen direction.

---

## 2. Visual Information Design

**What the course teaches:** How to make interfaces that communicate clearly through visual structure, not decoration.

### Gestalt Principles of Perception

These are psychological principles describing how humans naturally group and interpret visual elements. The course covers them as foundational tools for layout:

- **Proximity:** Elements placed close together are perceived as belonging to the same group. This is your primary tool for showing relationships -- more powerful than boxes or borders.
- **Similarity:** Elements that look alike (same color, shape, size, font) are perceived as related. Use this to create consistent "types" of content.
- **Continuity:** The eye follows smooth lines and curves. Alignment creates visual flow and implied connections.
- **Closure:** The brain fills in gaps to see complete shapes. You can imply boundaries without drawing them.
- **Figure/Ground:** The brain separates foreground elements from background. Manipulate this for focus and layering (e.g., modal overlays, card-based layouts).
- **Common Region:** Elements within the same bounded area are grouped together (the principle behind cards, panels, sections).

### Visual Hierarchy

The course teaches that every screen should have a clear reading order. The tools for establishing hierarchy include:

- **Size:** Larger elements are read first.
- **Color and Contrast:** High-contrast elements draw attention. Use sparingly for emphasis.
- **Position:** Top-left (in LTR cultures) gets scanned first. Important content goes where eyes naturally land.
- **Typography:** Font weight, size, and style create levels of importance. A good design typically uses 2-3 levels of typographic hierarchy max.
- **Whitespace:** Empty space is not wasted space. It creates breathing room, separates groups, and directs focus. The course emphasizes that whitespace is an active design element.

### Color

- Use color purposefully, not decoratively. Color should encode meaning (red for errors, green for success) and create visual grouping.
- Limit your palette. The course teaches restraint -- a few well-chosen colors create more professional results than a rainbow.
- Always ensure sufficient contrast for readability (relates to accessibility).

### Typography

- Choose typefaces that match the tone and context of your design.
- Establish a clear type scale (a set of predefined sizes that relate to each other proportionally).
- Line length, line height (leading), and letter spacing all affect readability and should be intentional, not default.

### What to showcase in a project:
Demonstrate that your visual design decisions are principled, not arbitrary. Annotate your designs: "I used proximity to group these related controls" or "The primary action button uses high contrast to establish hierarchy." Show a clear type scale and color palette with rationale.

---

## 3. Conceptual Models & Interface Metaphors

**What the course teaches:** How users build mental models of how a system works, and how to design interfaces that support accurate mental models.

### Core Concepts (from Don Norman)

- **Conceptual Model:** The user's understanding of how a system works. This is NOT the actual implementation -- it's the story the user tells themselves. A good design makes the conceptual model obvious; a bad one forces users to guess.

- **Affordances:** Properties of an object that suggest how it can be used. A button affords pressing. A slider affords dragging. In digital design, affordances are largely visual cues (shadows suggesting clickability, handles suggesting draggability).

- **Signifiers:** Visible indicators that communicate *where* and *how* to act. Affordances are about what's possible; signifiers are about what's communicated. A door handle is a signifier -- its shape tells you whether to push or pull. In UI: underlined blue text signifies "clickable link."

- **Mapping:** The relationship between controls and their effects. Good mapping is natural and spatial -- a volume slider that goes up to increase volume, a set of controls arranged to match the layout of what they affect. Bad mapping forces memorization.

- **Feedback:** Every action should produce an immediate, visible (or audible) response. The user must always know: Did my action register? What happened? What state is the system in now? The course emphasizes that lack of feedback is one of the most common and frustrating usability failures.

- **Constraints:** Limiting the possible actions to prevent errors. Physical constraints (a USB plug only fits one way), logical constraints (graying out unavailable options), and cultural constraints (red means stop).

### Interface Metaphors

Metaphors map a familiar domain onto an unfamiliar one. The classic example: the desktop metaphor (files, folders, trash can). The course teaches that metaphors are powerful but dangerous -- they help users get started, but break down when the digital system diverges from the physical analog. Design with awareness of where your metaphor helps and where it misleads.

### What to showcase in a project:
Show that your interface has a coherent conceptual model. Can a new user look at it and understand what they can do and how things relate? Annotate your design decisions in terms of affordances, signifiers, mapping, and feedback. Show that you've thought about where your metaphors work and where they might confuse.

---

## 4. Prototyping Across Fidelity Levels

**What the course teaches:** How to use prototypes strategically at each stage of design, matching fidelity to your current design question.

### The Fidelity Spectrum

The course walks through a deliberate progression, and each level has a distinct purpose:

**Sketching (Lowest Fidelity)**
- Quick, rough, disposable drawings. The course stresses that sketches should be *intentionally rough* so that people critique the idea rather than the execution.
- Key properties: timely (fast to make), inexpensive (easy to throw away), plentiful (make many alternatives), clear vocabulary (everyone understands them), minimal resolution (no more detail than needed).
- Purpose: Explore the solution space broadly. Generate 5-10 wildly different approaches before committing to one.

**Paper Prototyping (Low Fidelity)**
- Physical paper mockups of screens that a human "computer" operates in response to a test user's actions. The test user taps on paper buttons; a team member swaps in the next screen.
- Purpose: Test information architecture, navigation flow, and core task completion *before writing any code*. You're testing whether the structure makes sense, not whether it looks good.
- The course specifically teaches the Wizard of Oz technique here: simulating system behavior that doesn't exist yet.

**Concept Video**
- A short video (under 2 minutes) showing a person using your proposed solution in context. Not a demo of the interface -- a story of the *experience*.
- Purpose: Communicate the overall vision and emotional arc of using your product. Forces you to think about the full user journey, not just individual screens.
- Storyboarding comes first: plan each scene, the narrative, transitions, and what you're trying to communicate.

**Medium-Fidelity Prototype (Interactive Wireframes)**
- Clickable/tappable wireframes, typically in tools like Figma, that simulate real navigation and interaction flow. Still limited in visual polish.
- Purpose: Test interaction patterns, transitions between states, and whether the user can complete core tasks through the interface.

**High-Fidelity Prototype**
- Near-final visual design with real (or realistic) content, proper typography, color, and micro-interactions. May be built in code or a design tool.
- Purpose: Test the full experience including visual design, readability, emotional tone, and detailed interactions. This is where visual design principles (Section 2) get applied and evaluated.

### The Critical Lesson

The course's big message about prototyping is: **the right fidelity depends on what question you're trying to answer.** Don't jump to hi-fi too soon. Each fidelity level filters out different categories of problems:

| Fidelity Level | What It Tests |
|---|---|
| Sketches | Is this the right concept? |
| Paper prototype | Does the structure/flow work? |
| Concept video | Does the overall experience make sense? |
| Medium-fi | Do the interactions work? |
| Hi-fi | Does the full design feel right? |

### What to showcase in a project:
Show evidence of working across fidelity levels. Even if your final deliverable is hi-fi, include earlier sketches and lo-fi explorations to demonstrate that you iterated, not just executed. Show how feedback at lower fidelities changed your direction.

---

## 5. Heuristic Evaluation (Nielsen's 10 Heuristics)

**What the course teaches:** A structured, expert-driven method for identifying usability problems in an interface without needing test users.

### The 10 Heuristics

These are not vague guidelines -- they're specific lenses to evaluate an interface through:

1. **Visibility of System Status:** The system should always keep users informed about what's going on through appropriate feedback within reasonable time. (Loading indicators, progress bars, confirmation messages, active state on navigation.)

2. **Match Between System and Real World:** Use language, concepts, and conventions familiar to the user, not system-oriented jargon. Follow real-world conventions and present information in a natural, logical order.

3. **User Control and Freedom:** Users often make mistakes. Provide clearly marked "emergency exits" -- undo, cancel, back. Don't trap users in flows they can't escape.

4. **Consistency and Standards:** The same word, icon, or action should mean the same thing throughout your product. Also follow platform conventions (iOS patterns on iOS, Material Design on Android, etc.).

5. **Error Prevention:** Even better than good error messages is design that prevents errors from occurring in the first place. Disable impossible actions, use confirmation dialogs for destructive actions, provide smart defaults.

6. **Recognition Rather Than Recall:** Make information, options, and actions visible. Don't make users remember things from one screen to the next. Menus, tooltips, and visible labels reduce cognitive load.

7. **Flexibility and Efficiency of Use:** Provide accelerators (keyboard shortcuts, gestures, saved preferences) that speed up interaction for expert users without burdening novice users.

8. **Aesthetic and Minimalist Design:** Every extra piece of information competes with relevant information and diminishes its visibility. Interfaces should not contain information that is irrelevant or rarely needed.

9. **Help Users Recognize, Diagnose, and Recover from Errors:** Error messages should be in plain language (not codes), precisely indicate the problem, and constructively suggest a solution.

10. **Help and Documentation:** Even though it's better if the system can be used without documentation, it may be necessary to provide help. Any such information should be easy to search, focused on the user's task, list concrete steps, and not be too large.

### How to Apply Them

The course teaches a specific evaluation process: multiple evaluators independently walk through the interface applying each heuristic, rate the severity of each issue found (frequency, impact, persistence), then combine findings. Severity rating scale: 0 (not a problem) to 4 (usability catastrophe that must be fixed).

### What to showcase in a project:
Demonstrate that you've applied heuristic evaluation to your own design. Show specific violations you found and how you fixed them. Even better: show a before/after where a heuristic evaluation led to meaningful design changes.

---

## 6. Design Patterns & Interaction Conventions

**What the course teaches:** Reusable solutions to common UI problems that users already understand.

### Core Patterns Covered

- **Navigation patterns:** Tab bars, hamburger menus, breadcrumbs, sidebars. Each has trade-offs in discoverability vs. screen real estate.
- **Input patterns:** Forms, steppers, toggles, date pickers, search with autocomplete. The course emphasizes reducing input effort and preventing errors.
- **Content patterns:** Cards, lists, grids, master-detail layouts. Choosing the right pattern depends on the density and type of content.
- **Feedback patterns:** Toasts, snackbars, inline validation, skeleton screens, progress indicators. These directly support Nielsen's Heuristic #1.
- **Onboarding patterns:** Progressive disclosure, empty states as tutorials, contextual tips. Getting users to their first success quickly.

### The Principle Behind Patterns

Design patterns work because they leverage *existing user knowledge*. When you use a familiar pattern, you reduce cognitive load. When you invent a new interaction, you create a learning burden. The course teaches that novelty should be reserved for your core value proposition -- everything else should be conventional.

### What to showcase in a project:
Show deliberate pattern selection. Where you used a standard pattern, explain why it was the right fit. If you deviated from convention, explain the user benefit that justified the learning cost.

---

## 7. Usability Testing & Iterative Refinement

**What the course teaches:** How to observe real users interacting with your prototype and use those observations to improve your design.

### Key Techniques (execution-focused)

- **Think-Aloud Protocol:** Ask users to narrate their thought process as they use your prototype. This reveals the gap between what you designed and what they perceive.
- **Task-Based Testing:** Give users specific, realistic tasks ("Find a recipe for chicken soup and save it to your favorites") rather than open-ended exploration. Measure: Can they complete it? How long does it take? Where do they get stuck?
- **Severity Rating of Findings:** Not all usability problems are equal. Rate each finding by frequency (how many users encountered it), impact (how badly it affected task completion), and persistence (is it a one-time learning issue or a recurring frustration).
- **Iterative Testing:** The course emphasizes testing early and often with small numbers (3-5 users per round), making changes, and testing again. This is more effective than one large study at the end.

### What to showcase in a project:
Show at least one round of user testing with real findings. Demonstrate the iteration loop: what you tested, what you found, and specifically how it changed your design. Before-and-after comparisons of specific screens or flows are powerful evidence of design maturity.

---

## 8. Putting It All Together: What a Mastery-Level Project Looks Like

A project that demonstrates mastery of CS147's practical design skills would show:

1. **A clear, insightful problem framing** (POV/HMW) that reveals you understand the user's actual need, not just the surface-level request.

2. **Evidence of ideation breadth** -- multiple concepts explored before converging on one, with reasoning for the selection.

3. **A deliberate prototyping progression** from low to high fidelity, with each level answering specific design questions.

4. **Visual design that follows principles** -- clear hierarchy, purposeful use of color and typography, Gestalt-informed layout, consistent spacing system.

5. **A coherent conceptual model** where the interface metaphor, affordances, signifiers, mapping, and feedback all work together to make the system understandable.

6. **Heuristic compliance** -- your final design should clearly satisfy Nielsen's heuristics, and ideally you can show where earlier versions violated them and how you fixed those violations.

7. **Evidence of user-informed iteration** -- real testing with real changes, not just building what you initially imagined.

8. **Appropriate use of design patterns** -- conventional where convention serves users, innovative only where it adds genuine value.

---

## Key Readings & References the Course Draws From

- **Don Norman, "The Design of Everyday Things"** -- the conceptual models, affordances, signifiers, and feedback framework
- **Jakob Nielsen's 10 Usability Heuristics** -- the evaluation framework
- **Edward Tufte** -- information design and data visualization principles (though the visual design lecture is noted as "without Tufte," suggesting they cover the topic selectively)
- **Shneiderman's Eight Golden Rules of Interface Design** -- consistency, shortcuts, feedback, closure, error handling, reversibility, user control, reduced memory load
- **d.school Design Thinking methodology** -- the overall Empathize/Define/Ideate/Prototype/Test framework

---

*Compiled from Stanford CS147 course materials (2021-2025), lecture slides, and assignment specifications. Course taught by Prof. James A. Landay, Stanford Computer Science Department.*
