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
  manualPagePath,
  searchKnowledge,
  specs,
} from "./knowledge.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export interface ChatEvent {
  type: "text_delta" | "figure" | "tool" | "done" | "error";
  text?: string;
  figure?: { id: string; file: string; page: number; source: string; title: string; caption?: string };
  tool?: { name: string; detail?: string };
  sessionId?: string;
  costUsd?: number;
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
        async ({ topic }) => ({
          content: [
            { type: "text", text: JSON.stringify(specs[topic], null, 2) },
          ],
        }),
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

  const stream = query({
    prompt: prompt as any,
    options: {
      model: process.env.CLAUDE_MODEL || "claude-opus-5",
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { manual: mcp },
      tools: [], // no built-in file/bash tools — this is a product server
      allowedTools: ["mcp__manual__*"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: [], // fully isolated from any local Claude Code config

      includePartialMessages: true,
      maxTurns: 24,
      resume: sessionId,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      } as Record<string, string>,
      abortController: signal ? abortFrom(signal) : undefined,
    },
  });

  let finalSessionId = sessionId;
  try {
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
            emit({ type: "tool", tool: { name: prettyToolName(name) } });
          }
        }
      } else if (m.type === "result") {
        const r: any = m;
        finalSessionId = r.session_id ?? finalSessionId;
        if (r.subtype === "success") {
          emit({ type: "done", sessionId: finalSessionId, costUsd: r.total_cost_usd });
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
      read_manual_page: "Reading a manual page",
    }[name] ?? name
  );
}

function abortFrom(signal: AbortSignal): AbortController {
  const ac = new AbortController();
  if (signal.aborted) ac.abort();
  else signal.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}
