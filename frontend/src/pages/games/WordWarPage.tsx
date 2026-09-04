import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Loader2, LogOut, Play, Send, Volume2, VolumeX, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useWordWarOptional } from '../../contexts/WordWarContext';
import { api } from '../../services/api';
import {
  isGameSfxEnabled,
  playLobbyJoinSound,
  playLobbyLeaveSound,
  playWordWarAccept,
  playWordWarCountdown,
  playWordWarLobbyTick,
  playWordWarReject,
  playWordWarRoundEnd,
  playWordWarStart,
  playWordWarTick,
  playWordWarTimeout,
  playWordWarTurn,
  playWordWarWinner,
  setGameSfxEnabled,
} from '../../services/soundService';
import { WORD_WAR_EMOJIS, WordWarReaction, WordWarSyncChannel } from '../../services/wordWarSync';
import { DrawingConfetti } from '../../components/games/DrawingConfetti';
import { Logo } from '../../components/branding/Logo';
import { BrandLoading } from '../../components/branding/BrandLoading';
import { WordWarPlayer, WordWarState } from '../../types';

const REACTION_GAP_MS = 1200;

const EVENT_EMOJI: Record<string, string> = {
  speed: '⚡',
  last_chance: '🔥',
  category: '🎯',
  bomb: '💣',
  freeze: '🧊',
  reverse: '🔄',
  risky: '👑',
};

const STATUS_DOT: Record<string, string> = {
  answered: '🟢 Cevapladı',
  thinking: '🟡 Düşünüyor',
  critical: '🔴 Süresi bitiyor',
  miss: '❌ Hata',
  frozen: '🧊 Dondu',
  won: '👑 Kazandı',
  idle: '',
};

