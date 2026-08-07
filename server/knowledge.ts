import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");
export const PAGES_DIR = path.join(ROOT, "web", "public", "manual", "pages");

export interface Figure {
  id: string;
  file: string;
  source: string;
  page: number;
  title: string;
}

export interface Section {
  doc: string;
  heading: string;
  body: string;
}

export const specs = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "specs.json"), "utf8"),
);
export const figures: Figure[] = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "figures.json"), "utf8"),
);

/** Knowledge files split into heading-delimited sections for search. */
const sections: Section[] = [];
for (const file of fs.readdirSync(path.join(DATA_DIR, "knowledge")).sort()) {
  const text = fs.readFileSync(path.join(DATA_DIR, "knowledge", file), "utf8");
  const docTitle = text.match(/^# (.+)$/m)?.[1] ?? file;
  // Split on ## headings, keeping the doc-level intro as its own section.
  const parts = text.split(/^(?=## )/m);
  for (const part of parts) {
    const heading = part.match(/^##? (.+)$/m)?.[1] ??docTitle;
    sections.push({ doc: docTitle, heading, body: part.trim() });
  }
}

const STOP = new Set(
  "the a an and or of to in on for with at is are be do does what how my i it its this that when why which should".split(" "),
);

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9./"-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Simple deterministic lexical search over knowledge sections. */
export function searchKnowledge(query: string, limit = 4): Section[] {
  const qs = terms(query);
  const scored = sections.map((s) => {
    const hay = (s.doc + " " + s.body).toLowerCase();
    let score = 0;
    for (const t of qs) {
      const matches = hay.split(t).length - 1;
      if (matches > 0) score += 1 + Math.min(matches, 5) * 0.15;
      if (s.heading.toLowerCase().includes(t)) score += 1.5;
      if (s.doc.toLowerCase().includes(t)) score += 0.75;
    }
    return { s, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
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
