// Drives headless Chrome via CDP (Node's built-in WebSocket) to test the chat UI.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [
  "--headless", "--disable-gpu", "--remote-debugging-port=9223",
  "--window-size=1280,1600", "--hide-scrollbars", "--user-data-dir=/tmp/omnipro-chrome",
  "about:blank",
]);
await new Promise((r) => setTimeout(r, 2500));

const list = await fetch("http://localhost:9223/json").then((r) => r.json());
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3001" });
await new Promise((r) => setTimeout(r, 2000));

const question = process.argv[2] ?? "What polarity setup do I need for TIG? Which socket does the ground clamp go in?";
await send("Runtime.evaluate", {
  expression: `(() => {
    const chips=[...document.querySelectorAll('.chips button')];
    const btn=chips.find(b=>b.textContent.includes(${JSON.stringify(question.slice(0, 30))}));
    if(btn){btn.click();return 'clicked chip';}
    const input=document.querySelector('footer input');
    const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(input, ${JSON.stringify(question)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('footer form').requestSubmit();
    return 'typed+submitted';
  })()`,
});

// Poll until the stream finishes (send button re-enabled) or timeout.
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const { result } = await send("Runtime.evaluate", {
    expression: `document.querySelector('button.send')?.disabled === false && document.querySelectorAll('.msg').length >= 2`,
    returnByValue: true,
  });
  if (result?.result?.value) break;
}
await new Promise((r) => setTimeout(r, 2500));

let shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
if (!shot.result) shot = await send("Page.captureScreenshot", { format: "png" });
if (!shot.result) { console.error("screenshot failed:", JSON.stringify(shot).slice(0,300)); chrome.kill(); process.exit(1); }
fs.writeFileSync(process.argv[3] ?? "/tmp/omnipro-chat.png", Buffer.from(shot.result.data, "base64"));

const { result: stats } = await send("Runtime.evaluate", {
  expression: `JSON.stringify({figures:document.querySelectorAll('.figure-card').length, artifacts:document.querySelectorAll('.artifact').length, errors:document.querySelectorAll('.error-note').length, height:document.body.scrollHeight})`,
  returnByValue: true,
});
console.log("UI stats:", stats?.result?.value ?? JSON.stringify(stats).slice(0,300));
chrome.kill();
process.exit(0);
