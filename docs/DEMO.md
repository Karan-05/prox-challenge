# Video walkthrough — suggested script (~4 min)

A recording checklist for the demo video. Run `npm run dev`, open http://localhost:5173, record the browser + a few seconds of code.

1. **Cold open (20s).** Landing page. "This is a multimodal reasoning agent for the Vulcan OmniPro 220 welder, built on the Claude Agent SDK. Everything it says is grounded in the 48-page owner's manual with page citations."
2. **Hard fact (45s).** Click *"What's the duty cycle for MIG welding at 200A on 240V?"* Point out: exact answer (25%, 2½/7½), the manual's own duty-cycle chart appearing mid-answer, then the generated interactive calculator. Drag the slider across 115A to show the 100%-continuous zone.
3. **Cross-referencing (45s).** Ask the porosity question. Point out it connects the troubleshooting matrix (p.43), the polarity rule (DCEN for flux-core), and the weld-diagnosis photos (p.37) — three different manual sections.
4. **Visual grounding (30s).** TIG polarity question → real hookup diagram from p.24 surfaces; click to zoom. "The agent picks from 29 pre-extracted figures; a tool call streams the image into the chat at the exact point of the answer."
5. **Image-only knowledge (30s).** *"Which process should I use for 16-gauge sheet metal?"* — the selection chart exists only as an image in the source PDFs; the agent reasons over its transcription and can surface the chart itself.
6. **Ambiguity + honesty (30s).** *"What settings should I use for welding steel?"* — it asks one targeted clarifying question / explains the synergic Auto Weld procedure and labels rules of thumb as guidance, because the manual genuinely doesn't publish a settings matrix.
7. **Multi-turn (20s).** Follow up with *"and for stick welding?"* — context carries.
8. **Architecture flash (40s).** Show `server/agent.ts` (4 tools), `data/knowledge/` (page-cited files), `data/specs.json`. "Curated extraction over RAG: auditable accuracy, addressable figures, exact numbers. `npm run eval` — 6/6."
