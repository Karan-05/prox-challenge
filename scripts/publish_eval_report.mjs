// Converts a private/raw eval report into the response-text-free report linked by README.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const input = process.argv[2];
if (!input) throw new Error("usage: node scripts/publish_eval_report.mjs eval/results/<report>.json");
const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, input), "utf8"));
const publicReport = {
  ...report,
  sourceFingerprint: sourceFingerprint(),
  results: report.results.map((result) => ({
    id: result.id,
    category: result.category,
    run: result.run,
    passed: result.passed,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    turns: result.turns.map(({ text: _text, sessionId: _sessionId, ...turn }) => turn),
  })),
};
const directory = path.join(ROOT, "docs", "benchmark");
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, `${report.profile}-latest.json`);
fs.writeFileSync(output, JSON.stringify(publicReport, null, 2));
console.log(path.relative(ROOT, output));

function sourceFingerprint() {
  const files = [
    "data/specs.json",
    "data/figures.json",
    "scripts/eval.ts",
    ...["server", "data/knowledge"].flatMap((root) => listFiles(path.join(ROOT, root)).map((file) => path.relative(ROOT, file))),
  ].sort();
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update(fs.readFileSync(path.join(ROOT, relative)));
  }
  return `sha256:${hash.digest("hex")}`;
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}
