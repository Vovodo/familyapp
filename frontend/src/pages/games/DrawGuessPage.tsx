import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Circle,
  Eraser,
  Loader2,
  LogOut,
  MessageCircle,
  Music2,
  PaintBucket,
  Pencil,
  Play,
  Send,
  Settings,
  Shuffle,
  Square,
  Trash2,
  Triangle,
  Trophy,
  Undo2,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useDrawingGameOptional } from '../../contexts/DrawingGameContext';
import { api } from '../../services/api';
import { DrawingSyncChannel, StrokeDeltaPayload } from '../../services/drawingSync';
import { playApplauseSound, playGuessBlobSound, playLobbyJoinSound, playLobbyLeaveSound } from '../../services/soundService';
import {
  DrawingCanvas,
  DrawingCanvasHandle,
  DrawTool,
  NormalizedStroke,
} from '../../components/games/DrawingCanvas';
import { DrawingConfetti } from '../../components/games/DrawingConfetti';
import { Logo } from '../../components/branding/Logo';
import { BrandLoading } from '../../components/branding/BrandLoading';
import { DrawingGameState, DrawingGuessItem, DrawingPlayer, DrawingStrokesResponse } from '../../types';

const PALETTE = [
  { color: '#111827', label: 'Siyah' },
  { color: '#ef4444', label: 'Kırmızı' },
  { color: '#f97316', label: 'Turuncu' },
  { color: '#eab308', label: 'Sarı' },
  { color: '#22c55e', label: 'Yeşil' },
  { color: '#0ea5e9', label: 'Mavi' },
  { color: '#8b5cf6', label: 'Mor' },
  { color: '#ffffff', label: 'Beyaz' },
];

const BRUSHES = [
  { width: 18, label: 'İnce' },
  { width: 36, label: 'Normal' },
  { width: 72, label: 'Kalın' },
  { width: 140, label: 'Çok kalın' },
];

const ERASER_COLOR = '#ffffff';
const COUNTDOWN_SECONDS = 5;
const AUTO_NEXT_ROUND_MS = 450;
const ROUND_SECONDS = 150;

const CATEGORY_LABELS: Record<string, string> = {
  hayvanlar: 'Hayvanlar',
  meyve_sebze: 'Meyve ve sebze',
  yemek_icecek: 'Yemek ve içecek',
  ev_esyalari: 'Ev eşyaları',
  giyim: 'Giyim',
  doga: 'Doğa',
  ulasim: 'Ulaşım',
  meslekler: 'Meslekler',
  vucut_saglik: 'Vücut ve sağlık',
  spor_oyun: 'Spor ve oyun',
  muzik_sanat: 'Müzik ve sanat',
  okul_ofis: 'Okul ve ofis',
  teknoloji: 'Teknoloji',
  yapilar_sehir: 'Yapılar ve şehir',
  kutlama_kavramlar: 'Kutlama ve kavramlar',
  masal_fantastik: 'Masal ve fantastik',
  aletler_diger: 'Aletler',
};

const categoryLabel = (key?: string | null) => (key ? CATEGORY_LABELS[key] || key : '');

