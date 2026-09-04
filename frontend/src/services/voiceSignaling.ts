import {
  DataSnapshot,
  Database,
  DatabaseReference,
  off,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
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
}

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
  private unsubs: Array<() => void> = [];
  private presenceRef: DatabaseReference | null = null;
  private inboxRef: DatabaseReference | null = null;
  private peersRef: DatabaseReference | null = null;
  private connected = false;

  async connect(
    familyId: string,
    userId: string,
    token: string,
    config: FirebaseWebConfig,
    presence: VoicePeerPresence,
    handlers: VoiceSignalingHandlers
  ): Promise<void> {
    await this.disconnect();
    this.familyId = familyId;
    this.userId = userId;

    const { auth, database } = getFirebaseForVoice(config);
    this.db = database;
    this.auth = auth;
    await signInWithCustomToken(auth, token);
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

    this.presenceRef = ref(database, `voice/${familyId}/peers/${userId}`);
    this.inboxRef = ref(database, `voice/${familyId}/inbox/${userId}`);
    this.peersRef = ref(database, `voice/${familyId}/peers`);

    await set(this.presenceRef, presence);
    await onDisconnect(this.presenceRef).remove();
    await onDisconnect(this.inboxRef).remove();

    const onInbox = (snap: DataSnapshot) => {
      const val = snap.val() as VoiceSignal | null;
      void remove(snap.ref);
      if (!val?.type || !val.from || val.from === userId) return;
      if (val.to && val.to !== userId) return;
      handlers.onSignal(val);
    };
    const inboxUnsub = onChildAdded(this.inboxRef, onInbox);
    this.unsubs.push(() => off(this.inboxRef!, 'child_added', inboxUnsub));

    const added = onChildAdded(this.peersRef, (snap) => {
      if (!snap.key || snap.key === userId) return;
      handlers.onPeerJoined(snap.key, asPresence(snap.val()));
    });
    const changed = onChildChanged(this.peersRef, (snap) => {
      if (!snap.key || snap.key === userId) return;
      handlers.onPeerState(snap.key, asPresence(snap.val()));
    });
    const removed = onChildRemoved(this.peersRef, (snap) => {
      if (!snap.key || snap.key === userId) return;
      handlers.onPeerLeft(snap.key);
    });

    this.unsubs.push(() => off(this.peersRef!, 'child_added', added));
    this.unsubs.push(() => off(this.peersRef!, 'child_changed', changed));
    this.unsubs.push(() => off(this.peersRef!, 'child_removed', removed));
    this.connected = true;
  }

  async send(
    toUserId: string,
    payload:
      | { type: 'offer'; sdp: string }
      | { type: 'answer'; sdp: string }
      | { type: 'ice'; candidate: RTCIceCandidateInit }
  ): Promise<void> {
    if (!this.connected || !this.db || !this.familyId || toUserId === this.userId) return;
    const inbox = ref(this.db, `voice/${this.familyId}/inbox/${toUserId}`);
    await push(inbox, { ...payload, from: this.userId, to: toUserId, ts: Date.now() });
  }

  async updatePresence(patch: Partial<VoicePeerPresence>): Promise<void> {
    if (!this.presenceRef) return;
    await update(this.presenceRef, patch);
  }

  async disconnect(): Promise<void> {
    this.unsubs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    this.unsubs = [];
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
    this.connected = false;
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
