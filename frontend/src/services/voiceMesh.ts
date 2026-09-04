import { FirebaseVoiceSignaling, VoiceSignal } from './voiceSignaling';

export type VoiceLinkState = 'idle' | 'connecting' | 'connected' | 'failed';

interface PeerSlot {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  iceQueue: RTCIceCandidateInit[];
  restartTimer: number | null;
  watchdog: number | null;
}

const serializeCandidate = (candidate: RTCIceCandidate): RTCIceCandidateInit => {
  const json = typeof candidate.toJSON === 'function' ? candidate.toJSON() : {};
  const payload: RTCIceCandidateInit = {
    candidate: json.candidate || candidate.candidate || '',
    sdpMid: json.sdpMid ?? candidate.sdpMid ?? undefined,
    sdpMLineIndex: json.sdpMLineIndex ?? candidate.sdpMLineIndex ?? undefined,
    usernameFragment: json.usernameFragment ?? candidate.usernameFragment ?? undefined,
  };
  return JSON.parse(JSON.stringify(payload)) as RTCIceCandidateInit;
};

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export async function unlockAudioPlayback(): Promise<HTMLAudioElement> {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  audio.preload = 'auto';
  audio.volume = 1;
  audio.src = SILENT_WAV;
  audio.style.position = 'fixed';
  audio.style.width = '0';
  audio.style.height = '0';
  audio.style.opacity = '0';
  audio.style.pointerEvents = 'none';
  document.body.appendChild(audio);
  try {
    await audio.play();
  } catch {
    /* gesture may still unlock later */
  }
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.close();
  } catch {
    /* ignore */
  }
  return audio;
}

export class VoiceMesh {
  private peers = new Map<string, PeerSlot>();
  private remoteAudio = new Map<string, HTMLAudioElement>();
  private localStream: MediaStream | null = null;
  private selfId = '';
  private iceServers: RTCIceServer[] = [];
  private signaling: FirebaseVoiceSignaling | null = null;
  private unlockedAudio: HTMLAudioElement | null = null;
  private onLinkState: ((state: VoiceLinkState) => void) | null = null;

  attach(
    localStream: MediaStream,
    selfId: string,
    iceServers: RTCIceServer[],
    signaling: FirebaseVoiceSignaling,
    unlockedAudio?: HTMLAudioElement | null,
    onLinkState?: (state: VoiceLinkState) => void,
  ) {
    this.localStream = localStream;
    this.selfId = selfId;
    this.iceServers = iceServers.length ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
    this.signaling = signaling;
    this.unlockedAudio = unlockedAudio || null;
    this.onLinkState = onLinkState || null;
  }

