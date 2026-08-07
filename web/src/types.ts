export interface FigureData {
  id: string;
  file: string;
  page: number;
  source: string;
  title: string;
  caption?: string;
}

export type Block =
  | { t: "text"; s: string }
  | { t: "fig"; f: FigureData };

export interface Msg {
  role: "user" | "assistant";
  blocks: Block[];
  images?: string[]; // data URLs of user-attached photos
  status?: string | null; // live tool status while streaming
  error?: string;
}
