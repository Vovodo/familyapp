import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Brush,
  Check,
  Eraser,
  Loader2,
  LogOut,
  Palette,
  Play,
  RefreshCw,
  Send,
  Shuffle,
  Timer,
  Trash2,
  Trophy,
  Undo2,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useDrawingGameOptional } from '../../contexts/DrawingGameContext';
import { api } from '../../services/api';
import { DrawingSyncChannel, StrokeDeltaPayload } from '../../services/drawingSync';
import { playApplauseSound, playGuessBlobSound } from '../../services/soundService';
import {
  DrawingCanvas,
  DrawingCanvasHandle,
  NormalizedStroke,
} from '../../components/games/DrawingCanvas';
import { DrawingConfetti } from '../../components/games/DrawingConfetti';
import { DrawingGameState, DrawingGuessItem, DrawingStrokesResponse } from '../../types';

const PALETTE = [
  { color: '#111827', label: 'Siyah' },
  { color: '#ef4444', label: 'Kırmızı' },
  { color: '#f97316', label: 'Turuncu' },
  { color: '#eab308', label: 'Sarı' },
  { color: '#22c55e', label: 'Yeşil' },
  { color: '#0ea5e9', label: 'Mavi' },
  { color: '#8b5cf6', label: 'Mor' },
  { color: '#78350f', label: 'Kahve' },
];

const BRUSHES = [
  { width: 18, label: 'İnce' },
  { width: 36, label: 'Normal' },
  { width: 72, label: 'Kalın' },
  { width: 140, label: 'Çok kalın' },
];

