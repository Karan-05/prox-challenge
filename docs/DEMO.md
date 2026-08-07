# Video walkthrough script (~4–5 minutes)

Before recording: run `npm run check`, start `npm run dev`, close unrelated tabs, use a 1440px-wide browser, and increase the browser zoom until text remains readable in the recording.

## 1. Cold open — 20 seconds

Show the landing page.

> “This is a multimodal reasoning agent for the Vulcan OmniPro 220, built on the Claude Agent SDK. It converts a 48-page industrial manual, quick-start card, and image-only process chart into verifiable answers, original diagrams, and trusted interactive tools.”

Point out the visible 51-page / 29-figure / tool-verified coverage indicators.

## 2. Exact fact + trusted widget — 50 seconds

Click “What’s the duty cycle for MIG welding at 200A on 240V?”

Show:

- The native card’s `Tool-verified` badge.
- 25%, 2:30 weld, 7:30 rest.
- The amperage slider and explicit handling of unpublished intermediate values.
- The original p.19 duty-cycle chart.
- Click a citation, then expand “sources checked.”

> “The model does not write this calculator. A typed MCP tool validates the inputs against structured manual data and sends a native UI event. Generated code cannot alter the answer.”

## 3. Cross-reference + visual diagnosis — 45 seconds

Ask: “I’m getting porosity in my flux-cored welds. What should I check?”

Call out the connection between the p.37 defect example, DCEN polarity, contact-tip distance, clean metal, and the pp.42–43 troubleshooting matrix. Zoom the original defect figure.

## 4. Image-only reasoning — 35 seconds

Ask: “Which process should I use for 16-gauge steel indoors? I want the easiest clean result.”

Show the process decision card and original selection chart.

> “The source chart is image-only. Its decision matrix was hand-verified into searchable knowledge and a typed comparison tool.”

## 5. Photo input — 35 seconds

Upload a representative bead/defect image. Show the model describing only visible features, matching the manual pattern, surfacing the comparison figure, and asking for process/settings when needed.

## 6. Honesty and safety — 30 seconds

Ask either:

- “Give me the exact WFS for 1/8-inch aluminum with the spool gun.”
- “Can I TIG aluminum?”

Show that the assistant refuses to invent unpublished numbers and corrects the AC/DC limitation.

## 7. Generated artifact — 30 seconds

Ask: “Build me a clickable troubleshooting flowchart for an unstable MIG arc.”

Interact with it and point to the `Ready` runtime state.

> “Novel visuals can still be model-generated, but they run in a constrained iframe with CSP, no outbound fetch, a readiness handshake, and visible error reporting.”

## 8. Evaluation + architecture — 45 seconds

Show a terminal with `npm run check`, then briefly open:

- `server/agent.ts`: six bounded manual tools.
- `server/widgets.ts`: deterministic calculations.
- `data/knowledge/` and `data/specs.json`.
- `scripts/eval.ts`: exact figure/widget/evidence assertions.

State the recorded results accurately: 51 assets/pages validated, retrieval at 100% recall@4 / 0.900 MRR, the current live smoke-suite result, and successful browser verification for TIG, duty cycle, and generated artifacts.

Close with:

> “The core design choice is evidence over theater: one bounded agent, trusted domain tools for exact answers, original sources in the UI, and a benchmark that checks what the user actually sees.”

## Recording checklist

- No API keys, `.env`, browser secrets, notifications, or personal tabs visible.
- Show at least one citation being opened.
- Interact with both a native widget and generated artifact.
- Keep terminal/code footage under 45 seconds total.
- Add repository and hosted-demo links in the video description.
