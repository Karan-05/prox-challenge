import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { figures, manualPagePath, specs } from "../server/knowledge.js";
import { calculateDutyCycle, selectProcess } from "../server/widgets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeDir = path.join(ROOT, "data", "knowledge");
const knowledgeFiles = fs.readdirSync(knowledgeDir).filter((file) => file.endsWith(".md")).sort();

assert(knowledgeFiles.length === 16, `expected 16 knowledge files, found ${knowledgeFiles.length}`);
assert(figures.length === 29, `expected 29 figures, found ${figures.length}`);
assert(new Set(figures.map((figure) => figure.id)).size === figures.length, "figure IDs must be unique");

for (let page = 1; page <= 48; page++) assert(manualPagePath("manual", page), `missing owner-manual page ${page}`);
for (let page = 1; page <= 2; page++) assert(manualPagePath("quickstart", page), `missing quick-start page ${page}`);
assert(manualPagePath("chart", 1), "missing process chart page 1");

for (const figure of figures) {
  const asset = path.join(ROOT, "web", "public", figure.file);
  assert(fs.existsSync(asset), `missing figure asset ${figure.file}`);
  assert(fs.statSync(asset).size > 5_000, `figure asset looks empty: ${figure.file}`);
  assert(manualPagePath(figure.source, figure.page), `figure ${figure.id} references a missing source page`);
}

for (const file of knowledgeFiles) {
  const text = fs.readFileSync(path.join(knowledgeDir, file), "utf8");
  assert(/^# .+/m.test(text), `${file} has no document title`);
  assert(/\b(?:p|pp)\.\d|page \d|selection-chart\.pdf|quick-start-guide\.pdf/i.test(text), `${file} has no source-page provenance`);
}

const allKnowledge = knowledgeFiles
  .map((file) => fs.readFileSync(path.join(knowledgeDir, file), "utf8"))
  .join("\n");
assert(!/material caps well/i.test(allKnowledge), 'selection-chart transcription must say "material gaps"');
assert(allKnowledge.includes("25% @ 200A"), "knowledge is missing the canonical MIG duty-cycle point");
assert(specs.dutyCycle.MIG["240V"].rated.percent === 25, "structured MIG duty-cycle percentage drifted");
assert(specs.polarity.TIG.groundClamp.includes("POSITIVE"), "structured TIG ground polarity drifted");

const duty = calculateDutyCycle("MIG / Flux-Cored", "240V", 200);
assert(duty.result.status === "exact" && duty.result.percent === 25, "deterministic duty tool returned the wrong canonical answer");
assert(duty.result.weldMinutes === 2.5 && duty.result.restMinutes === 7.5, "deterministic duty tool returned the wrong timing");
const selection = selectProcess({ material: "steel", gauge: 16, environment: "indoors", priority: "easy" });
assert(selection.recommendation.startsWith("MIG"), "16-gauge indoor steel should rank MIG first");

console.log(`✓ data integrity: ${knowledgeFiles.length} knowledge files, 51 pages, ${figures.length} figures`);
console.log("✓ canonical specs and deterministic widgets agree with the source corpus");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Data check failed: ${message}`);
}
