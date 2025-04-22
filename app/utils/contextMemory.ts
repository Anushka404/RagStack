// contextMemory.ts

type MemoryEntry = {
  entity: string;
  expiresAt: number;
};

const memoryMap = new Map<string, MemoryEntry>();
const EXPIRY_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function setLastEntity(userId: string, entity: string) {
  memoryMap.set(userId, {
    entity,
    expiresAt: Date.now() + EXPIRY_DURATION_MS,
  });
}

export function getLastEntity(userId: string): string | null {
  const entry = memoryMap.get(userId);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryMap.delete(userId);
    return null;
  }

  return entry.entity;
}

export function clearEntityMemory(userId: string) {
  memoryMap.delete(userId);
}
