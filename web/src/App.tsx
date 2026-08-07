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

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  });

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [
      ...m,
      { role: "user", blocks: [{ t: "text", s: q }] },
      { role: "assistant", blocks: [], status: "Thinking" },
    ]);

    const update = (fn: (a: Msg) => Msg) =>
      setMsgs((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, sessionId: sessionRef.current }),
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
      update((a) => ({ ...a, status: null, error: err?.message ?? "Connection lost" }));
    } finally {
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
    <div className="app">
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
              answer with the manual's own diagrams, page citations, and interactive tools when they help.
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
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
            placeholder={listening ? "Listening…" : "Ask about setup, settings, weld problems…"}
            disabled={busy}
            autoFocus
          />
          <button type="submit" className="send" disabled={busy || !input.trim()}>
            {busy ? <span className="spinner light" /> : "Send"}
          </button>
        </form>
        <p className="disclaimer">
          Answers grounded in the Vulcan OmniPro 220 owner's manual. Always follow the safety
          instructions — arc rays, fumes, and electric shock are no joke.
        </p>
      </footer>
    </div>
  );
}
