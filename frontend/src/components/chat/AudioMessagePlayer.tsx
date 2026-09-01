import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, RotateCcw } from 'lucide-react';
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

  return (
    <div
      className={`flex items-center gap-3 p-1.5 sm:p-2 rounded-2xl min-w-[220px] sm:min-w-[260px] max-w-full select-none ${
        isMe ? 'text-white' : 'text-gray-900'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden Native Audio Element */}
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

      {/* Play / Pause Action Button */}
      <button
        type="button"
        onClick={togglePlayPause}
        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 active:scale-90 cursor-pointer shadow-sm ${
          isMe
            ? 'bg-white text-family-700 hover:bg-family-50'
            : 'bg-family-600 text-white hover:bg-family-700'
        }`}
        title={isPlaying ? 'Durdur' : 'Oynat'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Progress & Track Area */}
      <div className="flex-1 flex flex-col justify-center min-w-0 space-y-1.5">
        {/* Interactive Progress Bar */}
        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="relative h-4 flex items-center cursor-pointer group py-1"
        >
          {/* Background Track */}
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden transition-all ${
              isMe ? 'bg-white/30' : 'bg-gray-200'
            }`}
          >
            {/* Filled Progress */}
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                isMe ? 'bg-white' : 'bg-family-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Draggable Scrubber Handle */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full shadow-md transition-transform scale-0 group-hover:scale-100 ${
              isMe ? 'bg-white shadow-black/20' : 'bg-family-600 shadow-family-600/30'
            }`}
            style={{ left: `calc(${progressPercent}% - 7px)` }}
          />
        </div>

        {/* Timers & Speed Badge */}
        <div className="flex items-center justify-between text-[11px] font-medium leading-none">
          <span className={isMe ? 'text-white/90' : 'text-gray-600'}>
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(duration || 0)}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Speed Toggle (1x, 1.5x, 2x) */}
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition active:scale-95 cursor-pointer ${
                isMe
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
              }`}
              title="Oynatma Hızı"
            >
              {playbackRate}x
            </button>

            <Mic className={`w-3 h-3 ${isMe ? 'text-white/60' : 'text-gray-400'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};
