import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Palette, Timer } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { api, API_BASE_URL, storage } from '../services/api';
import { DrawingGameState } from '../types';

const HEARTBEAT_MS = 8000;

interface DrawingGameContextType {
  state: DrawingGameState | null;
  secondsLeft: number | null;
  reportState: (next: DrawingGameState | null) => void;
  leaveGame: () => Promise<void>;
  refreshState: () => Promise<DrawingGameState | null>;
}

const DrawingGameContext = createContext<DrawingGameContextType | undefined>(undefined);

const leaveKeepalive = async () => {
  try {
    const token = await storage.get('auth_token');
    const familyId = await storage.get('active_family_id');
    if (!token || !familyId) return;
    await fetch(`${API_BASE_URL}/games/drawing/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-family-id': familyId,
        'Content-Type': 'application/json',
      },
      body: '{}',
      keepalive: true,
    });
  } catch {
    // Kapanış anında ağ hatası yutulur; sunucu TTL ile düşürür.
  }
};

export const DrawingGameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const location = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<DrawingGameState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stateRef = useRef<DrawingGameState | null>(null);
  const isPlayerRef = useRef(false);
  stateRef.current = state;
  isPlayerRef.current = !!state?.is_player;

  const reportState = useCallback((next: DrawingGameState | null) => {
    setState(next);
  }, []);

  const refreshState = useCallback(async (): Promise<DrawingGameState | null> => {
    if (!currentFamily?.id || !user) return null;
    try {
      const res = await api.get<DrawingGameState>('/games/drawing/state');
      setState(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [currentFamily?.id, user]);

  const leaveGame = useCallback(async () => {
    isPlayerRef.current = false;
    try {
      const res = await api.post<DrawingGameState>('/games/drawing/leave');
      setState(res.data);
    } catch {
      setState((prev) =>
        prev
          ? { ...prev, is_player: false, players: prev.players.filter((p) => p.user_id !== user?.id) }
          : prev
      );
    }
  }, [user?.id]);

  useEffect(() => {
    if (!currentFamily?.id || !user) {
      setState(null);
      return;
    }
    void refreshState();
  }, [currentFamily?.id, user, refreshState]);

  useEffect(() => {
    if (!state?.is_player || !currentFamily?.id) return;

    const beat = () => {
      void api
        .post<DrawingGameState>('/games/drawing/heartbeat')
        .then((res) => setState(res.data))
        .catch(() => {});
    };

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [state?.is_player, currentFamily?.id]);

  useEffect(() => {
    if (state?.status !== 'drawing' || state.seconds_left === null) {
      setSecondsLeft(state?.status === 'drawing' ? state.seconds_left : null);
      return;
    }
    const deadline = Date.now() + (state.seconds_left ?? 0) * 1000;
    setSecondsLeft(state.seconds_left);
    const tick = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [state?.status, state?.seconds_left, state?.round_number]);

  // Uygulama kaydırılarak kapatıldığında / sekme ölünce lobiden düş.
  // Kısa arka plan (sohbet, başka uygulama) leave tetiklemez; heartbeat TTL yeter.
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !isPlayerRef.current) return;
      // Native'de arka plana almak pagehide üretebilir; kaydırarak öldürmeyi
      // sunucu TTL'si temizler. Web sekmesi kapanınca hemen ayrıl.
      if (Capacitor.isNativePlatform()) return;
      void leaveKeepalive();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  useEffect(() => {
    let remove: (() => void) | undefined;
    CapApp.addListener('appStateChange', (appState) => {
      if (appState.isActive && isPlayerRef.current) {
        void api.post<DrawingGameState>('/games/drawing/heartbeat').then((res) => setState(res.data));
      }
    })
      .then((listener) => {
        remove = () => listener.remove();
      })
      .catch(() => {});
    return () => remove?.();
  }, []);

  const value = useMemo(
    () => ({ state, secondsLeft, reportState, leaveGame, refreshState }),
    [state, secondsLeft, reportState, leaveGame, refreshState]
  );

  const showBar =
    !!state?.is_player &&
    location.pathname !== '/games/draw' &&
    (state.status === 'lobby' || state.status === 'drawing' || state.status === 'round_end');

  return (
    <DrawingGameContext.Provider value={value}>
      {children}
      {showBar && (
        <div className="fixed left-3 right-3 z-50 safe-area-top" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}>
          <div className="max-w-lg mx-auto theme-surface border theme-border shadow-lg rounded-2xl px-3 py-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center flex-shrink-0">
              <Palette className="w-4 h-4" />
            </div>
            <button
              type="button"
              onClick={() => navigate('/games/draw')}
              className="min-w-0 flex-1 text-left cursor-pointer"
            >
              <p className="text-[11px] font-black theme-text-primary truncate">
                {state.status === 'drawing'
                  ? `Çiz ve Tahmin Et · ${state.drawer_name || 'çizen'} çiziyor`
                  : state.status === 'round_end'
                    ? 'Çiz ve Tahmin Et · tur bitti'
                    : 'Çiz ve Tahmin Et · lobi'}
              </p>
              <p className="text-[10px] font-bold theme-text-secondary flex items-center gap-1">
                {state.status === 'drawing' && secondsLeft !== null ? (
                  <>
                    <Timer className="w-3 h-3" />
                    <span>{secondsLeft}s kaldı · oyuna dön</span>
                  </>
                ) : (
                  <span>Oyuna dön</span>
                )}
              </p>
            </button>
            <button
              type="button"
              onClick={() => void leaveGame()}
              className="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              <span>Ayrıl</span>
            </button>
          </div>
        </div>
      )}
    </DrawingGameContext.Provider>
  );
};

export const useDrawingGame = (): DrawingGameContextType => {
  const ctx = useContext(DrawingGameContext);
  if (!ctx) {
    throw new Error('useDrawingGame must be used within a DrawingGameProvider');
  }
  return ctx;
};

export const useDrawingGameOptional = (): DrawingGameContextType | undefined =>
  useContext(DrawingGameContext);
