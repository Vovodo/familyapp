import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Loader2,
  LogOut,
  Radio,
  UserPlus,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { api, API_BASE_URL, storage } from '../../services/api';
import { WatchPartyChannel } from '../../services/watchPartySync';
import { YouTubePartyPlayer } from '../../components/watchparty/YouTubePartyPlayer';
import { WatchPartyChat } from '../../components/watchparty/WatchPartyChat';
import { WatchPartyReactions, WatchReactionBurst } from '../../components/watchparty/WatchPartyReactions';
import { WatchPartyAvatar } from '../../components/watchparty/WatchPartyAvatar';
import { WatchChatMessage, WatchReactionEvent, WatchRoomState } from '../../types';
import { extractYoutubeVideoId, formatWatchTime } from '../../utils/youtubeUrl';

const HEARTBEAT_MS = 8000;
const RESYNC_MS = 18000;
const TRANSIENT_ERRORS = new Set(['Odaya girilemedi.', 'Mesaj gönderilemedi.']);

const leaveKeepalive = async (roomId: string) => {
  try {
    const token = await storage.get('auth_token');
    const familyId = await storage.get('active_family_id');
    if (!token || !familyId) return;
    await fetch(`${API_BASE_URL}/watch-party/rooms/${roomId}/leave`, {
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
    // TTL ile düşer
  }
};

export const WatchPartyRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [room, setRoom] = useState<WatchRoomState | null>(null);
  const [messages, setMessages] = useState<WatchChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [videoInput, setVideoInput] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactionBursts, setReactionBursts] = useState<WatchReactionBurst[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [liveMs, setLiveMs] = useState(0);

  const bumpReaction = useCallback((emoji: string) => {
    setReactionCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  }, []);

  const roomRef = useRef<WatchRoomState | null>(null);
  roomRef.current = room;
  const channelRef = useRef<WatchPartyChannel | null>(null);
  const controlGenRef = useRef(0);
  const controlInFlightRef = useRef(false);
  const queuedControlRef = useRef<{
    action: 'play' | 'pause' | 'seek' | 'ended';
    positionMs: number;
    durationMs?: number;
    gen: number;
  } | null>(null);
  const joinedRef = useRef(false);
  const localControlUntilRef = useRef(0);

  const applyState = useCallback((next: WatchRoomState) => {
    const prev = roomRef.current;
    if (prev && next.control_seq < prev.control_seq && next.room_id === prev.room_id) return;
    if (prev && Date.now() < localControlUntilRef.current && next.control_seq <= prev.control_seq) {
      return;
    }
    setRoom(next);
  }, []);

  const ensureJoined = useCallback(async (): Promise<boolean> => {
    if (!roomId) return false;
    if (joinedRef.current) return true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const joined = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/join`);
        applyState(joined.data);
        joinedRef.current = true;
        setError(null);
        return true;
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    joinedRef.current = false;
    return false;
  }, [roomId, applyState]);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return null;
    const res = await api.get<WatchRoomState>(`/watch-party/rooms/${roomId}`);
    if (res.data.status === 'ended') {
      setError('Bu seyir odası kapatıldı.');
      setRoom(res.data);
      return res.data;
    }
    applyState(res.data);
    return res.data;
  }, [roomId, applyState]);

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    const res = await api.get<WatchChatMessage[]>(`/watch-party/rooms/${roomId}/messages`);
    setMessages(res.data);
  }, [roomId]);

  useEffect(() => {
    if (!error || !TRANSIENT_ERRORS.has(error)) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!reactionBursts.length) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 2800;
      setReactionBursts((prev) =>
        prev.filter((burst) => {
          const ts = Number(burst.id.split('-')[0]) || 0;
          return ts > cutoff;
        })
      );
    }, 400);
    return () => window.clearInterval(timer);
  }, [reactionBursts.length]);

  useEffect(() => {
    if (!roomId || !currentFamily?.id || !user?.id) return;
    let cancelled = false;
    const userId = user.id;

    const boot = async () => {
      try {
        await fetchRoom();
        if (cancelled) return;
        const joined = await ensureJoined();
        if (cancelled) return;
        if (!joined) {
          setError('Odaya girilemedi.');
          return;
        }
        if (roomRef.current?.video_id) setUnlocked(true);
        if (roomRef.current?.status === 'ended') {
          setError('Bu seyir odası kapatıldı.');
          return;
        }
        await fetchMessages();
        channelRef.current?.sendPresence(roomId);
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) setError(detail || 'Odaya girilemedi.');
      }
    };

    const channel = new WatchPartyChannel(currentFamily.id, userId, {
      onSync: (payload) => {
        if (payload.room_id !== roomId) return;
        if (payload.status === 'ended') {
          setError('Bu seyir odası kapatıldı.');
        }
        setRoom((prev) => {
          if (!prev) return prev;
          if (payload.control_seq < prev.control_seq) return prev;
          if (Date.now() < localControlUntilRef.current && payload.control_seq <= prev.control_seq) {
            return prev;
          }
          return { ...prev, ...payload } as WatchRoomState;
        });
      },
      onChat: (message) => {
        if (message.room_id !== roomId) return;
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      },
      onReaction: (reaction) => {
        if (reaction.room_id !== roomId) return;
        bumpReaction(reaction.emoji);
        setReactionBursts((prev) => [
          ...prev,
          { id: reaction.id, emoji: reaction.emoji, name: reaction.name, x: reaction.x },
        ]);
      },
      onPresence: (id) => {
        if (id && id !== roomId) return;
        void fetchRoom();
      },
      onResyncNeeded: () => {
        void fetchRoom();
        void fetchMessages();
      },
    });
    channelRef.current = channel;
    channel.connect();
    void boot();

    const heartbeat = window.setInterval(() => {
      if (!roomId) return;
      const current = roomRef.current;
      void api
        .post<WatchRoomState>(`/watch-party/rooms/${roomId}/heartbeat`, {
          duration_ms: current?.duration_ms || undefined,
          video_title: current?.video_title || undefined,
        })
        .then((res) => {
          if (Date.now() < localControlUntilRef.current) return;
          applyState(res.data);
        })
        .catch(async (err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 403) {
            joinedRef.current = false;
            const ok = await ensureJoined();
            if (ok) channelRef.current?.sendPresence(roomId);
          }
        });
    }, HEARTBEAT_MS);

    const resync = window.setInterval(() => {
      if (Date.now() < localControlUntilRef.current) return;
      void fetchRoom();
    }, RESYNC_MS);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.clearInterval(resync);
      channel.disconnect();
      channelRef.current = null;
    };
  }, [roomId, currentFamily?.id, user?.id, applyState, bumpReaction, ensureJoined, fetchMessages, fetchRoom]);

  useEffect(() => {
    if (!roomId) return;
    const onPageHide = () => {
      void leaveKeepalive(roomId);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [roomId]);

  useEffect(() => {
    if (Capacitor.getPlatform() === 'web') return;
    let remove: (() => void) | undefined;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void fetchRoom();
        void fetchMessages();
      }
    }).then((listener) => {
      remove = () => listener.remove();
    });
    return () => remove?.();
  }, [fetchRoom, fetchMessages]);

  useEffect(() => {
    if (room?.video_id) setUnlocked(true);
  }, [room?.video_id]);

  useEffect(() => {
    if (!room) return;
    setLiveMs(room.position_ms);
    if (room.playback_state !== 'playing') return;
    const started = Date.now();
    const base = room.position_ms;
    const timer = window.setInterval(() => {
      setLiveMs(base + (Date.now() - started));
    }, 400);
    return () => window.clearInterval(timer);
  }, [room?.position_ms, room?.playback_state, room?.control_seq]);

  const avatarByUserId = useMemo(() => {
    const map = new Map<string, string>();
    currentFamily?.members?.forEach((member) => {
      if (member.user_id && member.user?.avatar_url) map.set(member.user_id, member.user.avatar_url);
    });
    room?.participants.forEach((person) => {
      if (person.avatar_url) map.set(person.user_id, person.avatar_url);
    });
    if (user?.id && user.avatar_url) map.set(user.id, user.avatar_url);
    return map;
  }, [currentFamily?.members, room?.participants, user?.id, user?.avatar_url]);

  const flushControl = useCallback(async () => {
    if (controlInFlightRef.current || !roomId) return;
    const job = queuedControlRef.current;
    if (!job) return;
    queuedControlRef.current = null;
    if (job.gen !== controlGenRef.current) return;
    controlInFlightRef.current = true;
    try {
      if (!joinedRef.current) {
        const ok = await ensureJoined();
        if (!ok) return;
      }
      if (queuedControlRef.current || job.gen !== controlGenRef.current) return;
      const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/control`, {
        action: job.action,
        position_ms: job.positionMs,
        duration_ms: job.durationMs,
        ...(job.action === 'seek' ? { base_control_seq: roomRef.current?.control_seq } : {}),
      });
      if (queuedControlRef.current || job.gen !== controlGenRef.current) return;
      applyState(res.data);
      channelRef.current?.sendSync(res.data);
      setError(null);
    } catch (err: unknown) {
      if (queuedControlRef.current || job.gen !== controlGenRef.current) return;
      const status = (err as { response?: { status?: number; data?: { detail?: string } } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 409) {
        void fetchRoom();
        return;
      }
      if (detail) setError(detail);
      void fetchRoom();
    } finally {
      controlInFlightRef.current = false;
      if (queuedControlRef.current) void flushControl();
    }
  }, [roomId, applyState, ensureJoined, fetchRoom]);

  const postControl = async (action: 'play' | 'pause' | 'seek' | 'ended', positionMs: number, durationMs?: number) => {
    if (!roomId || roomRef.current?.status === 'ended') return;
    const gen = ++controlGenRef.current;
    const rounded = Math.max(0, Math.round(positionMs));
    localControlUntilRef.current = Date.now() + 2800;
    setRoom((prev) => {
      if (!prev) return prev;
      const playback_state =
        action === 'play' ? 'playing' : action === 'pause' || action === 'ended' ? 'paused' : prev.playback_state;
      return { ...prev, playback_state, position_ms: rounded };
    });
    queuedControlRef.current = { action, positionMs: rounded, durationMs, gen };
    void flushControl();
  };

  const handleTransferHost = async (userId: string) => {
    if (!roomId || !room?.is_host) return;
    try {
      const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/host`, { user_id: userId });
      applyState(res.data);
      channelRef.current?.sendPresence(roomId);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Ev sahibi aktarılamadı.');
    }
  };

  const handleSeekFromChat = (positionMs: number) => {
    if (!room?.can_control) return;
    void postControl('seek', positionMs);
  };

  const handleSetVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomId) return;
    if (!extractYoutubeVideoId(videoInput)) {
      setError('Geçerli bir YouTube bağlantısı girin.');
      return;
    }
    setSavingVideo(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/video`, {
        video_url: videoInput.trim(),
      });
      applyState(res.data);
      setUnlocked(true);
      channelRef.current?.sendSync(res.data);
      channelRef.current?.sendPresence(roomId);
      setVideoInput('');
      setNotice(res.data.video_title || 'Video yüklendi. Oynatmak için videoya dokunun.');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Video eklenemedi.');
    } finally {
      setSavingVideo(false);
    }
  };

  const handleSendChat = async (body: string) => {
    if (!roomId || !user?.id) return;
    const clientMessageId = globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}`;
    const optimistic: WatchChatMessage = {
      id: `temp-${clientMessageId}`,
      room_id: roomId,
      user_id: user.id,
      name: user.full_name || user.email?.split('@')[0] || 'Siz',
      body,
      video_position_ms: room?.position_ms ?? null,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSendingChat(true);
    try {
      if (!joinedRef.current) {
        const ok = await ensureJoined();
        if (!ok) throw new Error('join');
      }
      const res = await api.post<WatchChatMessage>(`/watch-party/rooms/${roomId}/messages`, {
        body,
        video_position_ms: room?.position_ms ?? null,
        client_message_id: clientMessageId,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? res.data : m)).filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      );
      channelRef.current?.sendChat(res.data);
      setError(null);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError('Mesaj gönderilemedi.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleReaction = (emoji: string) => {
    if (!roomId || !user?.id) return;
    const reaction: WatchReactionEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      room_id: roomId,
      user_id: user.id,
      name: user.full_name || user.email?.split('@')[0] || 'Siz',
      emoji,
      x: 0.15 + Math.random() * 0.7,
      at: Date.now(),
    };
    setReactionBursts((prev) => [
      ...prev,
      { id: reaction.id, emoji: reaction.emoji, name: reaction.name, x: reaction.x },
    ]);
    bumpReaction(emoji);
    channelRef.current?.sendReaction(reaction);
  };

  const handleLeave = async () => {
    if (roomId) {
      try {
        await api.post(`/watch-party/rooms/${roomId}/leave`);
      } catch {
        await leaveKeepalive(roomId);
      }
    }
    navigate('/watch-party');
  };

  const handleEnd = async () => {
    if (!roomId) return;
    if (!window.confirm('Odayı kapatmak istiyor musunuz? Herkes çıkacak.')) return;
    const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/end`);
    channelRef.current?.sendSync(res.data);
    navigate('/watch-party');
  };

  if (error && !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0c0b18] text-white px-6">
        <p className="text-sm font-bold text-rose-300">{error}</p>
        <button type="button" onClick={() => navigate('/watch-party')} className="text-sm font-bold text-violet-300">
          Odalar listesine dön
        </button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0c0b18]">
        <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
      </div>
    );
  }

  if (room.status === 'ended') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0c0b18] text-white px-6 text-center">
        <p className="text-sm font-bold">Bu seyir odası kapatıldı.</p>
        <button type="button" onClick={() => navigate('/watch-party')} className="text-sm font-bold text-violet-300">
          Odalar listesine dön
        </button>
      </div>
    );
  }

  const watching = room.participants.filter((p) => p.is_online);
  const faces = watching.length ? watching : room.participants;
  const synced = room.playback_state === 'playing';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0c0b18] text-white">
      <header className="flex items-center gap-2 px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={() => void handleLeave()}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-violet-400">Seyir Partisi</div>
          <h1 className="text-sm font-black truncate">{room.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void handleLeave()}
          className="px-3 py-2 rounded-xl bg-white/10 text-[11px] font-bold flex items-center gap-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          Ayrıl
        </button>
      </header>

      {(error || notice) && (
        <p className={`text-[11px] font-bold px-4 pb-1 ${error ? 'text-rose-300' : 'text-emerald-300'}`}>
          {error || notice}
        </p>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_20.5rem] md:gap-3 md:px-3 md:pb-3">
        <div className="flex flex-col min-h-0 md:overflow-y-auto">
          {room.video_id ? (
            <div className="relative shrink-0">
              <YouTubePartyPlayer
                videoId={room.video_id}
                playbackState={room.playback_state}
                positionMs={room.position_ms}
                controlSeq={room.control_seq}
                canControl={room.can_control}
                unlocked={unlocked}
                onLocalControl={(action, positionMs, durationMs) => {
                  void postControl(action, positionMs, durationMs);
                }}
                onMeta={({ durationMs, title }) => {
                  setRoom((prev) =>
                    prev
                      ? {
                          ...prev,
                          duration_ms: durationMs,
                          video_title: prev.video_title || title || prev.video_title,
                        }
                      : prev
                  );
                }}
                onPlayerError={(message) => setError(message)}
              />
              <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
                <div className="absolute top-2 left-2 right-14 flex items-start gap-2">
                  <div className="flex -space-x-2">
                    {faces.slice(0, 5).map((person) => (
                      <WatchPartyAvatar
                        key={person.user_id}
                        name={person.name}
                        avatarUrl={avatarByUserId.get(person.user_id) || person.avatar_url}
                        size="xs"
                        online={person.is_online}
                      />
                    ))}
                  </div>
                  <div className="mt-0.5 px-2 py-1 rounded-full bg-black/55 backdrop-blur-sm text-[10px] font-bold">
                    {faces.length} kişi izliyor
                  </div>
                </div>
                {reactionBursts.map((burst) => (
                  <span
                    key={burst.id}
                    className="absolute bottom-[22%] text-2xl md:text-3xl animate-watch-float drop-shadow-lg"
                    style={{ left: `${burst.x * 100}%` }}
                    title={burst.name}
                  >
                    {burst.emoji}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="aspect-video min-h-[200px] bg-[#16132a] flex items-center justify-center text-sm font-bold text-violet-200">
              Video bekleniyor
            </div>
          )}

          <div className="px-3 pt-2.5 space-y-2.5 shrink-0">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-violet-300/80 mb-1.5">Odadakiler</div>
              <div className="flex gap-2.5 overflow-x-auto pb-0.5">
                {faces.map((person) => (
                  <button
                    key={person.user_id}
                    type="button"
                    disabled={!room.is_host || person.user_id === user?.id}
                    onClick={() => {
                      if (!room.is_host || person.user_id === user?.id) return;
                      if (window.confirm(`${person.name} ev sahibi yapılsın mı?`)) {
                        void handleTransferHost(person.user_id);
                      }
                    }}
                    className="flex flex-col items-center gap-1 min-w-[3.1rem] max-w-[3.8rem] disabled:cursor-default"
                  >
                    <WatchPartyAvatar
                      name={person.name}
                      avatarUrl={avatarByUserId.get(person.user_id) || person.avatar_url}
                      size="sm"
                      online={person.is_online}
                      host={person.is_host}
                    />
                    <span className="text-[10px] font-bold text-violet-100 truncate w-full text-center leading-tight">
                      {person.name}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => navigate('/family')}
                  className="flex flex-col items-center gap-1 min-w-[3.1rem]"
                >
                  <div className="w-10 h-10 rounded-full border border-dashed border-violet-400/50 bg-white/5 flex items-center justify-center text-violet-300">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-violet-300">Davet</span>
                </button>
              </div>
            </div>

            {room.video_id ? <WatchPartyReactions onPick={handleReaction} counts={reactionCounts} /> : null}

            <div className="flex items-center gap-2 text-[11px] font-bold text-violet-200">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${synced ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-violet-200'}`}>
                <Radio className={`w-3 h-3 ${synced ? 'animate-watch-live' : ''}`} />
                {synced ? 'Senkronize' : 'Duraklatıldı'}
              </span>
              <span className="tabular-nums text-violet-100">
                {formatWatchTime(liveMs)}
                {room.duration_ms ? ` / ${formatWatchTime(room.duration_ms)}` : ''}
              </span>
            </div>

            {room.can_control && (
              <form onSubmit={handleSetVideo} className="flex gap-2">
                <input
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  placeholder="YouTube bağlantısı yapıştırın"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-xs text-white placeholder:text-violet-300/40 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  type="submit"
                  disabled={savingVideo}
                  className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {savingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yükle'}
                </button>
              </form>
            )}
            {room.is_host && (
              <button type="button" onClick={() => void handleEnd()} className="text-[11px] font-bold text-rose-400">
                Odayı kapat
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-[12rem] mt-2 md:mt-0 mx-3 md:mx-0 mb-2 md:mb-0 rounded-3xl bg-white/5 border border-white/10 p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-violet-300">Sohbet</div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
              <Activity className="w-3 h-3" />
              Canlı
            </div>
          </div>
          <WatchPartyChat
            messages={messages}
            currentUserId={user?.id}
            sending={sendingChat}
            canSeek={room.can_control && !!room.video_id}
            avatarByUserId={avatarByUserId}
            onSend={(body) => void handleSendChat(body)}
            onSeekToTimestamp={handleSeekFromChat}
          />
        </div>
      </div>
    </div>
  );
};

export default WatchPartyRoomPage;
