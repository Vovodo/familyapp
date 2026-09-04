import { supabase } from './supabase';

export const WORD_WAR_EMOJIS = ['😂', '🔥', '😱', '👏', '💀', '😈', '❤️', '🤯'] as const;

export interface WordWarReaction {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  at: number;
}

export interface WordWarSyncHandlers {
  onGameEvent: (event: string, payload?: Record<string, unknown>) => void;
  onReaction: (reaction: WordWarReaction) => void;
  onResyncNeeded: () => void;
}

const RECONNECT_DELAY_MS = 1500;

export class WordWarSyncChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;

  private hasSubscribedOnce = false;

  private disposed = false;

  private reconnectTimer: number | null = null;

  private onVisibilityChange: (() => void) | null = null;

  private onOnline: (() => void) | null = null;

  constructor(
    private readonly familyId: string,
    private readonly userId: string,
    private readonly handlers: WordWarSyncHandlers
  ) {}

  connect(): void {
    if (!supabase || this.disposed) return;
    this.clearReconnectTimer();
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.channel = supabase.channel(`family-wordwar-${this.familyId}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    this.channel
      .on('broadcast', { event: 'game_event' }, ({ payload }) => {
        this.handlers.onGameEvent(payload?.event || 'state_changed', payload || {});
      })
      .on('broadcast', { event: 'ww_reaction' }, ({ payload }) => {
        const reaction = payload as WordWarReaction;
        if (!reaction?.id || reaction.user_id === this.userId) return;
        this.handlers.onReaction(reaction);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (this.hasSubscribedOnce) this.handlers.onResyncNeeded();
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
      this.onOnline = () => this.handlers.onResyncNeeded();
      window.addEventListener('online', this.onOnline);
    }
  }

  broadcastGameEvent(event: string, extra: Record<string, unknown> = {}): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'game_event',
      payload: { event, uid: this.userId, ...extra },
    });
  }

  sendReaction(reaction: WordWarReaction): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'ww_reaction',
      payload: reaction,
    });
  }

  dispose(): void {
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
      this.channel = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
