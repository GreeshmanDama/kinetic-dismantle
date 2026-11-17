/**
 * Procedural Audio Synthesizer for Kinetic Dismantle
 * Uses Web Audio API without needing external audio files.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.servoOsc = null;
    this.servoGain = null;
    this.lastFactor = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio not supported', e);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Continuous mechanical servo sound modulated by movement velocity
   */
  updateServo(factor, dt = 0.016) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const velocity = Math.abs(factor - this.lastFactor) / dt;
    this.lastFactor = factor;

    // Only produce audio when actually moving
    if (velocity > 0.04) {
      if (!this.servoOsc) {
        this.servoOsc = this.ctx.createOscillator();
        this.servoGain = this.ctx.createGain();

        // Bandpass filter for robotic servo texture
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, this.ctx.currentTime);
        filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

        this.servoOsc.type = 'sawtooth';
        this.servoOsc.connect(filter);
        filter.connect(this.servoGain);
        this.servoGain.connect(this.ctx.destination);
        this.servoGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        this.servoOsc.start();
      }

      // Modulate frequency based on factor & speed
      const targetFreq = 180 + factor * 350 + Math.min(velocity * 80, 200);
      const targetVol = Math.min(velocity * 0.08, 0.09);

      this.servoOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
      this.servoGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.05);
    } else if (this.servoGain) {
      this.servoGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
    }
  }

  /**
   * Heavy mechanical magnetic latch sound when closing to 0%
   */
  playLockSound() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Sub thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.16);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);

    // Metallic click
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(900, now);
    click.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    click.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    click.start(now);
    click.stop(now + 0.07);
  }

  /**
   * Energetic sci-fi chime when fully dismantled (100%)
   */
  playExplodeCompleteSound() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    [520, 780, 1040].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.06, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.24);
    });
  }

  /**
   * UI Click tone
   */
  playClick() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const sound = new SoundEngine();
