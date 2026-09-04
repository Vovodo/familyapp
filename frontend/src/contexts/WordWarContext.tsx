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
import { LogOut, Timer } from 'lucide-react';
import { Logo } from '../components/branding/Logo';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { api, API_BASE_URL, storage } from '../services/api';
import { WordWarState } from '../types';

const HEARTBEAT_MS = 1800;

interface WordWarContextType {
  state: WordWarState | null;
  secondsLeft: number | null;
  reportState: (next: WordWarState | null) => void;
  leaveGame: () => Promise<void>;
  refreshState: () => Promise<WordWarState | null>;
}

const WordWarContext = createContext<WordWarContextType | undefined>(undefined);

const leaveKeepalive = async () => {
  try {
    const token = await storage.get('auth_token');
    const familyId = await storage.get('active_family_id');
    if (!token || !familyId) return;
    await fetch(`${API_BASE_URL}/games/word-war/leave`, {
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
    // kapanış
  }
};

export const WordWarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const location = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<WordWarState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stateRef = useRef<WordWarState | null>(null);
  const isPlayerRef = useRef(false);
  stateRef.current = state;
  isPlayerRef.current = !!state?.is_player;

  const applyIncoming = useCallback((next: WordWarState | null) => {
    if (!next) {
      setState(null);
      return;
    }
    setState((prev) => {
      if (prev && (next.revision ?? 0) < (prev.revision ?? 0)) return prev;
      return next;
    });
  }, []);

  const reportState = useCallback((next: WordWarState | null) => {
    applyIncoming(next);
  }, [applyIncoming]);

  const refreshState = useCallback(async (): Promise<WordWarState | null> => {
    if (!currentFamily?.id || !user) return null;
    try {
      const res = await api.get<WordWarState>('/games/word-war/state');
      applyIncoming(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [currentFamily?.id, user, applyIncoming]);

  const leaveGame = useCallback(async () => {
    isPlayerRef.current = false;
    try {
      const res = await api.post<WordWarState>('/games/word-war/leave');
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
        .post<WordWarState>('/games/word-war/heartbeat')
        .then((res) => applyIncoming(res.data))
        .catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [state?.is_player, currentFamily?.id, applyIncoming]);

  useEffect(() => {
    const endsAt = state?.turn_ends_at || state?.phase_ends_at;
    if (!endsAt || !state || state.status === 'lobby' || state.status === 'none') {
      setSecondsLeft(state?.seconds_left ?? null);
      return;
    }
    const endMs = new Date(endsAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endMs - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [state?.status, state?.turn_ends_at, state?.phase_ends_at, state?.revision]);

  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !isPlayerRef.current) return;
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
        void api.post<WordWarState>('/games/word-war/heartbeat').then((res) => applyIncoming(res.data));
      }
    })
      .then((listener) => {
        remove = () => listener.remove();
      })
      .catch(() => {});
    return () => remove?.();
  }, [applyIncoming]);

  const value = useMemo(
    () => ({ state, secondsLeft, reportState, leaveGame, refreshState }),
    [state, secondsLeft, reportState, leaveGame, refreshState]
  );

  const live =
    state?.status === 'lobby' ||
    state?.status === 'countdown' ||
    state?.status === 'playing' ||
    state?.status === 'round_end' ||
    state?.status === 'winner';
  const showBar = !!state?.is_player && location.pathname !== '/games/word' && live;

  return (
    <WordWarContext.Provider value={value}>
      {children}
      {showBar && (
        <div className="fixed left-3 right-3 z-50 safe-area-top" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8.25rem)' }}>
          <div className="max-w-lg mx-auto theme-surface border theme-border shadow-lg rounded-2xl px-3 py-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
              <Logo size="xs" className="w-8 h-8" />
            </div>
            <button type="button" onClick={() => navigate('/games/word')} className="min-w-0 flex-1 text-left cursor-pointer">
              <p className="text-[11px] font-black theme-text-primary truncate">
                {state.status === 'playing'
                  ? `Kelime Savaşı · sıra ${state.current_player_name || ''}`
                  : state.status === 'winner'
                    ? 'Kelime Savaşı · kazanan'
                    : state.status === 'round_end'
                      ? 'Kelime Savaşı · tur bitti'
                      : state.status === 'countdown'
                        ? 'Kelime Savaşı · başlıyor'
                        : 'Kelime Savaşı · lobi'}
              </p>
              <p className="text-[10px] font-bold theme-text-secondary flex items-center gap-1">
                {secondsLeft != null && state.status === 'playing' ? (
                  <>
                    <Timer className="w-3 h-3" />
                    <span>{secondsLeft}s · oyuna dön</span>
                  </>
                ) : (
                  <span>Oyuna dön</span>
                )}
              </p>
            </button>
            <button
              type="button"
              onClick={() => void leaveGame()}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              <span>Ayrıl</span>
            </button>
          </div>
        </div>
      )}
    </WordWarContext.Provider>
  );
};

export const useWordWar = (): WordWarContextType => {
  const ctx = useContext(WordWarContext);
  if (!ctx) throw new Error('useWordWar must be used within a WordWarProvider');
  return ctx;
};

export const useWordWarOptional = (): WordWarContextType | undefined => useContext(WordWarContext);
