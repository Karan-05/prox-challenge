# Security and deployment model

## Trust boundaries

- User text and images are untrusted.
- Manual Markdown, structured specifications, figure metadata, and page images are committed application data.
- Model text and generated artifact code are untrusted output.
- The Anthropic API key remains server-side.

## Controls

The chat endpoint enforces message length, supported MIME types, strict base64 shape, decoded per-image and total-image limits, request rate, per-client concurrency, a wall-clock timeout, SDK turn limit, and per-query dollar budget.

Browser-visible conversation IDs are random opaque tokens. The corresponding SDK session ID stays in a server-side map, is bound to the originating client, and expires after six hours. A client cannot submit a raw SDK session identifier.

The agent receives no Bash or filesystem tools, loads no local Claude configuration, runs with non-interactive denial semantics, and can invoke only the six in-process manual MCP tools.

Generated artifacts execute in an iframe with `sandbox="allow-scripts"`, no same-origin access, an explicit CSP, `connect-src 'none'`, no forms, no nested frames, and no object/media sources. The parent observes a readiness/error bridge and a render timeout. Exact numerical widgets do not use generated code.

The Docker build excludes secrets and host dependencies, separates build/runtime stages, installs production dependencies only in the final image, and runs as the unprivileged `node` user.

## Production recommendations

The included in-memory rate/session stores are appropriate for the challenge’s single process. A multi-replica service should use Redis, a shared session adapter, centralized telemetry, and edge-level rate limiting. Set budgets appropriate to the deployment and monitor model usage rather than treating SDK estimates as billing records.

Do not log image payloads, API keys, raw authorization headers, or complete sensitive conversations. Retain only the minimum operational metadata needed for request IDs, latency, model usage, tool selection, and errors.
