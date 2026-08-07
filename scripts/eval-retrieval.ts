import { searchKnowledge } from "../server/knowledge.js";

interface RetrievalCase {
  query: string;
  expected: RegExp;
}

const CASES: RetrievalCase[] = [
  { query: "MIG 200 amps 240 volt duty cycle", expected: /Duty Cycle/ },
  { query: "holes in my flux core bead", expected: /Weld Diagnosis|Troubleshooting/ },
  { query: "which socket gets the TIG ground lead", expected: /Polarity|TIG Welding|Quick Start/ },
  { query: "welding a bracket on my truck frame battery", expected: /Wire Welding|Safety/ },
  { query: "wire tangles into a bird nest behind the rollers", expected: /Troubleshooting/ },
  { query: "which direction should the spool unwind", expected: /MIG \/ Flux-Cored Setup/ },
  { query: "drive roll tension for self shielded wire", expected: /MIG \/ Flux-Cored Setup|Troubleshooting/ },
  { query: "can this TIG aluminum", expected: /TIG Welding|Product Overview|Choosing a Welding Process/ },
  { query: "LCD is dead and machine will not turn on", expected: /Troubleshooting/ },
  { query: "where is the overload reset button", expected: /Troubleshooting|Parts List/ },
  { query: "MIG shielding gas flow rate", expected: /MIG \/ Flux-Cored Setup|Specifications/ },
  { query: "argon flow for TIG", expected: /TIG Welding|Polarity/ },
  { query: "can I use an extension cord", expected: /Safety|Specifications|Troubleshooting/ },
  { query: "is this safe with a pacemaker", expected: /Safety/ },
  { query: "how should I secure the gas cylinder", expected: /Safety|MIG \/ Flux-Cored Setup/ },
  { query: "overheated welder should I leave the fan on", expected: /Duty Cycle/ },
  { query: "how do I grind the tungsten", expected: /TIG Welding/ },
  { query: "how to strike a stick electrode", expected: /Stick Welding/ },
  { query: "contact tip distance from the work", expected: /Wire Welding|Polarity/ },
  { query: "what does increasing inductance do", expected: /Controls|Settings Guidance/ },
  { query: "stick hot start and arc force", expected: /Controls|Stick Welding|Settings Guidance/ },
  { query: "IGBT power path wiring schematic", expected: /Parts List/ },
  { query: "best process for 16 gauge sheet steel", expected: /Choosing a Welding Process/ },
  { query: "stainless wire is difficult to feed through liner", expected: /MIG \/ Flux-Cored Setup|Troubleshooting/ },
  { query: "wire speed for optional aluminum spool gun", expected: /MIG \/ Flux-Cored Setup|Settings Guidance|Product Overview/ },
  // Garage phrasing — users don't speak manual vocabulary (advisor-flagged).
  { query: "how long can I weld before it shuts off", expected: /Duty Cycle/ },
  { query: "welder keeps quitting on me mid bead", expected: /Duty Cycle|Troubleshooting/ },
  { query: "it flashed something about thermal and stopped", expected: /Duty Cycle|Troubleshooting/ },
  { query: "gasless wire hookup", expected: /Polarity|MIG \/ Flux-Cored Setup|Quick Start/ },
  { query: "how much stickout should the wire have", expected: /Wire Welding|Weld Diagnosis|MIG \/ Flux-Cored Setup/ },
  { query: "big chunks of splatter everywhere", expected: /Weld Diagnosis/ },
  { query: "best setting for rusty steel outside in the wind", expected: /Choosing a Welding Process/ },
  { query: "what helmet shade do I need", expected: /Safety|Wire Welding/ },
  { query: "breaker trips every time I pull the trigger", expected: /Troubleshooting/ },
];

let reciprocalRank = 0;
let hitsAtFour = 0;
for (const test of CASES) {
  const results = searchKnowledge(test.query, 4);
  const rank = results.findIndex((result) => test.expected.test(`${result.doc} ${result.heading}`));
  if (rank >= 0) {
    hitsAtFour++;
    reciprocalRank += 1 / (rank + 1);
    console.log(`✓ @${rank + 1} ${test.query}`);
  } else {
    console.error(`✗ ${test.query}`);
    console.error(`  got: ${results.map((result) => result.heading).join(" | ")}`);
  }
}

const recall = hitsAtFour / CASES.length;
const mrr = reciprocalRank / CASES.length;
console.log(`\nRetrieval: recall@4 ${(recall * 100).toFixed(1)}% · MRR ${mrr.toFixed(3)} · ${CASES.length} cases`);
if (recall < 0.96 || mrr < 0.72) process.exit(1);
