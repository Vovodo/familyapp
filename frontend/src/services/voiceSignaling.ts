import {
  DataSnapshot,
  Database,
  DatabaseReference,
  off,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { Auth, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { FirebaseWebConfig, getFirebaseForVoice } from './firebaseApp';

export type VoiceSignal =
  | { type: 'offer'; from: string; to: string; sdp: string }
  | { type: 'answer'; from: string; to: string; sdp: string }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit };

export interface VoicePeerPresence {
  name: string;
  muted: boolean;
  speaking: boolean;
  joinedAt: number;
}

interface VoiceSignalingHandlers {
  onSignal: (msg: VoiceSignal) => void;
  onPeerJoined: (userId: string, presence: VoicePeerPresence) => void;
  onPeerLeft: (userId: string) => void;
  onPeerState: (userId: string, presence: Partial<VoicePeerPresence>) => void;
  onRoster?: (peers: Array<{ userId: string; presence: VoicePeerPresence }>) => void;
}

type OutgoingSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

const asPresence = (val: unknown): VoicePeerPresence => {
  const row = (val || {}) as Partial<VoicePeerPresence>;
  return {
    name: row.name || 'Aile Üyesi',
    muted: Boolean(row.muted),
    speaking: Boolean(row.speaking),
    joinedAt: Number(row.joinedAt) || Date.now(),
  };
};

export class FirebaseVoiceSignaling {
  private familyId = '';
  private userId = '';
  private db: Database | null = null;
  private auth: Auth | null = null;
  private rosterUnsubs: Array<() => void> = [];
  private meshUnsubs: Array<() => void> = [];
  private presenceRef: DatabaseReference | null = null;
  private inboxRef: DatabaseReference | null = null;
  private peersRef: DatabaseReference | null = null;
  private connected = false;
  private meshLive = false;
  private sendQueue: Array<{ toUserId: string; payload: OutgoingSignal }> = [];
  private lastPeerKeys = new Set<string>();
  private rosterPrimed = false;
  private handlers: VoiceSignalingHandlers | null = null;
  private opening: Promise<void> | null = null;

  get isListening(): boolean {
    return this.connected;
  }

  async listen(
    familyId: string,
    userId: string,
    token: string,
    config: FirebaseWebConfig,
    handlers: VoiceSignalingHandlers
  ): Promise<void> {
    this.handlers = handlers;
    if (this.connected && this.familyId === familyId && this.userId === userId && this.db) {
      return;
    }
    if (this.opening) await this.opening;
    this.handlers = handlers;
    if (this.connected && this.familyId === familyId && this.userId === userId && this.db) {
      return;
    }
    let release = () => {};
    this.opening = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await this.disconnect();
      this.familyId = familyId;
      this.userId = userId;
      this.handlers = handlers;

      const { auth, database } = getFirebaseForVoice(config);
      this.db = database;
      this.auth = auth;
      await signInWithCustomToken(auth, token);
      if (auth.currentUser?.uid !== userId) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Firebase oturumu zaman aşımı')), 8000);
          const unsub = onAuthStateChanged(auth, (fbUser) => {
            if (fbUser?.uid === userId) {
              window.clearTimeout(timeout);
              unsub();
              resolve();
            }
          });
        });
      }

      this.peersRef = ref(database, `voice/${familyId}/peers`);
      const rosterUnsub = onValue(this.peersRef, (snap) => this.applyRoster(snap));
      this.rosterUnsubs.push(() => off(this.peersRef!, 'value', rosterUnsub));
      this.connected = true;
    } finally {
      release();
      this.opening = null;
    }
  }

  async connect(
    familyId: string,
    userId: string,
    token: string,
    config: FirebaseWebConfig,
    presence: VoicePeerPresence,
    handlers: VoiceSignalingHandlers
  ): Promise<void> {
    await this.listen(familyId, userId, token, config, handlers);
    if (!this.db) return;

    this.presenceRef = ref(this.db, `voice/${familyId}/peers/${userId}`);
    this.inboxRef = ref(this.db, `voice/${familyId}/inbox/${userId}`);

    const onInbox = (snap: DataSnapshot) => {
      const val = snap.val() as VoiceSignal | null;
      void remove(snap.ref);
      if (!val?.type || !val.from || val.from === userId) return;
      if (val.to && val.to !== userId) return;
      this.handlers?.onSignal(val);
    };
    this.clearMesh();
    const inboxUnsub = onChildAdded(this.inboxRef, onInbox);
    this.meshUnsubs.push(() => off(this.inboxRef!, 'child_added', inboxUnsub));
    await onDisconnect(this.inboxRef).remove();

    this.meshLive = true;
    await this.flushSendQueue();
    await set(this.presenceRef, presence);
    await onDisconnect(this.presenceRef).remove();
    await this.flushSendQueue();
  }

  async leaveChannel(): Promise<void> {
    this.meshLive = false;
    this.sendQueue = [];
    this.clearMesh();
    if (this.presenceRef) {
      try {
        await onDisconnect(this.presenceRef).cancel();
      } catch {
        /* ignore */
      }
      try {
        await remove(this.presenceRef);
      } catch {
        /* ignore */
      }
    }
    if (this.inboxRef) {
      try {
        await remove(this.inboxRef);
      } catch {
        /* ignore */
      }
    }
    this.presenceRef = null;
    this.inboxRef = null;
  }

  async send(toUserId: string, payload: OutgoingSignal): Promise<void> {
    if (!this.familyId || toUserId === this.userId) return;
    if (!this.meshLive || !this.db) {
      this.sendQueue.push({ toUserId, payload });
      return;
    }
    try {
      const inbox = ref(this.db, `voice/${this.familyId}/inbox/${toUserId}`);
      await push(inbox, { ...payload, from: this.userId, to: toUserId, ts: Date.now() });
    } catch (err) {
      console.warn('[voice] signal send failed', err);
    }
  }

  private applyRoster(snap: DataSnapshot) {
    const val = (snap.val() || {}) as Record<string, unknown>;
    const keys = new Set(Object.keys(val));
    const handlers = this.handlers;
    const peers = Object.entries(val).map(([userId, row]) => ({
      userId,
      presence: asPresence(row),
    }));
    if (!handlers) {
      this.lastPeerKeys = keys;
      return;
    }
    const primed = this.rosterPrimed;
    for (const key of keys) {
      if (key === this.userId) continue;
      const presence = asPresence(val[key]);
      if (!this.lastPeerKeys.has(key)) {
        if (primed) handlers.onPeerJoined(key, presence);
      } else {
        handlers.onPeerState(key, presence);
      }
    }
    for (const key of this.lastPeerKeys) {
      if (key !== this.userId && !keys.has(key)) handlers.onPeerLeft(key);
    }
    handlers.onRoster?.(peers);
    this.rosterPrimed = true;
    this.lastPeerKeys = keys;
  }

  private async flushSendQueue(): Promise<void> {
    if (!this.meshLive || !this.db || !this.sendQueue.length) return;
    const queued = this.sendQueue.splice(0, this.sendQueue.length);
    for (const item of queued) {
      await this.send(item.toUserId, item.payload);
    }
  }

  async updatePresence(patch: Partial<VoicePeerPresence>): Promise<void> {
    if (!this.presenceRef) return;
    await update(this.presenceRef, patch);
  }

  private clearMesh() {
    this.meshUnsubs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    this.meshUnsubs = [];
  }

  async disconnect(): Promise<void> {
    this.clearMesh();
    this.rosterUnsubs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    this.rosterUnsubs = [];
    this.sendQueue = [];
    this.connected = false;
    this.meshLive = false;
    this.lastPeerKeys = new Set();
    this.rosterPrimed = false;
    this.handlers = null;
    if (this.presenceRef) {
      try {
        await onDisconnect(this.presenceRef).cancel();
      } catch {
        /* ignore */
      }
      try {
        await remove(this.presenceRef);
      } catch {
        /* ignore */
      }
    }
    if (this.inboxRef) {
      try {
        await remove(this.inboxRef);
      } catch {
        /* ignore */
      }
    }
    this.presenceRef = null;
    this.inboxRef = null;
    this.peersRef = null;
    this.db = null;
    this.familyId = '';
    this.userId = '';
    try {
      if (this.auth?.currentUser) await signOut(this.auth);
    } catch {
      /* ignore */
    }
    this.auth = null;
  }
}

export const firebaseVoiceSignaling = new FirebaseVoiceSignaling();