const ERASER_COLOR = '#ffffff';

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

  const [state, setState] = useState<DrawingGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guessText, setGuessText] = useState('');
  const [color, setColor] = useState(PALETTE[0].color);
  const [brushWidth, setBrushWidth] = useState(BRUSHES[1].width);
  const [isEraser, setIsEraser] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  stateRef.current = state;

  const isDrawer =
    state?.status === 'drawing' && !!user?.id && state.drawer_user_id === user.id;
  const activeColor = isEraser ? ERASER_COLOR : color;
  const activeWidth = isEraser ? Math.max(brushWidth, 80) : brushWidth;

  const applyState = useCallback(
    (next: DrawingGameState) => {
      next.guesses.forEach((item) => seenGuessIdsRef.current.add(item.id));
      setState(next);
      reportState?.(next);
    },
    [reportState]
  );

  const celebrateCorrect = useCallback(() => {
    setShowConfetti(true);
    playApplauseSound();
    window.setTimeout(() => setShowConfetti(false), 1600);
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
        return { ...prev, guesses: [...prev.guesses, guess] };
      });
      if (guess.is_correct) celebrateCorrect();
    },
    [celebrateCorrect]
  );

  // ------------------------------------------------------------ veri çekme

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

  /** Tuvali sunucudaki kalıcı kayıttan baştan kurar (katılma / yenileme / kopma). */
  const resyncCanvas = useCallback(async () => {
    try {
      const res = await api.get<DrawingStrokesResponse>('/games/drawing/strokes');
      const strokes: NormalizedStroke[] = res.data.strokes
        .filter((s) => s.kind === 'stroke' && s.payload && s.payload.p.length >= 2)
        .map((s) => ({ c: s.payload!.c, w: s.payload!.w, p: s.payload!.p }));
      canvasRef.current?.replaceAll(strokes);
    } catch {
      // Aktif tur yoksa (404) tuval boş kalır; hata göstermeye gerek yok.
      canvasRef.current?.clearAll();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
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

  // ------------------------------------------------------------ realtime

  const handleStrokeDelta = useCallback((payload: StrokeDeltaPayload) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Başlık mesajı kaybolsa bile çizgi çizilebilsin diye idempotent başlatma.
    canvas.beginRemoteStroke(payload.sid, payload.c || '#111827', payload.w || 36);
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
        if (rawGuess?.id) {
          ingestGuess(rawGuess, payload?.uid !== user.id);
        }

        if (event === 'round_started' || event === 'canvas_reset' || event === 'turn_passed' || event === 'word_skipped') {
          canvasRef.current?.clearAll();
        }

        // Tahmin geldiğinde REST beklemeden listede görünür; skor için doğruysa tazele.
        if (event === 'guess' && rawGuess && !rawGuess.is_correct) {
          return;
        }

        void fetchState().then((next) => {
          const iAmDrawer = !!user?.id && next?.drawer_user_id === user.id;
          if (next?.status === 'drawing' && event === 'round_started' && !iAmDrawer) {
            void resyncCanvas();
          }
          if (next?.status === 'drawing' && event === 'turn_passed' && !iAmDrawer) {
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
  }, [currentFamily?.id, user?.id, handleStrokeDelta, fetchState, resyncCanvas, ingestGuess]);

  useEffect(() => {
    syncRef.current?.setRoundNumber(
      state?.status === 'drawing' ? state.round_number : null
    );
  }, [state?.status, state?.round_number]);

  useEffect(() => {
    seenGuessIdsRef.current = new Set((stateRef.current?.guesses || []).map((item) => item.id));
  }, [state?.round_number]);

  // ------------------------------------------------------------ tur sayacı

  useEffect(() => {
    if (state?.status !== 'drawing' || state.seconds_left === null) {
      setSecondsLeft(null);
      revealSentRef.current = false;
      return;
    }

    revealSentRef.current = false;
    const deadline = Date.now() + (state.seconds_left ?? 0) * 1000;
    setSecondsLeft(state.seconds_left);

    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);

      // Süre bitince turu yalnızca çizen kapatır; sunucu zaten idempotent.
      if (remaining === 0 && !revealSentRef.current && stateRef.current?.drawer_user_id === user?.id) {
        revealSentRef.current = true;
        void api
          .post('/games/drawing/round/reveal')
          .then(() => {
            syncRef.current?.broadcastGameEvent('round_end');
            return fetchState();
          })
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [state?.status, state?.seconds_left, state?.round_number, fetchState, user?.id]);

  // ------------------------------------------------------------ eylemler

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
      syncRef.current?.broadcastGameEvent('lobby_opened');
    });

  const handleJoinGame = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/join');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('player_joined');
    });

  const handleLeaveGame = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/leave');
      applyState(res.data);
      canvasRef.current?.clearAll();
      syncRef.current?.broadcastGameEvent('player_left');
    });

  const handleNextRound = () =>
    runAction(async () => {
      const prevRound = stateRef.current?.round_number;
      const prevStatus = stateRef.current?.status;
      const res = await api.post<DrawingGameState>('/games/drawing/round/next');
      applyState(res.data);
      const startedFresh =
        prevStatus !== 'drawing' || res.data.round_number !== prevRound;
      if (startedFresh) {
        canvasRef.current?.clearAll();
        syncRef.current?.broadcastGameEvent('round_started');
      }
    });

  const handleSkipWord = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/round/skip-word');
      canvasRef.current?.clearAll();
      applyState(res.data);
      syncRef.current?.broadcastCanvasCleared();
      syncRef.current?.broadcastGameEvent('word_skipped');
    });

  const handlePassTurn = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/pass');
      canvasRef.current?.clearAll();
      applyState(res.data);
      syncRef.current?.broadcastCanvasCleared();
      syncRef.current?.broadcastGameEvent('turn_passed');
    });

  const handleRevealRound = () =>
    runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/round/reveal');
      applyState(res.data);
      syncRef.current?.broadcastGameEvent('round_end');
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
    });

  const handleGuess = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = guessText.trim();
    if (!text || isBusy) return;
    setGuessText('');
    await runAction(async () => {
      const res = await api.post<DrawingGameState>('/games/drawing/guess', { text });
      const latest = res.data.guesses[res.data.guesses.length - 1];
      ingestGuess(latest, true);
      applyState(res.data);
      syncRef.current?.broadcastGameEvent(
        res.data.status === 'round_end' ? 'round_solved' : 'guess',
        latest ? { guess: latest } : {}
      );
    });
  };

  // ------------------------------------------------------------ çizim köprüsü

  const handleStrokeStart = useCallback(
    (strokeId: string, strokeColor: string, strokeWidth: number) => {
      syncRef.current?.beginStroke(strokeId, strokeColor, strokeWidth);
    },
    []
  );

  const handleLivePoints = useCallback((strokeId: string, points: number[]) => {
    syncRef.current?.queuePoints(strokeId, points);
  }, []);

  const handleStrokeEnd = useCallback((strokeId: string, stroke: NormalizedStroke) => {
    syncRef.current?.endStroke(strokeId, stroke);
  }, []);

  // ------------------------------------------------------------ görünüm

  const scoreboard = useMemo(
    () => [...(state?.players || [])].sort((a, b) => b.score - a.score),
    [state?.players]
  );

  const enoughPlayers = (state?.players.length || 0) >= (state?.min_players || 2);
  const enoughFamilyMembers = (state?.family_member_count || 0) >= (state?.min_players || 2);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-family-600" />
        <span className="text-xs font-bold theme-text-secondary">Oyun yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 w-full max-w-2xl mx-auto">
      <DrawingConfetti active={showConfetti} />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="w-9 h-9 rounded-2xl theme-surface-secondary flex items-center justify-center theme-text-secondary hover:opacity-80 transition cursor-pointer"
          aria-label="Oyunlara dön"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-black theme-text-primary truncate">Çiz ve Tahmin Et</h1>
          <p className="text-[11px] font-medium theme-text-secondary">
            {state?.status === 'drawing'
              ? `${state.round_number}. tur · çizen: ${state.drawer_name}`
              : `${state?.pool_size || 0} kelimelik havuz`}
          </p>
        </div>
        {state?.status === 'drawing' && secondsLeft !== null && (
          <div
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black ${
              secondsLeft <= 15 ? 'bg-rose-100 text-rose-700' : 'theme-surface-secondary theme-text-primary'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{secondsLeft}s</span>
          </div>
        )}
        {state?.is_player && state.status !== 'none' && (
          <button
            type="button"
            onClick={handleLeaveGame}
            disabled={isBusy}
            className={`${state?.status === 'drawing' && secondsLeft !== null ? '' : 'ml-auto'} px-2.5 py-1.5 rounded-2xl bg-rose-50 text-rose-700 text-[11px] font-black flex items-center gap-1 disabled:opacity-50 cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{state.status === 'lobby' ? 'Lobiden ayrıl' : 'Oyundan ayrıl'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {/* Oyun yok: başlatma ekranı */}
      {state?.status === 'none' && (
        <div className="theme-surface rounded-3xl p-6 border theme-border text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-fuchsia-100 text-fuchsia-600 mx-auto flex items-center justify-center">
            <Palette className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black theme-text-primary">Yeni oyun kur</h2>
            <p className="text-xs theme-text-secondary leading-relaxed max-w-sm mx-auto">
              Bir kişi kelimeyi çizer, diğerleri tahmin eder. Oyun için en az{' '}
              {state.min_players} aile üyesi gerekiyor.
            </p>
          </div>
          {!enoughFamilyMembers && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
              Ailenizde şu an {state.family_member_count} üye var. Oynamak için önce başka bir üyeyi
              davet edin.
            </p>
          )}
          <button
            type="button"
            onClick={handleStartGame}
            disabled={isBusy}
            className="w-full py-3.5 bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-98 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Oyunu Başlat</span>
          </button>
        </div>
      )}

      {/* Lobi */}
      {state?.status === 'lobby' && (
        <div className="theme-surface rounded-3xl p-5 border theme-border space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-fuchsia-600" />
            <h2 className="text-sm font-black theme-text-primary">
              Oyuncular ({state.players.length}/{state.family_member_count})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.players.map((player) => (
              <span
                key={player.user_id}
                className="px-3 py-1.5 rounded-2xl theme-surface-secondary text-xs font-bold theme-text-primary"
              >
                {player.name}
              </span>
            ))}
          </div>
          <p className="text-xs theme-text-secondary leading-relaxed">
            {enoughPlayers
              ? 'Herkes hazır. Turu başlattığınızda sistem çizecek kişiyi ve kelimeyi seçer.'
              : `Turun başlaması için en az ${state.min_players} oyuncu gerekiyor. Diğer üyeler bu sayfadan "Oyuna Katıl" demeli.`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {!state.is_player && (
              <button
                type="button"
                onClick={handleJoinGame}
                disabled={isBusy}
                className="py-3 theme-surface-secondary hover:opacity-80 theme-text-primary font-bold rounded-2xl text-xs disabled:opacity-50 cursor-pointer"
              >
                Oyuna Katıl
              </button>
            )}
            {state.is_player && (
              <button
                type="button"
                onClick={handleLeaveGame}
                disabled={isBusy}
                className="py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-2xl text-xs disabled:opacity-50 cursor-pointer"
              >
                Lobiden Ayrıl
              </button>
            )}
            <button
              type="button"
              onClick={handleNextRound}
              disabled={isBusy || !enoughPlayers}
              className={`py-3 font-black rounded-2xl text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                !state.is_player ? '' : ''
              } ${!state.is_player && !enoughPlayers ? 'col-span-1' : ''} bg-fuchsia-600 hover:bg-fuchsia-700 text-white`}
            >
              <Play className="w-4 h-4" />
              <span>Turu Başlat</span>
            </button>
          </div>
        </div>
      )}

      {/* Kelime şeridi */}
      {(state?.status === 'drawing' || state?.status === 'round_end') && (
        <div className="theme-surface rounded-3xl p-4 border theme-border text-center space-y-1">
          {state.status === 'drawing' && isDrawer && (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600">
                Çizeceğin kelime
              </p>
              <p className="text-2xl font-black theme-text-primary tracking-tight">{state.word}</p>
              <p className="text-[11px] theme-text-secondary">
                Kimseye söyleme, sadece çiz.
                {state.word_category ? ` Kategori: ${categoryLabel(state.word_category)}` : ''}
              </p>
            </>
          )}
          {state.status === 'drawing' && !isDrawer && (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider theme-text-secondary">
                {state.drawer_name} çiziyor
              </p>
              <p className="text-xl font-black theme-text-primary tracking-[0.25em]">
                {state.word_masked}
              </p>
              <p className="text-[11px] theme-text-secondary">
                {state.word_length} harf
                {state.word_category ? ` · ${categoryLabel(state.word_category)}` : ''}
              </p>
            </>
          )}
          {state.status === 'round_end' && (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider theme-text-secondary">
                {state.solved_by_name ? `${state.solved_by_name} buldu!` : 'Kimse bulamadı'}
              </p>
              <p className="text-2xl font-black theme-text-primary tracking-tight">
                {state.revealed_word}
              </p>
            </>
          )}
        </div>
      )}

      {/* Tuval */}
      {(state?.status === 'drawing' || state?.status === 'round_end') && (
        <div className="rounded-3xl overflow-hidden border-2 theme-border shadow-lg bg-white">
          <DrawingCanvas
            ref={canvasRef}
            interactive={state.status === 'drawing' && isDrawer}
            color={activeColor}
            width={activeWidth}
            onStrokeStart={handleStrokeStart}
            onLivePoints={handleLivePoints}
            onStrokeEnd={handleStrokeEnd}
          />
        </div>
      )}

      {/* Çizen araç çubuğu */}
      {state?.status === 'drawing' && isDrawer && (
        <div className="theme-surface rounded-3xl p-3 border theme-border space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PALETTE.map((item) => (
              <button
                key={item.color}
                type="button"
                onClick={() => {
                  setColor(item.color);
                  setIsEraser(false);
                }}
                className={`w-8 h-8 rounded-xl border-2 transition active:scale-95 cursor-pointer ${
                  !isEraser && color === item.color
                    ? 'border-fuchsia-500 scale-110'
                    : 'border-black/10'
                }`}
                style={{ backgroundColor: item.color }}
                aria-label={item.label}
                title={item.label}
              />
            ))}
            <button
              type="button"
              onClick={() => setIsEraser((prev) => !prev)}
              className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isEraser ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700' : 'border-black/10 theme-text-secondary'
              }`}
              aria-label="Silgi"
              title="Silgi"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Brush className="w-4 h-4 theme-text-secondary flex-shrink-0" />
            {BRUSHES.map((brush) => (
              <button
                key={brush.width}
                type="button"
                onClick={() => setBrushWidth(brush.width)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  brushWidth === brush.width
                    ? 'bg-fuchsia-600 text-white'
                    : 'theme-surface-secondary theme-text-secondary'
                }`}
              >
                {brush.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleClearCanvas}
              disabled={isBusy}
              className="py-2.5 theme-surface-secondary hover:opacity-80 theme-text-primary font-bold rounded-2xl text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Temizle</span>
            </button>
            <button
              type="button"
              onClick={handleSkipWord}
              disabled={isBusy}
              className="py-2.5 theme-surface-secondary hover:opacity-80 theme-text-primary font-bold rounded-2xl text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Kelimeyi Değiştir</span>
            </button>
            <button
              type="button"
              onClick={handlePassTurn}
              disabled={isBusy}
              className="py-2.5 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-800 font-bold rounded-2xl text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Turu Devret</span>
            </button>
            <button
              type="button"
              onClick={handleRevealRound}
              disabled={isBusy}
              className="py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-2xl text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Turu Bitir</span>
            </button>
          </div>
        </div>
      )}

      {/* Tahmin alanı */}
      {state?.status === 'drawing' && !isDrawer && state.is_player && (
        <form onSubmit={handleGuess} className="flex gap-2">
          <input
            type="text"
            value={guessText}
            onChange={(e) => setGuessText(e.target.value)}
            placeholder="Tahminini yaz..."
            maxLength={120}
            autoComplete="off"
            className="flex-1 px-4 py-3 theme-surface border theme-border rounded-2xl text-sm theme-text-primary focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
          />
          <button
            type="submit"
            disabled={isBusy || !guessText.trim()}
            className="px-5 bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-98 text-white font-black rounded-2xl text-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Tahminler */}
      {(state?.status === 'drawing' || state?.status === 'round_end') &&
        state.guesses.length > 0 && (
          <div className="theme-surface rounded-3xl p-3 border theme-border space-y-1.5 max-h-52 overflow-y-auto">
            {state.guesses.map((guess) => (
              <div
                key={guess.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-xs ${
                  guess.is_correct
                    ? 'bg-emerald-50 text-emerald-800 font-black'
                    : 'theme-surface-secondary theme-text-primary'
                }`}
              >
                <span className="font-bold opacity-70 flex-shrink-0">{guess.name}:</span>
                <span className="truncate">{guess.is_correct ? 'doğru tahmin!' : guess.text}</span>
                {guess.is_correct && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

      {/* Tur sonu aksiyonları */}
      {state?.status === 'round_end' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleNextRound}
            disabled={isBusy}
            className="py-3.5 bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-98 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Yeni Tur</span>
          </button>
          <button
            type="button"
            onClick={handleFinishGame}
            disabled={isBusy}
            className="py-3.5 theme-surface-secondary hover:opacity-80 theme-text-primary font-bold rounded-2xl text-sm disabled:opacity-50 cursor-pointer"
          >
            Oyunu Bitir
          </button>
        </div>
      )}

      {/* Skor tablosu */}
      {scoreboard.length > 0 && state?.status !== 'none' && (
        <div className="theme-surface rounded-3xl p-4 border theme-border space-y-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black theme-text-primary uppercase tracking-wider">
              Skor tablosu
            </h3>
          </div>
          {scoreboard.map((player, index) => (
            <div
              key={player.user_id}
              className="flex items-center gap-2 text-xs theme-text-primary"
            >
              <span className="w-5 font-black theme-text-secondary">{index + 1}.</span>
              <span className="font-bold truncate">{player.name}</span>
              {state && player.user_id === state.drawer_user_id && state.status === 'drawing' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-fuchsia-100 text-fuchsia-700 font-black flex-shrink-0">
                  çiziyor
                </span>
              )}
              <span className="ml-auto font-black">{player.score}</span>
            </div>
          ))}
        </div>
      )}

      {state && state.status !== 'none' && (
        <p className="text-[10px] text-center theme-text-secondary">
          Kelime havuzu: {state.pool_size} kelime · sana gösterilen: {state.my_words_seen}
        </p>
      )}
    </div>
  );
};

export default DrawGuessPage;
