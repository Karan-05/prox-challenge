// End-to-end browser probe via Chrome DevTools Protocol, without a test dependency.
// Requires a running production server on UI_BASE_URL (default localhost:3001).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const CHROME = candidates.find((candidate) => fs.existsSync(candidate));
if (!CHROME) {
  console.error("Chrome/Chromium not found. Set CHROME_PATH to run the UI probe.");
  process.exit(1);
}

const baseUrl = process.env.UI_BASE_URL ?? "http://localhost:3001";
const landingOnly = process.argv[2] === "--landing";
const question = landingOnly ? "" : (process.argv[2] ?? "What polarity setup do I need for TIG? Which socket does the ground clamp go in?");
const output = process.argv[3] ?? path.join(os.tmpdir(), "omnipro-chat.png");
const viewportWidth = Number(process.argv[4] ?? 1280);
const viewportHeight = Number(process.argv[5] ?? 1600);
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9200 + (process.pid % 700));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "omnipro-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${debugPort}`,
  `--window-size=${viewportWidth},${viewportHeight}`, "--hide-scrollbars", `--user-data-dir=${profile}`,
  "about:blank",
]);

try {
  await waitFor(() => fetch(`http://localhost:${debugPort}/json`).then((response) => response.ok), 10_000);
  const list = await fetch(`http://localhost:${debugPort}/json`).then((response) => response.json());
  const pageTarget = list.find((target) => target.type === "page" && !target.url.startsWith("chrome-extension://"));
  if (!pageTarget) throw new Error("Chrome did not expose a browser page target");
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const requestId = ++id;
    pending.set(requestId, resolve);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: baseUrl });
  await waitFor(async () => {
    const response = await send("Runtime.evaluate", { expression: "Boolean(document.querySelector('footer form'))", returnByValue: true });
    return response?.result?.result?.value === true;
  }, 15_000);

  let completed = landingOnly;
  if (!landingOnly) {
    await send("Runtime.evaluate", {
      expression: `(() => {
        const input=document.querySelector('footer textarea, footer input:not([type=file])');
        const prototype=input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(prototype,'value').set;
        setter.call(input, ${JSON.stringify(question)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelector('footer form').requestSubmit();
      })()`,
    });
    await waitFor(async () => {
      const response = await send("Runtime.evaluate", {
        expression: `!document.querySelector('button.stop') && document.querySelectorAll('.msg').length >= 2`,
        returnByValue: true,
      });
      completed = response?.result?.result?.value === true;
      return completed;
    }, Number(process.env.UI_TIMEOUT_MS ?? 210_000)).catch(() => false);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (!landingOnly) {
    const focusSelector = /duty cycle/i.test(question)
      ? ".native-widget"
      : /flowchart|artifact|interactive/i.test(question)
        ? ".artifact"
        : ".figure-card";
    await send("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(focusSelector)})?.scrollIntoView({block:'start'})`,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  let shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (!shot.result) shot = await send("Page.captureScreenshot", { format: "png" });
  if (!shot.result) throw new Error(`screenshot failed: ${JSON.stringify(shot).slice(0, 300)}`);
  fs.writeFileSync(output, Buffer.from(shot.result.data, "base64"));

  const response = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      figures:document.querySelectorAll('.figure-card').length,
      nativeWidgets:document.querySelectorAll('.native-widget').length,
      artifacts:document.querySelectorAll('.artifact').length,
      artifactsReady:document.querySelectorAll('.artifact-status.ready').length,
      artifactErrors:document.querySelectorAll('.artifact-error,.artifact-status.error').length,
      responseErrors:document.querySelectorAll('.error-note').length,
      evidence:document.querySelectorAll('.evidence-list a,.evidence-drawer').length,
      citations:document.querySelectorAll('.citation-link').length,
      height:document.body.scrollHeight
    })`,
    returnByValue: true,
  });
  const stats = JSON.parse(response?.result?.result?.value ?? "{}");
  const failures = [];
  if (!landingOnly) {
    if (!completed) failures.push("response did not complete before timeout");
    if (stats.responseErrors) failures.push(`${stats.responseErrors} response error(s)`);
    if (stats.artifactErrors) failures.push(`${stats.artifactErrors} artifact render error(s)`);
    if (stats.artifacts !== stats.artifactsReady) failures.push("not every generated artifact reached ready state");
    if (/duty cycle/i.test(question) && stats.nativeWidgets < 1) failures.push("duty-cycle prompt did not render a native widget");
    if (/polarity|show|diagram|picture/i.test(question) && stats.figures < 1) failures.push("visual prompt did not render a manual figure");
    if (stats.evidence < 1) failures.push("no evidence trace rendered");
  }

  console.log("UI stats:", stats);
  console.log("Screenshot:", output);
  ws.close();
  if (failures.length) {
    console.error("UI probe failed:", failures.join("; "));
    process.exitCode = 1;
  } else {
    console.log(landingOnly ? "✓ Landing UI rendered" : "✓ UI response, evidence, widgets, and artifact runtime passed");
  }
} finally {
  chrome.kill();
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`timed out after ${timeoutMs}ms`);
}
