import { supabase } from './supabase';
import { api } from './api';
import type { NormalizedStroke } from '../components/games/DrawingCanvas';

/**
 * Çizim oyununun ağ katmanı. Render'dan tamamen ayrıdır: tuval noktayı anında
 * çizer, buradaki kuyruk noktaları biriktirip sabit aralıkla tek broadcast
 * mesajı olarak yollar.
 *
 * - Her pointer event'i ayrı mesaj olarak gitmez; FLUSH_INTERVAL_MS'de bir
 *   toplu gönderilir (throttling + batching).
 * - Koordinatlar tam sayı (0..10000) olduğu için payload küçüktür.
 * - Kalıcılık ayrı katmandır: çizgi bitince REST'e yazılır, sonradan katılan
 *   veya bağlantısı kopan istemci farkı `since_seq` ile alır.
 */

const FLUSH_INTERVAL_MS = 45; // ~22 mesaj/sn
const PERSIST_DEBOUNCE_MS = 400;
const PERSIST_RETRY_MS = 2500;
const MAX_POINTS_PER_MESSAGE = 400;

export interface StrokeDeltaPayload {
  /** çizgi kimliği */
  sid: string;
  /** gönderen kullanıcı */
  uid: string;
  /** renk (yalnızca çizginin ilk mesajında) */
  c?: string;
  /** kalınlık (yalnızca çizginin ilk mesajında) */
  w?: number;
  /** yeni noktalar [x,y,...] */
  p: number[];
  /** çizgi bu mesajla tamamlandı mı */
  end?: boolean;
}

export interface DrawingSyncHandlers {
  onStrokeDelta: (payload: StrokeDeltaPayload) => void;
  onCanvasCleared: () => void;
  /** Tur/oyun durumu değişti; istemci kendi görünümünü REST'ten çekmeli. */
  onGameEvent: (event: string, payload?: Record<string, unknown>) => void;
  /** Kanal (yeniden) bağlandı; tuvalin sunucudan tazelenmesi gerekir. */
  onResyncNeeded: () => void;
}

interface PendingStroke {
  color: string;
  width: number;
  points: number[];
  headerSent: boolean;
  ended: boolean;
}

