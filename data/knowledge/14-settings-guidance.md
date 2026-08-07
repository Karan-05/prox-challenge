# Settings Guidance — what the manual specifies vs. rules of thumb

## What the machine/manual actually provides
- The OmniPro 220 is **synergic**: on the LCD you pick process → wire/rod/electrode diameter → material thickness, and **Auto Weld Settings** presets wire feed speed/voltage (MIG/Flux) or amperage (TIG/Stick). [p.20, 30, 32]
- If you adjust WFS or voltage manually, **a white mark on the settings line shows the recommended value** for your wire diameter and thickness. [p.20]
- The **Settings Chart inside the welder door** (also referenced on top of the welder for tungsten sizes) gives gas type, SCFH flow, and tungsten sizing. [pp.14, 21, 26, 30]
- Published ranges (p.7): MIG 30–140A (120V) / 30–220A (240V) · TIG 10–125A / 10–175A · Stick 10–80A / 10–175A · wire speed 50–500 IPM.
- Gas flow: MIG **20–30 SCFH**; TIG **10–25 SCFH** (100% Argon). [pp.20, 30]
- Wire sizes: solid 0.025/0.030/0.035"; flux-cored 0.030/0.035/0.045". [p.7]
- Selection-chart thickness envelopes: MIG 22 ga–3/8"; flux-cored 18 ga–5/16"; stick 10 ga–1/2"; TIG 24 ga–3/16".

## The honest gap
The manual does **not** print a full numeric matrix of WFS/voltage/amperage per material thickness — that mapping lives in the machine's firmware (Auto Weld) and on the door chart. When asked "what settings for X thickness":
1. Give the manual-backed procedure: select process, set actual wire diameter and thickness, start from Auto Weld's preset.
2. Then, clearly labeled as **general welding guidance, not OmniPro manual data**, offer starting points, e.g.:
   - Amperage rule of thumb for steel: ≈1 A per 0.001" of thickness (e.g. 1/8" ≈ 125A).
   - Common wire choices: 0.030" solid for 24 ga–1/8"; 0.035" solid or flux-cored for 1/8"+.
   - Stick electrodes: 1/16"–3/32" for thin work at lower amps; 1/8" for 1/4"+ at higher amps; the machine offers 60xx/70xx classes (p.32).
3. Always finish with the manual's own loop: test-weld on scrap of the same thickness, inspect against the weld-diagnosis diagrams (pp.35–40), adjust one variable at a time, and respect the duty cycle.

## Tuning cheat sheet (manual-backed)
| Want | Do (MIG/Flux) | Source |
|---|---|---|
| More penetration / hotter | ↑ current, ↓ travel speed, ↑ WFS, ↓ CTWD | p.35 |
| Less penetration / cooler (thin metal) | ↓ current, ↑ travel speed, ↓ WFS, ↑ CTWD | p.35 |
| Flatter bead, more fluid puddle | ↑ Inductance | p.21 |
| Colder puddle | ↓ Inductance | p.21 |
| Easier arc starts (wire) | Run-In WFS (% of preset before contact) | p.21 |
| Easier arc starts (stick) | Hot Start ↑ | p.33 |
| Stick penetration/smoothness | Arc Force | p.33 |
| Spot welds | Spot Timer | p.21 |
