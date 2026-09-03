import React, { useEffect, useRef } from 'react';

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

const DRIFT_IGNORE_MS = 400;
const DRIFT_NUDGE_MS = 1500;
const TICK_MS = 1000;

interface YouTubePartyPlayerProps {
  videoId: string;
  playbackState: string;
  positionMs: number;
  controlSeq: number;
  canControl: boolean;
  unlocked: boolean;
  onLocalControl: (action: 'play' | 'pause' | 'seek' | 'ended', positionMs: number, durationMs?: number) => void;
  onMeta?: (meta: { durationMs: number; title?: string }) => void;
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
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const applyingRef = useRef(false);
  const lastSeqRef = useRef(-1);
  const anchorRef = useRef({ at: 0, positionMs: 0, playing: false });
  const onControlRef = useRef(onLocalControl);
  const onMetaRef = useRef(onMeta);
  const canControlRef = useRef(canControl);
  const videoIdRef = useRef(videoId);
  onControlRef.current = onLocalControl;
  onMetaRef.current = onMeta;
  canControlRef.current = canControl;
  videoIdRef.current = videoId;

  const expectedMs = () => {
    const anchor = anchorRef.current;
    if (!anchor.playing) return anchor.positionMs;
    return anchor.positionMs + (performance.now() - anchor.at);
  };

  const applyRemote = (state: string, ms: number, seq: number) => {
    const player = playerRef.current;
    if (!player) return;
    lastSeqRef.current = seq;
    const playing = state === 'playing';
    anchorRef.current = { at: performance.now(), positionMs: ms, playing };
    applyingRef.current = true;
    try {
      player.seekTo(Math.max(0, ms / 1000), true);
      if (playing) player.playVideo();
      else player.pauseVideo();
      player.setPlaybackRate(1);
    } catch {
      // Player henüz hazır olmayabilir
    }
    window.setTimeout(() => {
      applyingRef.current = false;
    }, 700);
  };

  useEffect(() => {
    if (!unlocked || !hostRef.current) return;
    let cancelled = false;
    let tick: number | null = null;
    let player: YTPlayer | null = null;

    const start = async () => {
      const YT = await loadYouTubeApi();
      if (cancelled || !hostRef.current) return;
      player = new YT.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            playerRef.current = event.target;
            lastSeqRef.current = -1;
            applyRemote(playbackState, positionMs, controlSeq);
            const duration = event.target.getDuration();
            const title = event.target.getVideoData()?.title;
            if (duration > 0) onMetaRef.current?.({ durationMs: Math.round(duration * 1000), title });
          },
          onStateChange: (event: { data: number; target: YTPlayer }) => {
            if (applyingRef.current) return;
            const duration = Math.round((event.target.getDuration() || 0) * 1000);
            const current = Math.round((event.target.getCurrentTime() || 0) * 1000);
            const expected = expectedMs();
            const inSync = Math.abs(current - expected) < 1500;
            if (event.data === YT.PlayerState.PLAYING) {
              if (duration > 0) onMetaRef.current?.({ durationMs: duration, title: event.target.getVideoData()?.title });
              if (!canControlRef.current) return;
              if (anchorRef.current.playing && inSync) return;
              onControlRef.current('play', current, duration || undefined);
            } else if (event.data === YT.PlayerState.PAUSED) {
              if (!canControlRef.current) return;
              if (!anchorRef.current.playing && inSync) return;
              onControlRef.current('pause', current, duration || undefined);
            } else if (event.data === YT.PlayerState.ENDED) {
              if (!canControlRef.current) return;
              onControlRef.current('ended', current, duration || undefined);
            }
          },
          onError: (event: { data: number }) => {
            const code = event.data;
            const message =
              code === 101 || code === 150
                ? 'Bu video gömülü oynatmaya kapalı. Başka bir YouTube bağlantısı deneyin.'
                : code === 100
                  ? 'Video bulunamadı veya gizlenmiş.'
                  : 'Video oynatılamadı. Bağlantıyı kontrol edin.';
            window.alert(message);
          },
        },
      });
      playerRef.current = player;

      tick = window.setInterval(() => {
        const current = playerRef.current;
        if (!current || applyingRef.current) return;
        let state = -1;
        try {
          state = current.getPlayerState();
        } catch {
          return;
        }
        if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.UNSTARTED) return;
        const actual = (current.getCurrentTime() || 0) * 1000;
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
        if (Math.abs(drift) < DRIFT_NUDGE_MS && anchorRef.current.playing && state === YT.PlayerState.PLAYING) {
          try {
            current.setPlaybackRate(drift > 0 ? 0.92 : 1.08);
          } catch {
            /* ignore */
          }
          return;
        }
        applyingRef.current = true;
        try {
          current.setPlaybackRate(1);
          current.seekTo(Math.max(0, expected / 1000), true);
        } catch {
          /* ignore */
        }
        window.setTimeout(() => {
          applyingRef.current = false;
        }, 500);
      }, TICK_MS);
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
      anchorRef.current = {
        at: performance.now(),
        positionMs,
        playing: playbackState === 'playing',
      };
      return;
    }
    applyRemote(playbackState, positionMs, controlSeq);
    // applyRemote is stable enough via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlSeq, playbackState, positionMs, unlocked, videoId]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden">
      <div ref={hostRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