  ensurePeer(peerId: string): PeerSlot | null {
    if (!this.selfId || peerId === this.selfId) return null;
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 4,
    });
    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.selfId < peerId,
      iceQueue: [],
      restartTimer: null,
      watchdog: null,
    };

    this.localStream?.getAudioTracks().forEach((track) => {
      pc.addTrack(track, this.localStream as MediaStream);
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.signaling) return;
      void this.signaling.send(peerId, { type: 'ice', candidate: serializeCandidate(event.candidate) });
    };

    pc.ontrack = (event) => {
      const stream =
        event.streams && event.streams[0]
          ? event.streams[0]
          : new MediaStream(event.track ? [event.track] : []);
      this.attachRemote(peerId, stream);
    };

    pc.onnegotiationneeded = () => {
      void this.makeOffer(peerId);
    };

    pc.oniceconnectionstatechange = () => {
      this.emitLinkState();
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        if (slot.restartTimer) return;
        slot.restartTimer = window.setTimeout(() => {
          slot.restartTimer = null;
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            try {
              pc.restartIce();
            } catch {
              void this.makeOffer(peerId, true);
            }
          }
        }, state === 'failed' ? 400 : 2500);
      }
      if (state === 'connected' || state === 'completed') {
        if (slot.restartTimer) {
          window.clearTimeout(slot.restartTimer);
          slot.restartTimer = null;
        }
        if (slot.watchdog) {
          window.clearTimeout(slot.watchdog);
          slot.watchdog = null;
        }
      }
    };

    this.peers.set(peerId, slot);
    this.emitLinkState();
    this.armWatchdog(peerId);
    return slot;
  }

  async resendLocal(peerId: string) {
    const slot = this.peers.get(peerId);
    const desc = slot?.pc.localDescription;
    if (!slot || !desc?.sdp || !this.signaling) return;
    if (desc.type !== 'offer' && desc.type !== 'answer') return;
    await this.signaling.send(peerId, { type: desc.type, sdp: desc.sdp });
  }

  kickNegotiate(peerId: string) {
    const slot = this.ensurePeer(peerId);
    if (!slot) return;
    if (slot.pc.localDescription?.sdp) {
      void this.resendLocal(peerId);
      return;
    }
    if (slot.pc.signalingState === 'stable') {
      void this.makeOffer(peerId);
    }
  }

  private armWatchdog(peerId: string) {
    const slot = this.peers.get(peerId);
    if (!slot || slot.watchdog) return;
    slot.watchdog = window.setTimeout(() => {
      slot.watchdog = null;
      const state = slot.pc.iceConnectionState;
      if (state === 'connected' || state === 'completed' || state === 'closed') return;
      if (slot.pc.localDescription?.sdp) {
        void this.resendLocal(peerId);
      } else if (slot.pc.signalingState === 'stable') {
        void this.makeOffer(peerId);
      }
    }, 1800);
  }

  private emitLinkState() {
    if (!this.onLinkState) return;
    if (this.peers.size === 0) {
      this.onLinkState('idle');
      return;
    }
    const states = [...this.peers.values()].map((slot) => slot.pc.iceConnectionState);
    if (states.some((state) => state === 'connected' || state === 'completed')) {
      this.onLinkState('connected');
      return;
    }
    if (states.every((state) => state === 'failed' || state === 'closed' || state === 'disconnected')) {
      this.onLinkState('failed');
      return;
    }
    this.onLinkState('connecting');
  }

  private async makeOffer(peerId: string, iceRestart = false) {
    const slot = this.peers.get(peerId);
    if (!slot || !this.signaling) return;
    try {
      slot.makingOffer = true;
      if (iceRestart) {
        await slot.pc.setLocalDescription(
          await slot.pc.createOffer({ iceRestart: true, offerToReceiveAudio: true }),
        );
      } else {
        try {
          await slot.pc.setLocalDescription();
        } catch {
          const offer = await slot.pc.createOffer({ offerToReceiveAudio: true });
          await slot.pc.setLocalDescription(offer);
        }
      }
      const desc = slot.pc.localDescription;
      if (!desc?.sdp || (desc.type !== 'offer' && desc.type !== 'answer')) return;
      await this.signaling.send(peerId, { type: desc.type, sdp: desc.sdp });
    } catch (err) {
      console.warn('[voice] offer failed', err);
    } finally {
      slot.makingOffer = false;
    }
  }

  async handleSignal(msg: VoiceSignal) {
    if (msg.type === 'ice') {
      const slot = this.ensurePeer(msg.from);
      if (!slot) return;
      if (!slot.pc.remoteDescription) {
        slot.iceQueue.push(msg.candidate);
        return;
      }
      try {
        await slot.pc.addIceCandidate(msg.candidate);
      } catch {
        /* ignore */
      }
      return;
    }

    const slot = this.ensurePeer(msg.from);
    if (!slot) return;
    const description: RTCSessionDescriptionInit = { type: msg.type, sdp: msg.sdp };

    const offerCollision =
      description.type === 'offer' && (slot.makingOffer || slot.pc.signalingState !== 'stable');
    slot.ignoreOffer = !slot.polite && offerCollision;
    if (slot.ignoreOffer) return;

    try {
      if (offerCollision) {
        try {
          await Promise.all([
            slot.pc.setLocalDescription({ type: 'rollback' }),
            slot.pc.setRemoteDescription(description),
          ]);
        } catch {
          await slot.pc.setRemoteDescription(description);
        }
      } else {
        await slot.pc.setRemoteDescription(description);
      }

      while (slot.iceQueue.length) {
        const candidate = slot.iceQueue.shift();
        if (candidate) {
          try {
            await slot.pc.addIceCandidate(candidate);
          } catch {
            /* ignore */
          }
        }
      }

      if (description.type === 'offer') {
        const answer = await slot.pc.createAnswer();
        await slot.pc.setLocalDescription(answer);
        await this.signaling?.send(msg.from, {
          type: 'answer',
          sdp: slot.pc.localDescription?.sdp || answer.sdp || '',
        });
      }
    } catch (err) {
      console.warn('[voice] signal failed', err);
    }
  }

  private attachRemote(peerId: string, stream: MediaStream) {
    let audio = this.remoteAudio.get(peerId);
    if (!audio) {
      audio = this.unlockedAudio && !this.unlockedAudio.srcObject ? this.unlockedAudio : document.createElement('audio');
      this.unlockedAudio = null;
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audio.volume = 1;
      audio.muted = false;
      audio.controls = false;
      if (!audio.isConnected) {
        audio.style.position = 'fixed';
        audio.style.width = '0';
        audio.style.height = '0';
        audio.style.opacity = '0';
        document.body.appendChild(audio);
      }
      this.remoteAudio.set(peerId, audio);
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    const play = () => {
      audio!.muted = false;
      audio!.volume = 1;
      return audio!.play().catch(() => {});
    };
    void play();
    document.addEventListener('click', play, { once: true });
    document.addEventListener('touchstart', play, { once: true });
  }

  hangupPeer(peerId: string) {
    const slot = this.peers.get(peerId);
    if (slot) {
      if (slot.restartTimer) window.clearTimeout(slot.restartTimer);
      if (slot.watchdog) window.clearTimeout(slot.watchdog);
      slot.pc.onicecandidate = null;
      slot.pc.ontrack = null;
      slot.pc.onnegotiationneeded = null;
      slot.pc.close();
      this.peers.delete(peerId);
    }
    const audio = this.remoteAudio.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.remoteAudio.delete(peerId);
    }
    this.emitLinkState();
  }

  hangupAll() {
    [...this.peers.keys()].forEach((id) => this.hangupPeer(id));
    this.localStream = null;
    this.signaling = null;
    this.selfId = '';
    if (this.unlockedAudio) {
      this.unlockedAudio.srcObject = null;
      this.unlockedAudio.remove();
      this.unlockedAudio = null;
    }
    this.onLinkState = null;
  }
}

export const voiceMesh = new VoiceMesh();
