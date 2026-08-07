import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, type ChatEvent } from "./agent.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  res.setHeader("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  next();
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\n✗ ANTHROPIC_API_KEY is missing.\n  cp .env.example .env  and paste your key, then restart.\n",
  );
  process.exit(1);
}

const MESSAGE_MAX_CHARS = 8_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;
const AGENT_TIMEOUT_MS = envInt("AGENT_TIMEOUT_MS", 180_000, 15_000, 600_000);
const RATE_WINDOW_MS = envInt("RATE_LIMIT_WINDOW_MS", 600_000, 10_000, 86_400_000);
const RATE_MAX = envInt("RATE_LIMIT_REQUESTS", 20, 1, 1_000);
const SESSION_TTL_MS = 6 * 60 * 60 * 1_000;

interface SessionEntry {
  sdkSessionId?: string;
  owner: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionEntry>();
const rateWindows = new Map<string, { count: number; resetAt: number }>();
const activeRequests = new Map<string, number>();
// conversation id -> owning turn token. A turn may only release a lock it
// still owns: the previous turn's `finally` can fire seconds late (SDK stream
// teardown) and must not wipe the lock a newer turn has since taken.
const activeConversations = new Map<string, symbol>();

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "omnipro-agent", model: process.env.CLAUDE_MODEL || "claude-opus-5" }),
);

const artifactRuntimeFiles: Record<string, string> = {
  "react.js": path.join(ROOT, "node_modules", "react", "umd", "react.production.min.js"),
  "react-dom.js": path.join(ROOT, "node_modules", "react-dom", "umd", "react-dom.production.min.js"),
  "babel.js": path.join(ROOT, "node_modules", "@babel", "standalone", "babel.min.js"),
};
app.get("/artifact-runtime/:file", (req, res) => {
  const file = artifactRuntimeFiles[req.params.file];
  if (!file) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type("application/javascript").sendFile(file);
});

app.post("/api/chat", async (req, res) => {
  const owner = req.ip || req.socket.remoteAddress || "unknown";
  const limited = takeRateLimit(owner);
  res.setHeader("RateLimit-Limit", String(RATE_MAX));
  res.setHeader("RateLimit-Remaining", String(limited.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(limited.resetAt / 1_000)));
  if (!limited.allowed) {
    return res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
  }
  if ((activeRequests.get(owner) ?? 0) >= 2) {
    return res.status(429).json({ error: "Two requests are already running for this client." });
  }

  const { message, sessionId, images } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message required" });
  }
  if (message.length > MESSAGE_MAX_CHARS) {
    return res.status(413).json({ error: `message exceeds ${MESSAGE_MAX_CHARS} characters` });
  }

  const checkedImages = validateImages(images);
  if (checkedImages.error) return res.status(413).json({ error: checkedImages.error });

  expireSessions();
  let clientSessionId: string;
  let sdkSessionId: string | undefined;
  if (sessionId !== undefined) {
    if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return res.status(400).json({ error: "invalid conversation session" });
    }
    const existing = sessions.get(sessionId);
    if (!existing || existing.owner !== owner || existing.expiresAt <= Date.now()) {
      return res.status(409).json({ error: "conversation expired; start a new chat" });
    }
    if (activeConversations.has(sessionId)) {
      // Two concurrent turns resuming one SDK session would fork the history
      // and race on the stored session id — serialize per conversation.
      // 429 (not 409): the client keeps its session and can simply retry —
      // 409 is reserved for expired sessions, which reset the client thread.
      return res.status(429).json({ error: "the previous answer in this conversation is still streaming" });
    }
    clientSessionId = sessionId;
    sdkSessionId = existing.sdkSessionId;
    existing.expiresAt = Date.now() + SESSION_TTL_MS;
  } else {
    clientSessionId = randomUUID();
    sessions.set(clientSessionId, { owner, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let disconnected = false;
  let timedOut = false;
  const send = (e: ChatEvent) => {
    if (res.writableEnded || disconnected) return;
    const outgoing = { ...e };
    if ((e.type === "done" || e.type === "error") && e.sessionId) {
      const entry = sessions.get(clientSessionId);
      if (entry) {
        entry.sdkSessionId = e.sessionId;
        entry.expiresAt = Date.now() + SESSION_TTL_MS;
      }
      outgoing.sessionId = clientSessionId;
    }
    res.write(`data: ${JSON.stringify(outgoing)}\n\n`);
    if (e.type === "done" || e.type === "error") {
      // Release the per-conversation lock the moment the turn is over —
      // SDK stream teardown can lag, and a fast follow-up must not 429.
      releaseConversation();
      res.end();
    }
  };

  const ac = new AbortController();
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !disconnected) res.write(": heartbeat\n\n");
  }, 15_000);
  const timeout = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, AGENT_TIMEOUT_MS);
  // res 'close' before writableEnded = client disconnected mid-stream.
  // (req 'close' fires as soon as the request body is consumed — wrong signal.)
  res.on("close", () => {
    if (!res.writableEnded) {
      disconnected = true;
      ac.abort();
    }
  });

  activeRequests.set(owner, (activeRequests.get(owner) ?? 0) + 1);
  const turnToken = Symbol("turn");
  activeConversations.set(clientSessionId, turnToken);
  const releaseConversation = () => {
    if (activeConversations.get(clientSessionId) === turnToken) {
      activeConversations.delete(clientSessionId);
    }
  };
  try {
    await runAgent(message.trim(), sdkSessionId, send, ac.signal, checkedImages.images);
    if (timedOut && !res.writableEnded && !disconnected) {
      send({ type: "error", message: "The answer timed out. Try a narrower question." });
    }
  } catch (error: any) {
    send({ type: "error", message: error?.message || "The agent could not start." });
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    releaseConversation();
    const active = Math.max(0, (activeRequests.get(owner) ?? 1) - 1);
    if (active === 0) activeRequests.delete(owner);
    else activeRequests.set(owner, active);
    if (!res.writableEnded) res.end();
  }
});

