import {
  query,
  tool,
  createSdkMcpServer,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "node:fs";
import {
  figures,
  manualPageHref,
  manualPagePath,
  searchKnowledge,
  specs,
  type Section,
} from "./knowledge.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import {
  calculateDutyCycle,
  selectProcess,
  type WidgetData,
} from "./widgets.js";

export interface EvidenceItem {
  id: string;
  label: string;
  source: "manual" | "quickstart" | "chart";
  page: number;
  href: string;
  detail?: string;
}

export interface ChatEvent {
  type: "text_delta" | "figure" | "widget" | "evidence" | "tool" | "done" | "error";
  text?: string;
  figure?: { id: string; file: string; page: number; source: string; title: string; caption?: string };
  widget?: WidgetData;
  evidence?: EvidenceItem[];
  tool?: { name: string; detail?: string };
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
  inputTokens?: number;
  outputTokens?: number;
  message?: string;
}

const SPEC_TOPICS = Object.keys(specs) as string[];

/**
 * Runs one agent turn. Tool handlers close over `emit`, so figure directives
 * stream to the UI at the moment the model calls the tool.
 */
export interface UserImage {
  /** base64 payload, no data: prefix */
  data: string;
  mimeType: string;
}

export async function runAgent(
  message: string,
  sessionId: string | undefined,
  emit: (e: ChatEvent) => void,
  signal?: AbortSignal,
  images?: UserImage[],
): Promise<void> {
  const startedAt = Date.now();
  let dutyCycleWidgetEmitted = false;
  const mcp = createSdkMcpServer({
    name: "manual",
    version: "1.0.0",
    tools: [
      tool(
        "search_manual",
        "Search the OmniPro 220 knowledge base (owner's manual, quick-start guide, selection chart — all hand-verified with page citations). Returns the most relevant sections. Use before answering any technical question.",
        { query: z.string().describe("What to look up, e.g. 'duty cycle MIG 240V' or 'porosity flux-cored causes'") },
        async ({ query: q }) => {
          const hits = searchKnowledge(q, 4);
          const evidence = evidenceFromSections(hits);
          if (evidence.length) emit({ type: "evidence", evidence });
          const text = hits.length
            ? hits.map((h) => `### From: ${h.doc}\n${h.body}`).join("\n\n---\n\n")
            : "No sections matched. Try different terms, get_specs for numbers, or read_manual_page for the original page.";
          return { content: [{ type: "text", text }] };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "get_specs",
        `Exact structured data extracted from the manual. Topics: ${SPEC_TOPICS.join(", ")}. Use for any number you plan to state or put in an artifact (duty cycles, amp ranges, polarity map, gas flows, tension settings).`,
        {
          topic: z
            .enum(SPEC_TOPICS as [string, ...string[]])
            .describe("Which spec group to fetch"),
        },
        async ({ topic }) => {
          const evidence = evidenceFromSpec(topic, specs[topic]);
          if (evidence.length) emit({ type: "evidence", evidence });
          return {
            content: [{ type: "text", text: JSON.stringify(specs[topic], null, 2) }],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "calculate_duty_cycle",
        "Calculate and render a deterministic, manual-grounded duty-cycle card. The card already lets the user switch among every process and voltage, so call it once per turn even for comparisons. Always use it for duty-cycle questions instead of writing calculator code.",
        {
          process: z.enum(["MIG / Flux-Cored", "TIG", "Stick"]),
          voltage: z.enum(["120V", "240V"]),
          amps: z.number().min(1).max(500),
        },
        async ({ process, voltage, amps }) => {
          const widget = calculateDutyCycle(process, voltage, amps);
          const suppressed = dutyCycleWidgetEmitted;
          if (!dutyCycleWidgetEmitted) {
            emit({ type: "widget", widget });
            dutyCycleWidgetEmitted = true;
          }
          emit({
            type: "evidence",
            evidence: [
              {
                id: `manual:${widget.source.page}:duty-cycle`,
                label: widget.source.label,
                source: "manual",
                page: widget.source.page,
                href: widget.source.href,
                detail: "Published rated and continuous duty-cycle points",
              },
            ],
          });
          return {
            content: [
              {
                type: "text",
                text:
                  (suppressed
                    ? "NOTE: the interactive card from your first call is already on screen — it lets the user switch process/voltage/amps themselves, so do NOT describe this second result as a separate card. Data for your prose:\n"
                    : "") + JSON.stringify(widget, null, 2),
              },
            ],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "select_process",
        "Render a deterministic process decision card from the image-only selection chart. Use when the user asks which welding process fits a material, thickness, environment, or goal.",
        {
          material: z.enum(["steel", "stainless", "aluminum", "chrome-moly", "cast-iron"]),
          gauge: z.number().int().min(0).max(30).optional(),
          environment: z.enum(["indoors", "outdoors"]),
          priority: z.enum(["easy", "clean", "penetration", "precision"]),
        },
        async (input) => {
          const widget = selectProcess(input);
          emit({ type: "widget", widget });
          emit({
            type: "evidence",
            evidence: [
              {
                id: "chart:1:process-selection",
                label: widget.source.label,
                source: "chart",
                page: 1,
                href: widget.source.href,
                detail: "Image-only process comparison matrix",
              },
            ],
          });
          return { content: [{ type: "text", text: JSON.stringify(widget, null, 2) }] };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "show_figure",
        "Display a real figure from the manual in the chat, right where you are in your answer. Use whenever the answer relates to something visual. Pass a short caption tying it to the user's question.",
        {
          id: z.string().describe("Figure id from the catalog in your instructions"),
          caption: z.string().optional().describe("One-line caption shown under the image"),
        },
        async ({ id, caption }) => {
          const fig = figures.find((f) => f.id === id);
          if (!fig) {
            return {
              content: [
                {
                  type: "text",
                  text: `Unknown figure id "${id}". Valid ids: ${figures.map((f) => f.id).join(", ")}`,
                },
              ],
              isError: true,
            };
          }
          emit({ type: "figure", figure: { ...fig, caption } });
          const source = sourceKey(fig.source);
          emit({
            type: "evidence",
            evidence: [
              {
                id: `${source}:${fig.page}:figure:${fig.id}`,
                label: `${fig.title} · p.${fig.page}`,
                source,
                page: fig.page,
                href: manualPageHref(fig.source, fig.page),
                detail: "Original manual figure surfaced in the answer",
              },
            ],
          });
          return {
            content: [
              {
                type: "text",
                text: `Displayed "${fig.title}" (${fig.source} p.${fig.page}) to the user. Refer to it naturally; no need to describe every detail.`,
              },
            ],
          };
        },
      ),
      tool(
        "read_manual_page",
        "View the original rendered page image (vision). Use for dense visual content the knowledge base can't fully convey — the wiring schematic, exact table layouts, or to double-check a detail. Sources: 'manual' (pp.1-48), 'quickstart' (pp.1-2), 'chart' (p.1).",
        {
          source: z.enum(["manual", "quickstart", "chart"]).default("manual"),
          page: z.number().int().min(1).max(48),
        },
        async ({ source, page }) => {
          const p = manualPagePath(source, page);
          if (!p) {
            return {
              content: [{ type: "text", text: `No page ${page} for source "${source}".` }],
              isError: true,
            };
          }
          emit({
            type: "evidence",
            evidence: [
              {
                id: `${source}:${page}:page`,
                label: `${sourceLabel(source)} p.${page}`,
                source,
                page,
                href: manualPageHref(source, page),
                detail: "Original rendered source page inspected by the agent",
              },
            ],
          });
          return {
            content: [
              {
                type: "image",
                data: fs.readFileSync(p).toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });

  // Text-only goes as a plain string; with photos we stream one user message
  // whose content mixes image blocks (e.g. the user's weld bead) and text.
  const prompt =
    !images || images.length === 0
      ? message
      : (async function* () {
          yield {
            type: "user" as const,
            message: {
              role: "user" as const,
              content: [
                ...images.map((img) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mimeType,
                    data: img.data,
                  },
                })),
                { type: "text" as const, text: message },
              ],
            },
            parent_tool_use_id: null,
            session_id: sessionId ?? "",
          };
        })();

  let finalSessionId = sessionId;
  try {
    const stream = query({
      prompt: prompt as any,
      options: {
        model: process.env.CLAUDE_MODEL || "claude-opus-5",
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: { manual: mcp },
        tools: [], // no built-in file/bash tools — this is a product server
        allowedTools: ["mcp__manual__*"],
        permissionMode: "dontAsk",
        settingSources: [], // fully isolated from any local Claude Code config
        includePartialMessages: true,
        maxTurns: 12,
        maxBudgetUsd: envNumber("MAX_BUDGET_USD_PER_TURN", 0.75, 0.05, 10),
        resume: sessionId,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        } as Record<string, string>,
        abortController: signal ? abortFrom(signal) : undefined,
      },
    });

    for await (const m of stream as AsyncIterable<SDKMessage>) {
      if (m.type === "system" && (m as any).subtype === "init") {
        finalSessionId = (m as any).session_id ?? finalSessionId;
      } else if (m.type === "stream_event") {
        const ev: any = (m as any).event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          emit({ type: "text_delta", text: ev.delta.text });
        } else if (
          ev?.type === "content_block_start" &&
          ev.content_block?.type === "tool_use"
        ) {
          const name: string = ev.content_block.name ?? "";
          if (name && !name.endsWith("show_figure")) {
            emit({ type: "tool", tool: { name: prettyToolName(name), detail: name.replace(/^mcp__manual__/, "") } });
          }
        }
      } else if (m.type === "result") {
        const r: any = m;
        finalSessionId = r.session_id ?? finalSessionId;
        if (r.subtype === "success") {
          emit({
            type: "done",
            sessionId: finalSessionId,
            costUsd: r.total_cost_usd,
            durationMs: r.duration_ms ?? Date.now() - startedAt,
            turns: r.num_turns,
            inputTokens: r.usage?.input_tokens,
            outputTokens: r.usage?.output_tokens,
          });
        } else {
          emit({
            type: "error",
            message: `Agent stopped early (${r.subtype}). Try again or start a new chat.`,
            sessionId: finalSessionId,
          });
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) return;
    emit({ type: "error", message: err?.message ?? "Agent error" });
  }
}

function prettyToolName(raw: string): string {
  const name = raw.replace(/^mcp__manual__/, "");
  return (
    {
      search_manual: "Searching the manual",
      get_specs: "Pulling exact specs",
      calculate_duty_cycle: "Calculating from published ratings",
      select_process: "Comparing welding processes",
      read_manual_page: "Reading a manual page",
    }[name] ?? name
  );
}

function evidenceFromSections(hits: Section[]): EvidenceItem[] {
  const output: EvidenceItem[] = [];
  for (const hit of hits) {
    // Classify by the document title only — body text may legitimately
    // mention other source filenames without changing this section's source.
    const source = /selection.chart|choosing a welding process/i.test(hit.doc)
      ? "chart"
      : /quick.start/i.test(hit.doc)
        ? "quickstart"
        : "manual";
    const pages = source === "chart" ? [1] : extractPages(`${hit.doc} ${hit.heading} ${hit.body}`);
    for (const page of pages.slice(0, 4)) {
      if (!manualPagePath(source, page)) continue; // never link a page that doesn't exist
      output.push({
        id: `${source}:${page}:${slug(hit.heading)}`,
        label: `${hit.heading} · p.${page}`,
        source,
        page,
        href: manualPageHref(source, page),
        detail: hit.doc,
      });
    }
  }
  return uniqueEvidence(output).slice(0, 8);
}

function evidenceFromSpec(topic: string, value: unknown): EvidenceItem[] {
  const pages = new Set<number>();
  collectPages(value, pages);
  return [...pages].slice(0, 8).map((page) => ({
    id: `manual:${page}:spec:${slug(topic)}`,
    label: `${topic} specifications · p.${page}`,
    source: "manual",
    page,
    href: manualPageHref("manual", page),
    detail: "Structured value extracted from the owner’s manual",
  }));
}

function collectPages(value: unknown, pages: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPages(item, pages);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "page") {
      for (const page of Array.isArray(item) ? item : [item]) if (typeof page === "number") pages.add(page);
    } else {
      collectPages(item, pages);
    }
  }
}

function extractPages(text: string): number[] {
  const pages = new Set<number>();
  // Handles single cites (p.19), comma lists (pp.19, 23, 29), and ranges
  // (pp.42–44) — including combinations like "pp.35-37, 43".
  for (const match of text.matchAll(
    /\bpp?\.\s*(\d{1,2}(?:\s*[-–]\s*\d{1,2})?(?:\s*,\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?)*)/gi,
  )) {
    for (const chunk of match[1].split(",")) {
      const range = chunk.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/);
      if (!range) continue;
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : start;
      if (end >= start && end - start <= 10) {
        for (let page = start; page <= end; page++) pages.add(page);
      } else {
        pages.add(start);
      }
    }
  }
  return [...pages];
}

function uniqueEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function sourceKey(source: string): EvidenceItem["source"] {
  if (source === "quick-start-guide.pdf" || source === "quickstart") return "quickstart";
  if (source === "selection-chart.pdf" || source === "chart") return "chart";
  return "manual";
}

function sourceLabel(source: EvidenceItem["source"]): string {
  return source === "manual" ? "Owner’s manual" : source === "quickstart" ? "Quick-start guide" : "Process chart";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function abortFrom(signal: AbortSignal): AbortController {
  const ac = new AbortController();
  if (signal.aborted) ac.abort();
  else signal.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}
