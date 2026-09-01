import { Message } from '../types';

const DB_NAME = 'ailem_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'chat_messages';

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
 * Reconciles two message lists without losing optimistic or in-flight messages.
 */
export function reconcileMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();

  // 1. Index current messages by primary key and client_message_id
  for (const m of current) {
    const key = m.client_message_id || m.id;
    map.set(key, m);
    map.set(m.id, m);
  }

  // 2. Process incoming server/realtime messages
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

    // Smart merge for poll messages: preserve local user's vote if server snapshot is stale
    let mergedPoll = inc.poll;
    if (inc.media_type === 'poll' && existing?.poll && inc.poll) {
      if (
        existing.poll.my_vote !== undefined &&
        existing.poll.my_vote !== null &&
        (inc.poll.my_vote === undefined || inc.poll.my_vote === null)
      ) {
        mergedPoll = {
          ...inc.poll,
          my_vote: existing.poll.my_vote,
          tallies: existing.poll.tallies || inc.poll.tallies,
          voters: existing.poll.voters || inc.poll.voters,
          total_votes: Math.max(existing.poll.total_votes || 0, inc.poll.total_votes || 0),
        };
      }
    }

    map.set(inc.id, { ...inc, poll: mergedPoll, status: 'sent' });
  }

  // 3. Extract unique list
  const uniqueMessages = Array.from(new Set(map.values()));

  // 4. Sort chronologically
  uniqueMessages.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeA - timeB;
  });

  return uniqueMessages;
}

export const localChatStorage = {
  /**
   * Instantly retrieves all locally cached messages for a family.
   */
  async getMessages(familyId: string): Promise<Message[]> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(familyId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.messages)) {
            resolve(req.result.messages);
          } else {
            const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
            resolve(fallback ? JSON.parse(fallback) : []);
          }
        };
        req.onerror = () => {
          const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
          resolve(fallback ? JSON.parse(fallback) : []);
        };
      });
    } catch {
      try {
        const fallback = localStorage.getItem(`ailem_msgs_${familyId}`);
        return fallback ? JSON.parse(fallback) : [];
      } catch {
        return [];
      }
    }
  },

  /**
   * Persists messages to local device storage.
   */
  async saveMessages(familyId: string, messages: Message[]): Promise<void> {
    try {
      const trimmed = messages.slice(-500);
      try {
        localStorage.setItem(`ailem_msgs_${familyId}`, JSON.stringify(trimmed));
      } catch {}

      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ family_id: familyId, messages: trimmed, updated_at: Date.now() });
    } catch (err) {
      console.warn('[LocalChatStorage] save failed:', err);
    }
  },

  /**
   * Safely merges server messages with local storage without dropping in-flight messages.
   */
  async mergeMessages(familyId: string, serverMessages: Message[]): Promise<Message[]> {
    const local = await this.getMessages(familyId);
    const merged = reconcileMessages(local, serverMessages);
    await this.saveMessages(familyId, merged);
    return merged;
  },
};
