import { FirebaseVoiceSignaling, VoiceSignal } from './voiceSignaling';

interface PeerSlot {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  iceQueue: RTCIceCandidateInit[];
  restartTimer: number | null;
}

export class VoiceMesh {
  private peers = new Map<string, PeerSlot>();
  private remoteAudio = new Map<string, HTMLAudioElement>();
  private localStream: MediaStream | null = null;
  private selfId = '';
  private iceServers: RTCIceServer[] = [];
  private signaling: FirebaseVoiceSignaling | null = null;

  attach(localStream: MediaStream, selfId: string, iceServers: RTCIceServer[], signaling: FirebaseVoiceSignaling) {
    this.localStream = localStream;
    this.selfId = selfId;
    this.iceServers = iceServers.length ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
    this.signaling = signaling;
  }

  ensurePeer(peerId: string): PeerSlot | null {
    if (!this.selfId || peerId === this.selfId) return null;
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 8,
    });
    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.selfId < peerId,
      iceQueue: [],
      restartTimer: null,
    };

    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream as MediaStream));

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.signaling) return;
      void this.signaling.send(peerId, { type: 'ice', candidate: event.candidate.toJSON() });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.attachRemote(peerId, stream);
    };

    pc.onnegotiationneeded = () => {
      void this.makeOffer(peerId);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        if (slot.restartTimer) return;
        slot.restartTimer = window.setTimeout(() => {
          slot.restartTimer = null;
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            void pc.restartIce();
          }
        }, state === 'failed' ? 400 : 2500);
      }
      if (state === 'connected' || state === 'completed') {
        if (slot.restartTimer) {
          window.clearTimeout(slot.restartTimer);
          slot.restartTimer = null;
        }
      }
    };

    this.peers.set(peerId, slot);
    return slot;
  }

  private async makeOffer(peerId: string) {
    const slot = this.peers.get(peerId);
    if (!slot || !this.signaling) return;
    try {
      slot.makingOffer = true;
      const offer = await slot.pc.createOffer({ offerToReceiveAudio: true, iceRestart: false });
      if (slot.pc.signalingState !== 'stable') return;
      await slot.pc.setLocalDescription(offer);
      await this.signaling.send(peerId, { type: 'offer', sdp: slot.pc.localDescription?.sdp || offer.sdp || '' });
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
        await Promise.all([
          slot.pc.setLocalDescription({ type: 'rollback' }),
          slot.pc.setRemoteDescription(description),
        ]);
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
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      this.remoteAudio.set(peerId, audio);
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }
    const play = () => audio?.play().catch(() => {});
    play();
    document.addEventListener('click', play, { once: true });
  }

  hangupPeer(peerId: string) {
    const slot = this.peers.get(peerId);
    if (slot) {
      if (slot.restartTimer) window.clearTimeout(slot.restartTimer);
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
  }

  hangupAll() {
    [...this.peers.keys()].forEach((id) => this.hangupPeer(id));
    this.localStream = null;
    this.signaling = null;
    this.selfId = '';
  }
}

export const voiceMesh = new VoiceMesh();
