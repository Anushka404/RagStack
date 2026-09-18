export type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type Thread = {
  threadId: string;
  messages: ThreadMessage[];
  entities: string[];
};
