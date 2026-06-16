/**
 * Audio utilities — ringtone generator using Web Audio API
 * No external audio files needed!
 */
class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.ringtoneInterval = null;
    this.isRinging = false;
  }

  _ensureContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play a short beep/tone
   */
  playTone(frequency = 440, duration = 0.15, type = 'sine', volume = 0.1) {
    this._ensureContext();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  /**
   * Start ringing (incoming call)
   */
  startRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;

    const ring = () => {
      if (!this.isRinging) return;
      // Two-tone ring pattern (like a phone)
      this.playTone(784, 0.2, 'sine', 0.08);   // G5
      setTimeout(() => {
        if (!this.isRinging) return;
        this.playTone(659, 0.2, 'sine', 0.08); // E5
      }, 200);
      setTimeout(() => {
        if (!this.isRinging) return;
        this.playTone(784, 0.2, 'sine', 0.08); // G5
      }, 400);
    };

    ring();
    this.ringtoneInterval = setInterval(ring, 2000);
  }

  /**
   * Stop ringing
   */
  stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * Play call connected sound
   */
  playConnected() {
    this.playTone(523, 0.1, 'sine', 0.06);
    setTimeout(() => this.playTone(659, 0.1, 'sine', 0.06), 100);
    setTimeout(() => this.playTone(784, 0.15, 'sine', 0.06), 200);
  }

  /**
   * Play call ended sound
   */
  playDisconnected() {
    this.playTone(523, 0.15, 'sine', 0.06);
    setTimeout(() => this.playTone(392, 0.2, 'sine', 0.06), 150);
  }

  /**
   * Play dialing tone (outgoing)
   */
  startDialTone() {
    if (this.isRinging) return;
    this.isRinging = true;

    const dial = () => {
      if (!this.isRinging) return;
      this.playTone(440, 0.8, 'sine', 0.04);
    };

    dial();
    this.ringtoneInterval = setInterval(dial, 3000);
  }

  /**
   * Play notification blip
   */
  playNotification() {
    this.playTone(880, 0.08, 'sine', 0.05);
    setTimeout(() => this.playTone(1100, 0.1, 'sine', 0.05), 80);
  }
}

// Global instance
window.audioManager = new AudioManager();
