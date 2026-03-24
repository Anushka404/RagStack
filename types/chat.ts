export type SourceRef = {
  fileName: string;
  pageNumber: number | null;
  textPreview: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
};
