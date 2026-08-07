import React, { useEffect, useRef, useState } from "react";
import Message from "./Message";
import type { Msg } from "./types";

const SUGGESTIONS = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG? Which socket does the ground clamp go in?",
  "Build me an interactive duty cycle calculator",
  "Walk me through first-time flux-core setup, with pictures",
  "Which process should I use for 16-gauge sheet metal?",
];

interface Attachment {
  data: string; // bare base64
  mimeType: string;
  preview: string; // data URL
}

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  });

  async function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files).slice(0, 4 - attachments.length)) {
      if (!f.type.startsWith("image/")) continue;
      const att = await downscale(f);
      if (att) setAttachments((a) => [...a, att].slice(0, 4));
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if ((!q && attachments.length === 0) || busy) return;
    const imgs = attachments;
    setAttachments([]);
    setInput("");
    setBusy(true);
    setMsgs((m) => [
      ...m,
      {
        role: "user",
        blocks: [{ t: "text", s: q || "(photo attached)" }],
        images: imgs.map((i) => i.preview),
      },
      { role: "assistant", blocks: [], status: "Thinking" },
    ]);

    const update = (fn: (a: Msg) => Msg) =>
      setMsgs((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          message: q || "Take a look at this photo.",
          sessionId: sessionRef.current,
          images: imgs.map(({ data, mimeType }) => ({ data, mimeType })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Server error (${res.status})`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const e = JSON.parse(line.slice(5));
          if (e.type === "text_delta") {
            update((a) => {
              const blocks = a.blocks.slice();
              const lastB = blocks[blocks.length - 1];
              if (lastB?.t === "text") {
                blocks[blocks.length - 1] = { t: "text", s: lastB.s + e.text };
              } else {
                blocks.push({ t: "text", s: e.text });
              }
              return { ...a, blocks, status: null };
            });
          } else if (e.type === "figure") {
            update((a) => ({ ...a, blocks: [...a.blocks, { t: "fig", f: e.figure }], status: null }));
          } else if (e.type === "tool") {
            update((a) => ({ ...a, status: e.tool.name }));
          } else if (e.type === "done") {
            sessionRef.current = e.sessionId ?? sessionRef.current;
            update((a) => ({ ...a, status: null }));
          } else if (e.type === "error") {
            sessionRef.current = e.sessionId ?? sessionRef.current;
            update((a) => ({ ...a, status: null, error: e.message }));
          }
        }
      }
    } catch (err: any) {
      if (ac.signal.aborted) {
        update((a) => ({
          ...a,
          status: null,
          blocks: a.blocks.length ? a.blocks : [{ t: "text", s: "_Stopped._" }],
        }));
      } else {
        update((a) => ({ ...a, status: null, error: err?.message ?? "Connection lost" }));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function toggleMic() {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return alert("Voice input needs Chrome/Edge (Web Speech API).");
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      const t = Array.from(ev.results).map((r: any) => r[0].transcript).join("");
      setInput(t);
      if (ev.results[ev.results.length - 1].isFinal) {
        setListening(false);
        rec.stop();
        send(t);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
    >
      <header>
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <div>
            <h1>OmniPro 220 Assistant</h1>
            <p>Vulcan multiprocess welder · MIG / Flux / TIG / Stick · grounded in the owner's manual</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <button
            className="ghost"
            onClick={() => {
              abortRef.current?.abort();
              sessionRef.current = undefined;
              setMsgs([]);
            }}
          >
            New chat
          </button>
        )}
      </header>

      <div className="chat" ref={scrollRef}>
        {msgs.length === 0 ? (
          <div className="hero">
            <img src="/product.webp" alt="Vulcan OmniPro 220" />
            <h2>What are we welding today?</h2>
            <p>
              Ask anything about your OmniPro 220 — setup, settings, weld problems, safety. I'll
              answer with the manual's own diagrams, page citations, and interactive tools when they
              help. You can also <strong>drop in a photo of your weld</strong> and I'll diagnose it
              against the manual's defect charts.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <Message key={i} msg={m} streaming={busy && i === msgs.length - 1} />
          ))
        )}
      </div>

      <footer>
        {attachments.length > 0 && (
          <div className="attach-strip composer">
            {attachments.map((a, i) => (
              <div key={i} className="attach-chip">
                <img src={a.preview} alt="attachment" />
                <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="mic"
            title="Attach a photo (or drag & drop)"
            onClick={() => fileRef.current?.click()}
          >
            📷
          </button>
          <button
            type="button"
            className={`mic ${listening ? "on" : ""}`}
            onClick={toggleMic}
            title="Voice input"
          >
            {listening ? "●" : "🎙"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              listening
                ? "Listening…"
                : attachments.length
                  ? "Add a note about the photo…"
                  : "Ask about setup, settings, weld problems…"
            }
            autoFocus
          />
          {busy ? (
            <button
              type="button"
              className="send stop"
              onClick={() => abortRef.current?.abort()}
            >
              ■ Stop
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim() && !attachments.length}>
              Send
            </button>
          )}
        </form>
        <p className="disclaimer">
          Answers grounded in the Vulcan OmniPro 220 owner's manual. Always follow the safety
          instructions — arc rays, fumes, and electric shock are no joke.
        </p>
      </footer>
    </div>
  );
}

/** Downscale to ≤1568px long edge, JPEG — keeps uploads fast and vision-friendly. */
async function downscale(file: File): Promise<Attachment | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const preview = canvas.toDataURL("image/jpeg", 0.85);
    return { data: preview.split(",")[1], mimeType: "image/jpeg", preview };
  } catch {
    return null;
  }
}
