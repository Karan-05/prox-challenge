import React, { useEffect, useMemo, useRef, useState } from "react";

/** Sandboxed renderer for agent-generated artifacts (react | svg | html). */
export default function ArtifactFrame({
  lang,
  code,
}: {
  lang: string;
  code: string;
}) {
  const [tall, setTall] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [contentHeight, setContentHeight] = useState(460);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(() => buildDoc(lang, code), [lang, code]);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.channel !== "omnipro-artifact") return;
      if (event.data.type === "ready") setStatus((current) => (current === "error" ? current : "ready"));
      if (event.data.type === "error") {
        setStatus("error");
        setError(String(event.data.message || "Artifact failed to render"));
      }
      if (event.data.type === "resize" && Number.isFinite(event.data.height)) {
        setContentHeight(Math.min(900, Math.max(320, Math.ceil(event.data.height))));
      }
    };
    window.addEventListener("message", receive);
    const timer = window.setTimeout(() => {
      setStatus((current) => {
        if (current === "loading") setError("Artifact did not report ready within 12 seconds.");
        return current === "loading" ? "error" : current;
      });
    }, 12_000);
    return () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(timer);
    };
  }, [srcDoc]);

  return (
    <div className="artifact">
      <div className="artifact-bar">
        <span className="artifact-dot" />
        <span className="artifact-label">
          Interactive {lang === "svg" ? "diagram" : "artifact"}
        </span>
        <span className={`artifact-status ${status}`}>
          {status === "loading" ? "Loading" : status === "ready" ? "Ready" : "Render error"}
        </span>
        <div className="artifact-actions">
          <button onClick={() => setShowCode((v) => !v)}>
            {showCode ? "Preview" : "Code"}
          </button>
          <button onClick={() => setTall((v) => !v)}>
            {tall ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {showCode ? (
        <pre className="artifact-code">{code}</pre>
      ) : (
        <iframe
          ref={frameRef}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          style={{ height: tall ? Math.max(760, contentHeight) : contentHeight }}
          title="artifact"
          loading="lazy"
        />
      )}
      {error && <div className="artifact-error" role="alert">⚠ {error}</div>}
    </div>
  );
}

export function buildDoc(lang: string, code: string): string {
  const runtimeOrigin = typeof window === "undefined" ? "http://localhost:3001" : window.location.origin;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${runtimeOrigin} https://cdn.tailwindcss.com; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
  const base = `<style>
    body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;}
    ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
  </style>`;
  const bridge = `<script>
    (function(){
      var send=function(type,extra){ parent.postMessage(Object.assign({channel:'omnipro-artifact',type:type},extra||{}),'*'); };
      window.__artifactReady=function(){ send('ready'); requestAnimationFrame(function(){ send('resize',{height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)}); }); };
      window.addEventListener('error',function(event){ send('error',{message:String(event.message||'Artifact runtime error')}); });
      window.addEventListener('unhandledrejection',function(event){ send('error',{message:String(event.reason?.message||event.reason||'Artifact promise rejected')}); });
      window.addEventListener('load',function(){ setTimeout(window.__artifactReady,0); });
      new ResizeObserver(function(){ send('resize',{height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)}); }).observe(document.documentElement);
    })();
  </script>`;

  if (lang === "svg") {
    return `<!doctype html><html><head>${csp}${base}<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:12px;box-sizing:border-box}svg{max-width:100%;height:auto}</style></head><body>${code}${bridge}</body></html>`;
  }

  if (lang === "html") {
    const sanitized = code.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
    if (/<html[\s>]/i.test(sanitized)) {
      const withHead = /<head[\s>]/i.test(sanitized)
        ? sanitized.replace(/<head([^>]*)>/i, `<head$1>${csp}`)
        : sanitized.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${base}</head>`);
      return withHead.replace(/<\/body>/i, `${bridge}</body>`);
    }
    return `<!doctype html><html><head>${csp}${base}<script src="https://cdn.tailwindcss.com"></script></head><body>${sanitized}${bridge}</body></html>`;
  }

  // react — sanitize module syntax the model occasionally emits despite instructions
  const escaped = code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^\s*import\s[^\n]*$/gm, "")
    .replace(/^\s*export\s+default\s+function\s+App/m, "function App")
    .replace(/^\s*export\s+default\s+App\s*;?\s*$/m, "")
    .replace(/^\s*export\s+/gm, "")
    .replace(/\b(ReactDOM\.createRoot\([^)]*\)\.render\([^;]*\);?|ReactDOM\.render\([^;]*\);?)\s*$/m, "")
    .replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head>${csp}${base}
  <script src="${runtimeOrigin}/artifact-runtime/react.js"></script>
  <script src="${runtimeOrigin}/artifact-runtime/react-dom.js"></script>
  <script src="${runtimeOrigin}/artifact-runtime/babel.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  </head><body><div id="root"></div>${bridge}
  <script>
    window.addEventListener('error', function(e){
      var r=document.getElementById('root');
      if(r&&!r.hasChildNodes()){var d=document.createElement('div');d.style.cssText='padding:16px;color:#fca5a5;font:13px monospace';d.textContent='Artifact error: '+String(e.message);r.appendChild(d);}
    });
  </script>
  <script type="text/babel" data-presets="react">
${escaped}
try {
  const _root = ReactDOM.createRoot(document.getElementById('root'));
  _root.render(React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', null, 'Define function App() { ... }'))));
  requestAnimationFrame(function(){ window.__artifactReady(); });
} catch (e) {
  var root=document.getElementById('root');var message=document.createElement('div');message.style.cssText='padding:16px;color:#fca5a5';message.textContent='Artifact error: '+String(e.message);root.replaceChildren(message);parent.postMessage({channel:'omnipro-artifact',type:'error',message:String(e.message)},'*');
}
  </script></body></html>`;
}
