# Parts List, Assembly Diagram, Wiring Schematic (manual pp.45–47)

Manufacturer's disclaimer (p.46): the parts list/diagram is a **reference tool only** — repairs and part replacement should be done by certified, licensed technicians; the buyer assumes all risk of self-repair. Some listed parts are illustration-only and not sold individually; parts may not be interchangeable. **Specify UPC 193175422590 when ordering.** Record the product's date code (or purchase month/year).

## Parts list (p.46)
| # | Part | Qty | | # | Part | Qty |
|---|---|---|---|---|---|---|
| 1 | Right Cover | 1 | | 32 | Polarity Cable | 1 |
| 2 | Handle Base | 1 | | 33 | Output Inductor | 1 |
| 3 | Handle Cover | 1 | | 34 | Air Connector | 2 |
| 4 | Hinge-Right | 2 | | 35 | Solenoid Valve | 2 |
| 5 | Hinge-Left | 2 | | 36 | Bottom Housing | 1 |
| 6 | Left Cover | 1 | | 37 | Board Insulation Paper | 1 |
| 7 | Latch | 1 | | 38 | Main PCB | 1 |
| 8 | Middle Bracket | 1 | | 39 | Control PCB | 1 |
| 9 | PFC Inductance | 1 | | 40 | Fast Recovery Diode | 6 |
| 10 | Spool | 1 | | 41 | Metal Case Air Way | 1 |
| 11 | Remote Control PCB | 1 | | 42 | Rectifier Radiator Support Bar | 1 |
| 12 | Wire Feeder | 1 | | 43 | Rectifier Radiator | 1 |
| 13 | Aviation Plug Wire | 1 | | 44 | Fan | 1 |
| 14 | Miller Plug Connector | 1 | | 45 | Transformer | 1 |
| 15 | Protective Cover | 1 | | 46 | IGBT | 6 |
| 16 | Display PCB | 1 | | 47 | Bridge Rectifier Heatsink | 1 |
| 17 | Screen Cover | 1 | | 48 | Fast Recovery Diode | 2 |
| 18 | Screen Frame | 1 | | 49 | IGBT Heat Sink Support Bar | 1 |
| 19 | MIG Welding Torch | 1 | | 50 | IGBT Radiator | 1 |
| 20 | Front Handle Cover | 1 | | 51 | Bridge Rectifiers | 2 |
| 21 | Front Panel | 1 | | 52 | IGBT Radiator | 2 |
| 22 | Display | 1 | | 53 | Fan | 1 |
| 23 | Knob | 2 | | 54 | Y-Type Threaded Tee | 1 |
| 24 | Knob | 1 | | 55 | 120 VAC Power Cord | 1 |
| 25 | Storage Door | 1 | | 56 | Rear Panel | 1 |
| 26 | Switch | 1 | | 57 | Rear Handle Cover | 1 |
| 27 | American Air Fitting | 2 | | 58 | American Power Socket | 1 |
| 28 | Air Connector | 3 | | 59 | Overload Protector | 1 |
| 29 | Quick Connector | 2 | | 60 | Rear Panel | 1 |
| 30 | Grounding Clamp Assembly | 1 | | 61 | 240 VAC Power Cord | 1 |
| 31 | Welding Clamp Assembly | 1 | | | | |

The **assembly diagram** (p.47) is an exploded view keying these numbers to locations — surface figure `assembly-diagram` when discussing part locations. The **Overload Protector (59)** is the Reset Button on the rear panel referenced by troubleshooting.

## Wiring schematic (p.45) — high-level reading
Power path: K1 AC input (120–240V, 50/60Hz) → EMI filtering → **bridge rectifiers** → **PFC (power factor correction) stage with IGBTs** → high-frequency **inverter (IGBT bank)** → main **transformer** → output rectification (**fast recovery diodes**) → output inductor → **OUT+ / OUT−** terminals.
Control: **MCU BOARD** ties to the **LCD SCREEN**, drives relays, reads the **fast wire feed switch** (cold wire feed), and controls two **solenoid valves** (gas), the **wire feeder motor (M)**, and connects to the **REMOTE BOARD** with two **aviation plugs** (foot pedal / wire-feed control sockets). Two **fans** (FAN, FAN2) cool the power stage.
For exact component-level questions, surface the `wiring-schematic` figure — the schematic is dense and best read visually.
