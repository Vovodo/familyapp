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
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { voiceChannelApi } from '../services/voiceChannelApi';
import { voiceChannelNative } from '../services/voiceChannelNative';
import { firebaseVoiceSignaling } from '../services/voiceSignaling';
import { unlockAudioPlayback, voiceMesh, VoiceLinkState } from '../services/voiceMesh';
import { permissionService } from '../services/permissionService';
import { playLobbyJoinSound, playLobbyLeaveSound } from '../services/soundService';
import { VoiceChannelState, VoiceParticipant } from '../types';

const HEARTBEAT_MS = 10000;
const REFRESH_MS = 12000;

interface VoiceChannelContextType {
  participants: VoiceParticipant[];
  participantCount: number;
  speakingCount: number;
  isJoined: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  linkState: VoiceLinkState;
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
  const [linkState, setLinkState] = useState<VoiceLinkState>('idle');

  const joinedRef = useRef(false);
  const mutedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const speakingStopRef = useRef<(() => void) | null>(null);
  const presenceLiveRef = useRef(false);

  const displayName = activeMember?.nickname || user?.full_name?.split(' ')[0] || 'Ben';

  const applyState = useCallback((data: VoiceChannelState) => {
    setFamilyName(data.family_name);
    if (!presenceLiveRef.current) {
      setParticipants((prev) => mergeParticipants(data.participants, prev));
    }
    if (joinedRef.current) {
      setIsMuted(data.self_muted);
      mutedRef.current = data.self_muted;
    }
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

  const stopLocalMedia = () => {
    speakingStopRef.current?.();
    speakingStopRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    voiceMesh.hangupAll();
  };

  const leaveInternal = useCallback(async (playSound: boolean) => {
    if (!joinedRef.current && !localStreamRef.current) {
      setIsJoined(false);
      return;
    }
    const selfId = userIdRef.current;
    joinedRef.current = false;
    setIsJoined(false);
    setIsMuted(false);
    setLinkState('idle');
    mutedRef.current = false;
    setParticipants((prev) => prev.filter((p) => p.user_id !== selfId));
    stopLocalMedia();
    await firebaseVoiceSignaling.leaveChannel();
    await voiceChannelNative.stop();
    if (playSound) playLobbyLeaveSound();
    try {
      await voiceChannelApi.leave();
    } catch {
      // ignore
    }
    setParticipants((prev) => prev.filter((p) => p.user_id !== selfId));
  }, []);

  const join = useCallback(async () => {
    if (!user || !currentFamily || joinedRef.current || isConnecting) return;
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      localStreamRef.current = stream;
      permissionService.markMicrophoneGranted();
      const playbackEl = await unlockAudioPlayback();

      const res = await voiceChannelApi.join();
      applyState(res.data);
      if (!res.data.firebase_token || !res.data.firebase_config) {
        throw new Error('Ses kanalı Firebase oturumu açılamadı.');
      }

      joinedRef.current = true;
      setIsJoined(true);
      setIsMuted(false);
      mutedRef.current = false;
      setLinkState('connecting');
      playLobbyJoinSound();

      voiceMesh.attach(
        stream,
        user.id,
        res.data.ice_servers || [],
        firebaseVoiceSignaling,
        playbackEl,
        (state) => {
          if (joinedRef.current) setLinkState(state);
        },
      );

      await firebaseVoiceSignaling.connect(
        currentFamily.id,
        user.id,
        res.data.firebase_token,
        res.data.firebase_config,
        {
          name: displayName,
          muted: false,
          speaking: false,
          joinedAt: Date.now(),
        },
        {
          onSignal: (msg) => {
            if (!joinedRef.current) return;
            void voiceMesh.handleSignal(msg);
          },
          onRoster: (peers) => {
            presenceLiveRef.current = true;
            setParticipants(
              peers.map((peer) => {
                const member = currentFamily.members?.find((m) => m.user_id === peer.userId);
                const self = peer.userId === user.id;
                return {
                  user_id: peer.userId,
                  name:
                    peer.presence.name ||
                    member?.nickname ||
                    member?.user?.full_name?.split(' ')[0] ||
                    'Aile Üyesi',
                  avatar_url: (self ? user.avatar_url : member?.user?.avatar_url) || null,
                  muted: peer.presence.muted,
                  speaking: peer.presence.speaking,
                  is_self: self,
                };
              })
            );
          },
          onPeerJoined: (peerId) => {
            if (peerId === user.id) return;
            playLobbyJoinSound();
            if (!joinedRef.current) return;
            voiceMesh.ensurePeer(peerId);
            voiceMesh.kickNegotiate(peerId);
          },
          onPeerLeft: (peerId) => {
            if (peerId === user.id) return;
            playLobbyLeaveSound();
            voiceMesh.hangupPeer(peerId);
          },
          onPeerState: (peerId, presence) => {
            setParticipants((prev) =>
              prev.map((p) =>
                p.user_id === peerId
                  ? {
                      ...p,
                      muted: presence.muted ?? p.muted,
                      speaking: presence.speaking ?? p.speaking,
                      name: presence.name || p.name,
                    }
                  : p
              )
            );
          },
        }
      );

      for (const peer of res.data.participants) {
        if (peer.user_id !== user.id) voiceMesh.kickNegotiate(peer.user_id);
      }

      const copy = notificationCopy(res.data.participants, false);
      await voiceChannelNative.start(copy.title, copy.text, false);

      const probe = stream.clone();
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(probe);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let speaking = false;
      const timer = window.setInterval(() => {
        if (!joinedRef.current || mutedRef.current) {
          if (speaking) {
            speaking = false;
            void firebaseVoiceSignaling.updatePresence({ speaking: false });
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
          void firebaseVoiceSignaling.updatePresence({ speaking: next });
          setParticipants((prev) =>
            prev.map((p) => (p.user_id === user.id ? { ...p, speaking: next } : p))
          );
        }
      }, 180);
      speakingStopRef.current = () => {
        window.clearInterval(timer);
        probe.getTracks().forEach((track) => track.stop());
        audioCtx.close().catch(() => {});
      };
    } catch (err: any) {
      stopLocalMedia();
      await firebaseVoiceSignaling.leaveChannel();
      joinedRef.current = false;
      setIsJoined(false);
      setLinkState('idle');
      const denied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /denied|permission/i.test(String(err?.message || ''));
      if (denied) permissionService.markMicrophoneDenied();
      try {
        await voiceChannelApi.leave();
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [applyState, currentFamily, displayName, isConnecting, notificationCopy, user]);

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
    void firebaseVoiceSignaling.updatePresence({ muted: next, speaking: next ? false : undefined });
    try {
      await voiceChannelApi.mute(next);
    } catch {
      // keep local mute
    }
  }, [user]);

  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user?.id]);

  const leaveRef = useRef(leaveInternal);
  leaveRef.current = leaveInternal;

  useEffect(() => {
    if (!currentFamily?.id || !user?.id) return;

    let cancelled = false;
    presenceLiveRef.current = false;

    const mapPeer = (userId: string, presence: { name: string; muted: boolean; speaking: boolean }) => {
      const member = currentFamily.members?.find((m) => m.user_id === userId);
      const self = userId === user.id;
      return {
        user_id: userId,
        name: presence.name || member?.nickname || member?.user?.full_name?.split(' ')[0] || 'Aile Üyesi',
        avatar_url: (self ? user.avatar_url : member?.user?.avatar_url) || null,
        muted: presence.muted,
        speaking: presence.speaking,
        is_self: self,
      };
    };

    const handlers = {
      onSignal: (msg: Parameters<typeof voiceMesh.handleSignal>[0]) => {
        if (!joinedRef.current) return;
        void voiceMesh.handleSignal(msg);
      },
      onRoster: (peers: Array<{ userId: string; presence: { name: string; muted: boolean; speaking: boolean } }>) => {
        if (cancelled) return;
        presenceLiveRef.current = true;
        setParticipants(peers.map((peer) => mapPeer(peer.userId, peer.presence)));
      },
      onPeerJoined: (peerId: string) => {
        if (cancelled || peerId === user.id) return;
        playLobbyJoinSound();
        if (!joinedRef.current) return;
        voiceMesh.ensurePeer(peerId);
        voiceMesh.kickNegotiate(peerId);
      },
      onPeerLeft: (peerId: string) => {
        if (cancelled || peerId === user.id) return;
        playLobbyLeaveSound();
        voiceMesh.hangupPeer(peerId);
      },
      onPeerState: (
        peerId: string,
        presence: { name?: string; muted?: boolean; speaking?: boolean }
      ) => {
        if (cancelled) return;
        setParticipants((prev) =>
          prev.map((p) =>
            p.user_id === peerId
              ? {
                  ...p,
                  muted: presence.muted ?? p.muted,
                  speaking: presence.speaking ?? p.speaking,
                  name: presence.name || p.name,
                }
              : p
          )
        );
      },
    };

    voiceChannelApi
      .get()
      .then(async (res) => {
        if (cancelled) return;
        applyState(res.data);
        if (!res.data.firebase_token || !res.data.firebase_config) return;
        await firebaseVoiceSignaling.listen(
          currentFamily.id,
          user.id,
          res.data.firebase_token,
          res.data.firebase_config,
          handlers
        );
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
      presenceLiveRef.current = false;
      window.clearInterval(refresh);
      void firebaseVoiceSignaling.disconnect();
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
      linkState,
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
      linkState,
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
