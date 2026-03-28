// ============================================================
// WAASTA — WebRTC Voice Channel with Supabase Signaling
// ============================================================

import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  private channel: RealtimeChannel | null = null;
  private channelName: string;
  private role: VoiceRole;
  private cb: VoiceChannelCallbacks;
  private started = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  constructor(incidentId: string, role: VoiceRole, cb: VoiceChannelCallbacks) {
    this.channelName = `voice-${incidentId}`;
    this.role = role;
    this.cb = cb;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const t = `[VOICE:${this.role}]`;

    try {
      // 1. Mic
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      console.log(`${t} Mic OK`);

      // 2. Peer connection
      this.pc = new RTCPeerConnection(ICE_SERVERS);
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      this.pc.ontrack = (e) => {
        console.log(`${t} Got remote audio`);
        if (e.streams[0]) this.cb.onRemoteStream(e.streams[0]);
      };

      this.pc.onicecandidate = (e) => {
        if (e.candidate) this.send('ice-candidate', { candidate: e.candidate.toJSON() });
      };

      this.pc.onconnectionstatechange = () => {
        const s = this.pc?.connectionState;
        console.log(`${t} State: ${s}`);
        if (s === 'connected') this.cb.onConnected();
        // Only treat 'failed' and 'closed' as real disconnect
        // 'disconnected' is temporary (ICE renegotiation) — ignore it
        if (s === 'failed' || s === 'closed') this.cb.onDisconnected();
      };

      this.pc.oniceconnectionstatechange = () => {
        console.log(`${t} ICE: ${this.pc?.iceConnectionState}`);
      };

      // 3. Subscribe to Supabase broadcast channel
      this.channel = supabase.channel(this.channelName, {
        config: { broadcast: { self: false, ack: true } },
      });

      this.channel.on('broadcast', { event: 'webrtc' }, async ({ payload }) => {
        if (!payload || payload.from === this.role) return;
        console.log(`${t} Recv: ${payload.type}`);

        try {
          if (payload.type === 'offer' && this.pc) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            this.remoteDescSet = true;
            await this.flushCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.send('answer', { sdp: { type: answer.type, sdp: answer.sdp } });
            console.log(`${t} Answer sent`);
          }

          if (payload.type === 'answer' && this.pc) {
            if (this.pc.signalingState === 'have-local-offer') {
              await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              this.remoteDescSet = true;
              await this.flushCandidates();
              console.log(`${t} Answer applied`);
            }
          }

          if (payload.type === 'ice-candidate') {
            if (this.remoteDescSet && this.pc) {
              await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              this.pendingCandidates.push(payload.candidate);
            }
          }

          if (payload.type === 'hangup') {
            this.cleanup();
            this.cb.onDisconnected();
          }
        } catch (err) {
          console.error(`${t} Signal error:`, err);
        }
      });

      // Wait for subscription to be confirmed
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Channel subscribe timeout')), 10000);
        this.channel!.subscribe((status) => {
          console.log(`${t} Channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout);
            reject(new Error(`Channel ${status}`));
          }
        });
      });

      console.log(`${t} Channel ready`);

      // 4. Civilian sends offer after delay (institution just waits)
      if (this.role === 'civilian') {
        // Send a ping first to verify channel works
        this.send('ping', {});
        await new Promise(r => setTimeout(r, 2500));

        if (!this.pc) return;
        console.log(`${t} Creating offer...`);
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.send('offer', { sdp: { type: offer.type, sdp: offer.sdp } });
        console.log(`${t} Offer sent`);
      }

    } catch (err) {
      console.error(`${t} Start failed:`, err);
      this.cb.onError(err instanceof Error ? err.message : 'Voice channel failed');
    }
  }

  private async flushCandidates(): Promise<void> {
    for (const c of this.pendingCandidates) {
      try { await this.pc?.addIceCandidate(new RTCIceCandidate(c)); } catch { /* skip */ }
    }
    this.pendingCandidates = [];
  }

  private async send(type: string, data: Record<string, unknown>): Promise<void> {
    if (!this.channel) return;
    try {
      const status = await this.channel.send({
        type: 'broadcast',
        event: 'webrtc',
        payload: { type, from: this.role, ...data },
      });
      if (status !== 'ok') console.warn(`[VOICE:${this.role}] Send ${type} status: ${status}`);
    } catch (err) {
      console.warn(`[VOICE:${this.role}] Send ${type} failed:`, err);
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  private cleanup(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    if (this.channel) { supabase.removeChannel(this.channel); this.channel = null; }
    this.started = false;
    this.remoteDescSet = false;
    this.pendingCandidates = [];
  }

  async stop(): Promise<void> {
    console.log(`[VOICE:${this.role}] Stop`);
    // Send hangup and WAIT for it to be delivered before cleanup
    try {
      await this.send('hangup', {});
      // Small delay to ensure peer receives the message
      await new Promise(r => setTimeout(r, 300));
    } catch { /* ok */ }
    this.cleanup();
  }
}
