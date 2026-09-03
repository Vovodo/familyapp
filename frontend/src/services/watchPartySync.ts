import { supabase } from './supabase';
import type { WatchChatMessage, WatchReactionEvent, WatchRoomState } from '../types';

export interface WatchSyncHandlers {
  onSync: (state: Partial<WatchRoomState> & { room_id: string; control_seq: number }) => void;
  onChat: (message: WatchChatMessage) => void;
  onPresence: (roomId: string) => void;
  onReaction: (reaction: WatchReactionEvent) => void;
  onResyncNeeded: () => void;
}

const RECONNECT_DELAY_MS = 1500;

export class WatchPartyChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;

  private hasSubscribedOnce = false;

  private disposed = false;

  private reconnectTimer: number | null = null;

  private onVisibilityChange: (() => void) | null = null;

  private onOnline: (() => void) | null = null;

  constructor(
    private readonly familyId: string,
    private readonly userId: string,
    private readonly handlers: WatchSyncHandlers
  ) {}

  connect(): void {
    if (!supabase || this.disposed) return;
    this.clearReconnectTimer();
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

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
      .on('broadcast', { event: 'watch_reaction' }, ({ payload }) => {
        const reaction = payload as WatchReactionEvent;
        if (!reaction?.id || reaction.user_id === this.userId) return;
        this.handlers.onReaction(reaction);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (this.hasSubscribedOnce) {
            this.handlers.onResyncNeeded();
          }
          this.hasSubscribedOnce = true;
          return;
        }
        if (this.disposed) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.scheduleReconnect();
        }
      });

    if (!this.onVisibilityChange) {
      this.onVisibilityChange = () => {
        if (document.visibilityState === 'visible') this.handlers.onResyncNeeded();
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (!this.onOnline) {
      this.onOnline = () => {
        this.handlers.onResyncNeeded();
        if (!this.disposed) this.connect();
      };
      window.addEventListener('online', this.onOnline);
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    if (this.onOnline) {
      window.removeEventListener('online', this.onOnline);
      this.onOnline = null;
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

  sendReaction(reaction: WatchReactionEvent): void {
    if (this.disposed || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'watch_reaction',
      payload: reaction,
    });
  }
}
