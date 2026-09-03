import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { localMediaVault } from '../../services/localMediaVault';

interface AudioMessagePlayerProps {
  audioUrl: string;
  isMe: boolean;
}

// Global active audio manager to pause other audios when one starts
let activeAudio: HTMLAudioElement | null = null;
let activeStopCallback: (() => void) | null = null;

const resolveAudioUrl = (url: string): string => {
  if (!url) return '';
  if (
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('capacitor://')
  ) {
    return url;
  }
  const apiBase = (import.meta.env.VITE_API_URL || 'https://familyapi.rfqcollector.com/api/v1').replace(
    /\/api\/v1\/?$/,
    ''
  );
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

const waveformBars = (seed: string): number[] => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Array.from({ length: 32 }, (_, i) => {
    const n = ((h >>> (i % 16)) + i * 19 + seed.length) % 100;
    return 0.22 + (n / 100) * 0.78;
  });
};

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({ audioUrl, isMe }) => {
  const [playableSrc, setPlayableSrc] = useState<string>(() => resolveAudioUrl(audioUrl));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // 0ms Local-First Disk Cache Check
  useEffect(() => {
    let isSubscribed = true;
    localMediaVault.getMediaUrl(audioUrl, 'audio').then((localSrc) => {
      if (isSubscribed && localSrc) {
        setPlayableSrc(localSrc);
      }
    });
    return () => {
      isSubscribed = false;
    };
  }, [audioUrl]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (activeAudio === audioRef.current) {
      activeAudio = null;
      activeStopCallback = null;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!duration && audioRef.current.duration && isFinite(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // Pause any previously playing audio
      if (activeAudio && activeAudio !== audio) {
        activeAudio.pause();
        activeStopCallback?.();
      }

      // If at end or invalid, reset to start
      if (audio.ended || Math.abs(audio.currentTime - (duration || audio.duration || 0)) < 0.2) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      audio.playbackRate = playbackRate;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            activeAudio = audio;
            activeStopCallback = () => setIsPlaying(false);
          })
          .catch((err) => {
            console.warn('[AudioPlayer] Playback error:', err);
            // Retry reset
            audio.currentTime = 0;
            audio.play().then(() => setIsPlaying(true)).catch(() => {});
          });
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const ratio = Math.max(0, Math.min(1, clickX / width));

    const totalDur = duration || audio.duration || 1;
    const newTime = ratio * totalDur;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  useEffect(() => {
    // When the audio URL changes (e.g., blob -> real URL after upload), reset the player
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.load(); // Force reload with new src
  }, [playableSrc]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (activeAudio === audioRef.current) {
        activeAudio = null;
        activeStopCallback = null;
      }
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bars = waveformBars(audioUrl);

  return (
    <div
      className={`flex items-center gap-2 min-w-[200px] max-w-full select-none ${
        isMe ? 'text-white' : 'theme-text-primary'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={playableSrc}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={(e) => {
          console.warn('[AudioPlayer] Playback error:', (e.target as HTMLAudioElement).error?.message, 'src:', playableSrc);
        }}
      />

      <button
        type="button"
        onClick={togglePlayPause}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 active:scale-90 cursor-pointer ${
          isMe ? 'bg-white/20 text-white' : 'text-white'
        }`}
        style={!isMe ? { background: '#7C3AED' } : undefined}
        title={isPlaying ? 'Durdur' : 'Oynat'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="flex items-end gap-[2px] h-7 cursor-pointer"
        >
          {bars.map((amp, i) => {
            const barProgress = ((i + 0.5) / bars.length) * 100;
            const active = barProgress <= progressPercent;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full min-w-[2px] transition-colors ${
                  active
                    ? isMe
                      ? 'bg-white'
                      : ''
                    : isMe
                      ? 'bg-white/30'
                      : 'bg-white/15'
                }`}
                style={{
                  height: `${Math.round(amp * 100)}%`,
                  backgroundColor: active && !isMe ? '#7C3AED' : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between leading-none mt-0.5 pr-12">
          <span className={`text-[9px] font-bold ${isMe ? 'text-white/85' : 'theme-text-secondary'}`}>
            {formatTime(isPlaying || currentTime > 0 ? currentTime : duration || 0)}
          </span>
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold cursor-pointer ${
              isMe ? 'bg-white/15 text-white' : 'theme-text-secondary'
            }`}
            title="Oynatma Hızı"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
