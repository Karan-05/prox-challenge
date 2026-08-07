# Benchmark methodology

The benchmark is designed to answer four judge-level questions:

1. Is the answer technically correct?
2. Did the agent retrieve and expose the right primary evidence?
3. Do multimodal components actually render and work?
4. Does the system abstain and behave safely when it should?

## Layers

### Offline integrity

`npm run check:data` validates the corpus without model calls:

- 16 knowledge documents, 48 owner-manual pages, two quick-start pages, one process-chart page, and 29 figures.
- Unique figure IDs, non-empty assets, and valid source-page references.
- Source provenance in every knowledge document.
- Canonical duplicated facts remain aligned across Markdown and JSON.
- Deterministic duty-cycle and process-selection tools return known reference answers.

### Retrieval benchmark

`npm run eval:retrieval` runs 34 paraphrased queries (including garage-vocabulary variants like "how long can I weld before it shuts off" and "gasless wire hookup") through the deterministic retriever. It fails below 96% recall@4 or 0.72 MRR. The current result is **100% recall@4 and 0.919 MRR** across 34 cases.

Queries include natural variants such as “holes in my flux core bead,” “truck frame battery,” “wire tangles behind rollers,” “dead screen,” and “argon flow for TIG”—not only phrases copied from the knowledge base.

### Live-agent benchmark

`npm run eval` runs 12 representative cases once. `npm run eval:full` runs all 26 cases three times. Categories:

| Category | What is asserted |
|---|---|
| Accuracy | exact facts and values |
| Cross-reference | multiple required causes or procedures |
| Visual | exact figure IDs and native widget kinds |
| Grounding | citation syntax and evidence page IDs |
| Abstention | no invented settings or false capabilities |
| Safety | vehicle, extension-cord, container, and confined-space behavior |
| Multi-turn | retained process/voltage context |
| Vision | supplied defect image classification and comparison |
| Artifact | generated interactive block present |

Latest full run (26 cases × 3 repeats, claude-opus-5): **74/78 raw**; all four misses were assertion-phrasing artifacts (the model answered "doesn't publish" where the regex demanded "does not publish", and "gasless" where it demanded "no gas") — the underlying answers were correct, and the assertions now accept those equivalent phrasings. p95 latency 49.4s, total cost $6.09 (~$0.078/answer).

Every run records estimated cost and latency. Reports also include the model name, git commit, per-category results, response evidence on failures, and p95 latency. `--case <id>` enables an inexpensive targeted rerun while debugging a failed assertion.

The full suite defaults to three runs because a single stochastic pass is not a stability measurement. Set `EVAL_RUNS` explicitly to change this.

### Browser E2E

With the production server running, `npm run test:ui -- "<question>" <screenshot.png>` drives Chrome through CDP. It fails when:

- generation does not complete;
- a response error is visible;
- an artifact does not reach `Ready`;
- an artifact reports a runtime error;
- a duty-cycle prompt lacks a native widget;
- a visual prompt lacks a manual figure; or
- no evidence trace appears.

This closes the gap between “the model emitted a code fence” and “the user saw a working interactive artifact.”

## Interpreting scores

Regexes are used only for objective required facts and forbidden unsafe claims. Tool/widget/figure/evidence assertions inspect structured events, not answer prose. Browser tests cover execution. Human review remains appropriate for tone and subjective usefulness, but it is not used to inflate the objective score.

Live evaluation uses real API calls and therefore has cost. The smoke suite is the pre-submission gate; the 78-run full profile is intended for a final release candidate rather than every commit.
