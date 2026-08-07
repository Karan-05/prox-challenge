# OmniPro Copilot

### A multimodal, evidence-first reasoning agent for a real industrial machine

[![Submission quality](https://github.com/Karan-05/prox-challenge/actions/workflows/ci.yml/badge.svg)](https://github.com/Karan-05/prox-challenge/actions/workflows/ci.yml)

OmniPro Copilot helps someone standing in their garage operate and troubleshoot a **Vulcan OmniPro 220** welder. It is grounded in the complete owner’s manual, quick-start guide, and image-only process chart; cites exact pages; surfaces the original diagrams; accepts weld photos; and renders trusted interactive tools inside the conversation.

![A tool-verified duty-cycle card beside the original manual chart](docs/screenshots/duty-cycle-artifact.png)

The screenshot is a real response. The calculator is not arbitrary model-written code: `calculate_duty_cycle` validates the inputs against `specs.json`, emits a typed UI event, and labels the result as exact, conservative, continuous, or unpublished. The manual’s p.19 chart appears beside it, citations open the original page, and the evidence drawer records which sources the agent actually used.

## Run it in under two minutes

```bash
git clone https://github.com/Karan-05/prox-challenge.git
cd prox-challenge
cp .env.example .env        # add your Anthropic API key
npm install
npm run dev                 # http://localhost:5173
```

Requirements: Node 20+ and `ANTHROPIC_API_KEY`. There is no database, embedding job, or Python runtime. For a single production-style process, use `npm start` and open `http://localhost:3001`.

Try these:

- “What’s the duty cycle for MIG at 200A on 240V?” — exact 25% result, native calculator, original chart, clickable evidence.
- “I’m getting porosity in my flux-cored welds.” — cross-references polarity, CTWD, cleanliness, gas, troubleshooting, and defect figures.
- “Which socket gets the TIG ground clamp?” — surfaces the p.24 hookup diagram and answers ground positive / torch negative.
- “Which process should I use for 16-gauge sheet steel?” — converts the image-only selection chart into a deterministic decision card.
- “Can I TIG aluminum?” — correctly refuses the premise: this machine is DC TIG only and aluminum requires MIG with the optional spool gun.
- Drop in a weld photo — visually describes the bead, compares it with the manual’s defect examples, and returns causes and corrections.
- “Build a clickable unstable-arc troubleshooting flowchart.” — generates a sandboxed custom artifact and reports whether it rendered successfully.

## What makes this more than PDF chat

### 1. Three complementary ground-truth layers

- `data/knowledge/*.md`: 16 task-oriented, human-verified knowledge files with source-page provenance.
- `data/specs.json`: exact structured values for duty cycles, ranges, polarity, gas, and feed settings.
- `web/public/manual`: all 51 source pages plus 29 addressable figure crops.

The corpus is small enough that a curated, auditable representation is more reliable than an opaque embedding index. A deterministic BM25-style retriever with a small welding synonym map handles paraphrases; `read_manual_page` remains a vision escape hatch to the primary source.

### 2. Evidence is part of the interface

Technical answers are not merely instructed to cite. Search, spec, figure, page-reading, and widget tools emit structured evidence events. The UI deduplicates them by source page, displays a source drawer, and turns citations such as `[p.19]` and `[chart p.1]` into direct links to the committed page image.

### 3. Trusted widgets and creative artifacts are separate

Exact decisions use typed, deterministic tools:

- `calculate_duty_cycle(process, voltage, amps)`
- `select_process(material, gauge, environment, priority)`

The model can still generate React, SVG, or HTML for novel visual explanations. Those artifacts run in a script-only sandbox with an explicit CSP, no outbound `connect-src`, runtime error reporting, a readiness handshake, automatic sizing, and a 12-second render watchdog. A generated artifact can enrich an answer; it cannot override trusted numerical tools.

### 4. Bidirectional multimodality

The agent sends original manual diagrams and native/generated interactive visuals out. Users can send weld-bead or machine photos in. Images are downscaled in the browser, type/size validated again on the server, and passed as image blocks through the Claude Agent SDK.

### 5. A product-grade interaction layer

The responsive UI includes workflow launchers, a multiline keyboard-aware composer, photo drag-and-drop, voice input, live agent/tool states, pinned scrolling that respects users reading earlier content, a “jump to latest” control, copyable responses, animated evidence drawers, accessible figure lightboxes, mobile-specific layouts, and reduced-motion support. The browser harness checks both landing-page viewports and real streamed agent responses.

## Architecture

```text
Browser — React chat, streaming SSE
  ├─ clickable citations + structured evidence drawer
  ├─ FigureCard: original manual images with zoom
  ├─ WidgetCard: typed duty-cycle / process-selection tools
  └─ ArtifactFrame: sandboxed generated React/SVG/HTML
       │
Express /api/chat
  ├─ rate, size, concurrency, timeout, session, and cost limits
  └─ Claude Agent SDK query()
       ├─ search_manual            deterministic BM25-style retrieval
       ├─ get_specs               exact structured source data
       ├─ calculate_duty_cycle    validated calculation + native UI event
       ├─ select_process          chart-backed decision + native UI event
       ├─ show_figure             streams primary-source evidence to the UI
       └─ read_manual_page        vision access to the original page
```

One turn is one bounded agent loop. There is no decorative “agent swarm”: the problem benefits from strong retrieval and typed tools, not orchestration theater. The SDK has no Bash/filesystem tools, loads no local Claude settings, and runs in `dontAsk` mode with only the six manual MCP tools allowlisted.

## Evaluation and scoring

The repository has three distinct quality gates:

```bash
npm run check             # free: types + data integrity + retrieval + production build
npm run eval              # paid: 12-case live smoke benchmark, one run
npm run eval:full         # paid: 26 cases × 3 runs for variance
```

Current deterministic results:

- **Data integrity:** 16 knowledge files, 51 pages, 29 figures; canonical tool outputs agree with structured source data.
- **Retrieval:** **100% recall@4, 0.919 MRR** across 34 paraphrased queries — including garage phrasing like "how long can I weld before it shuts off" and "gasless wire hookup".
- **Browser E2E:** verified real TIG, duty-cycle, and generated-artifact responses; correct figures/widgets/evidence; zero response or iframe errors.
- **Live smoke:** **12/12 passed (100%)** on the current release candidate; p95 87.2s, $1.031 total estimated cost. [Inspect the sanitized JSON report](docs/benchmark/smoke-latest.json).

The live suite covers exact facts, cross-referencing, exact figure IDs, evidence pages, native widget types, abstention, ambiguity, prompt injection, safety, multi-turn context, vision, and artifact generation. It records model, git commit, cost, latency, per-category results, and failure evidence as JSON. See [the benchmark methodology](docs/BENCHMARK.md).

## Knowledge extraction

The 48-page manual mixes prose, tables, annotated machinery diagrams, decision matrices, schematics, and weld examples. Critical material exists only in images. The one-time extraction pipeline:

1. Renders every PDF page at 150 DPI.
2. Crops and catalogs 29 judge-relevant figures.
3. Transcribes visual-only knowledge into cited task documents.
4. Separates exact repeated numbers into `specs.json`.
5. Runs integrity assertions against asset counts, page references, duplicated canonical facts, and deterministic tool outputs.

The source PDFs and all derived assets are committed. Evaluators do not rerun extraction.

One intentional limitation is treated honestly: the manual does not publish a numeric WFS/voltage-by-thickness matrix because the machine’s Auto Weld firmware computes it. The assistant gives the documented machine procedure and clearly labels general welding rules of thumb instead of presenting invented OmniPro settings.

## Reliability and security

- Server-owned opaque conversation tokens prevent clients from resuming arbitrary SDK sessions.
- Sessions expire after six hours and are bound to the originating client.
- Configurable request rate, concurrency, message, image, timeout, turn, and dollar limits.
- SSE heartbeat plus anti-buffering headers and clean disconnect aborts.
- No built-in shell or filesystem tools and no imported local settings.
- Zod validation for source catalogs and MCP inputs.
- Sandboxed artifact iframes with CSP, error bridge, readiness state, and no outbound fetch access.
- Secret-safe multi-stage Docker build running as an unprivileged user.
- CI runs typecheck, source/asset integrity, retrieval evaluation, production build, dependency audit, and Docker build.

See [SECURITY.md](docs/SECURITY.md) for the trust boundaries and deployment controls.

## Project map

```text
server/                 API, Agent SDK loop, tools, retrieval, deterministic widgets
web/src/                streaming chat, figures, citations, evidence, widgets, artifacts
data/knowledge/         16 curated source-grounded task documents
data/specs.json         exact machine-readable specifications
data/figures.json       addressable figure catalog
web/public/manual/      51 rendered pages + 29 figure crops
scripts/                integrity, retrieval, live-agent, browser, extraction harnesses
docs/                   challenge, design, benchmark, security, demo script, screenshots
files/                  untouched source PDFs
```

## Screenshots

| Landing | TIG evidence response |
|---|---|
| ![Landing](docs/screenshots/landing.png) | ![TIG polarity with original manual figure and citations](docs/screenshots/tig-figure.png) |

## Deployment

The app is one stateless-facing Node service with an in-memory single-instance session map:

- Render: connect the repository and use `render.yaml`; set `ANTHROPIC_API_KEY`.
- Fly.io: `fly launch --copy-config && fly secrets set ANTHROPIC_API_KEY=... && fly deploy`.
- Docker: `docker build -t omnipro . && docker run -p 3001:3001 -e ANTHROPIC_API_KEY=... omnipro`.

For a multi-replica production deployment, replace the in-memory session/rate stores with Redis. For this challenge’s single-instance deployment, the included implementation deliberately keeps setup below two minutes.

## Demo walkthrough

The recommended four-minute recording sequence is in [docs/DEMO.md](docs/DEMO.md): exact duty-cycle widget, porosity cross-reference, visual TIG setup, image-only process selection, honest ambiguity handling, a weld-photo diagnosis, benchmark results, then the six-tool architecture.
