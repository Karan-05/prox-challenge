import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");
export const PAGES_DIR = path.join(ROOT, "web", "public", "manual", "pages");

export interface Figure {
  id: string;
  file: string;
  source: string;
  page: number;
  title: string;
  keywords?: string[];
}

export interface Section {
  doc: string;
  heading: string;
  body: string;
}

const FigureSchema = z.object({
  id: z.string().min(1),
  file: z.string().regex(/^\/manual\/figures\/.+\.png$/),
  source: z.enum(["owner-manual.pdf", "quick-start-guide.pdf", "selection-chart.pdf"]),
  page: z.number().int().positive(),
  title: z.string().min(1),
  keywords: z.array(z.string()).optional(),
});

export const specs: Record<string, any> = z.record(z.string(), z.unknown()).parse(
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, "specs.json"), "utf8")),
);
export const figures: Figure[] = z.array(FigureSchema).parse(
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, "figures.json"), "utf8")),
);

/** Knowledge files split into heading-delimited sections for search. */
const sections: Section[] = [];
for (const file of fs.readdirSync(path.join(DATA_DIR, "knowledge")).sort()) {
  const text = fs.readFileSync(path.join(DATA_DIR, "knowledge", file), "utf8");
  const docTitle = text.match(/^# (.+)$/m)?.[1] ?? file;
  // Split on task-level headings, keeping the doc-level intro as its own section.
  // Fine-grained sections prevent one long troubleshooting matrix from being
  // penalized against a short but weakly-related section.
  const parts = text.split(/^(?=##+ )/m);
  for (const part of parts) {
    const heading = part.match(/^#{1,3} (.+)$/m)?.[1] ?? docTitle;
    sections.push({ doc: docTitle, heading, body: part.trim() });
  }
}

const STOP = new Set(
  "the a an and or of to in on for with at is are be do does what how my i it its this that when why which should".split(" "),
);

const ALIASES: Record<string, string[]> = {
  truck: ["vehicle", "automotive"],
  car: ["vehicle", "automotive"],
  tangled: ["birdnest", "birdnesting", "nest"],
  tangles: ["birdnest", "birdnesting", "nest"],
  tangle: ["birdnest", "birdnesting", "nest"],
  nest: ["birdnest", "birdnesting", "tangle"],
  holes: ["porosity", "cavities"],
  hole: ["porosity", "cavity"],
  dead: ["unpowered", "function", "light"],
  screen: ["lcd", "display"],
  socket: ["cable", "polarity", "positive", "negative"],
  ground: ["clamp"],
  outdoor: ["windy", "outside"],
  outside: ["outdoor", "windy"],
  aluminum: ["aluminium", "spool"],
  // Garage vocabulary → manual vocabulary (advisor-flagged: users rarely say
  // "duty cycle" or "flux-cored"; they say "it keeps shutting off" and "gasless").
  gasless: ["flux", "cored", "dcen"],
  gas: ["shielding", "mig", "argon"],
  hardwire: ["solid", "mig"],
  stickout: ["ctwd", "contact", "tip"],
  overheat: ["duty", "cycle", "thermal", "shutdown"],
  overheating: ["duty", "cycle", "thermal", "shutdown"],
  overheated: ["duty", "cycle", "thermal", "cooling"],
  thermal: ["duty", "cycle", "shutdown", "warning"],
  shut: ["thermal", "duty", "cycle", "shutdown"],
  quit: ["thermal", "duty", "cycle", "shutdown"],
  quitting: ["thermal", "duty", "cycle", "shutdown"],
  shutting: ["thermal", "duty", "cycle", "shutdown"],
  stopping: ["thermal", "shutdown"],
  cutting: ["thermal", "shutdown", "duty"],
  stop: ["thermal", "shutdown"],
  stopped: ["thermal", "shutdown"],
  spatter: ["spatter", "polarity", "ctwd"],
  splatter: ["spatter"],
  sputter: ["spatter", "unstable", "arc"],
  sticking: ["arc", "electrode", "hot", "start"],
  penetration: ["heat", "current"],
  beginner: ["skill", "easiest", "learn"],
  wind: ["windy", "outdoor", "flux", "cored"],
  breaker: ["circuit", "gfci", "reset", "overload"],
  trip: ["breaker", "reset", "overload", "thermal"],
  tripped: ["breaker", "reset", "overload", "thermal"],
  fan: ["cooling", "thermal", "duty"],
  helmet: ["shade", "face", "shield", "mask"],
  rusty: ["rust", "dirty", "flux", "cored"],
  galvanized: ["flux", "cored", "coating", "fumes"],
};

function tokenize(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [])
    .map((term) => (term.endsWith("s") && term.length > 4 ? term.slice(0, -1) : term))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const indexed = sections.map((section) => {
  const tokens = tokenize(`${section.doc} ${section.heading} ${section.body}`) ?? [];
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return {
    section,
    counts,
    length: tokens.length,
    heading: new Set(tokenize(section.heading) ?? []),
    doc: new Set(tokenize(section.doc) ?? []),
    normalized: tokens.join(" "),
  };
});
const averageLength = indexed.reduce((sum, item) => sum + item.length, 0) / Math.max(1, indexed.length);

/** Deterministic BM25-style retrieval with a small, auditable welding synonym map. */
export function searchKnowledge(query: string, limit = 4): Section[] {
  const originals = [...new Set(tokenize(query) ?? [])];
  const weighted = new Map<string, number>();
  for (const term of originals) {
    weighted.set(term, 1);
    for (const alias of ALIASES[term] ?? []) weighted.set(alias, Math.max(weighted.get(alias) ?? 0, 0.55));
  }

  const scored = indexed.map((item) => {
    let score = 0;
    for (const [term, weight] of weighted) {
      const tf = item.counts.get(term) ?? 0;
      if (tf === 0) continue;
      const documentFrequency = indexed.reduce((count, candidate) => count + Number(candidate.counts.has(term)), 0);
      const idf = Math.log(1 + (indexed.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const normalizedTf = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (item.length / averageLength)));
      score += weight * idf * normalizedTf;
      if (item.heading.has(term)) score += weight * 1.8;
      if (item.doc.has(term)) score += weight;
    }
    const phrase = originals.join(" ");
    if (originals.length > 1 && item.normalized.includes(phrase)) score += 3;
    return { section: item.section, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.section.doc.localeCompare(b.section.doc))
    .slice(0, limit)
    .map((x) => x.section);
}

export function manualPagePath(source: string, page: number): string | null {
  const prefix =
    source === "quick-start-guide.pdf" || source === "quickstart"
      ? "quickstart"
      : source === "selection-chart.pdf" || source === "chart"
        ? "chart"
        : "manual";
  const p = path.join(PAGES_DIR, `${prefix}-${String(page).padStart(2, "0")}.png`);
  return fs.existsSync(p) ? p : null;
}

export function manualPageHref(source: string, page: number): string {
  const prefix =
    source === "quick-start-guide.pdf" || source === "quickstart"
      ? "quickstart"
      : source === "selection-chart.pdf" || source === "chart"
        ? "chart"
        : "manual";
  return `/manual/pages/${prefix}-${String(page).padStart(2, "0")}.png`;
}
