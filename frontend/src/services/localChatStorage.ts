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
            // LocalStorage fallback
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
      // Keep up to latest 500 messages in local storage
      const trimmed = messages.slice(-500);
      
      // Save in localStorage as quick fallback
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
   * Merges server messages with local messages without duplicates.
   */
  async mergeMessages(familyId: string, serverMessages: Message[]): Promise<Message[]> {
    const local = await this.getMessages(familyId);
    const messageMap = new Map<string, Message>();

    // Put local messages first
    for (const msg of local) {
      messageMap.set(msg.id, msg);
      if (msg.client_message_id) {
        messageMap.set(msg.client_message_id, msg);
      }
    }

    // Merge/overwrite with server messages
    for (const sMsg of serverMessages) {
      if (sMsg.client_message_id && messageMap.has(sMsg.client_message_id)) {
        const old = messageMap.get(sMsg.client_message_id)!;
        messageMap.delete(old.id);
        messageMap.delete(sMsg.client_message_id);
      }
      messageMap.set(sMsg.id, { ...sMsg, status: 'sent' });
    }

    const merged = Array.from(new Set(messageMap.values()));
    // Sort chronologically
    merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    await this.saveMessages(familyId, merged);
    return merged;
  },
};
