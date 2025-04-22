let lastResolvedEntity: string | null = null;

export function setLastEntity(entity: string) {
  lastResolvedEntity = entity;
}

export function getLastEntity(): string | null {
  return lastResolvedEntity;
}

export function clearEntityMemory() {
  lastResolvedEntity = null;
}
