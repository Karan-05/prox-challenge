import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, type ChatEvent } from "./agent.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.use(express.json({ limit: "25mb" })); // room for attached weld photos

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\n✗ ANTHROPIC_API_KEY is missing.\n  cp .env.example .env  and paste your key, then restart.\n",
  );
  process.exit(1);
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/chat", async (req, res) => {
  const { message, sessionId, images } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message required" });
  }
  const safeImages = Array.isArray(images)
    ? images
        .filter(
          (i: any) =>
            i &&
            typeof i.data === "string" &&
            /^image\/(png|jpeg|webp|gif)$/.test(i.mimeType ?? ""),
        )
        .slice(0, 4)
    : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (e: ChatEvent) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (e.type === "done" || e.type === "error") res.end();
  };

  const ac = new AbortController();
  // res 'close' before writableEnded = client disconnected mid-stream.
  // (req 'close' fires as soon as the request body is consumed — wrong signal.)
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });

  await runAgent(message.trim(), sessionId, send, ac.signal, safeImages);
  if (!res.writableEnded) res.end();
});

// Production: serve the built frontend. In dev, Vite serves it and proxies /api.
const dist = path.join(ROOT, "web", "dist");
app.use(express.static(dist));
app.use("/manual", express.static(path.join(ROOT, "web", "public", "manual")));
app.get(/^\/(?!api).*/, (_req, res, next) => {
  res.sendFile(path.join(dist, "index.html"), (err) => err && next());
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`⚡ OmniPro agent server on http://localhost:${PORT}`);
});