export class DrawingSyncChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;

  private pending = new Map<string, PendingStroke>();

  private persistQueue: NormalizedStroke[] = [];

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private hasSubscribedOnce = false;

  private disposed = false;

  private roundNumber: number | null = null;

  private onVisibilityChange: (() => void) | null = null;

  private onOnline: (() => void) | null = null;

  constructor(
    private readonly familyId: string,
    private readonly userId: string,
    private readonly handlers: DrawingSyncHandlers
  ) {}

  connect(): void {
    if (!supabase || this.channel) return;

    this.channel = supabase.channel(`family-draw-${this.familyId}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    this.channel
      .on('broadcast', { event: 'stroke_delta' }, ({ payload }) => {
        const data = payload as StrokeDeltaPayload;
        if (!data?.sid || data.uid === this.userId) return;
        this.handlers.onStrokeDelta(data);
      })
      .on('broadcast', { event: 'canvas_cleared' }, ({ payload }) => {
        if (payload?.uid === this.userId) return;
        this.handlers.onCanvasCleared();
      })
      .on('broadcast', { event: 'game_event' }, ({ payload }) => {
        this.handlers.onGameEvent(payload?.event || 'state_changed', payload || {});
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // İlk bağlanmada sayfa zaten state çekiyor; sonraki bağlanmalar
          // kopmuş bağlantı demektir, tuvali sunucudan tazele.
          if (this.hasSubscribedOnce) {
            this.handlers.onResyncNeeded();
          }
          this.hasSubscribedOnce = true;
        }
      });

    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

    // Kanalın yeniden abone olması tek başına güvenilir bir sinyal değil:
    // telefon kilitlenip açıldığında veya bağlantı geri geldiğinde de tuvalin
    // sunucudan tazelenmesi gerekir.
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.handlers.onResyncNeeded();
        void this.persistNow();
      }
    };
    this.onOnline = () => {
      this.handlers.onResyncNeeded();
      void this.persistNow();
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.onOnline);
  }

  disconnect(): void {
    this.disposed = true;
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    if (this.onOnline) {
      window.removeEventListener('online', this.onOnline);
      this.onOnline = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.pending.clear();
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
    }
    this.channel = null;
  }

  /** Yeni çizgi başladı; renk/kalınlık ilk mesajda taşınır. */
  beginStroke(strokeId: string, color: string, width: number): void {
    this.pending.set(strokeId, {
      color,
      width,
      points: [],
      headerSent: false,
      ended: false,
    });
  }

  /** Noktaları kuyruğa yazar. Ağ çağrısı yapmaz, çizimi bloklamaz. */
  queuePoints(strokeId: string, points: number[]): void {
    const entry = this.pending.get(strokeId);
    if (!entry) return;
    for (let i = 0; i < points.length; i += 1) {
      entry.points.push(points[i]);
    }
  }

  /** Çizgi bitti: kalan noktaları hemen yolla ve kalıcı kayda al. */
  endStroke(strokeId: string, stroke: NormalizedStroke): void {
    const entry = this.pending.get(strokeId);
    if (entry) {
      entry.ended = true;
    }
    this.flush();
    this.queuePersist(stroke);
  }

  private flush(): void {
    if (!this.channel || this.pending.size === 0) return;

    this.pending.forEach((entry, strokeId) => {
      if (entry.points.length === 0 && !entry.ended) return;

      // Çok uzun bir çizgi tek mesajı şişirmesin.
      const chunk = entry.points.splice(0, MAX_POINTS_PER_MESSAGE);
      const isFinal = entry.ended && entry.points.length === 0;

      const payload: StrokeDeltaPayload = {
        sid: strokeId,
        uid: this.userId,
        p: chunk,
      };
      if (!entry.headerSent) {
        payload.c = entry.color;
        payload.w = entry.width;
        entry.headerSent = true;
      }
      if (isFinal) {
        payload.end = true;
      }

      this.channel?.send({ type: 'broadcast', event: 'stroke_delta', payload });

      if (isFinal) {
        this.pending.delete(strokeId);
      }
    });
  }

  private queuePersist(stroke: NormalizedStroke): void {
    if (stroke.p.length < 2) return;
    this.persistQueue.push(stroke);
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Biriken çizgileri tek istekte kaydeder. Başarısız olursa kuyruğa geri
   * konur: geçici ağ hatası çizimi kalıcı olarak kaybettirmez.
   */
  private async persistNow(): Promise<void> {
    if (this.disposed || this.persistQueue.length === 0 || this.roundNumber === null) return;
    const batch = this.persistQueue.splice(0, this.persistQueue.length);
    try {
      await api.post('/games/drawing/strokes', {
        round_number: this.roundNumber,
        strokes: batch.map((s) => ({ color: s.c, width: s.w, points: s.p })),
      });
    } catch (err) {
      // Tur değiştiyse eski çizgileri tekrar denemenin anlamı yok.
      const message = (err as Error)?.message || '';
      if (message.includes('Tur değişti')) return;

      // Geçici ağ hatası: kuyruğa geri koy ve yeniden dene, yoksa çizgi
      // sonradan katılan oyuncularda hiç görünmez.
      this.persistQueue.unshift(...batch);
      if (!this.persistTimer) {
        this.persistTimer = setTimeout(() => {
          this.persistTimer = null;
          void this.persistNow();
        }, PERSIST_RETRY_MS);
      }
    }
  }

  setRoundNumber(round: number | null): void {
    if (this.roundNumber === round) return;
    this.roundNumber = round;
    this.persistQueue = [];
  }

  broadcastCanvasCleared(): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'canvas_cleared',
      payload: { uid: this.userId },
    });
  }

  /** Tur başladı / tahmin geldi / tur bitti gibi durum sinyalleri. Kelime asla gönderilmez. */
  broadcastGameEvent(event: string, extra: Record<string, unknown> = {}): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'game_event',
      payload: { event, uid: this.userId, ...extra },
    });
  }
}