const formatClock = (total: number) => {
  const safe = Math.max(0, total);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const DrawGuessPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const drawingSession = useDrawingGameOptional();
  const reportState = drawingSession?.reportState;
  const navigate = useNavigate();

  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const syncRef = useRef<DrawingSyncChannel | null>(null);
  const stateRef = useRef<DrawingGameState | null>(null);
  const revealSentRef = useRef(false);
  const seenGuessIdsRef = useRef<Set<string>>(new Set());
  const pendingJoinRef = useRef(false);
  const sendingGuessRef = useRef(false);
  const autoNextKeyRef = useRef<string | null>(null);
  const handleNextRoundRef = useRef<() => void>(() => {});

  const [state, setState] = useState<DrawingGameState | null>(drawingSession?.state ?? null);
  const [isLoading, setIsLoading] = useState(!drawingSession?.state);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guessText, setGuessText] = useState('');
  const [color, setColor] = useState(PALETTE[0].color);
  const [brushWidth, setBrushWidth] = useState(BRUSHES[1].width);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showDrawerMenu, setShowDrawerMenu] = useState(false);
  const [guessToasts, setGuessToasts] = useState<DrawingGuessItem[]>([]);

  stateRef.current = state;

  const isDrawer =
    state?.status === 'drawing' && !!user?.id && state.drawer_user_id === user.id;
  const isEraser = drawTool === 'eraser';
  const activeColor = isEraser ? ERASER_COLOR : color;
  const activeWidth = isEraser ? Math.max(brushWidth, 80) : brushWidth;
  const startedMs = state?.round_started_at ? new Date(state.round_started_at).getTime() : 0;
  const derivedCountdown =
    state?.status === 'drawing' && startedMs
      ? Math.max(0, Math.ceil((startedMs + COUNTDOWN_SECONDS * 1000 - Date.now()) / 1000))
      : 0;
  const shownCountdown = countdown ?? (derivedCountdown > 0 ? derivedCountdown : null);
  const inCountdown = state?.status === 'drawing' && (shownCountdown || 0) > 0;

  const applyState = useCallback(
    (next: DrawingGameState) => {
      next.guesses.forEach((item) => seenGuessIdsRef.current.add(item.id));
      setState((prev) => {
        if (prev && (next.revision ?? 0) < (prev.revision ?? 0)) return prev;
        let merged: DrawingGameState = next;
        if (pendingJoinRef.current && user?.id && !next.is_player && next.status !== 'none') {
          const self = prev?.players.find((p) => p.user_id === user.id);
          merged = {
            ...next,
            is_player: true,
            players:
              self && !next.players.some((p) => p.user_id === user.id)
                ? [...next.players, self]
                : next.players,
          };
        }
        if (prev && (next.revision ?? 0) === (prev.revision ?? 0)) {
          const olderScores = new Map(prev.players.map((p) => [p.user_id, p.score]));
          merged = {
            ...merged,
            players: merged.players.map((p) => ({
              ...p,
              score: Math.max(p.score, olderScores.get(p.user_id) ?? 0),
            })),
          };
        }
        return merged;
      });
      reportState?.(next);
    },
    [reportState, user?.id]
  );

  const mergePlayers = useCallback((incoming: DrawingPlayer[]) => {
    setState((prev) => {
      if (!prev) return prev;
      const map = new Map(prev.players.map((p) => [p.user_id, p]));
      incoming.forEach((p) => {
        const existing = map.get(p.user_id);
        map.set(p.user_id, {
          ...existing,
          ...p,
          score: Math.max(existing?.score ?? 0, p.score),
        });
      });
      return { ...prev, players: Array.from(map.values()), online_count: incoming.length };
    });
  }, []);

  const celebrateCorrect = useCallback(() => {
    setShowConfetti(true);
    playApplauseSound();
    window.setTimeout(() => setShowConfetti(false), 500);
  }, []);

  const ingestGuess = useCallback(
    (guess: DrawingGuessItem | undefined, playBlob: boolean) => {
      if (!guess?.id) return;
      if (seenGuessIdsRef.current.has(guess.id)) return;
      seenGuessIdsRef.current.add(guess.id);
      if (playBlob && !guess.is_correct) playGuessBlobSound();
      setState((prev) => {
        if (!prev) return prev;
        if (prev.guesses.some((item) => item.id === guess.id)) return prev;
        const withoutTempDup = prev.guesses.filter(
          (item) =>
            !(
              item.id.startsWith('temp-guess-') &&
              item.user_id === guess.user_id &&
              item.text === guess.text
            )
        );
        if (withoutTempDup.some((item) => item.id === guess.id)) return prev;
        return { ...prev, guesses: [...withoutTempDup, guess] };
      });
      if (guess.is_correct) celebrateCorrect();
      if (stateRef.current?.drawer_user_id === user?.id) {
        setGuessToasts((prev) => [...prev.slice(-3), guess]);
        window.setTimeout(() => {
          setGuessToasts((prev) => prev.filter((item) => item.id !== guess.id));
        }, 1100);
      }
    },
    [celebrateCorrect, user?.id]
  );

  const fetchState = useCallback(async (): Promise<DrawingGameState | null> => {
    try {
      const res = await api.get<DrawingGameState>('/games/drawing/state');
      applyState(res.data);
      setError(null);
      return res.data;
    } catch (err: any) {
      setError(err?.message || 'Oyun durumu alınamadı.');
      return null;
    }
  }, [applyState]);

  const resyncCanvas = useCallback(async () => {
    try {
      const res = await api.get<DrawingStrokesResponse>('/games/drawing/strokes');
      const strokes: NormalizedStroke[] = res.data.strokes
        .filter((s) => s.kind === 'stroke' && s.payload && s.payload.p.length >= 2)
        .map((s) => ({
          c: s.payload!.c,
          w: s.payload!.w,
          p: s.payload!.p,
          k: (s.payload!.k as NormalizedStroke['k']) || 'stroke',
        }));
      canvasRef.current?.replaceAll(strokes);
    } catch {
      canvasRef.current?.clearAll();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!stateRef.current) setIsLoading(true);
      const loaded = await fetchState();
      if (!cancelled && loaded?.status === 'drawing') {
        await resyncCanvas();
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchState, resyncCanvas, currentFamily?.id]);

  const handleStrokeDelta = useCallback((payload: StrokeDeltaPayload) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.beginRemoteStroke(payload.sid, payload.c || '#111827', payload.w || 36, payload.k);
    if (payload.p.length > 0) {
      canvas.appendRemotePoints(payload.sid, payload.p);
    }
    if (payload.end) {
      canvas.endRemoteStroke(payload.sid);
    }
  }, []);

  useEffect(() => {
    if (!currentFamily?.id || !user?.id) return;

    const sync = new DrawingSyncChannel(currentFamily.id, user.id, {
      onStrokeDelta: handleStrokeDelta,
      onCanvasCleared: () => canvasRef.current?.clearAll(),
      onGameEvent: (event, payload) => {
        const rawGuess = payload?.guess as DrawingGuessItem | undefined;
        const snapshot = payload?.players as DrawingPlayer[] | undefined;
        const single = payload?.player as DrawingPlayer | undefined;

        if (snapshot?.length) {
          mergePlayers(snapshot);
        } else if (single?.user_id && event === 'player_joined') {
          mergePlayers([single]);
        } else if (event === 'player_left' && payload?.uid) {
          setState((prev) =>
            prev
              ? { ...prev, players: prev.players.filter((p) => p.user_id !== payload.uid) }
              : prev
          );
        }

        if (event === 'player_joined' && payload?.uid !== user.id) {
          playLobbyJoinSound();
        }
        if (event === 'player_left' && payload?.uid !== user.id) {
          playLobbyLeaveSound();
        }

        if (rawGuess?.id) {
          ingestGuess(rawGuess, payload?.uid !== user.id);
        }

        if (event === 'round_started' || event === 'canvas_reset' || event === 'turn_passed' || event === 'word_skipped') {
          canvasRef.current?.clearAll();
        }

        if (event === 'player_joined' || event === 'player_left' || (event === 'guess' && rawGuess && !rawGuess.is_correct)) {
          return;
        }

        void fetchState().then((next) => {
          const iAmDrawer = !!user?.id && next?.drawer_user_id === user.id;
          if (next?.status === 'drawing' && (event === 'round_started' || event === 'turn_passed') && !iAmDrawer) {
            void resyncCanvas();
          }
        });
      },
      onResyncNeeded: () => {
        void fetchState().then((next) => {
          const iAmDrawer = !!user?.id && next?.drawer_user_id === user.id;
          if (next?.status === 'drawing' && !iAmDrawer) void resyncCanvas();
        });
      },
    });

    sync.connect();
    syncRef.current = sync;

    return () => {
      sync.disconnect();
      syncRef.current = null;
    };
  }, [currentFamily?.id, user?.id, handleStrokeDelta, fetchState, resyncCanvas, ingestGuess, mergePlayers]);

  useEffect(() => {
    syncRef.current?.setRoundNumber(
      state?.status === 'drawing' ? state.round_number : null
    );
  }, [state?.status, state?.round_number]);

  useEffect(() => {
    seenGuessIdsRef.current = new Set((stateRef.current?.guesses || []).map((item) => item.id));
  }, [state?.round_number]);

  useEffect(() => {
    if (state?.status !== 'drawing' || !state.round_started_at || !state.round_ends_at) {
      setSecondsLeft(null);
      setCountdown(null);
      revealSentRef.current = false;
      return;
    }

    revealSentRef.current = false;
    const started = new Date(state.round_started_at).getTime();
    const ends = new Date(state.round_ends_at).getTime();

    const tick = () => {
      const now = Date.now();
      const cd = Math.max(0, Math.ceil((started + COUNTDOWN_SECONDS * 1000 - now) / 1000));
      setCountdown(cd > 0 ? cd : null);
      const remaining = Math.max(0, Math.round((ends - now) / 1000));
      setSecondsLeft(cd > 0 ? ROUND_SECONDS : remaining);

      if (cd <= 0 && remaining <= 0 && !revealSentRef.current && stateRef.current?.drawer_user_id === user?.id) {
        revealSentRef.current = true;
        void api
          .post('/games/drawing/round/reveal')
          .then(() => {
            syncRef.current?.broadcastGameEvent('round_end');
            return fetchState();
          })
          .catch(() => {});
      }
    };

    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [state?.status, state?.round_started_at, state?.round_ends_at, state?.round_number, fetchState, user?.id]);

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true);
      setError(null);
      try {
        await action();
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'İşlem tamamlanamadı.');
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const handleStartGame = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/start');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('lobby_opened', { players: res.data.players });
    });

  const handleJoinGame = () => {
    if (!user || !currentFamily || pendingJoinRef.current) return;
    pendingJoinRef.current = true;
    const selfPlayer: DrawingPlayer = {
      user_id: user.id,
      name: user.full_name?.split(' ')[0] || 'Ben',
      avatar_url: user.avatar_url,
      score: 0,
      rounds_drawn: 0,
      is_drawer: false,
      is_online: true,
    };
    setState((prev) => {
      if (!prev) return prev;
      if (prev.players.some((p) => p.user_id === user.id)) {
        return { ...prev, is_player: true };
      }
      return { ...prev, is_player: true, players: [...prev.players, selfPlayer] };
    });
    playLobbyJoinSound();
    syncRef.current?.broadcastGameEvent('player_joined', { player: selfPlayer });
    void api
      .post<DrawingGameState>('/games/drawing/join')
      .then((res) => {
        pendingJoinRef.current = false;
        applyState(res.data);
        syncRef.current?.broadcastGameEvent('player_joined', { players: res.data.players });
      })
      .catch((err: any) => {
        pendingJoinRef.current = false;
        setError(err?.response?.data?.detail || err?.message || 'Katılamadı.');
        setState((prev) =>
          prev
            ? { ...prev, is_player: false, players: prev.players.filter((p) => p.user_id !== user.id) }
            : prev
        );
      });
  };

  const handleLeaveGame = () =>
    runAction(async () => {
      playLobbyLeaveSound();
      const res = await api.post<DrawingGameState>('/games/drawing/leave');
      applyState(res.data);
      canvasRef.current?.clearAll();
      syncRef.current?.broadcastGameEvent('player_left');
    });

  const handleNextRound = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/round/next');
      applyState(res.data);
      if (res.data.started_round) {
        canvasRef.current?.clearAll();
        syncRef.current?.broadcastGameEvent('round_started');
        setShowDrawerMenu(false);
      }
    });

  handleNextRoundRef.current = handleNextRound;

  const handleSkipWord = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/round/skip-word');
      canvasRef.current?.clearAll();
      applyState(res.data);
      syncRef.current?.broadcastCanvasCleared();
      syncRef.current?.broadcastGameEvent('word_skipped');
      setShowDrawerMenu(false);
    });

  const handlePassTurn = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/pass');
      canvasRef.current?.clearAll();
      applyState(res.data);
      syncRef.current?.broadcastCanvasCleared();
      syncRef.current?.broadcastGameEvent('turn_passed');
      setShowDrawerMenu(false);
    });

  const handleRevealRound = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/round/reveal');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('round_end');
      setShowDrawerMenu(false);
    });

  const handleClearCanvas = () =>
    runAction(async () => {
      await api.post('/games/drawing/clear');
      canvasRef.current?.clearAll();
      syncRef.current?.broadcastCanvasCleared();
    });

  const handleFinishGame = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/finish');
      canvasRef.current?.clearAll();
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('game_finished');
      setShowDrawerMenu(false);
    });

  const handleGuess = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = guessText.trim();
    if (!text || sendingGuessRef.current || !user || inCountdown) return;
    setGuessText('');
    sendingGuessRef.current = true;

    const optimistic: DrawingGuessItem = {
      id: `temp-guess-${Date.now()}`,
      user_id: user.id,
      name: user.full_name?.split(' ')[0] || 'Ben',
      text,
      is_correct: false,
      created_at: new Date().toISOString(),
    };
    ingestGuess(optimistic, true);
    syncRef.current?.broadcastGameEvent('guess', { guess: optimistic });

    try {
      const res = await api.post<DrawingGameState>('/games/drawing/guess', { text });
      const latest = res.data.guesses[res.data.guesses.length - 1];
      ingestGuess(latest, false);
      applyState(res.data);
      syncRef.current?.broadcastGameEvent(
        res.data.status === 'round_end' ? 'round_solved' : 'guess',
        latest ? { guess: latest, players: res.data.players, revision: res.data.revision } : {}
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Tahmin gönderilemedi.');
    } finally {
      sendingGuessRef.current = false;
    }
  };

  const handleStrokeStart = useCallback(
    (strokeId: string, strokeColor: string, strokeWidth: number, kind?: NormalizedStroke['k']) => {
      syncRef.current?.beginStroke(strokeId, strokeColor, strokeWidth, kind);
    },
    []
  );

  const handleLivePoints = useCallback((strokeId: string, points: number[]) => {
    syncRef.current?.queuePoints(strokeId, points);
  }, []);

  const handleStrokeEnd = useCallback((strokeId: string, stroke: NormalizedStroke) => {
    syncRef.current?.endStroke(strokeId, stroke);
  }, []);

  const onlineCount = useMemo(
    () => (state?.players || []).filter((p) => p.is_online !== false).length,
    [state?.players]
  );

  useEffect(() => {
    if (state?.status !== 'round_end' || !state.is_player) return;
    if (onlineCount < (state.min_players || 2)) return;
    const onlineIds = (state.players || [])
      .filter((p) => p.is_online !== false)
      .map((p) => p.user_id)
      .sort();
    const isLeader = onlineIds[0] === user?.id;
    if (!isLeader) return;
    const key = `${state.game_id}-${state.round_number}`;
    const timer = window.setTimeout(() => {
      if (autoNextKeyRef.current === key) return;
      if (stateRef.current?.status !== 'round_end') return;
      autoNextKeyRef.current = key;
      handleNextRoundRef.current();
    }, AUTO_NEXT_ROUND_MS);
    return () => window.clearTimeout(timer);
  }, [state?.status, state?.round_number, state?.game_id, state?.is_player, onlineCount, state?.min_players, state?.players, user?.id]);

  const avatarByUserId = useMemo(() => {
    const map = new Map<string, string>();
    currentFamily?.members?.forEach((member) => {
      const url = member.user?.avatar_url;
      if (member.user_id && url) map.set(member.user_id, url);
    });
    if (user?.id && user.avatar_url) map.set(user.id, user.avatar_url);
    return map;
  }, [currentFamily?.members, user?.id, user?.avatar_url]);

  const playerAvatar = (player: DrawingPlayer) =>
    player.avatar_url || avatarByUserId.get(player.user_id) || null;

  const enoughPlayers = (state?.players.length || 0) >= (state?.min_players || 2);
  const enoughFamilyMembers = (state?.family_member_count || 0) >= (state?.min_players || 2);
  const recentGuesses = (state?.guesses || []).slice(-10);
  const myScore = state?.players.find((p) => p.user_id === user?.id)?.score ?? 0;
  const familyName = currentFamily?.name || 'Aile';
  const selfInitial = (user?.full_name?.[0] || '?').toUpperCase();
  const slotCount = Math.max(4, state?.players.length || 0);
  const isPlay =
    state?.status === 'drawing' || state?.status === 'round_end';

  if (isLoading) {
    return (
      <div className="h-full" style={{ background: '#120F1D' }}>
        <BrandLoading fullScreen={false} message="Oyun yükleniyor..." />
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col h-full min-h-0 w-full overflow-hidden"
      style={{ background: '#120F1D', color: '#F8F7FC' }}
    >
      <DrawingConfetti active={showConfetti} />
      <div
        className={`flex items-center gap-2 px-3 pt-2 pb-2 flex-shrink-0 ${isPlay ? '' : 'px-4'}`}
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="w-9 h-9 rounded-2xl bg-white/8 flex items-center justify-center text-white/80 hover:bg-white/14 transition cursor-pointer"
          aria-label="Oyunlara dön"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {isPlay ? (
          <>
            <Logo size="xs" />
            <span className="text-xs font-black text-white/80">Tur {state?.round_number || 1}</span>
            {secondsLeft !== null && !inCountdown && (
              <span className="ml-1 px-2.5 py-1 rounded-full bg-violet-600 text-[11px] font-black">
                {formatClock(secondsLeft)}
              </span>
            )}
            <span className="ml-auto text-[11px] font-black text-white/70">Puan: {myScore}</span>
            {isDrawer && (
              <button
                type="button"
                onClick={() => setShowDrawerMenu((v) => !v)}
                className="w-9 h-9 rounded-2xl bg-white/8 flex items-center justify-center text-white/80 cursor-pointer"
                aria-label="Ayarlar"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-sm font-black truncate">{familyName}</p>
            </div>
            <div className="w-9 h-9 rounded-2xl bg-violet-600 text-white font-black flex items-center justify-center text-sm">
              {selfInitial}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-2 p-3 bg-rose-500/15 border border-rose-400/30 rounded-2xl text-xs font-bold text-rose-200">
          {error}
        </div>
      )}

      {state?.status === 'none' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          <LobbyChrome
            poolSize={state.pool_size}
            onLeave={state.is_player ? handleLeaveGame : undefined}
            leaveBusy={isBusy}
          />
          <div className="rounded-3xl bg-white/6 border border-white/8 p-6 text-center space-y-4">
            <Logo size="lg" className="mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-black">Yeni oyun kur</h2>
              <p className="text-xs text-white/55 leading-relaxed max-w-sm mx-auto">
                Bir kişi kelimeyi çizer, diğerleri tahmin eder. En az {state.min_players} aile üyesi gerekir.
              </p>
            </div>
            {!enoughFamilyMembers && (
              <p className="text-[11px] font-bold text-amber-200 bg-amber-500/15 border border-amber-400/20 rounded-2xl p-2.5">
                Ailenizde şu an {state.family_member_count} üye var. Oynamak için başka bir üyeyi davet edin.
              </p>
            )}
            <button
              type="button"
              onClick={handleStartGame}
              disabled={isBusy}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 active:scale-98 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Oyunu Başlat</span>
            </button>
          </div>
        </div>
      )}

      {state?.status === 'lobby' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          <LobbyChrome
            poolSize={state.pool_size}
            onLeave={state.is_player ? handleLeaveGame : undefined}
            leaveBusy={isBusy}
          />
          <PlayerSlots
            players={state.players}
            slotCount={slotCount}
            userId={user?.id}
            playerAvatar={playerAvatar}
          />
          <HowToPlay />
          {!state.is_player && (
            <button
              type="button"
              onClick={handleJoinGame}
              className="w-full py-3.5 bg-white/10 hover:bg-white/14 text-white font-black rounded-2xl text-sm cursor-pointer"
            >
              Oyuna Katıl
            </button>
          )}
          <button
            type="button"
            onClick={handleNextRound}
            disabled={isBusy || !enoughPlayers}
            className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 active:scale-98 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Oyunu Başlat</span>
          </button>
          {!enoughPlayers && (
            <p className="text-[11px] text-center text-white/45 font-bold">
              Turun başlaması için en az {state.min_players} oyuncu odada olmalı.
            </p>
          )}
        </div>
      )}

      {isPlay && state && (
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div className={`relative min-h-0 ${isDrawer ? 'h-[80%]' : 'h-[60%]'}`}>
            <DrawingCanvas
              ref={canvasRef}
              tool={drawTool}
              interactive={state.status === 'drawing' && isDrawer && !inCountdown}
              color={activeColor}
              width={activeWidth}
              onStrokeStart={handleStrokeStart}
              onLivePoints={handleLivePoints}
              onStrokeEnd={handleStrokeEnd}
            />

            {state.status === 'drawing' && !inCountdown && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                <div className="px-3 py-1 rounded-full bg-[#120F1D]/80 text-white text-[11px] font-black shadow-lg">
                  {isDrawer ? state.word : state.word_masked}
                </div>
                {isDrawer && (
                  <button
                    type="button"
                    onClick={handleSkipWord}
                    disabled={isBusy}
                    className="px-2.5 py-1 rounded-full bg-[#120F1D]/80 text-white/80 text-[10px] font-bold shadow-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Shuffle className="w-3 h-3" />
                    Değiştir
                  </button>
                )}
              </div>
            )}

            {isDrawer && guessToasts.length > 0 && (
              <div className="absolute top-11 right-2 z-20 w-[min(58%,13.5rem)] space-y-1.5 pointer-events-none">
                {guessToasts.map((guess) => (
                  <div
                    key={guess.id}
                    className={`guess-toast-in px-2.5 py-1.5 rounded-xl text-[11px] shadow-lg ${
                      guess.is_correct
                        ? 'bg-emerald-500/90 text-white font-black'
                        : 'bg-[#1A1528]/80 text-white/95'
                    }`}
                  >
                    <span className="font-black opacity-80">{guess.name}: </span>
                    <span>{guess.is_correct ? 'doğru!' : guess.text}</span>
                  </div>
                ))}
              </div>
            )}

            {isDrawer && inCountdown && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#120F1D]/78">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Konu</p>
                <p className="text-3xl font-black text-violet-300 mt-1">{state.word}</p>
                <p className="text-6xl font-black text-white mt-6">{shownCountdown}</p>
                <p className="text-xs font-bold text-white/50 mt-2">Hazır olun!</p>
                <button
                  type="button"
                  onClick={handleSkipWord}
                  disabled={isBusy}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/12 text-[11px] font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Kelimeyi değiştir
                </button>
              </div>
            )}
          </div>

          {isDrawer && state.status === 'drawing' && !inCountdown && (
            <div className="flex-1 min-h-0 px-2 py-1.5 flex flex-col justify-center gap-1.5">
              <div className="flex items-center justify-center gap-1 overflow-x-auto">
                {(
                  [
                    { id: 'pen' as DrawTool, label: 'Kalem', Icon: Pencil },
                    { id: 'eraser' as DrawTool, label: 'Silgi', Icon: Eraser },
                    { id: 'rect' as DrawTool, label: 'Kare', Icon: Square },
                    { id: 'circle' as DrawTool, label: 'Daire', Icon: Circle },
                    { id: 'triangle' as DrawTool, label: 'Üçgen', Icon: Triangle },
                    { id: 'fill' as DrawTool, label: 'Boya', Icon: PaintBucket },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDrawTool(id)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer ${
                      drawTool === id ? 'bg-violet-600 text-white' : 'bg-white/8 text-white/70'
                    }`}
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  disabled={isBusy}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-300 bg-white/8 cursor-pointer disabled:opacity-50"
                  aria-label="Temizle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2">
                {BRUSHES.map((brush) => (
                  <button
                    key={brush.width}
                    type="button"
                    onClick={() => setBrushWidth(brush.width)}
                    className="flex items-center justify-center cursor-pointer"
                    aria-label={brush.label}
                  >
                    <span
                      className={`rounded-full ${brushWidth === brush.width ? 'ring-2 ring-violet-400' : 'ring-1 ring-white/20'}`}
                      style={{
                        width: 8 + brush.width / 28,
                        height: 8 + brush.width / 28,
                        backgroundColor: isEraser ? '#ffffff' : color,
                      }}
                    />
                  </button>
                ))}
                <span className="w-px h-5 bg-white/15 mx-0.5" />
                {PALETTE.map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    onClick={() => {
                      setColor(item.color);
                      if (drawTool === 'eraser') setDrawTool('pen');
                    }}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                      !isEraser && color === item.color ? 'border-violet-400 scale-110' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: item.color }}
                    aria-label={item.label}
                  />
                ))}
              </div>
            </div>
          )}

          {!isDrawer && (
            <div className="flex-1 min-h-0 flex flex-col px-3 py-2 gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                {recentGuesses.slice(-8).map((guess) => (
                  <div
                    key={guess.id}
                    className={`px-2.5 py-1.5 rounded-xl text-[12px] ${
                      guess.is_correct ? 'bg-emerald-500 text-white font-black' : 'bg-white/10 text-white/95'
                    }`}
                  >
                    <span className="font-black opacity-70">{guess.name}: </span>
                    <span>{guess.is_correct ? 'doğru!' : guess.text}</span>
                  </div>
                ))}
              </div>
              {state.status === 'drawing' && state.is_player && !inCountdown && (
                <form onSubmit={handleGuess} className="flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guessText}
                      onChange={(e) => setGuessText(e.target.value)}
                      placeholder="Tahminini yaz..."
                      maxLength={120}
                      autoComplete="off"
                      enterKeyHint="send"
                      className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                      type="submit"
                      disabled={!guessText.trim()}
                      className="px-4 bg-violet-600 hover:bg-violet-500 active:scale-98 text-white font-black rounded-2xl text-sm disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {state.status === 'round_end' && (
            <div className="flex-shrink-0 px-4 py-2.5 bg-emerald-500 text-white flex items-center justify-center gap-2 relative overflow-hidden">
              <Trophy className="w-5 h-5" />
              <p className="text-sm font-black">
                {state.solved_by_name
                  ? `Doğru! ${state.revealed_word}`
                  : `Süre bitti · ${state.revealed_word}`}
              </p>
            </div>
          )}
        </div>
      )}

      {inCountdown && state && !isDrawer && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: '#120F1D' }}>
          <div
            className="flex items-center gap-2 px-4 pb-2"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          >
            <button
              type="button"
              onClick={() => navigate('/games')}
              className="w-9 h-9 rounded-2xl bg-white/8 flex items-center justify-center text-white/80 cursor-pointer"
              aria-label="Oyunlara dön"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <p className="flex-1 text-center text-sm font-black truncate">{familyName}</p>
            <div className="w-9 h-9 rounded-2xl bg-violet-600 text-white font-black flex items-center justify-center text-sm">
              {selfInitial}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
            <LobbyChrome
              poolSize={state.pool_size}
              onLeave={state.is_player ? handleLeaveGame : undefined}
              leaveBusy={isBusy}
            />
            {isDrawer && state.word && (
              <div className="rounded-3xl bg-white/6 border border-white/8 p-5 text-center space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Konu</p>
                <p className="text-3xl font-black text-pink-400">{state.word}</p>
                {state.word_category && (
                  <p className="text-[11px] font-bold text-white/45">{categoryLabel(state.word_category)}</p>
                )}
                <button
                  type="button"
                  onClick={handleSkipWord}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/8 text-[11px] font-bold text-white/70 cursor-pointer disabled:opacity-50"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Konuyu Değiştir
                </button>
              </div>
            )}
            {!isDrawer && (
              <div className="rounded-3xl bg-white/6 border border-white/8 p-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Konu</p>
                <p className="text-2xl font-black tracking-[0.2em] mt-2">{state.word_masked}</p>
                <p className="text-[11px] text-white/45 mt-1">{state.drawer_name} çiziyor</p>
              </div>
            )}
            <div className="rounded-3xl bg-white/6 border border-white/8 p-6 text-center space-y-3">
              <p className="text-sm font-black text-white/80">Oyun başlıyor</p>
              <div className="relative w-28 h-28 mx-auto">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#A855F7"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${((shownCountdown || 0) / COUNTDOWN_SECONDS) * 97} 97`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-5xl font-black">
                  {shownCountdown}
                </span>
              </div>
              <p className="text-xs font-bold text-white/50">Hazır olun!</p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`w-2 h-2 rounded-full ${n <= (COUNTDOWN_SECONDS - (shownCountdown || 0) + 1) ? 'bg-violet-500' : 'bg-white/15'}`}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white/6 border border-white/8 px-3 py-2.5 flex items-center gap-2">
              <Music2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
              <p className="text-[11px] font-bold text-white/70">Oyun başlıyor! Hazır olun, iyi eğlenceler!</p>
            </div>
            <PlayerSlots
              players={state.players}
              slotCount={slotCount}
              userId={user?.id}
              playerAvatar={playerAvatar}
            />
          </div>
        </div>
      )}

      {showDrawerMenu && isDrawer && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end" onClick={() => setShowDrawerMenu(false)}>
          <div
            className="w-full rounded-t-3xl bg-[#1A1528] border-t border-white/10 p-4 space-y-2"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-white/40 px-1">Çizen menüsü</p>
            <button
              type="button"
              onClick={handleSkipWord}
              disabled={isBusy}
              className="w-full py-3 rounded-2xl bg-white/8 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Shuffle className="w-4 h-4" />
              Kelimeyi değiştir
            </button>
            <button
              type="button"
              onClick={handlePassTurn}
              disabled={isBusy}
              className="w-full py-3 rounded-2xl bg-white/8 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              Turu devret
            </button>
            <button
              type="button"
              onClick={handleRevealRound}
              disabled={isBusy}
              className="w-full py-3 rounded-2xl bg-white/8 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              Turu bitir
            </button>
            <button
              type="button"
              onClick={handleFinishGame}
              disabled={isBusy}
              className="w-full py-3 rounded-2xl bg-rose-500/20 text-rose-200 text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              Oyunu bitir
            </button>
          </div>
        </div>
      )}

      {state?.status === 'round_end' && (
        <div className="absolute left-3 right-3 z-20 flex justify-center" style={{ bottom: 'max(4.5rem, calc(env(safe-area-inset-bottom, 0px) + 3.5rem))' }}>
          <button
            type="button"
            onClick={handleFinishGame}
            disabled={isBusy}
            className="px-4 py-2 rounded-full bg-[#120F1D]/80 text-[11px] font-bold text-white/70 cursor-pointer disabled:opacity-50"
          >
            Oyunu bitir
          </button>
        </div>
      )}
    </div>
  );
};

const LobbyChrome: React.FC<{
  poolSize: number;
  onLeave?: () => void;
  leaveBusy?: boolean;
}> = ({ poolSize, onLeave, leaveBusy }) => (
  <div className="rounded-3xl bg-white/6 border border-white/8 p-4 flex items-start gap-3">
    <Logo size="md" className="flex-shrink-0" />
    <div className="min-w-0 flex-1">
      <h1 className="text-lg font-black">Çiz ve Tahmin Et</h1>
      <p className="text-[11px] font-bold text-white/45">{poolSize} kelimelik havuz</p>
    </div>
    {onLeave && (
      <button
        type="button"
        onClick={onLeave}
        disabled={leaveBusy}
        className="px-2.5 py-2 rounded-2xl bg-rose-500/15 text-rose-200 text-[11px] font-black flex items-center gap-1 disabled:opacity-50 cursor-pointer flex-shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
        Ayrıl
      </button>
    )}
  </div>
);

const PlayerSlots: React.FC<{
  players: DrawingPlayer[];
  slotCount: number;
  userId?: string;
  playerAvatar: (player: DrawingPlayer) => string | null;
}> = ({ players, slotCount, userId, playerAvatar }) => {
  const slots: Array<DrawingPlayer | null> = [...players];
  while (slots.length < slotCount) slots.push(null);
  return (
    <div className="rounded-3xl bg-white/6 border border-white/8 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-violet-400" />
        <h2 className="text-[10px] font-black uppercase tracking-wider text-white/45">
          Oyuncular ({players.length}/{slotCount})
        </h2>
      </div>
      <div className="space-y-2">
        {slots.map((player, index) =>
          player ? (
            <div key={player.user_id} className="flex items-center gap-3">
              <div className="relative">
                {playerAvatar(player) ? (
                  <img
                    src={playerAvatar(player)!}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-violet-600/40 text-violet-100 font-black flex items-center justify-center">
                    {(player.name[0] || '?').toUpperCase()}
                  </div>
                )}
                {player.is_online !== false && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1A1528]" />
                )}
              </div>
              <span className="text-sm font-bold truncate flex-1">{player.name}</span>
              {player.is_drawer && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  Çizer
                </span>
              )}
              {player.user_id === userId && !player.is_drawer && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-violet-500/20 text-violet-200">
                  sen
                </span>
              )}
            </div>
          ) : (
            <div key={`empty-${index}`} className="flex items-center gap-3 opacity-40">
              <div className="w-10 h-10 rounded-full border border-dashed border-white/25" />
              <span className="text-sm font-bold">Oyuncu bekleniyor...</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};

const HowToPlay: React.FC = () => (
  <div className="grid grid-cols-3 gap-2">
    {[
      { icon: Pencil, label: 'Kelimeyi çiz' },
      { icon: MessageCircle, label: 'Diğerleri tahmin etsin' },
      { icon: Trophy, label: 'Doğru = puan' },
    ].map((item) => (
      <div key={item.label} className="rounded-2xl bg-white/6 border border-white/8 p-3 text-center space-y-1.5">
        <item.icon className="w-5 h-5 mx-auto text-violet-300" />
        <p className="text-[10px] font-bold text-white/55 leading-tight">{item.label}</p>
      </div>
    ))}
  </div>
);

export default DrawGuessPage;