function initials(name: string): string {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function Avatar({ player, size = 'md', pulse = false }: { player: WordWarPlayer; size?: 'sm' | 'md' | 'lg'; pulse?: boolean }) {
  const dim = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-9 h-9 text-sm' : 'w-12 h-12 text-lg';
  return (
    <div
      className={`${dim} rounded-full overflow-hidden flex items-center justify-center font-black flex-shrink-0 ${
        pulse ? 'ring-2 ring-violet-400 animate-pulse' : 'ring-1 ring-white/10'
      }`}
      style={{ background: 'var(--theme-surface-secondary, #2C1F4C)', color: 'var(--theme-text-primary)' }}
    >
      {player.avatar_url ? (
        <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        initials(player.name)
      )}
    </div>
  );
}

export const WordWarPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const ctx = useWordWarOptional();

  const [state, setState] = useState<WordWarState | null>(ctx?.state ?? null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sfxOn, setSfxOn] = useState(isGameSfxEnabled);
  const [bursts, setBursts] = useState<Array<WordWarReaction & { x: number }>>([]);
  const [shake, setShake] = useState(false);

  const syncRef = useRef<WordWarSyncChannel | null>(null);
  const pendingJoinRef = useRef(false);
  const lastSoundKey = useRef('');
  const lastTickSec = useRef<number | null>(null);
  const lastReactAt = useRef(0);
  const lastLobbyTick = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reportState = ctx?.reportState;

  const applyState = useCallback(
    (next: WordWarState | null) => {
      if (!next) {
        setState(null);
        reportState?.(null);
        return;
      }
      setState((prev) => {
        if (prev && (next.revision ?? 0) < (prev.revision ?? 0)) return prev;
        return next;
      });
      reportState?.(next);
    },
    [reportState]
  );

  useEffect(() => {
    if (ctx?.state) {
      setState((prev) => {
        if (prev && (ctx.state!.revision ?? 0) < (prev.revision ?? 0)) return prev;
        return ctx.state;
      });
    }
  }, [ctx?.state]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<WordWarState>('/games/word-war/state');
      applyState(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [applyState]);

  useEffect(() => {
    if (!currentFamily?.id || !user) return;
    const sync = new WordWarSyncChannel(currentFamily.id, user.id, {
      onGameEvent: () => {
        void refresh();
      },
      onReaction: (reaction) => {
        setBursts((prev) => [...prev.slice(-10), { ...reaction, x: 18 + Math.random() * 64 }]);
      },
      onResyncNeeded: () => {
        void refresh();
      },
    });
    sync.connect();
    syncRef.current = sync;
    void refresh();
    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [currentFamily?.id, user, refresh]);

  const secondsLeft = ctx?.secondsLeft ?? state?.seconds_left ?? null;
  const visualSeconds = secondsLeft;

  useEffect(() => {
    if (state?.status !== 'playing' || visualSeconds !== 0) return;
    void api.post<WordWarState>('/games/word-war/heartbeat').then((res) => applyState(res.data)).catch(() => {});
  }, [state?.status, visualSeconds, applyState]);

  useEffect(() => {
    if (!state) return;
    const key = `${state.status}:${state.round_number}:${state.current_player_id}:${state.last_result?.kind}:${state.revision}`;
    if (lastSoundKey.current === key) return;
    const prev = lastSoundKey.current;
    lastSoundKey.current = key;
    if (!prev) return;

    if (state.status === 'playing' && state.is_my_turn) playWordWarTurn();
    if (state.last_result?.kind === 'accepted') playWordWarAccept();
    if (state.last_result?.kind === 'invalid') {
      playWordWarReject();
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
    }
    if (state.last_result?.kind === 'timeout') playWordWarTimeout();
    if (state.status === 'round_end') playWordWarRoundEnd();
    if (state.status === 'winner') playWordWarWinner();
  }, [state]);

  useEffect(() => {
    if (state?.status !== 'playing' || visualSeconds == null) return;
    if (visualSeconds <= 3 && visualSeconds !== lastTickSec.current) {
      lastTickSec.current = visualSeconds;
      playWordWarTick(visualSeconds <= 1);
    }
  }, [state?.status, visualSeconds]);

  useEffect(() => {
    if (state?.status === 'countdown' && state.countdown_left != null) {
      playWordWarCountdown(state.countdown_left);
    }
  }, [state?.status, state?.countdown_left]);

  useEffect(() => {
    if (state?.status !== 'winner' || state.countdown_left == null) return;
    if (lastLobbyTick.current === state.countdown_left) return;
    lastLobbyTick.current = state.countdown_left;
    playWordWarLobbyTick();
  }, [state?.status, state?.countdown_left]);

  useEffect(() => {
    if (state?.is_my_turn && state.status === 'playing') {
      inputRef.current?.focus();
    } else {
      setDraft('');
    }
  }, [state?.is_my_turn, state?.status, state?.revision]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail;
      setError(detail || (err as Error)?.message || 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenLobby = () =>
    run(async () => {
      const res = await api.post<WordWarState>('/games/word-war/start');
      applyState(res.data);
      playLobbyJoinSound();
      syncRef.current?.broadcastGameEvent('lobby_opened');
    });

  const handleJoin = () => {
    if (!user || pendingJoinRef.current) return;
    pendingJoinRef.current = true;
    playLobbyJoinSound();
    void api
      .post<WordWarState>('/games/word-war/join')
      .then((res) => {
        pendingJoinRef.current = false;
        applyState(res.data);
        syncRef.current?.broadcastGameEvent('player_joined');
      })
      .catch((err: { response?: { data?: { detail?: string } } }) => {
        pendingJoinRef.current = false;
        setError(err?.response?.data?.detail || 'Katılamadı.');
      });
  };

  const handleLeave = () =>
    run(async () => {
      playLobbyLeaveSound();
      const res = await api.post<WordWarState>('/games/word-war/leave');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('player_left');
    });

  const handleBegin = () =>
    run(async () => {
      playWordWarStart();
      const res = await api.post<WordWarState>('/games/word-war/begin');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('match_started');
    });

  const handleReplay = () =>
    run(async () => {
      playWordWarStart();
      const res = await api.post<WordWarState>('/games/word-war/replay');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('replay');
    });

  const handleAnswer = () => {
    if (!state?.is_my_turn || !draft.trim() || busy) return;
    void run(async () => {
      const res = await api.post<WordWarState>('/games/word-war/answer', { word: draft.trim() });
      applyState(res.data);
      setDraft('');
      syncRef.current?.broadcastGameEvent('answer');
    });
  };

  const sendReaction = (emoji: string) => {
    if (!user) return;
    const now = Date.now();
    if (now - lastReactAt.current < REACTION_GAP_MS) return;
    lastReactAt.current = now;
    const reaction: WordWarReaction = {
      id: `${user.id}-${now}`,
      user_id: user.id,
      name: user.full_name?.split(' ')[0] || 'Ben',
      emoji,
      at: now,
    };
    setBursts((prev) => [...prev.slice(-10), { ...reaction, x: 18 + Math.random() * 64 }]);
    syncRef.current?.sendReaction(reaction);
  };

  useEffect(() => {
    if (!bursts.length) return;
    const t = window.setTimeout(() => setBursts((prev) => prev.slice(1)), 1400);
    return () => window.clearTimeout(t);
  }, [bursts.length]);

  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxOn(next);
    setGameSfxEnabled(next);
  };

  if (!currentFamily) {
    return <BrandLoading message="Aile yükleniyor..." />;
  }

  const players = state?.players || [];
  const canStart = (state?.online_count || 0) >= (state?.min_players || 2);
  const tension =
    state?.status === 'playing' && visualSeconds != null
      ? visualSeconds <= 1
        ? 'critical'
        : visualSeconds <= 3
          ? 'danger'
          : visualSeconds <= 5
            ? 'warn'
            : 'ok'
      : 'ok';

  return (
    <div
      className={`relative flex flex-col h-full min-h-0 theme-bg overflow-hidden ${shake ? 'ww-shake' : ''}`}
      data-tension={tension}
    >
      <style>{`
        @keyframes ww-float { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-72px) scale(1.15); opacity: 0; } }
        @keyframes ww-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
        .ww-shake { animation: ww-shake 0.35s ease; }
        .ww-critical { box-shadow: inset 0 0 80px rgba(239, 68, 68, 0.35); }
        .ww-danger { box-shadow: inset 0 0 60px rgba(249, 115, 22, 0.22); }
      `}</style>
      <DrawingConfetti active={state?.status === 'winner'} />

      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="pointer-events-none absolute z-30 text-3xl"
          style={{ left: `${burst.x}%`, bottom: '28%', animation: 'ww-float 1.35s ease-out forwards' }}
        >
          {burst.emoji}
        </div>
      ))}

      <header className="safe-area-top px-3 pt-2 pb-2 flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="w-10 h-10 rounded-2xl theme-surface border theme-border flex items-center justify-center cursor-pointer"
          aria-label="Oyunlara dön"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-violet-300">
            <Logo size="xs" />
            <span>Kelime Savaşı</span>
          </div>
          <p className="text-sm font-black truncate theme-text-primary">
            {state?.status === 'playing'
              ? `Tur ${state.round_number}/${state.total_rounds}`
              : state?.status === 'winner'
                ? 'Kazanan'
                : 'Parti lobisi'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSfx}
          className="w-10 h-10 rounded-2xl theme-surface border theme-border flex items-center justify-center cursor-pointer"
          aria-label={sfxOn ? 'Sesleri kapat' : 'Sesleri aç'}
        >
          {sfxOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        {state?.is_player && (
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-300 flex items-center justify-center cursor-pointer"
            aria-label="Ayrıl"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </header>

      <div
        className={`flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3 ${
          tension === 'critical' ? 'ww-critical' : tension === 'danger' ? 'ww-danger' : ''
        }`}
      >
        {error && (
          <div className="rounded-2xl px-3 py-2 text-xs font-bold bg-rose-500/15 text-rose-200 border border-rose-400/20">
            {error}
          </div>
        )}

        {(!state || state.status === 'none') && (
          <div className="theme-surface border theme-border rounded-3xl p-5 space-y-3">
            <h2 className="text-lg font-black">Kelime zinciri, parti temposu</h2>
            <p className="text-sm theme-text-secondary leading-relaxed">
              Önceki kelimenin son harfiyle başla. Süre kısa, eventler sürpriz. Aileyle lobi aç.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleOpenLobby()}
              className="w-full py-3 rounded-2xl font-black text-sm text-white cursor-pointer theme-cta"
            >
              Lobi aç
            </button>
          </div>
        )}

        {state?.status === 'lobby' && (
          <LobbyPanel
            state={state}
            busy={busy}
            canStart={canStart}
            onJoin={handleJoin}
            onBegin={() => void handleBegin()}
          />
        )}

        {state?.status === 'countdown' && (
          <div className="theme-surface border theme-border rounded-3xl py-12 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-violet-300 mb-2">Hazır ol</p>
            <p className="text-7xl font-black theme-text-primary tabular-nums">
              {(state.countdown_left ?? 0) > 0 ? state.countdown_left : 'GO!'}
            </p>
            {state.previous_word && (
              <p className="mt-4 text-sm theme-text-secondary">
                Başlangıç: <span className="font-black theme-text-primary">{state.previous_word}</span>
              </p>
            )}
          </div>
        )}

        {state?.status === 'playing' && (
          <PlayPanel
            state={state}
            visualSeconds={visualSeconds}
            tension={tension}
            draft={draft}
            setDraft={setDraft}
            onAnswer={handleAnswer}
            busy={busy}
            inputRef={inputRef}
          />
        )}

        {state?.status === 'round_end' && state.round_summary && (
          <div className="theme-surface border theme-border rounded-3xl p-5 space-y-3 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-violet-300">Tur {state.round_summary.round_number} bitti</p>
            <p className="text-sm theme-text-secondary">
              {state.round_summary.correct_count} doğru · {state.round_summary.miss_count} hata
            </p>
            {state.round_summary.fastest_name && (
              <p className="text-xs font-bold text-amber-300">⚡ En hızlı: {state.round_summary.fastest_name}</p>
            )}
            <div className="space-y-2">
              {state.round_summary.scores.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between text-sm font-bold">
                  <span>{p.name}</span>
                  <span className={p.round_score >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {p.round_score > 0 ? '+' : ''}
                    {p.round_score}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-3xl font-black tabular-nums">{state.countdown_left ?? 0}</p>
            <p className="text-[11px] theme-text-secondary">Sonraki tur</p>
          </div>
        )}

        {state?.status === 'winner' && (
          <WinnerPanel state={state} busy={busy} onReplay={() => void handleReplay()} />
        )}

        {state && state.status !== 'none' && (
          <PlayerStrip players={players} currentId={state.current_player_id} />
        )}
      </div>

      {state && state.status !== 'none' && state.status !== 'winner' && (
        <div className="safe-area-bottom px-3 pb-3 pt-1 flex-shrink-0">
          <div className="flex gap-1.5 justify-center">
            {WORD_WAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendReaction(emoji)}
                className="w-9 h-9 rounded-xl theme-surface border theme-border text-lg cursor-pointer active:scale-90"
                aria-label={`${emoji} gönder`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const LobbyPanel: React.FC<{
  state: WordWarState;
  busy: boolean;
  canStart: boolean;
  onJoin: () => void;
  onBegin: () => void;
}> = ({ state, busy, canStart, onJoin, onBegin }) => (
  <div className="theme-surface border theme-border rounded-3xl p-5 space-y-4">
    <div>
      <h2 className="text-lg font-black">Lobide {state.online_count} kişi</h2>
      <p className="text-xs theme-text-secondary mt-1">Son harften devam et. 8 saniye. 5 tur.</p>
    </div>
    <div className="flex flex-wrap gap-3">
      {state.players.map((p) => (
        <div key={p.user_id} className="flex flex-col items-center gap-1 w-16">
          <Avatar player={p} />
          <span className="text-[11px] font-bold truncate w-full text-center">{p.name}</span>
        </div>
      ))}
      {state.players.length === 0 && <p className="text-xs theme-text-secondary">Henüz kimse yok.</p>}
    </div>
    {!state.is_player ? (
      <button
        type="button"
        disabled={busy}
        onClick={onJoin}
        className="w-full py-3 rounded-2xl font-black text-sm text-white cursor-pointer theme-cta"
      >
        Lobiye katıl
      </button>
    ) : (
      <button
        type="button"
        disabled={busy || !canStart}
        onClick={onBegin}
        className="w-full py-3 rounded-2xl font-black text-sm text-white cursor-pointer theme-cta disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {canStart ? 'Oyunu başlat' : `En az ${state.min_players} kişi`}
      </button>
    )}
  </div>
);

const PlayPanel: React.FC<{
  state: WordWarState;
  visualSeconds: number | null;
  tension: string;
  draft: string;
  setDraft: (v: string) => void;
  onAnswer: () => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ state, visualSeconds, tension, draft, setDraft, onAnswer, busy, inputRef }) => {
  const max = state.turn_seconds || 8;
  const left = visualSeconds ?? max;
  const ratio = Math.max(0, Math.min(1, left / max));
  const timerColor =
    tension === 'critical' ? '#ef4444' : tension === 'danger' ? '#f97316' : tension === 'warn' ? '#eab308' : '#a78bfa';

  return (
    <div className="space-y-3">
      {state.event_label && (
        <div className="rounded-2xl px-3 py-2 text-center text-sm font-black bg-violet-500/20 border border-violet-400/30">
          {EVENT_EMOJI[state.event_type || ''] || '✨'} {state.event_label}
        </div>
      )}
      <div className="theme-surface border theme-border rounded-3xl p-5 text-center space-y-2">
        <p className="text-[11px] font-black uppercase tracking-wider theme-text-secondary">Önceki kelime</p>
        <p className="text-3xl font-black tracking-tight">{state.previous_word}</p>
        <p className="text-sm theme-text-secondary">
          Şununla başla:{' '}
          <span className="text-4xl font-black text-violet-300 align-middle">{state.required_letter?.toLocaleUpperCase('tr-TR')}</span>
        </p>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-3">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${ratio * 100}%`, background: timerColor }}
          />
        </div>
        <p
          className={`text-5xl font-black tabular-nums ${
            tension === 'critical' ? 'text-rose-400' : tension === 'danger' ? 'text-orange-400' : 'theme-text-primary'
          }`}
        >
          {left}
        </p>
        <p className="text-xs font-bold theme-text-secondary">
          {state.is_my_turn ? 'LAN SÜRE BİTİYOR — bir kelime yaz!' : `${state.current_player_name || 'Oyuncu'} düşünüyor`}
        </p>
      </div>

      {state.last_result && (
        <p className={`text-center text-xs font-bold ${state.last_result.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {state.last_result.name}: {state.last_result.word || state.last_result.reason}{' '}
          {state.last_result.delta > 0 ? `+${state.last_result.delta}` : state.last_result.delta}
        </p>
      )}

      {state.is_my_turn ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={`${state.required_letter?.toLocaleUpperCase('tr-TR') || ''}...`}
            className="flex-1 min-w-0 h-14 rounded-2xl px-4 text-lg font-black theme-surface border theme-border outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="h-14 w-14 rounded-2xl theme-cta text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Gönder"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      ) : (
        <div className="h-14 rounded-2xl theme-surface border theme-border flex items-center justify-center text-sm font-bold theme-text-secondary">
          Sıra {state.current_player_name || 'rakipte'}
        </div>
      )}
    </div>
  );
};

const WinnerPanel: React.FC<{ state: WordWarState; busy: boolean; onReplay: () => void }> = ({ state, busy, onReplay }) => {
  const winner = state.players.find((p) => p.user_id === state.winner_stats?.winner_user_id) || state.players[0];
  return (
    <div className="theme-surface border theme-border rounded-3xl p-5 space-y-4 text-center">
      <p className="text-xs font-black uppercase tracking-widest text-amber-300">Kazanan</p>
      {winner && <Avatar player={winner} size="lg" pulse />}
      <h2 className="text-2xl font-black flex items-center justify-center gap-2">
        <Crown className="w-6 h-6 text-amber-300" />
        {state.winner_stats?.winner_name || winner?.name}
      </h2>
      <p className="text-lg font-black">{winner?.score ?? 0} puan</p>
      <div className="space-y-1.5 text-left">
        {state.players
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-2 text-sm font-bold">
              <span className="w-5 theme-text-secondary">{i + 1}</span>
              <Avatar player={p} size="sm" />
              <span className="flex-1 truncate">{p.name}</span>
              <span>{p.score}</span>
            </div>
          ))}
      </div>
      <div className="grid grid-cols-1 gap-1 text-[11px] font-bold theme-text-secondary">
        {state.winner_stats?.fastest_name && <p>⚡ En Hızlı: {state.winner_stats.fastest_name}</p>}
        {state.winner_stats?.word_master_name && <p>📚 Kelime Ustası: {state.winner_stats.word_master_name}</p>}
        {state.winner_stats?.risk_taker_name && <p>👑 En Çok Risk Alan: {state.winner_stats.risk_taker_name}</p>}
      </div>
      <p className="text-4xl font-black tabular-nums">{state.countdown_left ?? 0}</p>
      <p className="text-xs theme-text-secondary">Lobiye dönülüyor...</p>
      <button
        type="button"
        disabled={busy}
        onClick={onReplay}
        className="w-full py-3 rounded-2xl font-black text-sm text-white theme-cta cursor-pointer flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Hemen tekrar oyna
      </button>
    </div>
  );
};

const PlayerStrip: React.FC<{ players: WordWarPlayer[]; currentId: string | null }> = ({ players, currentId }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    {players.map((p) => (
      <div
        key={p.user_id}
        className={`min-w-[5.5rem] rounded-2xl p-2 text-center border ${
          p.user_id === currentId ? 'border-violet-400 bg-violet-500/15' : 'theme-border theme-surface'
        }`}
      >
        <div className="flex justify-center">
          <Avatar player={p} size="sm" pulse={p.user_id === currentId} />
        </div>
        <p className="text-[11px] font-black truncate mt-1">{p.name}</p>
        <p className="text-[10px] font-bold text-violet-300">{p.score}</p>
        {STATUS_DOT[p.last_status] && (
          <p className="text-[9px] font-bold theme-text-secondary leading-tight">{STATUS_DOT[p.last_status]}</p>
        )}
      </div>
    ))}
  </div>
);

export default WordWarPage;
