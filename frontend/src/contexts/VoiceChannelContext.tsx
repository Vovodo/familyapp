import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { supabase } from '../services/supabase';
import { voiceChannelApi } from '../services/voiceChannelApi';
import { voiceChannelNative } from '../services/voiceChannelNative';
import { permissionService } from '../services/permissionService';
import { playLobbyJoinSound, playLobbyLeaveSound } from '../services/soundService';
import { VoiceChannelState, VoiceParticipant } from '../types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const HEARTBEAT_MS = 10000;
const REFRESH_MS = 12000;

type SignalEvent =
  | { type: 'joined'; participant: VoiceParticipant }
  | { type: 'left'; user_id: string }
  | { type: 'state'; user_id: string; muted?: boolean; speaking?: boolean }
  | { type: 'offer'; from: string; to: string; sdp: string }
  | { type: 'answer'; from: string; to: string; sdp: string }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit };

interface VoiceChannelContextType {
  participants: VoiceParticipant[];
  participantCount: number;
  speakingCount: number;
  isJoined: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  familyName: string;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
}

const VoiceChannelContext = createContext<VoiceChannelContextType | undefined>(undefined);

const mergeParticipants = (
  incoming: VoiceParticipant[],
  prev: VoiceParticipant[]
): VoiceParticipant[] => {
  const speakingById = new Map(prev.map((p) => [p.user_id, p.speaking]));
  return incoming.map((p) => ({
    ...p,
    speaking: speakingById.get(p.user_id) ?? false,
  }));
};

