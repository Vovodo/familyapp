import { Message } from '../types';

const DB_NAME = 'ailem_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'chat_messages';
const LOCAL_KEEP = 2000;
const FALLBACK_KEEP = 40;

const memoryCache = new Map<string, Message[]>();

export function isEphemeralMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('data:');
}

export function isDurableMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function isLocalVaultUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.startsWith('capacitor://') ||
    url.startsWith('file://') ||
    url.includes('/_capacitor_file_') ||
    url.includes('family/images/') ||
    url.includes('family/audio/')
  );
}

function pollVoteCount(poll?: { total_votes?: number; tallies?: Record<string | number, number> } | null): number {
  if (!poll) return 0;
  const fromTotal = Number(poll.total_votes);
  if (Number.isFinite(fromTotal) && fromTotal > 0) return fromTotal;
  return Object.values(poll.tallies || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function mergePollState<T extends { my_vote?: number | null; total_votes?: number; tallies?: Record<string | number, number>; voters?: Record<string | number, unknown> }>(
  existing: T | undefined,
  incoming: T
): T {
  if (!existing) return incoming;

  const localCount = pollVoteCount(existing);
  const incomingCount = pollVoteCount(incoming);
  const keepLocalCounts = localCount > incomingCount;
  const keepLocalVote =
    existing.my_vote !== undefined &&
    existing.my_vote !== null &&
    (incoming.my_vote === undefined || incoming.my_vote === null);

  return {
    ...incoming,
    my_vote: keepLocalVote ? existing.my_vote : incoming.my_vote ?? existing.my_vote,
    tallies: keepLocalCounts ? existing.tallies || incoming.tallies : incoming.tallies || existing.tallies,
    voters: keepLocalCounts ? existing.voters || incoming.voters : incoming.voters || existing.voters,
    total_votes: Math.max(localCount, incomingCount),
  };
}

function sanitizeForDisk(messages: Message[]): Message[] {
  return messages.slice(-LOCAL_KEEP).map((m) => {
    const mediaUrl = isEphemeralMediaUrl(m.media_url) ? undefined : m.media_url;
    return {
      ...m,
      media_url: mediaUrl,
    };
  });
}

function compactFallback(messages: Message[]): Message[] {
  return messages.slice(-FALLBACK_KEEP).map((m) => ({
    ...m,
    media_url: isDurableMediaUrl(m.media_url) ? m.media_url : undefined,
    media_thumbnail_url: isDurableMediaUrl(m.media_thumbnail_url) ? m.media_thumbnail_url : undefined,
  }));
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'family_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Reconciles two message lists without losing optimistic, failed, or local vault paths.
 */
export function reconcileMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();

  for (const m of current) {
    const key = m.client_message_id || m.id;
    map.set(key, m);
    map.set(m.id, m);
  }

  for (const inc of incoming) {
    const clientKey = inc.client_message_id;
    let existing: Message | undefined;
    if (clientKey && map.has(clientKey)) {
      existing = map.get(clientKey)!;
      map.delete(existing.id);
      map.delete(clientKey);
    } else if (map.has(inc.id)) {
      existing = map.get(inc.id);
      map.delete(inc.id);
    }

    let mergedPoll = inc.poll;
    if (inc.media_type === 'poll' && inc.poll) {
      mergedPoll = mergePollState(existing?.poll, inc.poll);
    }

    const durableIncoming = isDurableMediaUrl(inc.media_url) ? inc.media_url : undefined;
    const durableExisting = isDurableMediaUrl(existing?.media_url) ? existing?.media_url : undefined;
    const localExisting = isLocalVaultUrl(existing?.media_url) ? existing?.media_url : undefined;

    const merged: Message = {
      ...inc,
      poll: mergedPoll,
      status: 'sent',
      local_media_path: existing?.local_media_path || inc.local_media_path,
      media_url: durableIncoming || durableExisting || localExisting || inc.media_url,
    };

    map.set(inc.id, merged);
    if (inc.client_message_id) {
      map.set(inc.client_message_id, merged);
    }
  }

  const uniqueMessages = Array.from(new Set(map.values()));

  uniqueMessages.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || '').localeCompare(b.id || '');
  });

  return uniqueMessages;
}

export const localChatStorage = {
  peekMessages(familyId: string): Message[] {
    const cached = memoryCache.get(familyId);
    if (cached) return cached;
    try {
      const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
      if (!fallback) return [];
      const parsed = JSON.parse(fallback) as Message[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache.set(familyId, parsed);
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  },

  async getMessages(familyId: string): Promise<Message[]> {
    const peeked = memoryCache.get(familyId);
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(familyId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.messages)) {
            memoryCache.set(familyId, req.result.messages);
            resolve(req.result.messages);
          } else {
            const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
            const parsed = fallback ? (JSON.parse(fallback) as Message[]) : peeked || [];
            if (parsed.length) memoryCache.set(familyId, parsed);
            resolve(parsed);
          }
        };
        req.onerror = () => {
          const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
          const parsed = fallback ? (JSON.parse(fallback) as Message[]) : peeked || [];
          resolve(parsed);
        };
      });
    } catch {
      try {
        const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
        const parsed = fallback ? (JSON.parse(fallback) as Message[]) : peeked || [];
        return parsed;
      } catch {
        return peeked || [];
      }
    }
  },

  async saveMessages(familyId: string, messages: Message[]): Promise<void> {
    const trimmed = sanitizeForDisk(messages);
    memoryCache.set(familyId, trimmed);
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ family_id: familyId, messages: trimmed, updated_at: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[LocalChatStorage] IndexedDB save failed:', err);
    }

    try {
      localStorage.setItem(`ailem_msgs_${familyId}`, JSON.stringify(compactFallback(trimmed)));
    } catch {
      try {
        localStorage.removeItem(`ailem_msgs_${familyId}`);
      } catch {}
    }
  },

  async mergeMessages(familyId: string, serverMessages: Message[]): Promise<Message[]> {
    const local = await this.getMessages(familyId);
    const merged = reconcileMessages(local, serverMessages);
    await this.saveMessages(familyId, merged);
    return merged;
  },
};
