export function isTempId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith('temp-');
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function reconcileRemoteInsert<T extends { id: string }>(
  prev: T[],
  incoming: T,
  isSamePendingItem: (local: T, incoming: T) => boolean
): T[] {
  if (!incoming?.id) return prev;
  if (prev.some((item) => item.id === incoming.id)) {
    return prev.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item));
  }
  const tempIndex = prev.findIndex((item) => isTempId(item.id) && isSamePendingItem(item, incoming));
  if (tempIndex >= 0) {
    const next = [...prev];
    next[tempIndex] = { ...prev[tempIndex], ...incoming };
    return next;
  }
  return [incoming, ...prev];
}

export function commitTempItem<T extends { id: string }>(
  prev: T[],
  tempId: string,
  serverItem: T
): T[] {
  if (!serverItem?.id) {
    return prev.filter((item) => item.id !== tempId);
  }
  const localTemp = prev.find((item) => item.id === tempId);
  const merged = { ...(localTemp as T | undefined), ...serverItem };
  const others = prev.filter((item) => item.id !== tempId && item.id !== serverItem.id);
  const insertAt = prev.findIndex((item) => item.id === tempId);
  if (insertAt < 0) {
    return dedupeById([merged, ...others]);
  }
  const next = [...others];
  next.splice(Math.min(insertAt, next.length), 0, merged);
  return dedupeById(next);
}

export function prependUnique<T extends { id: string }>(prev: T[], item: T): T[] {
  if (!item?.id) return prev;
  if (prev.some((existing) => existing.id === item.id)) {
    return prev.map((existing) => (existing.id === item.id ? { ...existing, ...item } : existing));
  }
  return [item, ...prev];
}