export const VoiceChannelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const joinedRef = useRef(false);
  const mutedRef = useRef(false);
  const familyIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const speakingStopRef = useRef<(() => void) | null>(null);
  const makingOfferRef = useRef<Set<string>>(new Set());

  const displayName = activeMember?.nickname || user?.full_name?.split(' ')[0] || 'Ben';

  const applyState = useCallback((data: VoiceChannelState) => {
    setFamilyName(data.family_name);
    setParticipants((prev) => mergeParticipants(data.participants, prev));
    if (joinedRef.current) {
      setIsMuted(data.self_muted);
      mutedRef.current = data.self_muted;
    }
  }, []);

  const sendSignal = useCallback(async (payload: SignalEvent) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({ type: 'broadcast', event: 'voice', payload });
  }, []);

  const notificationCopy = useCallback(
    (list: VoiceParticipant[], muted: boolean) => {
      const others = list.filter((p) => !p.is_self);
      const speaking = list.filter((p) => p.speaking && !p.muted).length;
      const count = list.length;
      const title = `🔊 ${familyName || currentFamily?.name || 'Aile'} — Ses Kanalı`;
      let text =
        count <= 1
          ? muted
            ? 'Mikrofon kapalı'
            : 'Ses kanalındasınız'
          : speaking > 0
            ? `${speaking} kişi konuşuyor`
            : `${count} kişi kanalda`;
      if (others.length === 0) text = muted ? 'Mikrofon kapalı' : 'Ses kanalındasınız';
      return { title, text, muted };
    },
    [familyName, currentFamily?.name]
  );

  const syncNotification = useCallback(
    (list: VoiceParticipant[], muted: boolean) => {
      if (!joinedRef.current) return;
      const copy = notificationCopy(list, muted);
      void voiceChannelNative.update(copy.title, copy.text, copy.muted);
    },
    [notificationCopy]
  );

  const detachRemote = (peerId: string) => {
    const audio = remoteAudioRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudioRef.current.delete(peerId);
    }
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      peersRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
  };

  const attachRemoteTrack = (peerId: string, stream: MediaStream) => {
    let audio = remoteAudioRef.current.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      remoteAudioRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});
  };

  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const local = localStreamRef.current;
      local?.getTracks().forEach((track) => pc.addTrack(track, local));

      pc.onicecandidate = (event) => {
        if (!event.candidate || !userIdRef.current) return;
        void sendSignal({
          type: 'ice',
          from: userIdRef.current,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        attachRemoteTrack(peerId, stream);
      };

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [sendSignal]
  );

  const flushIce = async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(peerId) || [];
    pendingIceRef.current.set(peerId, []);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
  };

  const createOfferTo = useCallback(
    async (peerId: string) => {
      if (!joinedRef.current || !userIdRef.current || peerId === userIdRef.current) return;
      if (makingOfferRef.current.has(peerId)) return;
      makingOfferRef.current.add(peerId);
      try {
        const pc = ensurePeer(peerId);
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await sendSignal({
          type: 'offer',
          from: userIdRef.current,
          to: peerId,
          sdp: offer.sdp || '',
        });
      } catch (err) {
        console.warn('[voice] offer failed', err);
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    },
    [ensurePeer, sendSignal]
  );

  const handleSignal = useCallback(
    async (payload: SignalEvent) => {
      const selfId = userIdRef.current;
      if (!payload || !selfId) return;

      if (payload.type === 'joined') {
        setParticipants((prev) => {
          if (prev.some((p) => p.user_id === payload.participant.user_id)) {
            return prev.map((p) =>
              p.user_id === payload.participant.user_id ? { ...p, ...payload.participant } : p
            );
          }
          playLobbyJoinSound();
          return [...prev, { ...payload.participant, speaking: false }];
        });
        if (joinedRef.current && payload.participant.user_id !== selfId) {
          void createOfferTo(payload.participant.user_id);
        }
        return;
      }

      if (payload.type === 'left') {
        if (payload.user_id === selfId) return;
        setParticipants((prev) => {
          if (!prev.some((p) => p.user_id === payload.user_id)) return prev;
          playLobbyLeaveSound();
          return prev.filter((p) => p.user_id !== payload.user_id);
        });
        detachRemote(payload.user_id);
        return;
      }

      if (payload.type === 'state') {
        setParticipants((prev) =>
          prev.map((p) =>
            p.user_id === payload.user_id
              ? {
                  ...p,
                  muted: payload.muted ?? p.muted,
                  speaking: payload.speaking ?? p.speaking,
                }
              : p
          )
        );
        return;
      }

      if (!joinedRef.current) return;
      if (payload.to !== selfId || payload.from === selfId) return;

      if (payload.type === 'offer') {
        const pc = ensurePeer(payload.from);
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        await flushIce(payload.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal({
          type: 'answer',
          from: selfId,
          to: payload.from,
          sdp: answer.sdp || '',
        });
        return;
      }

      if (payload.type === 'answer') {
        const pc = peersRef.current.get(payload.from);
        if (!pc) return;
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          await flushIce(payload.from, pc);
        }
        return;
      }

      if (payload.type === 'ice') {
        const pc = peersRef.current.get(payload.from);
        if (!pc || !pc.remoteDescription) {
          const queue = pendingIceRef.current.get(payload.from) || [];
          queue.push(payload.candidate);
          pendingIceRef.current.set(payload.from, queue);
          return;
        }
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          // ignore
        }
      }
    },
    [createOfferTo, ensurePeer, sendSignal]
  );

  const stopLocalMedia = () => {
    speakingStopRef.current?.();
    speakingStopRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    [...peersRef.current.keys()].forEach(detachRemote);
  };

  const leaveInternal = useCallback(
    async (playSound: boolean) => {
      if (!joinedRef.current && !localStreamRef.current) {
        setIsJoined(false);
        return;
      }
      const selfId = userIdRef.current;
      joinedRef.current = false;
      setIsJoined(false);
      setIsMuted(false);
      mutedRef.current = false;
      stopLocalMedia();
      await voiceChannelNative.stop();
      if (playSound) playLobbyLeaveSound();
      if (selfId) {
        void sendSignal({ type: 'left', user_id: selfId });
      }
      try {
        await voiceChannelApi.leave();
      } catch {
        // ignore
      }
      setParticipants((prev) => prev.filter((p) => p.user_id !== selfId));
    },
    [sendSignal]
  );

  const join = useCallback(async () => {
    if (!user || !currentFamily || joinedRef.current || isConnecting) return;
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      permissionService.markMicrophoneGranted();

      const res = await voiceChannelApi.join();
      applyState(res.data);
      joinedRef.current = true;
      setIsJoined(true);
      setIsMuted(false);
      mutedRef.current = false;
      playLobbyJoinSound();

      const self: VoiceParticipant = {
        user_id: user.id,
        name: displayName,
        avatar_url: user.avatar_url || null,
        muted: false,
        speaking: false,
        is_self: true,
      };
      await sendSignal({ type: 'joined', participant: { ...self, is_self: false } });

      for (const peer of res.data.participants) {
        if (peer.user_id !== user.id) {
          void createOfferTo(peer.user_id);
        }
      }

      const copy = notificationCopy(res.data.participants, false);
      await voiceChannelNative.start(copy.title, copy.text, false);

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let speaking = false;
      const timer = window.setInterval(() => {
        if (!joinedRef.current || mutedRef.current) {
          if (speaking) {
            speaking = false;
            void sendSignal({ type: 'state', user_id: user.id, speaking: false });
            setParticipants((prev) =>
              prev.map((p) => (p.user_id === user.id ? { ...p, speaking: false } : p))
            );
          }
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const next = Math.sqrt(sum / data.length) > 0.075;
        if (next !== speaking) {
          speaking = next;
          void sendSignal({ type: 'state', user_id: user.id, speaking: next });
          setParticipants((prev) =>
            prev.map((p) => (p.user_id === user.id ? { ...p, speaking: next } : p))
          );
        }
      }, 180);
      speakingStopRef.current = () => {
        window.clearInterval(timer);
        audioCtx.close().catch(() => {});
      };
    } catch (err: any) {
      stopLocalMedia();
      joinedRef.current = false;
      setIsJoined(false);
      const denied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /denied|permission/i.test(String(err?.message || ''));
      if (denied) permissionService.markMicrophoneDenied();
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [
    applyState,
    createOfferTo,
    currentFamily,
    displayName,
    isConnecting,
    notificationCopy,
    sendSignal,
    user,
  ]);

  const leave = useCallback(async () => {
    await leaveInternal(true);
  }, [leaveInternal]);

  const toggleMute = useCallback(async () => {
    if (!joinedRef.current || !user) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setParticipants((prev) =>
      prev.map((p) => (p.user_id === user.id ? { ...p, muted: next, speaking: next ? false : p.speaking } : p))
    );
    void sendSignal({ type: 'state', user_id: user.id, muted: next, speaking: next ? false : undefined });
    try {
      await voiceChannelApi.mute(next);
    } catch {
      // keep local mute
    }
  }, [sendSignal, user]);

  useEffect(() => {
    familyIdRef.current = currentFamily?.id || null;
    userIdRef.current = user?.id || null;
  }, [currentFamily?.id, user?.id]);

  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;
  const leaveRef = useRef(leaveInternal);
  leaveRef.current = leaveInternal;

  useEffect(() => {
    if (!currentFamily?.id || !user?.id || !supabase) {
      return;
    }

    const familyId = currentFamily.id;
    let cancelled = false;
    const channel = supabase.channel(`family-voice-${familyId}`, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;
    channel.on('broadcast', { event: 'voice' }, ({ payload }) => {
      void handleSignalRef.current(payload as SignalEvent);
    });
    channel.subscribe();

    voiceChannelApi
      .get()
      .then((res) => {
        if (!cancelled) applyState(res.data);
      })
      .catch(() => {});

    const refresh = window.setInterval(() => {
      voiceChannelApi
        .get()
        .then((res) => {
          if (!cancelled) applyState(res.data);
        })
        .catch(() => {});
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [applyState, currentFamily?.id, user?.id]);

  useEffect(() => {
    if (!isJoined) return;
    const beat = window.setInterval(() => {
      voiceChannelApi.heartbeat().then((res) => applyState(res.data)).catch(() => {
        void leaveInternal(false);
      });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(beat);
  }, [applyState, isJoined, leaveInternal]);

  useEffect(() => {
    if (!isJoined) return;
    syncNotification(participants, isMuted);
  }, [isJoined, isMuted, participants, syncNotification]);

  useEffect(() => {
    let handles: Array<{ remove: () => Promise<void> }> = [];
    const bind = async () => {
      const muteH = await voiceChannelNative.addListener('muteToggle', () => {
        void toggleMute();
      });
      const leaveH = await voiceChannelNative.addListener('leave', () => {
        void leaveInternal(true);
      });
      const returnH = await voiceChannelNative.addListener('returnToApp', () => {
        navigate('/chat');
      });
      handles = [muteH, leaveH, returnH].filter(Boolean) as Array<{ remove: () => Promise<void> }>;
    };
    void bind();
    return () => {
      handles.forEach((h) => h.remove().catch(() => {}));
    };
  }, [leaveInternal, navigate, toggleMute]);

  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        void leaveRef.current(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentFamily?.id) return;
    return () => {
      if (joinedRef.current) {
        void leaveRef.current(false);
      }
    };
  }, [currentFamily?.id]);

  const speakingCount = useMemo(
    () => participants.filter((p) => p.speaking && !p.muted).length,
    [participants]
  );

  const value = useMemo<VoiceChannelContextType>(
    () => ({
      participants,
      participantCount: participants.length,
      speakingCount,
      isJoined,
      isMuted,
      isConnecting,
      familyName: familyName || currentFamily?.name || 'Aile',
      join,
      leave,
      toggleMute,
    }),
    [
      currentFamily?.name,
      familyName,
      isConnecting,
      isJoined,
      isMuted,
      join,
      leave,
      participants,
      speakingCount,
      toggleMute,
    ]
  );

  return <VoiceChannelContext.Provider value={value}>{children}</VoiceChannelContext.Provider>;
};

export const useVoiceChannel = (): VoiceChannelContextType => {
  const ctx = useContext(VoiceChannelContext);
  if (!ctx) {
    throw new Error('useVoiceChannel must be used within a VoiceChannelProvider');
  }
  return ctx;
};
