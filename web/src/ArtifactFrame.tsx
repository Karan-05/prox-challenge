import React, { useMemo, useState } from "react";

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

  const srcDoc = useMemo(() => buildDoc(lang, code), [lang, code]);

  return (
    <div className="artifact">
      <div className="artifact-bar">
        <span className="artifact-dot" />
        <span className="artifact-label">
          Interactive {lang === "svg" ? "diagram" : "artifact"}
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
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          style={{ height: tall ? 760 : 460 }}
          title="artifact"
        />
      )}
    </div>
  );
}

function buildDoc(lang: string, code: string): string {
  const base = `<style>
    body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;}
    ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
  </style>`;

  if (lang === "svg") {
    return `<!doctype html><html><head>${base}<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:12px;box-sizing:border-box}svg{max-width:100%;height:auto}</style></head><body>${code}</body></html>`;
  }

  if (lang === "html") {
    // Full documents pass through; fragments get the dark base + Tailwind.
    if (/<html[\s>]/i.test(code)) return code;
    return `<!doctype html><html><head>${base}<script src="https://cdn.tailwindcss.com"></script></head><body>${code}</body></html>`;
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
  return `<!doctype html><html><head>${base}
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  </head><body><div id="root"></div>
  <script>
    window.addEventListener('error', function(e){
      var r=document.getElementById('root');
      if(r&&!r.hasChildNodes()){r.innerHTML='<div style="padding:16px;color:#fca5a5;font:13px JetBrains Mono,monospace">Artifact error: '+String(e.message).replace(/</g,'&lt;')+'</div>';}
    });
  </script>
  <script type="text/babel" data-presets="react">
${escaped}
try {
  const _root = ReactDOM.createRoot(document.getElementById('root'));
  _root.render(React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', null, 'Define function App() { ... }'))));
} catch (e) {
  document.getElementById('root').innerHTML = '<div style="padding:16px;color:#fca5a5">Artifact error: ' + e.message + '</div>';
}
  </script></body></html>`;
}
