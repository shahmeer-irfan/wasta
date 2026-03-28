// ============================================================
// WAASTA — WebRTC Voice Channel with Supabase Signaling
// Browser-to-browser voice chat (like InDrive in-app call)
// ============================================================

import { supabase } from '@/lib/supabase/client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type VoiceRole = 'civilian' | 'institution';

export interface VoiceChannelCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onRemoteStream: (stream: MediaStream) => void;
  onError: (error: string) => void;
}

export class VoiceChannel {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private channelName: string;
  private role: VoiceRole;
  private callbacks: VoiceChannelCallbacks;
  private subscribed = false;

  constructor(
    incidentId: string,
    role: VoiceRole,
    callbacks: VoiceChannelCallbacks
  ) {
    this.channelName = `voice-${incidentId}`;
    this.role = role;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    try {
      // Get microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Create peer connection
      this.pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local audio tracks
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      // Handle remote stream
      this.pc.ontrack = (event) => {
        if (event.streams[0]) {
          this.callbacks.onRemoteStream(event.streams[0]);
        }
      };

      // Handle ICE candidates — send via Supabase
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal('ice-candidate', {
            candidate: event.candidate.toJSON(),
            from: this.role,
          });
        }
      };

      // Connection state
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        if (state === 'connected') {
          this.callbacks.onConnected();
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.callbacks.onDisconnected();
        }
      };

      // Subscribe to signaling channel
      this.listenForSignals();

      // Civilian creates the offer, institution waits
      if (this.role === 'civilian') {
        await this.createOffer();
      }
    } catch (err) {
      this.callbacks.onError(
        err instanceof Error ? err.message : 'Failed to start voice channel'
      );
    }
  }

  private async createOffer(): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal('offer', {
      sdp: offer,
      from: this.role,
    });
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.sendSignal('answer', {
      sdp: answer,
      from: this.role,
    });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // ICE candidate error — non-fatal
    }
  }

  private listenForSignals(): void {
    if (this.subscribed) return;
    this.subscribed = true;

    const channel = supabase.channel(this.channelName);

    channel
      .on('broadcast', { event: 'signal' }, (payload) => {
        const data = payload.payload;
        if (!data || data.from === this.role) return; // Ignore own signals

        switch (data.type) {
          case 'offer':
            this.handleOffer(data.sdp);
            break;
          case 'answer':
            this.handleAnswer(data.sdp);
            break;
          case 'ice-candidate':
            this.handleIceCandidate(data.candidate);
            break;
          case 'hangup':
            this.stop();
            this.callbacks.onDisconnected();
            break;
        }
      })
      .subscribe();
  }

  private sendSignal(type: string, data: Record<string, unknown>): void {
    supabase.channel(this.channelName).send({
      type: 'broadcast',
      event: 'signal',
      payload: { type, ...data },
    });
  }

  setMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  stop(): void {
    // Notify peer
    this.sendSignal('hangup', { from: this.role });

    // Cleanup
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    supabase.removeChannel(supabase.channel(this.channelName));
    this.subscribed = false;
  }
}
