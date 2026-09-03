import { supabase } from './supabase';
import type { WatchChatMessage, WatchRoomState } from '../types';

export interface WatchSyncHandlers {
  onSync: (state: Partial<WatchRoomState> & { room_id: string; control_seq: number }) => void;
  onChat: (message: WatchChatMessage) => void;
  onPresence: (roomId: string) => void;
  onResyncNeeded: () => void;
}

export class WatchPartyChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;

  private hasSubscribedOnce = false;

  private disposed = false;

  private onVisibilityChange: (() => void) | null = null;

  private onOnline: (() => void) | null = null;

  constructor(
    private readonly familyId: string,
    private readonly userId: string,
    private readonly handlers: WatchSyncHandlers
  ) {}

  connect(): void {
    if (!supabase || this.channel) return;

    this.channel = supabase.channel(`family-watch-${this.familyId}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    this.channel
      .on('broadcast', { event: 'watch_sync' }, ({ payload }) => {
        const data = payload as WatchRoomState;
        if (!data?.room_id) return;
        this.handlers.onSync(data);
      })
      .on('broadcast', { event: 'watch_chat' }, ({ payload }) => {
        const message = payload as WatchChatMessage;
        if (!message?.id || message.user_id === this.userId) return;
        this.handlers.onChat(message);
      })
      .on('broadcast', { event: 'watch_presence' }, ({ payload }) => {
        if (payload?.uid === this.userId) return;
        this.handlers.onPresence(String(payload?.room_id || ''));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.hasSubscribedOnce) {
          this.handlers.onResyncNeeded();
        }
        if (status === 'SUBSCRIBED') this.hasSubscribedOnce = true;
      });

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') this.handlers.onResyncNeeded();
    };
    this.onOnline = () => this.handlers.onResyncNeeded();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.onOnline);
  }

  disconnect(): void {
    this.disposed = true;
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (this.onOnline) {
      window.removeEventListener('online', this.onOnline);
    }
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
    }
    this.channel = null;
  }

  sendSync(state: WatchRoomState): void {
    if (this.disposed || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'watch_sync',
      payload: state,
    });
  }

  sendChat(message: WatchChatMessage): void {
    if (this.disposed || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'watch_chat',
      payload: message,
    });
  }

  sendPresence(roomId: string): void {
    if (this.disposed || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'watch_presence',
      payload: { room_id: roomId, uid: this.userId },
    });
  }
}
