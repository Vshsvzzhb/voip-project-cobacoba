/**
 * WebRTC Manager — Handles peer connection, media streams, and ICE
 */
class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isVideoEnabled = false;
    this.isAudioEnabled = true;

    // STUN servers (free, public)
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ];

    // Callbacks (to be set by app.js)
    this.onIceCandidate = null;     // (candidate) => {}
    this.onRemoteStream = null;     // (stream) => {}
    this.onConnectionStateChange = null; // (state) => {}
  }

  /**
   * Get user media (microphone, optionally camera)
   */
  async getLocalStream(video = false) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      });
      this.isVideoEnabled = video;
      this.isAudioEnabled = true;
      return this.localStream;
    } catch (err) {
      console.error('[WebRTC] Failed to get media:', err);
      throw err;
    }
  }

  /**
   * Create a new RTCPeerConnection
   */
  createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    // Handle remote stream
    this.remoteStream = new MediaStream();
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream.addTrack(track);
      });
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state: ${this.peerConnection.iceConnectionState}`);
    };

    return this.peerConnection;
  }

  /**
   * Create an SDP Offer (caller side)
   */
  async createOffer() {
    if (!this.peerConnection) this.createPeerConnection();

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create an SDP Answer (callee side)
   */
  async createAnswer(offer) {
    if (!this.peerConnection) this.createPeerConnection();

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set remote answer (caller side, after receiving answer)
   */
  async setRemoteAnswer(answer) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  /**
   * Add ICE candidate from remote peer
   */
  async addIceCandidate(candidate) {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    }
  }

  /**
   * Toggle microphone mute
   */
  toggleMute() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      this.isAudioEnabled = audioTracks[0]?.enabled ?? false;
      return this.isAudioEnabled;
    }
    return true;
  }

  /**
   * Toggle video
   */
  async toggleVideo() {
    if (!this.localStream) return false;

    if (this.isVideoEnabled) {
      // Turn off video
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        this.localStream.removeTrack(track);
      });

      // Remove video track from peer connection
      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          this.peerConnection.removeTrack(videoSender);
        }
      }

      this.isVideoEnabled = false;
    } else {
      // Turn on video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);

        // Add video track to peer connection
        if (this.peerConnection) {
          this.peerConnection.addTrack(videoTrack, this.localStream);
        }

        this.isVideoEnabled = true;
      } catch (err) {
        console.error('[WebRTC] Failed to enable video:', err);
        return false;
      }
    }
    return this.isVideoEnabled;
  }

  /**
   * Close the connection and clean up
   */
  cleanup() {
    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.isVideoEnabled = false;
    this.isAudioEnabled = true;
  }
}

// Global instance
window.webrtcManager = new WebRTCManager();
