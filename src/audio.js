/**
 * Procedural Audio Synthesizer & Ambient Music Engine for Kinetic Dismantle
 * Uses Web Audio API without needing external audio files.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.servoOsc = null;
    this.servoGain = null;
    this.lastFactor = 0;

    // Ambient sci-fi background music nodes
    this.ambientNodes = [];
    this.ambientRunning = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      if (this.enabled) {
        this.startAmbientMusic();
      }
    } catch (e) {
      console.warn("Web Audio not supported", e);
    }
  }

  toggle() {
    this.init();
    this.enabled = !this.enabled;
    if (this.enabled) {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.startAmbientMusic();
    } else {
      this.stopAmbientMusic();
      if (this.servoGain) {
        this.servoGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      }
    }
    return this.enabled;
  }

  setEnabled(val) {
    if (this.enabled === val) return this.enabled;
    return this.toggle();
  }

  /**
   * Subtle generative ambient sci-fi synthesizer music
   */
  startAmbientMusic() {
    if (!this.ctx || !this.enabled || this.ambientRunning) return;
    try {
      const now = this.ctx.currentTime;
      this.ambientRunning = true;
      this.ambientNodes = [];

      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.028, now + 2.0);
      masterGain.connect(this.ctx.destination);
      this.ambientNodes.push(masterGain);

      // Low drone (F# minor sci-fi chord notes: F#1 (46.25Hz), C#2 (69.3Hz), A2 (110Hz))
      const chord = [46.25, 69.3, 110.0, 138.59];
      chord.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = idx % 2 === 0 ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(freq, now);

        // Slow frequency shimmer / detune
        const detuneLfo = this.ctx.createOscillator();
        const detuneGain = this.ctx.createGain();
        detuneLfo.frequency.setValueAtTime(0.12 + idx * 0.05, now);
        detuneGain.gain.setValueAtTime(2.5, now);
        detuneLfo.connect(detuneGain);
        detuneGain.connect(osc.detune);
        detuneLfo.start(now);
        this.ambientNodes.push(detuneLfo, detuneGain);

        // Lowpass filter for warm space drone
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(220 + idx * 60, now);
        filter.Q.setValueAtTime(2.0, now);

        gain.gain.setValueAtTime(0.25 / chord.length, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        this.ambientNodes.push(osc, filter, gain);
      });
    } catch {
      // Audio node creation fallback
    }
  }

  stopAmbientMusic() {
    if (!this.ambientRunning) return;
    this.ambientRunning = false;
    try {
      this.ambientNodes.forEach((node) => {
        try {
          if (node.stop) node.stop();
          if (node.disconnect) node.disconnect();
        } catch {}
      });
      this.ambientNodes = [];
    } catch {}
  }

  /**
   * Continuous mechanical servo sound modulated by movement velocity
   */
  updateServo(factor, dt = 0.016) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    const velocity = Math.abs(factor - this.lastFactor) / dt;
    this.lastFactor = factor;

    // Only produce audio when actually moving
    if (velocity > 0.04) {
      if (!this.servoOsc) {
        this.servoOsc = this.ctx.createOscillator();
        this.servoGain = this.ctx.createGain();

        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(600, this.ctx.currentTime);
        filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

        this.servoOsc.type = "sawtooth";
        this.servoOsc.connect(filter);
        filter.connect(this.servoGain);
        this.servoGain.connect(this.ctx.destination);
        this.servoGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        this.servoOsc.start();
      }

      const targetFreq = 180 + factor * 350 + Math.min(velocity * 80, 200);
      const targetVol = Math.min(velocity * 0.08, 0.085);

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

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.16);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);

    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = "triangle";
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
      osc.type = "sine";
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
    osc.type = "sine";
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
