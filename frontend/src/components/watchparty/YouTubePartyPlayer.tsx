import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import {
  DRIFT_IGNORE_MS,
  DRIFT_NUDGE_MS,
  LOCAL_CONTROL_MS,
  RESUME_SEEK_THRESHOLD_MS,
  mapPlayerEvent,
  needsControlSeek,
  shouldIgnorePlayerEvent,
  type WatchIntend,
} from '../../utils/watchPlaybackSync';

const YT_SRC = 'https://www.youtube.com/iframe_api';

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getVideoData: () => { title?: string; video_id?: string };
  destroy: () => void;
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReady: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${YT_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = YT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const wait = () => {
      if (window.YT?.Player) resolve(window.YT);
      else window.setTimeout(wait, 50);
    };
    wait();
  });
  return ytReady;
}

const TICK_MS = 1000;
const SEEK_DETECT_MS = 1800;
const YT_UNSTARTED = -1;
const YT_PLAYING = 1;
const YT_BUFFERING = 3;

interface YouTubePartyPlayerProps {
  videoId: string;
  playbackState: string;
  positionMs: number;
  controlSeq: number;
  canControl: boolean;
  unlocked: boolean;
  onLocalControl: (action: 'play' | 'pause' | 'seek' | 'ended', positionMs: number, durationMs?: number) => void;
  onMeta?: (meta: { durationMs: number; title?: string }) => void;
  onPlayerError?: (message: string) => void;
}

