import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ArtifactFrame from "./ArtifactFrame";
import WidgetCard from "./WidgetCard";
import type { Block, EvidenceItem, FigureData, Msg } from "./types";

const ARTIFACT_RE = /```artifact:(react|svg|html)\n([\s\S]*?)```/g;
const OPEN_FENCE_RE = /```artifact:(react|svg|html)\n(?![\s\S]*```)/;

export default function Message({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  const plainText = msg.blocks.filter((block) => block.t === "text").map((block) => block.t === "text" ? block.s.replace(ARTIFACT_RE, "") : "").join("\n\n");

  async function copyAnswer() {
    if (!plainText.trim()) return;
    try {
      await navigator.clipboard.writeText(plainText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (non-secure context) — fail quietly
    }
  }

  return (
    <div className={`msg ${msg.role}`}>
      {msg.role === "assistant" && <div className="avatar"><BoltMark /></div>}
      <div className="message-shell">
        <div className="message-byline">
          <span>{msg.role === "assistant" ? "OmniPro Expert" : "You"}</span>
          {msg.role === "assistant" && <small><i /> MANUAL-GROUNDED</small>}
        </div>
        <div className="bubble">
          {msg.images && msg.images.length > 0 && (
            <div className="attach-strip sent-attachments">
              {msg.images.map((src, i) => (
                <img key={i} src={src} alt={`Attached weld ${i + 1}`} />
              ))}
            </div>
          )}
          {msg.blocks.map((b, i) => (
            <BlockView key={i} block={b} streaming={streaming && i === msg.blocks.length - 1} />
          ))}
          {msg.status && <ToolStatus status={msg.status} />}
          {msg.error && <div className="error-note"><span>!</span><div><strong>Something interrupted the response</strong><small>{msg.error}</small></div></div>}
          {msg.evidence && msg.evidence.length > 0 && <EvidenceDrawer evidence={msg.evidence} />}
          {msg.role === "assistant" && (msg.meta || plainText.trim()) && (
            <div className="response-footer">
              {msg.meta && <ResponseMeta meta={msg.meta} />}
              {plainText.trim() && (
                <button className="copy-response" onClick={copyAnswer} aria-label="Copy response">
                  {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolStatus({ status }: { status: string }) {
  return (
    <div className="tool-status" role="status" aria-live="polite">
      <span className="agent-orbit"><i /><i /><i /></span>
      <span><small>AGENT WORKING</small><strong>{status}</strong></span>
      <span className="tool-shimmer" />
    </div>
  );
}

function BlockView({ block, streaming }: { block: Block; streaming: boolean }) {
  if (block.t === "fig") return <FigureCard f={block.f} />;
  if (block.t === "widget") return <WidgetCard widget={block.w} />;

  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const text = block.s;
  ARTIFACT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ARTIFACT_RE.exec(text))) {
    if (m.index > last) parts.push(<Md key={key++} text={text.slice(last, m.index)} />);
    parts.push(<ArtifactFrame key={key++} lang={m[1]} code={m[2]} />);
    last = m.index + m[0].length;
  }
  let tail = text.slice(last);
  // Hide a partially-streamed artifact block behind a builder chip.
  const open = tail.match(OPEN_FENCE_RE);
  let building = false;
  if (open && streaming) {
    tail = tail.slice(0, open.index);
    building = true;
  }
  if (tail.trim()) parts.push(<Md key={key++} text={tail} />);
  if (building)
    parts.push(
      <div key={key++} className="tool-status building">
        <span className="spinner" /> Building interactive artifact…
      </div>,
    );
  if (streaming && !building) parts.push(<span key={key++} className="stream-cursor" aria-hidden="true" />);
  return <>{parts}</>;
}

function Md({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              className={href?.startsWith("/manual/pages/") ? "citation-link" : undefined}
              target={href?.startsWith("/manual/pages/") ? "_blank" : undefined}
              rel={href?.startsWith("/manual/pages/") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
        }}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}

function FigureCard({ f }: { f: FigureData }) {
  const [zoom, setZoom] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (zoom) dialogRef.current?.focus();
  }, [zoom]);
  return (
    <>
      <figure
        className="figure-card"
        role="button"
        tabIndex={0}
        aria-label={`Open ${f.title}`}
        onClick={() => setZoom(true)}
        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setZoom(true)}
      >
        <span className="figure-badge">ORIGINAL MANUAL FIGURE</span>
        <img src={f.file} alt={f.title} loading="lazy" />
        <figcaption>
          <span className="fig-title"><strong>{f.caption || f.title}</strong><small>Click to inspect full size</small></span>
          <span className="fig-src">
            {f.source.replace(".pdf", "")} <b>p.{f.page}</b>
          </span>
        </figcaption>
      </figure>
      {zoom && (
        <div
          ref={dialogRef}
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={f.title}
          tabIndex={-1}
          onClick={() => setZoom(false)}
          onKeyDown={(event) => event.key === "Escape" && setZoom(false)}
        >
          <button className="lightbox-close" onClick={() => setZoom(false)} aria-label="Close figure"><span /> Close</button>
          <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
            <img src={f.file} alt={f.title} />
          </div>
          <div className="lightbox-caption" onClick={(event) => event.stopPropagation()}>
            <span><strong>{f.title}</strong><small>{f.source} · page {f.page}</small></span>
            <a href={f.file} target="_blank" rel="noreferrer">Open original ↗</a>
          </div>
        </div>
      )}
    </>
  );
}

function EvidenceDrawer({ evidence }: { evidence: EvidenceItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="evidence-drawer">
      <button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="evidence-check"><CheckIcon /></span>
        <span><strong>Sources verified</strong><small>{evidence.length} reference{evidence.length === 1 ? "" : "s"} used in this answer</small></span>
        <span className={open ? "drawer-chevron open" : "drawer-chevron"} aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="evidence-list">
          {evidence.map((item) => (
            <a key={item.id} href={item.href} target="_blank" rel="noreferrer">
              <span>{item.source === "manual" ? "OWNER'S MANUAL" : item.source === "quickstart" ? "QUICK START" : "PROCESS CHART"}</span>
              <strong>{item.label}</strong>
              {item.detail && <small>{item.detail}</small>}
              <b aria-hidden="true">↗</b>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ResponseMeta({ meta }: { meta: NonNullable<Msg["meta"]> }) {
  const parts = [
    meta.durationMs ? `${(meta.durationMs / 1000).toFixed(1)}s` : null,
    meta.turns ? `${meta.turns} agent turn${meta.turns === 1 ? "" : "s"}` : null,
    meta.costUsd !== undefined ? `$${meta.costUsd.toFixed(3)}` : null,
  ].filter(Boolean);
  return parts.length ? <div className="response-meta"><span className="response-ready"><i /> RESPONSE COMPLETE</span>{parts.map((part) => <span key={part}>{part}</span>)}</div> : null;
}

function BoltMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2 4.8 13.1h6.4L10.8 22l8.4-12h-6.1L13.2 2Z" /></svg>;
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function linkCitations(text: string): string {
  const rangesLinked = text.replace(/\[((?:quickstart |chart )?pp)\.\s*(\d{1,2})(?:[–-](\d{1,2}))?\]/gi, (_match, prefix: string, page: string, end?: string) => {
    const source = prefix.toLowerCase().startsWith("quickstart")
      ? "quickstart"
      : prefix.toLowerCase().startsWith("chart")
        ? "chart"
        : "manual";
    const href = `/manual/pages/${source}-${page.padStart(2, "0")}.png`;
    return `[${prefix}.${page}${end ? `–${end}` : ""}](${href} "Open first page in cited range")`;
  });
  return rangesLinked.replace(/\[((?:quickstart |chart )?p)\.(\d{1,2})\]/gi, (_match, prefix: string, page: string) => {
    const source = prefix.toLowerCase().startsWith("quickstart")
      ? "quickstart"
      : prefix.toLowerCase().startsWith("chart")
        ? "chart"
        : "manual";
    const href = `/manual/pages/${source}-${page.padStart(2, "0")}.png`;
    return `[${prefix}.${page}](${href} "Open source page")`;
  });
}
