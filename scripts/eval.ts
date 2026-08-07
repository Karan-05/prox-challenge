/**
 * Smoke-eval: runs the README's hard questions (plus cross-referencing and
 * ambiguity probes) through the agent and checks key facts appear.
 *
 * Usage: npm run eval          (all cases)
 *        npm run eval -- 0 2   (specific cases)
 */
import "dotenv/config";
import { runAgent, type ChatEvent } from "../server/agent.js";

interface Case {
  q: string;
  mustMatch: RegExp[];
  wantFigure?: boolean;
  wantArtifact?: boolean;
}

const CASES: Case[] = [
  {
    q: "What's the duty cycle for MIG welding at 200A on 240V?",
    mustMatch: [/25\s?%/, /2[.\s]?[½5]|2\.5|2-1\/2/, /115\s?A/i],
  },
  {
    q: "I'm getting porosity in my flux-cored welds. What should I check?",
    mustMatch: [/polarity/i, /DCEN/i, /clean|bare metal/i, /CTWD|contact tip/i],
  },
  {
    q: "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
    mustMatch: [/DCEN|negative/i, /positive/i, /argon/i],
    wantFigure: true,
  },
  {
    q: "Build me an interactive duty cycle calculator for this welder.",
    mustMatch: [],
    wantArtifact: true,
  },
  {
    q: "Can I TIG weld aluminum with this machine?",
    mustMatch: [/AC TIG|DC( TIG)? only|cannot|can't|no\b/i, /spool gun/i],
  },
  {
    q: "What settings should I use for welding steel?",
    // Ambiguous — expect a clarifying question or explicit variant handling
    mustMatch: [/thickness|process|which|what.*(wire|gauge|thick)|\?/i],
  },
  {
    // Cross-referencing: setup procedure (p.15/17) + troubleshooting matrix (p.42)
    q: "My wire keeps birdnesting at the feed rollers. Why?",
    mustMatch: [/tension|pressure/i, /contact tip/i, /liner|connector/i],
  },
  {
    // Honesty out-of-scope: manual defers spool gun operation to its own manual
    q: "What wire feed speed should I run for aluminum with the spool gun?",
    mustMatch: [/spool gun/i, /manual|separate|sold separately/i],
  },
  {
    // Safety cross-reference: vehicle welding notice (pp.19, 29)
    q: "I want to weld a bracket on my truck frame. Anything special I should do first?",
    mustMatch: [/batter/i, /disconnect/i],
  },
];

async function run(idx: number, c: Case): Promise<boolean> {
  let text = "";
  let figures = 0;
  let errored: string | null = null;
  await runAgent(c.q, undefined, (e: ChatEvent) => {
    if (e.type === "text_delta") text += e.text;
    if (e.type === "figure") figures++;
    if (e.type === "error") errored = e.message ?? "error";
  });

  const failures: string[] = [];
  if (errored) failures.push(`agent error: ${errored}`);
  for (const re of c.mustMatch) if (!re.test(text)) failures.push(`missing ${re}`);
  if (c.wantFigure && figures === 0) failures.push("expected a manual figure");
  if (c.wantArtifact && !/```artifact:(react|svg|html)/.test(text))
    failures.push("expected an artifact block");

  const ok = failures.length === 0;
  console.log(`\n${ok ? "✅" : "❌"} [${idx}] ${c.q}`);
  if (!ok) console.log("   " + failures.join("; "));
  console.log(
    `   ${text.length} chars, ${figures} figure(s)${/```artifact:/.test(text) ? ", artifact ✓" : ""}`,
  );
  console.log("   ┌─ answer preview ─────");
  console.log(
    text
      .slice(0, 600)
      .split("\n")
      .map((l) => "   │ " + l)
      .join("\n"),
  );
  return ok;
}

const only = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
let pass = 0;
let total = 0;
for (let i = 0; i < CASES.length; i++) {
  if (only.length && !only.includes(i)) continue;
  total++;
  if (await run(i, CASES[i])) pass++;
}
console.log(`\n═══ ${pass}/${total} passed ═══`);
process.exit(pass === total ? 0 : 1);
