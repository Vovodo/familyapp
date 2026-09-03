import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clapperboard,
  Crown,
  Loader2,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Users,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { api, API_BASE_URL, storage } from '../../services/api';
import { WatchPartyChannel } from '../../services/watchPartySync';
import { YouTubePartyPlayer } from '../../components/watchparty/YouTubePartyPlayer';
import { WatchPartyChat } from '../../components/watchparty/WatchPartyChat';
import { WatchChatMessage, WatchRoomState } from '../../types';
import { extractYoutubeVideoId, formatWatchTime } from '../../utils/youtubeUrl';

const HEARTBEAT_MS = 8000;
const RESYNC_MS = 18000;

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
  const [mobileTab, setMobileTab] = useState<'chat' | 'people'>('chat');

  const roomRef = useRef<WatchRoomState | null>(null);
  roomRef.current = room;
  const channelRef = useRef<WatchPartyChannel | null>(null);
  const controlLockRef = useRef(false);

  const applyState = useCallback((next: WatchRoomState) => {
    const prev = roomRef.current;
    if (prev && next.control_seq < prev.control_seq && next.room_id === prev.room_id) return;
    setRoom(next);
  }, []);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return null;
    const res = await api.get<WatchRoomState>(`/watch-party/rooms/${roomId}`);
    applyState(res.data);
    return res.data;
  }, [roomId, applyState]);

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    const res = await api.get<WatchChatMessage[]>(`/watch-party/rooms/${roomId}/messages`);
    setMessages(res.data);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !currentFamily?.id || !user) return;
    let cancelled = false;

    const boot = async () => {
      try {
        const joined = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/join`);
        if (cancelled) return;
        applyState(joined.data);
        await fetchMessages();
        channelRef.current?.sendPresence(roomId);
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail || 'Odaya girilemedi.');
      }
    };

    const channel = new WatchPartyChannel(currentFamily.id, user.id, {
      onSync: (payload) => {
        if (payload.room_id !== roomId) return;
        setRoom((prev) => {
          if (!prev) return prev;
          if (payload.control_seq < prev.control_seq) return prev;
          return { ...prev, ...payload } as WatchRoomState;
        });
      },
      onChat: (message) => {
        if (message.room_id !== roomId) return;
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
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
        .then((res) => applyState(res.data))
        .catch(() => {});
    }, HEARTBEAT_MS);

    const resync = window.setInterval(() => {
      void fetchRoom();
    }, RESYNC_MS);

    const onPageHide = () => {
      if (roomId) void leaveKeepalive(roomId);
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.clearInterval(resync);
      window.removeEventListener('pagehide', onPageHide);
      channel.disconnect();
      channelRef.current = null;
      if (roomId) void leaveKeepalive(roomId);
    };
  }, [roomId, currentFamily?.id, user, applyState, fetchMessages, fetchRoom]);

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

  const postControl = async (action: 'play' | 'pause' | 'seek' | 'ended', positionMs: number, durationMs?: number) => {
    if (!roomId || controlLockRef.current) return;
    controlLockRef.current = true;
    try {
      const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/control`, {
        action,
        position_ms: Math.max(0, Math.round(positionMs)),
        duration_ms: durationMs,
      });
      applyState(res.data);
      channelRef.current?.sendSync(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail) setError(detail);
      void fetchRoom();
    } finally {
      controlLockRef.current = false;
    }
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
    try {
      const res = await api.post<WatchRoomState>(`/watch-party/rooms/${roomId}/video`, {
        video_url: videoInput.trim(),
      });
      applyState(res.data);
      channelRef.current?.sendSync(res.data);
      channelRef.current?.sendPresence(roomId);
      setVideoInput('');
      setUnlocked(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Video eklenemedi.');
    } finally {
      setSavingVideo(false);
    }
  };

  const handleSendChat = async (body: string) => {
    if (!roomId) return;
    setSendingChat(true);
    try {
      const res = await api.post<WatchChatMessage>(`/watch-party/rooms/${roomId}/messages`, {
        body,
        video_position_ms: room?.position_ms ?? null,
        client_message_id: globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}`,
      });
      setMessages((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
      channelRef.current?.sendChat(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Mesaj gönderilemedi.');
    } finally {
      setSendingChat(false);
    }
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
      <div className="p-4 max-w-lg mx-auto space-y-3">
        <p className="text-sm font-bold text-rose-700">{error}</p>
        <button type="button" onClick={() => navigate('/watch-party')} className="text-sm font-bold text-violet-700">
          Odalar listesine dön
        </button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 w-full max-w-6xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/watch-party')} className="p-2 rounded-xl hover:bg-violet-50">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-violet-600 flex items-center gap-1">
            <Clapperboard className="w-3.5 h-3.5" />
            Seyir odası
          </div>
          <h1 className="text-base font-black theme-text-primary truncate">{room.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void handleLeave()}
          className="px-3 py-2 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-bold flex items-center gap-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          Ayrıl
        </button>
      </div>

      {error && <p className="text-[11px] font-bold text-rose-600 px-1">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_20rem] gap-3">
        <div className="space-y-3">
          {room.video_id ? (
            <div className="relative">
              {unlocked ? (
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
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setUnlocked(true)}
                  className="w-full aspect-video rounded-2xl bg-violet-950 text-white flex flex-col items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-12 h-12 fill-white" />
                  <span className="text-sm font-black">Seyre katıl</span>
                  <span className="text-[11px] opacity-80">
                    {room.playback_state === 'playing' ? 'Oynatılıyor' : 'Hazır'} · {formatWatchTime(room.position_ms)}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="aspect-video rounded-2xl bg-violet-950/90 text-white flex items-center justify-center text-sm font-bold">
              Video bekleniyor
            </div>
          )}

          <div className="theme-surface rounded-3xl p-3 border theme-border space-y-2">
            <div className="text-xs font-black theme-text-primary truncate">
              {room.video_title || (room.video_id ? `YouTube · ${room.video_id}` : 'Henüz video yok')}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-violet-700">
              {room.playback_state === 'playing' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{formatWatchTime(room.position_ms)}</span>
              {room.duration_ms ? <span>/ {formatWatchTime(room.duration_ms)}</span> : null}
              <span>· Kontrol herkese açık</span>
            </div>
            {room.can_control && (
              <form onSubmit={handleSetVideo} className="flex gap-2">
                <input
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  placeholder="YouTube bağlantısı yapıştırın"
                  className="flex-1 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-xs"
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
              <button type="button" onClick={() => void handleEnd()} className="text-[11px] font-bold text-rose-600">
                Odayı kapat
              </button>
            )}
          </div>
        </div>

        <div className="theme-surface rounded-3xl border theme-border p-3 flex flex-col min-h-[18rem] md:min-h-[28rem] md:h-[calc(100vh-11rem)]">
          <div className="md:hidden flex gap-1 mb-2 bg-violet-50 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-black ${mobileTab === 'chat' ? 'bg-white text-violet-800 shadow-sm' : 'text-violet-500'}`}
            >
              <span className="inline-flex items-center gap-1 justify-center">
                <MessageCircle className="w-3 h-3" /> Yorumlar
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('people')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-black ${mobileTab === 'people' ? 'bg-white text-violet-800 shadow-sm' : 'text-violet-500'}`}
            >
              <span className="inline-flex items-center gap-1 justify-center">
                <Users className="w-3 h-3" /> {room.online_count}
              </span>
            </button>
          </div>

          <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0`}>
            <WatchPartyChat
              messages={messages}
              currentUserId={user?.id}
              sending={sendingChat}
              onSend={(body) => void handleSendChat(body)}
            />
          </div>

          <div className={`${mobileTab === 'people' ? 'block' : 'hidden'} md:block mt-3 pt-3 border-t border-violet-100`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-2">Odada</div>
            <div className="space-y-1.5">
              {room.participants.map((person) => (
                <div key={person.user_id} className="flex items-center gap-2 text-xs font-bold text-violet-950">
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[11px]">
                    {person.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{person.name}</span>
                  {person.is_host && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPartyRoomPage;
