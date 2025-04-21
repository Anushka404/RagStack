// lib/contextMemory.ts

export type Message = {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  };
  
  const contextMemory = new Map<string, Message[]>();
  const TTL = 30 * 60 * 1000; // 30 minutes
  
  export function addToMemory(userId: string, role: 'user' | 'assistant', content: string) {
    const now = Date.now();
    const existing = contextMemory.get(userId) || [];
    const updated = [...existing, { role, content, timestamp: now }]
      .filter(m => now - m.timestamp <= TTL);
    contextMemory.set(userId, updated);
  }
  
  export function getRecentContext(userId: string): Message[] {
    const now = Date.now();
    const messages = contextMemory.get(userId) || [];
    return messages.filter(m => now - m.timestamp <= TTL);
  }
  
  export function clearContext(userId: string) {
    contextMemory.delete(userId);
  }
  