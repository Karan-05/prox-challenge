export interface FigureData {
  id: string;
  file: string;
  page: number;
  source: string;
  title: string;
  caption?: string;
}

export interface EvidenceItem {
  id: string;
  label: string;
  source: "manual" | "quickstart" | "chart";
  page: number;
  href: string;
  detail?: string;
}

export interface DutyCycleWidgetData {
  kind: "duty-cycle";
  title: string;
  process: "MIG / Flux-Cored" | "TIG" | "Stick";
  voltage: "120V" | "240V";
  amps: number;
  currentRange: { min: number; max: number };
  published: { ratedPercent: number; ratedAmps: number; continuousAmps: number };
  matrix: Record<DutyCycleWidgetData["process"], Record<DutyCycleWidgetData["voltage"], {
    currentRange: { min: number; max: number };
    ratedPercent: number;
    ratedAmps: number;
    continuousAmps: number;
    page: number;
  }>>;
  result: DutyCycleResult;
  source: { label: string; page: number; href: string };
}

export interface DutyCycleResult {
  status: "continuous" | "exact" | "conservative" | "unsupported" | "out-of-range";
  percent: number | null;
  weldMinutes: number | null;
  restMinutes: number | null;
  label: string;
  explanation: string;
}

export interface ProcessSelectionWidgetData {
  kind: "process-selection";
  title: string;
  inputs: {
    material: string;
    gauge?: number;
    environment: string;
    priority: string;
  };
  recommendation: string;
  summary: string;
  processes: Array<{
    name: string;
    fit: "recommended" | "possible" | "not-suited";
    gas: string;
    thickness: string;
    reason: string;
  }>;
  source: { label: string; page: number; href: string };
}

export type WidgetData = DutyCycleWidgetData | ProcessSelectionWidgetData;

export type Block =
  | { t: "text"; s: string }
  | { t: "fig"; f: FigureData }
  | { t: "widget"; w: WidgetData };

export interface Msg {
  role: "user" | "assistant";
  blocks: Block[];
  images?: string[]; // data URLs of user-attached photos
  evidence?: EvidenceItem[];
  meta?: {
    costUsd?: number;
    durationMs?: number;
    turns?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  status?: string | null; // live tool status while streaming
  error?: string;
}
