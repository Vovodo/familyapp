export function isTempId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith('temp-');
}

export function asCompletedFlag(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 't' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 'f' || value === 0 || value === '0') return false;
  return undefined;
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

type Completable = {
  id: string;
  title?: string;
  quantity?: string;
  category?: string;
  is_completed: boolean;
  completed_by_name?: string;
  created_at?: string;
};

export function sortShoppingItems<T extends Completable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Sunucu listesini yerel in-flight işlemlerin üzerine oturtur.
 * Eski GET yanıtı, henüz onaylanmamış silme/işaretlemeyi geri alamaz.
 */
export function rebaseShoppingFromServer<T extends Completable>(
  serverItems: T[],
  prev: T[],
  pending: {
    tombstones: Set<string>;
    completions: Map<string, boolean>;
    appliedAt: Map<string, number>;
    snapshotStartedAt: number;
  }
): T[] {
  const serverList = Array.isArray(serverItems) ? serverItems.filter((item) => item?.id) : [];
  const serverIds = new Set(serverList.map((item) => item.id));

  for (const id of [...pending.tombstones]) {
    const applied = pending.appliedAt.get(id) ?? 0;
    if (!serverIds.has(id) && applied <= pending.snapshotStartedAt) {
      pending.tombstones.delete(id);
    }
  }

  const temps = prev.filter(
    (item) =>
      isTempId(item.id) &&
      !serverList.some(
        (server) =>
          server.title === item.title &&
          server.quantity === item.quantity &&
          server.category === item.category
      )
  );

  const next = serverList
    .filter((item) => {
      if (!pending.tombstones.has(item.id)) return true;
      const deletedAt = pending.appliedAt.get(item.id) ?? 0;
      return deletedAt < pending.snapshotStartedAt;
    })
    .map((item) => {
      const intended = pending.completions.get(item.id);
      const applied = pending.appliedAt.get(item.id) ?? 0;
      const completed = asCompletedFlag(item.is_completed);
      const serverItem = {
        ...item,
        is_completed: completed ?? !!item.is_completed,
      };
      const local = prev.find((p) => p.id === item.id);

      if (intended !== undefined) {
        return {
          ...serverItem,
          is_completed: intended,
          completed_by_name: intended
            ? local?.completed_by_name || serverItem.completed_by_name
            : undefined,
        };
      }

      if (applied >= pending.snapshotStartedAt && local) {
        return {
          ...serverItem,
          is_completed: local.is_completed,
          completed_by_name: local.is_completed
            ? local.completed_by_name || serverItem.completed_by_name
            : undefined,
        };
      }
      return serverItem;
    });

  return sortShoppingItems(dedupeById([...temps, ...next]));
}