// Production: serve the built frontend. In dev, Vite serves it and proxies /api.
const dist = path.join(ROOT, "web", "dist");
app.use(express.static(dist));
// The Vite build intentionally skips copying web/public (copyPublicDir:false)
// so the 23MB of manual imagery isn't shipped twice — serve it from source.
app.use(express.static(path.join(ROOT, "web", "public")));
app.use("/manual", express.static(path.join(ROOT, "web", "public", "manual")));
app.get(/^\/(?!api).*/, (_req, res, next) => {
  res.sendFile(path.join(dist, "index.html"), (err) => err && next());
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`⚡ OmniPro agent server on http://localhost:${PORT}`);
});

function validateImages(input: unknown): { images?: Array<{ data: string; mimeType: string }>; error?: string } {
  if (input === undefined) return {};
  if (!Array.isArray(input)) return { error: "images must be an array" };
  if (input.length > MAX_IMAGES) return { error: `attach at most ${MAX_IMAGES} images` };

  const images: Array<{ data: string; mimeType: string }> = [];
  let total = 0;
  for (const item of input) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.data !== "string" ||
      !/^image\/(png|jpeg|webp|gif)$/.test(item.mimeType ?? "") ||
      item.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)
    ) {
      return { error: "an attachment is not a supported base64 image" };
    }
    const decoded = Buffer.from(item.data, "base64");
    if (!matchesImageSignature(decoded, item.mimeType)) return { error: "an attachment’s bytes do not match its image type" };
    if (decoded.byteLength > MAX_IMAGE_BYTES) return { error: "an attachment exceeds 4 MB after decoding" };
    total += decoded.byteLength;
    if (total > MAX_TOTAL_IMAGE_BYTES) return { error: "attachments exceed 10 MB in total" };
    images.push({ data: item.data, mimeType: item.mimeType });
  }
  return { images };
}

function matchesImageSignature(data: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === "image/gif") return data.length >= 6 && ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function takeRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  if (rateWindows.size > 10_000) {
    for (const [client, window] of rateWindows) if (window.resetAt <= now) rateWindows.delete(client);
  }
  const current = rateWindows.get(key);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + RATE_WINDOW_MS } : current;
  window.count++;
  rateWindows.set(key, window);
  return {
    allowed: window.count <= RATE_MAX,
    remaining: Math.max(0, RATE_MAX - window.count),
    resetAt: window.resetAt,
  };
}

function expireSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
