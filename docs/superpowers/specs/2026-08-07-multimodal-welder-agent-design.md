# Design: Multimodal Reasoning Agent for the Vulcan OmniPro 220

**Date:** 2026-08-07 · **Status:** Approved for implementation (autonomous build)

## Goal

A locally-runnable, multimodal expert assistant for the Vulcan OmniPro 220 multiprocess welder, built on the **Claude Agent SDK**, that:

1. Answers deep technical questions accurately, grounded in the 48-page owner's manual, quick-start guide, and process selection chart — with page citations.
2. Responds **multimodally**: surfaces the actual manual figures, draws diagrams, and generates interactive artifacts (calculators, configurators, flowcharts) rendered in-app, Claude-Artifacts-style.
3. Speaks to a garage DIYer: capable, friendly, safety-conscious, never condescending.
4. Runs in <2 minutes from clone: `cp .env.example .env && npm install && npm run dev`.

## Approaches considered

- **A. Raw PDF in context every turn** — simplest, but ~50 vision-heavy pages per request is slow/expensive, and the agent can't *surface* images to the UI (PDF pages aren't addressable assets). Rejected.
- **B. RAG with embeddings** — overkill for a 48-page corpus; adds an indexing dependency and setup time; retrieval failures hurt accuracy on cross-referencing questions. Rejected.
- **C. Curated knowledge base + pre-extracted figure assets + agent tools (chosen)** — the manual is small enough to convert into hand-verified, page-cited markdown + structured JSON once, at build time. Every figure/page becomes a real image asset the agent can surface by ID. Tools stay cheap and deterministic; accuracy is auditable; the agent still has a `read_manual_page` escape hatch to look at the original page image when a question demands the primary source.

## Architecture

```
browser ── Vite/React chat UI (streaming SSE)
   │            ├─ markdown renderer
   │            ├─ FigureCard (manual images w/ captions + page refs)
   │            └─ ArtifactFrame (sandboxed iframe: React/HTML/SVG artifacts)
   ▼
Express server (server/)
   └─ /api/chat → Claude Agent SDK query()
        ├─ system prompt: role, tone, response protocol, figure catalog, KB map
        ├─ MCP tools (in-process):
        │    search_manual(query)      → ranked KB sections w/ page cites
        │    read_manual_page(page)    → original page image (vision escape hatch)
        │    show_figure(id, caption)  → emits figure directive → UI renders image
        │    get_specs(topic)          → exact structured data (duty cycle, polarity…)
        │    calculate_duty_cycle(...) → validated native calculator card
        │    select_process(...)       → chart-grounded native decision card
        └─ session resume per conversation id
data/
   ├─ knowledge/*.md   (hand-verified, page-cited)
   ├─ specs.json       (exact numbers for widgets + get_specs)
   └─ figures.json     (figure catalog: id, file, source, page, title)
web/public/manual/     (all page renders + figure crops)
```

## Multimodal response system

Four tiers, in order of preference for a given answer:

1. **Manual figures** (`show_figure`) — when the answer relates to a real image in the manual (polarity hookups, wire-feed mechanism, weld diagnosis photos, selection chart, wiring schematic). Ground truth beats a redrawing.
2. **Trusted native widgets** — typed server-validated duty-cycle and process-selection events rendered by the application.
3. **Generated artifacts** — fenced blocks (```artifact:react / artifact:svg / artifact:html) streamed in the reply, rendered client-side in a sandboxed iframe. Used for novel troubleshooting flowcharts and custom diagrams, never as the source of exact machine values.
4. **Inline SVG/markdown** for simple visual aids.

Exact numbers inside artifacts must come from tool results (specs.json), never invented — enforced via system prompt + get_specs tool.

## Knowledge extraction

- All 51 PDF pages rendered to PNG at build time (committed; evaluators never rerun extraction).
- 29 curated figure crops with metadata (id, title, source, page) in figures.json.
- knowledge/*.md authored from a full manual read, organized by task (setup-mig-flux, polarity-and-cables, duty-cycle, weld-diagnosis, troubleshooting, tig, stick, controls-ui, specs, selection-chart, safety, parts, maintenance). Every fact carries its page number.
- specs.json holds the tables machines: duty cycles (3 processes × 2 voltages), current ranges, wire/tensioner settings, polarity map, gas settings. Powers both get_specs and generated calculators.
- Known gap handled honestly: the manual does not publish a full WFS/voltage matrix per material thickness (the machine's synergic mode computes it; the door chart shows menu flows). The settings advisor therefore reports the manual's auto-set procedure + ranges, and labels rule-of-thumb starting points as guidance, not manual data.

## Accuracy & clarification behavior

- System prompt mandates: search before answering technical questions; cite pages; never guess numbers; ask one targeted clarifying question when the answer depends on unstated variables (process? voltage? wire type? thickness?); safety warnings surfaced when relevant, proportionate, not preachy.
- Model: `claude-opus-5` default (env-overridable via CLAUDE_MODEL).

## Error handling

- Server: per-request try/catch → SSE error event; missing API key detected at startup with a clear message.
- UI: stream-abort recovery, error toasts, tool-call status indicators.
- Artifacts: iframe sandbox (`allow-scripts` only), render errors caught and shown inside the frame without killing the chat.

## Testing

- `npm run check`: typecheck, data/asset integrity, 25-case retrieval benchmark, and production build.
- `npm run eval`: 12-case live smoke benchmark; `npm run eval:full`: 26 cases × 3 runs.
- `npm run test:ui`: Chrome E2E assertions for figures, native widgets, evidence, citations, and generated-artifact execution.

## Out of scope (noted in README as future work)

TTS voice output, shared session/rate storage for multi-replica hosting, and multi-product generalization.
