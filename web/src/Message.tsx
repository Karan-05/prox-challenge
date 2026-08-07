import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ArtifactFrame from "./ArtifactFrame";
import type { Block, FigureData, Msg } from "./types";

const ARTIFACT_RE = /```artifact:(react|svg|html)\n([\s\S]*?)```/g;
const OPEN_FENCE_RE = /```artifact:(react|svg|html)\n(?![\s\S]*```)/;

export default function Message({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  return (
    <div className={`msg ${msg.role}`}>
      {msg.role === "assistant" && <div className="avatar">⚡</div>}
      <div className="bubble">
        {msg.images && msg.images.length > 0 && (
          <div className="attach-strip">
            {msg.images.map((src, i) => (
              <img key={i} src={src} alt="attached" />
            ))}
          </div>
        )}
        {msg.blocks.map((b, i) => (
          <BlockView key={i} block={b} streaming={streaming && i === msg.blocks.length - 1} />
        ))}
        {msg.status && (
          <div className="tool-status">
            <span className="spinner" /> {msg.status}…
          </div>
        )}
        {msg.error && <div className="error-note">⚠ {msg.error}</div>}
      </div>
    </div>
  );
}

function BlockView({ block, streaming }: { block: Block; streaming: boolean }) {
  if (block.t === "fig") return <FigureCard f={block.f} />;

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
  return <>{parts}</>;
}

function Md({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function FigureCard({ f }: { f: FigureData }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <figure className="figure-card" onClick={() => setZoom(true)}>
        <img src={f.file} alt={f.title} loading="lazy" />
        <figcaption>
          <span className="fig-title">{f.caption || f.title}</span>
          <span className="fig-src">
            {f.source.replace(".pdf", "")} · p.{f.page}
          </span>
        </figcaption>
      </figure>
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img src={f.file} alt={f.title} />
          <div className="lightbox-caption">
            {f.title} — {f.source} p.{f.page} (click to close)
          </div>
        </div>
      )}
    </>
  );
}
