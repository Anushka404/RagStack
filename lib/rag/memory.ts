import { Thread, ThreadMessage } from "@/types/memory";

const threadStore = new Map<string, Thread>();
const MAX_MESSAGES = 10;
const MAX_ENTITIES = 5;
const TTL_MS = 25 * 60 * 1000; // 25 minutes

function now() {
  return Date.now();
}

/**
 * Returns an existing thread or creates a fresh one.
 * Also checks and evicts expired threads.
 */
export function getOrCreateThread(threadId: string): Thread {
  evictExpiredThreads();

  const existing = threadStore.get(threadId);
  if (existing) {
    existing.updatedAt = now();
    return existing;
  }

  const thread: Thread = {
    threadId,
    createdAt: now(),
    updatedAt: now(),
    messages: [],
    entities: [],
    lastDocumentRef: null,
    lastRetrievalQuery: null,
  };

  threadStore.set(threadId, thread);
  return thread;
}

/**
 * Appends a message to the thread, keeping at most MAX_MESSAGES.
 */
export function addMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string
): void {
  const thread = getOrCreateThread(threadId);
  const msg: ThreadMessage = { role, content, timestamp: now() };
  thread.messages.push(msg);
  if (thread.messages.length > MAX_MESSAGES) {
    thread.messages = thread.messages.slice(-MAX_MESSAGES);
  }
  thread.updatedAt = now();
}

/**
 * Pushes an entity into the thread's entity list.
 * Deduplicates and keeps only the last MAX_ENTITIES.
 */
export function setEntity(threadId: string, entity: string): void {
  const thread = getOrCreateThread(threadId);
  thread.entities = [...thread.entities.filter((e) => e !== entity), entity].slice(
    -MAX_ENTITIES
  );
  thread.updatedAt = now();
}

/**
 * Sets the last retrieval query for the thread.
 */
export function setLastRetrievalQuery(threadId: string, query: string): void {
  const thread = getOrCreateThread(threadId);
  thread.lastRetrievalQuery = query;
  thread.updatedAt = now();
}

/**
 * Sets the last referenced document for the thread.
 */
export function setLastDocumentRef(threadId: string, ref: string): void {
  const thread = getOrCreateThread(threadId);
  thread.lastDocumentRef = ref;
  thread.updatedAt = now();
}

/**
 * Clears a thread completely (all messages, entities, etc.).
 */
export function clearThread(threadId: string): void {
  threadStore.delete(threadId);
}

/**
 * Clears all threads that have exceeded the TTL.
 */
function evictExpiredThreads(): void {
  const cutoff = now() - TTL_MS;
  for (const [id, thread] of threadStore.entries()) {
    if (thread.updatedAt < cutoff) {
      threadStore.delete(id);
    }
  }
}
