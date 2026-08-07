# Duty Cycle (Duration of Use) — manual pp.19 (wire) and 29 (TIG/Stick), plus p.7

**Definition:** duty cycle is the number of minutes, within a **10-minute period**, that the welder can produce a given welding current without overheating. Example from the manual: a 40% duty cycle at 100A means 4 minutes of welding, then at least 6 minutes of rest, per 10-minute window. [p.19]

## Full duty-cycle matrix

| Process | Voltage | Rated duty cycle | Welding / resting per 10 min | 100% continuous use at |
|---|---|---|---|---|
| MIG/Flux | 120VAC | 40% @ 100A | 4 min / 6 min | 75A |
| MIG/Flux | 240VAC | **25% @ 200A** | 2½ min / 7½ min | 115A |
| TIG | 120VAC | 40% @ 125A | 4 min / 6 min | 90A |
| TIG | 240VAC | 30% @ 175A | 3 min / 7 min | 105A |
| Stick | 120VAC | 40% @ 80A | 4 min / 6 min | 60A |
| Stick | 240VAC | 25% @ 175A | 2½ min / 7½ min | 100A |

Sources: p.7 (specifications), p.19 (MIG duty-cycle clocks), p.29 (TIG and Stick duty-cycle clocks), p.23 ("FOLLOW DUTY CYCLE!" reminder).

Direct answer for a common question: **MIG at 200A on 240V input → 25% duty cycle** (2½ minutes welding, 7½ minutes resting per 10 minutes). At or below 115A on 240V, MIG can run continuously (100%).

Note: the manual publishes duty cycle at these rated points and the 100%-continuous currents. It does not publish a per-amp curve between them — for intermediate amperages, treat the next-higher published point as the conservative limit.

## Thermal protection behavior [pp.19, 23, 29, 43]
- Exceeding duty cycle over-stresses the power-generation system and shortens welder life.
- The welder has an internal thermal protection system: on overheat it **automatically shuts down** and a warning screen appears on the LCD (problems listed: Duty Cycle Exceeded / Low Voltage Input / High Voltage Input). It automatically returns to service after cooling off.
- If it happens: rest the MIG gun / TIG torch / electrode holder on an electrically non-conductive, heat-proof surface (e.g. a concrete slab) well clear of the ground clamp, and **leave the Power Switch ON while cooling** so the internal fan keeps running.
- After normal operation resumes, use shorter welding periods and longer rests.
