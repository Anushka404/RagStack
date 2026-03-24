export type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type Thread = {
  threadId: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
  entities: string[];
  lastDocumentRef: string | null;
  lastRetrievalQuery: string | null;
};
