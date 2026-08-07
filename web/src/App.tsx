import React, { useEffect, useRef, useState } from "react";
import Message from "./Message";
import type { Msg } from "./types";

const QUICK_ACTIONS = [
  {
    icon: "gauge",
    eyebrow: "CALCULATE",
    title: "Check a duty cycle",
    detail: "Exact, tool-verified limits",
    prompt: "What's the duty cycle for MIG welding at 200A on 240V?",
  },
  {
    icon: "spark",
    eyebrow: "DIAGNOSE",
    title: "Fix weld porosity",
    detail: "Causes ranked by likelihood",
    prompt: "I'm getting porosity in my flux-cored welds. What should I check?",
  },
  {
    icon: "plug",
    eyebrow: "CONNECT",
    title: "Set up TIG polarity",
    detail: "Sockets, gas and diagram",
    prompt: "What polarity setup do I need for TIG? Which socket does the ground clamp go in?",
  },
  {
    icon: "route",
    eyebrow: "DECIDE",
    title: "Choose a process",
    detail: "Material-aware comparison",
    prompt: "Which process should I use for 16-gauge sheet metal indoors?",
  },
  {
    icon: "layers",
    eyebrow: "LEARN",
    title: "First flux-core setup",
    detail: "A visual walkthrough",
    prompt: "Walk me through first-time flux-core setup, with pictures",
  },
  {
    icon: "flow",
    eyebrow: "BUILD",
    title: "Troubleshoot unstable arc",
    detail: "Interactive decision flow",
    prompt: "Build me a clickable troubleshooting flowchart for an unstable MIG arc.",
  },
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
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinnedToBottomRef = useRef(true);

  useEffect(() => {
    if (msgs.length === 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    if (!pinnedToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: busy ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [msgs, busy]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(144, Math.max(28, textarea.scrollHeight))}px`;
  }, [input]);

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
    pinnedToBottomRef.current = true;
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
        // Guard: "New conversation" mid-stream empties the list before the
        // aborted fetch's catch block runs — never update a vanished message.
        if (m.length === 0 || m[m.length - 1].role !== "assistant") return m;
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
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        if (res.status === 409) sessionRef.current = undefined;
        throw new Error(detail?.error || `Server error (${res.status})`);
      }

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
          } else if (e.type === "widget") {
            update((a) => ({ ...a, blocks: [...a.blocks, { t: "widget", w: e.widget }], status: null }));
          } else if (e.type === "evidence") {
            update((a) => ({
              ...a,
              evidence: [
                ...new Map(
                  [...(a.evidence ?? []), ...(e.evidence ?? [])].map((item: any) => [item.id ?? `${item.source}:${item.page}`, item]),
                ).values(),
              ],
            }));
          } else if (e.type === "tool") {
            update((a) => ({ ...a, status: e.tool.name }));
          } else if (e.type === "done") {
            sessionRef.current = e.sessionId ?? sessionRef.current;
            update((a) => ({
              ...a,
              status: null,
              meta: {
                costUsd: e.costUsd,
                durationMs: e.durationMs,
                turns: e.turns,
                inputTokens: e.inputTokens,
                outputTokens: e.outputTokens,
              },
            }));
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

  function newChat() {
    abortRef.current?.abort();
    sessionRef.current = undefined;
    setMsgs([]);
    setAttachments([]);
    setInput("");
    setShowScrollButton(false);
  }

  function scrollToLatest() {
    pinnedToBottomRef.current = true;
    setShowScrollButton(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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
      className={`app ${msgs.length ? "has-conversation" : "is-empty"}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="bolt" size={22} /></span>
          <div className="brand-copy">
            <span className="brand-overline">VULCAN INTELLIGENCE</span>
            <h1>OmniPro <strong>Copilot</strong></h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="source-status" title="Knowledge base and tools are ready">
            <span className="status-pulse" />
            <span><strong>Manual connected</strong><small>51 pages indexed</small></span>
          </div>
          {msgs.length > 0 && (
          <button
            className="ghost topbar-new"
            aria-label="Start a new chat"
            onClick={newChat}
          >
            <Icon name="plus" size={15} />
            <span>New conversation</span>
          </button>
          )}
        </div>
      </header>

      <main
        className="chat"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const pinned = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          pinnedToBottomRef.current = pinned;
          setShowScrollButton(!pinned && msgs.length > 0);
        }}
      >
        <div className="chat-inner">
          {msgs.length === 0 ? (
            <div className="welcome">
              <section className="hero">
                <div className="hero-copy">
                  <div className="hero-badge"><span /> AI WELDING COPILOT</div>
                  <h2>Your welder,<br /><em>fully understood.</em></h2>
                  <p>
                    Get precise setup guidance, diagnose bad welds, and make safer decisions with an
                    expert grounded in the complete OmniPro 220 manual.
                  </p>
                  <div className="hero-actions">
                    <button className="primary-cta" onClick={() => textareaRef.current?.focus()}>
                      Ask your first question <Icon name="arrow" size={16} />
                    </button>
                    <button className="secondary-cta" onClick={() => fileRef.current?.click()}>
                      <Icon name="camera" size={17} /> Diagnose a weld photo
                    </button>
                  </div>
                  <div className="process-list" aria-label="Supported welding processes">
                    {['MIG', 'FLUX-CORE', 'DC TIG', 'STICK'].map((process) => <span key={process}>{process}</span>)}
                  </div>
                </div>

                <div className="hero-visual">
                  <div className="machine-glow" />
                  <div className="machine-card">
                    <div className="machine-card-top">
                      <span>OMNIPRO 220</span><span className="live-label"><i /> ONLINE</span>
                    </div>
                    <img src="/product.webp" alt="Vulcan OmniPro 220 multiprocess welder" />
                    <div className="machine-card-bottom">
                      <span><small>INPUT</small><strong>120 / 240V</strong></span>
                      <span><small>PROCESSES</small><strong>4-in-1</strong></span>
                      <span><small>MAX OUTPUT</small><strong>220A</strong></span>
                    </div>
                  </div>
                  <div className="floating-proof proof-one"><Icon name="check" size={14} /><span><strong>Tool-verified</strong><small>Exact specifications</small></span></div>
                  <div className="floating-proof proof-two"><Icon name="book" size={14} /><span><strong>29 figures</strong><small>Original diagrams</small></span></div>
                </div>
              </section>

              <section className="starter-section">
                <div className="section-heading">
                  <div><span>START A WORKFLOW</span><h3>What do you need help with?</h3></div>
                  <p>Choose a starting point or ask anything below.</p>
                </div>
                <div className="action-grid">
                  {QUICK_ACTIONS.map((action, index) => (
                    <button key={action.prompt} onClick={() => send(action.prompt)} style={{ '--delay': `${index * 45}ms` } as React.CSSProperties}>
                      <span className="action-icon"><Icon name={action.icon} size={18} /></span>
                      <span className="action-copy"><small>{action.eyebrow}</small><strong>{action.title}</strong><em>{action.detail}</em></span>
                      <Icon name="chevron" size={16} />
                    </button>
                  ))}
                </div>
                <div className="trust-rail" aria-label="Grounding and safety coverage">
                  <span><Icon name="shield" size={15} /><strong>Manual-grounded</strong> answers</span>
                  <span><Icon name="scan" size={15} /><strong>Vision</strong> weld diagnosis</span>
                  <span><Icon name="cursor" size={15} /><strong>Interactive</strong> tools</span>
                  <span><Icon name="lock" size={15} /><strong>Sandboxed</strong> artifacts</span>
                </div>
              </section>
            </div>
          ) : (
            <div className="conversation" aria-live="polite">
              <div className="conversation-intro">
                <span className="conversation-line" />
                <span>OMNIPRO SESSION</span>
                <span className="conversation-line" />
              </div>
              {msgs.map((m, i) => (
                <Message key={i} msg={m} streaming={busy && i === msgs.length - 1} />
              ))}
            </div>
          )}
        </div>
        {showScrollButton && (
          <button className="scroll-latest" onClick={scrollToLatest} aria-label="Scroll to the latest message">
            <Icon name="down" size={17} /> <span>Latest</span>
          </button>
        )}
      </main>

      <footer className="composer-dock">
        <div className="composer-wrap">
          {attachments.length > 0 && (
            <div className="attach-strip composer">
              {attachments.map((a, i) => (
                <div key={i} className="attach-chip">
                  <img src={a.preview} alt={`Attachment ${i + 1} preview`} />
                  <span>Photo {i + 1}</span>
                  <button aria-label={`Remove attachment ${i + 1}`} onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}><Icon name="close" size={11} /></button>
                </div>
              ))}
            </div>
          )}
        <form
          className={`composer-shell ${listening ? "is-listening" : ""} ${busy ? "is-busy" : ""}`}
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
          <div className="composer-tools">
            <button type="button" className="composer-tool" aria-label="Attach a photo" title="Attach a photo or drag and drop" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={19} />
            </button>
            <button type="button" className={`composer-tool ${listening ? "on" : ""}`} aria-label={listening ? "Stop voice input" : "Start voice input"} onClick={toggleMic} title="Voice input">
              {listening ? <span className="recording-dot" /> : <Icon name="mic" size={19} />}
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={
              listening
                ? "Listening…"
                : attachments.length
                  ? "Add a note about the photo…"
                  : "Ask anything about your OmniPro 220…"
            }
          />
          {busy ? (
            <button type="button" className="send stop" aria-label="Stop generating" title="Stop response" onClick={() => abortRef.current?.abort()}>
              <span className="stop-square" />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim() && !attachments.length} aria-label="Send message" title="Send message">
              <Icon name="send" size={18} />
            </button>
          )}
        </form>
          <div className="composer-meta">
            <span className={busy ? "agent-state active" : "agent-state"}><i />{busy ? "Agent is working" : "Manual-grounded AI"}</span>
            <span className="keyboard-hint"><kbd>Enter</kbd> send <b>·</b> <kbd>Shift</kbd> + <kbd>Enter</kbd> new line</span>
            <span>Always follow the safety instructions.</span>
          </div>
        </div>
      </footer>

      {dragging && (
        <div className="drop-overlay">
          <div><span><Icon name="camera" size={28} /></span><strong>Drop your weld photo</strong><small>JPG, PNG or WebP · up to 4 images</small></div>
        </div>
      )}
    </div>
  );
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, React.ReactNode> = {
    bolt: <path d="M13.2 2 4.8 13.1h6.4L10.8 22l8.4-12h-6.1L13.2 2Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    down: <><path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" /></>,
    camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z" /><circle cx="12" cy="12" r="4" /></>,
    mic: <><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></>,
    send: <><path d="m3 3 18 9-18 9 3.5-9L3 3Z" /><path d="M6.5 12H21" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" /></>,
    shield: <><path d="M12 2 4.5 5v5.2c0 4.8 3.1 9.1 7.5 11.1 4.4-2 7.5-6.3 7.5-11.1V5L12 2Z" /><path d="m8.5 11.5 2.2 2.2 4.8-5" /></>,
    scan: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><circle cx="12" cy="12" r="3" /></>,
    cursor: <path d="m5 3 13 9-6 1.2L9 19 5 3Z" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></>,
    gauge: <><path d="M4.2 17a8 8 0 1 1 15.6 0" /><path d="m12 13 4-4M7 17h10" /></>,
    spark: <><path d="m12 2 1.4 5.6L19 9l-5.6 1.4L12 16l-1.4-5.6L5 9l5.6-1.4L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    plug: <><path d="M9 7V3M15 7V3M7 7h10v3a5 5 0 0 1-10 0V7ZM12 15v6" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    flow: <><rect x="3" y="3" width="7" height="5" rx="1" /><rect x="14" y="16" width="7" height="5" rx="1" /><path d="M6.5 8v4h11v4M17.5 12V8" /></>,
  };
  return <svg {...common}>{paths[name] ?? paths.spark}</svg>;
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