export const YouTubePartyPlayer: React.FC<YouTubePartyPlayerProps> = ({
  videoId,
  playbackState,
  positionMs,
  controlSeq,
  canControl,
  unlocked,
  onLocalControl,
  onMeta,
  onPlayerError,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const applyingRef = useRef(false);
  const applyGenRef = useRef(0);
  const syncGenRef = useRef(0);
  const syncingRef = useRef(false);
  const lastSeqRef = useRef(-1);
  const intendedRef = useRef<WatchIntend>('idle');
  const localOverrideUntilRef = useRef(0);
  const anchorRef = useRef({ at: 0, positionMs: 0, playing: false });
  const onControlRef = useRef(onLocalControl);
  const onMetaRef = useRef(onMeta);
  const onErrorRef = useRef(onPlayerError);
  const canControlRef = useRef(canControl);
  const lastSampleMsRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  onControlRef.current = onLocalControl;
  onMetaRef.current = onMeta;
  onErrorRef.current = onPlayerError;
  canControlRef.current = canControl;

  const reportError = (message: string) => {
    setPlayerError(message);
    setLoading(false);
    hideSyncOverlay();
    onErrorRef.current?.(message);
  };

  const showSyncOverlay = () => {
    syncingRef.current = true;
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '1';
      overlayRef.current.style.pointerEvents = 'auto';
    }
    setSyncing(true);
  };

  const hideSyncOverlay = () => {
    syncingRef.current = false;
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '0';
      overlayRef.current.style.pointerEvents = 'none';
    }
    setSyncing(false);
  };

  const measureHost = () => {
    const el = hostRef.current;
    if (!el) return { width: 640, height: 360 };
    const rect = el.getBoundingClientRect();
    return {
      width: Math.max(320, Math.round(rect.width || el.clientWidth || 640)),
      height: Math.max(180, Math.round(rect.height || el.clientHeight || 360)),
    };
  };

  const currentMs = () => {
    try {
      return (playerRef.current?.getCurrentTime() || 0) * 1000;
    } catch {
      return 0;
    }
  };

  const expectedMs = () => {
    const anchor = anchorRef.current;
    if (!anchor.playing) return anchor.positionMs;
    return anchor.positionMs + (performance.now() - anchor.at);
  };

  const markApplying = (ms: number) => {
    applyingRef.current = true;
    const gen = ++applyGenRef.current;
    window.setTimeout(() => {
      if (gen !== applyGenRef.current) return;
      applyingRef.current = false;
      if (intendedRef.current === 'paused' || intendedRef.current === 'ended') {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          /* ignore */
        }
      }
    }, ms);
  };

  const noteLocal = (intend: WatchIntend, ms: number) => {
    const now = performance.now();
    intendedRef.current = intend;
    localOverrideUntilRef.current = now + LOCAL_CONTROL_MS;
    const playing = intend === 'playing';
    anchorRef.current = { at: now, positionMs: ms, playing };
  };

  const waitUntilNear = (targetSec: number, gen: number, timeoutMs: number) =>
    new Promise<void>((resolve) => {
      const started = performance.now();
      const poll = () => {
        if (gen !== syncGenRef.current) {
          resolve();
          return;
        }
        const player = playerRef.current;
        if (!player) {
          resolve();
          return;
        }
        let t = 0;
        let state = -1;
        try {
          t = player.getCurrentTime() || 0;
          state = player.getPlayerState();
        } catch {
          resolve();
          return;
        }
        if (Math.abs(t - targetSec) <= 0.4 && state !== YT_BUFFERING) {
          resolve();
          return;
        }
        if (performance.now() - started > timeoutMs) {
          resolve();
          return;
        }
        window.setTimeout(poll, 50);
      };
      poll();
    });

  const resumeAt = async (ms: number, forceSeek: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    const gen = ++syncGenRef.current;
    const targetSec = Math.max(0, ms / 1000);
    applyingRef.current = true;
    showSyncOverlay();
    try {
      player.setPlaybackRate(1);
      player.pauseVideo();
      const actual = currentMs();
      const seek = forceSeek || needsControlSeek(actual, ms, RESUME_SEEK_THRESHOLD_MS);
      if (seek) {
        player.seekTo(targetSec, true);
        await waitUntilNear(targetSec, gen, 1800);
      }
      if (gen !== syncGenRef.current || intendedRef.current !== 'playing') return;
      player.playVideo();
      const playStarted = performance.now();
      while (gen === syncGenRef.current && intendedRef.current === 'playing') {
        let state = -1;
        try {
          state = player.getPlayerState();
        } catch {
          break;
        }
        if (state === YT_PLAYING) break;
        if (performance.now() - playStarted > 900) break;
        await new Promise((r) => window.setTimeout(r, 40));
      }
    } catch {
      /* Player henüz hazır olmayabilir */
    } finally {
      if (gen === syncGenRef.current) {
        applyingRef.current = false;
        if (intendedRef.current === 'playing') hideSyncOverlay();
      }
    }
  };

  const applyRemote = (state: string, ms: number, seq: number, forceSeek = false) => {
    const player = playerRef.current;
    if (!player) return;
    lastSeqRef.current = seq;
    const playing = state === 'playing';
    const intend: WatchIntend = playing ? 'playing' : state === 'ended' ? 'ended' : 'paused';
    const now = performance.now();
    const local = now < localOverrideUntilRef.current;
    const sameIntent = intendedRef.current === intend || (intend === 'paused' && intendedRef.current === 'ended');

    if (local && sameIntent && !forceSeek) {
      return;
    }

    intendedRef.current = intend;
    anchorRef.current = { at: now, positionMs: ms, playing };

    if (!playing) {
      syncGenRef.current += 1;
      hideSyncOverlay();
      const needSeek = forceSeek || needsControlSeek(currentMs(), ms);
      markApplying(needSeek ? 400 : 150);
      try {
        player.setPlaybackRate(1);
        player.pauseVideo();
        if (needSeek) player.seekTo(Math.max(0, ms / 1000), true);
      } catch {
        /* ignore */
      }
      return;
    }

    void resumeAt(ms, forceSeek);
  };

  const handleLocalPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    const duration = Math.round((player.getDuration() || 0) * 1000);
    const current = Math.round(currentMs());
    noteLocal('playing', current);
    if (canControlRef.current) onControlRef.current('play', current, duration || undefined);
    void resumeAt(current, false);
  };

  useEffect(() => {
    if (!unlocked || !hostRef.current) return;
    let cancelled = false;
    let tick: number | null = null;
    let player: YTPlayer | null = null;
    setLoading(true);
    setPlayerError(null);

    const start = async () => {
      try {
        const YT = await loadYouTubeApi();
        if (cancelled || !hostRef.current) return;
        const { width, height } = measureHost();
        player = new YT.Player(hostRef.current, {
          videoId,
          width,
          height,
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            fs: 0,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: { target: YTPlayer }) => {
              if (cancelled) return;
              playerRef.current = event.target;
              lastSeqRef.current = -1;
              setLoading(false);
              applyRemote(playbackState, positionMs, controlSeq, true);
              const duration = event.target.getDuration();
              const title = event.target.getVideoData()?.title;
              if (duration > 0) onMetaRef.current?.({ durationMs: Math.round(duration * 1000), title });
            },
            onStateChange: (event: { data: number; target: YTPlayer }) => {
              const mapped = mapPlayerEvent(event.data);
              if (
                shouldIgnorePlayerEvent({
                  applying: applyingRef.current,
                  syncing: syncingRef.current,
                  intended: intendedRef.current,
                  event: mapped,
                })
              ) {
                return;
              }

              const duration = Math.round((event.target.getDuration() || 0) * 1000);
              const current = Math.round((event.target.getCurrentTime() || 0) * 1000);
              if (mapped === 'playing') {
                if (duration > 0) onMetaRef.current?.({ durationMs: duration, title: event.target.getVideoData()?.title });
                handleLocalPlay();
              } else if (mapped === 'paused') {
                syncGenRef.current += 1;
                applyingRef.current = false;
                hideSyncOverlay();
                noteLocal('paused', current);
                if (canControlRef.current) onControlRef.current('pause', current, duration || undefined);
              } else if (mapped === 'ended') {
                syncGenRef.current += 1;
                applyingRef.current = false;
                hideSyncOverlay();
                noteLocal('ended', current);
                if (canControlRef.current) onControlRef.current('ended', current, duration || undefined);
              }
            },
            onError: (event: { data: number }) => {
              const code = event.data;
              const message =
                code === 101 || code === 150
                  ? 'Bu video gömülü oynatmaya kapalı. Başka bir YouTube bağlantısı deneyin.'
                  : code === 100
                    ? 'Video bulunamadı veya gizlenmiş.'
                    : code === 153
                      ? 'YouTube oynatıcı yapılandırma hatası. Sayfayı yenileyip tekrar deneyin.'
                      : 'Video oynatılamadı. Bağlantıyı kontrol edin.';
              reportError(message);
            },
          },
        });
        playerRef.current = player;

        tick = window.setInterval(() => {
          const current = playerRef.current;
          if (!current || applyingRef.current || syncingRef.current) return;
          if (performance.now() < localOverrideUntilRef.current) return;
          let state = -1;
          try {
            state = current.getPlayerState();
          } catch {
            return;
          }
          if (state === YT_BUFFERING || state === YT_UNSTARTED) return;

          const actual = (current.getCurrentTime() || 0) * 1000;
          const prevSample = lastSampleMsRef.current;
          lastSampleMsRef.current = actual;

          if (
            canControlRef.current &&
            prevSample > 0 &&
            Math.abs(actual - prevSample) > SEEK_DETECT_MS &&
            Math.abs(actual - expectedMs()) > SEEK_DETECT_MS
          ) {
            noteLocal(state === YT_PLAYING ? 'playing' : 'paused', actual);
            onControlRef.current('seek', actual, Math.round((current.getDuration() || 0) * 1000) || undefined);
            return;
          }

          if (!anchorRef.current.playing || intendedRef.current !== 'playing') return;
          if (state !== YT_PLAYING) return;

          const expected = expectedMs();
          const drift = actual - expected;
          if (Math.abs(drift) < DRIFT_IGNORE_MS) {
            try {
              current.setPlaybackRate(1);
            } catch {
              /* ignore */
            }
            return;
          }
          if (Math.abs(drift) < DRIFT_NUDGE_MS) {
            try {
              current.setPlaybackRate(drift > 0 ? 0.95 : 1.05);
            } catch {
              /* ignore */
            }
            return;
          }
          markApplying(500);
          try {
            current.setPlaybackRate(1);
            current.seekTo(Math.max(0, expected / 1000), true);
          } catch {
            /* ignore */
          }
        }, TICK_MS);
      } catch {
        if (!cancelled) reportError('YouTube oynatıcı yüklenemedi.');
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (tick) window.clearInterval(tick);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // Player instance is tied to video id; sync updates go through the other effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, videoId]);

  useEffect(() => {
    if (!playerRef.current || !unlocked) return;
    if (controlSeq < lastSeqRef.current) return;
    if (controlSeq === lastSeqRef.current) {
      if (performance.now() < localOverrideUntilRef.current) return;
      if (playbackState === 'playing' && intendedRef.current === 'playing') {
        anchorRef.current = { at: performance.now(), positionMs, playing: true };
      } else if (playbackState !== 'playing' && intendedRef.current !== 'playing') {
        anchorRef.current = { at: performance.now(), positionMs, playing: false };
      }
      return;
    }
    applyRemote(playbackState, positionMs, controlSeq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlSeq, playbackState, positionMs, unlocked, videoId]);

  const showPlayOverlay = !loading && !playerError && !syncing && playbackState !== 'playing' && canControl;

  return (
    <div className="relative w-full h-full min-h-[200px] bg-black overflow-hidden">
      <div ref={hostRef} className="absolute inset-0 w-full h-full min-h-[220px]" />
      {loading && !playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c0b18] text-white z-10">
          <Loader2 className="w-8 h-8 animate-spin text-violet-300" />
          <span className="text-xs font-bold">Video yükleniyor…</span>
        </div>
      )}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#0c0b18] text-white transition-opacity duration-150"
        style={{ opacity: 0, pointerEvents: 'none' }}
        aria-hidden={!syncing}
      >
        <Loader2 className="w-8 h-8 animate-spin text-violet-300" />
        <span className="text-xs font-bold tracking-wide">Video senkronize ediliyor…</span>
      </div>
      {playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c0b18] text-white p-4 text-center z-30">
          <p className="text-sm font-bold">{playerError}</p>
        </div>
      )}
      {showPlayOverlay && (
        <button
          type="button"
          onClick={handleLocalPlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white z-10 cursor-pointer"
        >
          <Play className="w-14 h-14 fill-white" />
          <span className="text-sm font-black">Oynat</span>
        </button>
      )}
    </div>
  );
};
