/**
 * Cyberpunk Tank Battle - Web Audio API Synthesizer Sound Manager
 * Entirely self-contained retro synth & SFX engine. No external files needed.
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.sfxEnabled = true;
    this.musicEnabled = true;
    
    // Music Sequencer state
    this.musicInterval = null;
    this.musicStep = 0;
    this.bpm = 115;
    this.notes = [
      55.00, 110.00, 55.00, 110.00, // A1, A2, A1, A2
      48.99, 97.99,  48.99, 97.99,  // G1, G2, G1, G2
      43.65, 87.31,  43.65, 87.31,  // F1, F2, F1, F2
      48.99, 97.99,  51.91, 103.83  // G1, G2, G#1, G#2
    ];
    
    // Engine sound nodes
    this.engineOsc = null;
    this.engineGain = null;
    this.engineActive = false;
  }

  /**
   * Initializes the AudioContext in response to a user action
   */
  init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Create white noise buffer for explosions
    this.noiseBuffer = this.createNoiseBuffer();
    
    // Start engine rumble in background (muted initially)
    this.setupEngineRumble();
    
    // If music is enabled, start sequencer loop
    if (this.musicEnabled) {
      this.startMusic();
    }
  }

  /**
   * Generates a 2-second buffer of white noise
   */
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Synthesizes Player or Enemy Laser Shoot SFX
   */
  playShoot(playerIndex = 0, speedUp = false) {
    if (!this.ctx || !this.sfxEnabled) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Setup type and frequency sweep
    // P1 (Cyan) is high pitch laser, P2 (Magenta) is slightly lower, Enemies are saw wave chirps
    if (playerIndex === 0) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.12);
    } else if (playerIndex === 1) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.14);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.16);
    }
    
    // Volume envelope
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + (speedUp ? 0.08 : 0.15));
    
    osc.start();
    osc.stop(this.ctx.currentTime + (speedUp ? 0.08 : 0.15));
  }

  /**
   * Synthesizes Explosion SFX using the white noise buffer & low-pass filter
   */
  playExplosion(isLarge = false) {
    if (!this.ctx || !this.sfxEnabled || !this.noiseBuffer) return;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    const gain = this.ctx.createGain();
    
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    const duration = isLarge ? 0.7 : 0.3;
    
    // Filter frequency sweep
    filter.frequency.setValueAtTime(isLarge ? 400 : 800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);
    
    // Gain envelope
    gain.gain.setValueAtTime(isLarge ? 0.4 : 0.25, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    noiseSource.start();
    noiseSource.stop(this.ctx.currentTime + duration);
  }

  /**
   * Synthesizes power-up spawn arpeggio
   */
  playPowerUpSpawn() {
    if (!this.ctx || !this.sfxEnabled) return;
    
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, index) => {
      const time = this.ctx.currentTime + index * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.12);
      
      osc.start(time);
      osc.stop(time + 0.12);
    });
  }

  /**
   * Synthesizes power-up pick-up SFX (cyberpunk uplift chord)
   */
  playPowerUpCollect() {
    if (!this.ctx || !this.sfxEnabled) return;
    
    const baseFreq = 220; // A3
    const intervals = [1, 1.25, 1.5, 1.875, 2.0]; // Major chords arpeggio
    
    intervals.forEach((ratio, index) => {
      const time = this.ctx.currentTime + index * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq * ratio * 2, time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio * 4, time + 0.2);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.25);
      
      osc.start(time);
      osc.stop(time + 0.25);
    });
  }

  /**
   * Synthesizes base damage buzz
   */
  playBaseHit() {
    if (!this.ctx || !this.sfxEnabled) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(55, this.ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.45);
  }

  /**
   * Synthesizes continuous engine hum
   */
  setupEngineRumble() {
    if (!this.ctx) return;
    
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(90, this.ctx.currentTime);
    
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // Low A1
    
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    
    this.engineGain.gain.setValueAtTime(0.001, this.ctx.currentTime); // Keep muted
    this.engineOsc.start();
  }

  /**
   * Updates the engine sound pitch and volume based on moving state
   */
  setEngineActive(active = false) {
    if (!this.ctx || !this.sfxEnabled || !this.engineGain) return;
    
    const targetFreq = active ? 75 : 55;
    const targetVolume = active ? 0.05 : 0.02;
    
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    this.engineGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
    this.engineActive = active;
  }

  /**
   * Completely silences the engine (when paused or menus)
   */
  silenceEngine() {
    if (this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Synthwave Sequencer Loop
   */
  startMusic() {
    if (!this.ctx || this.musicInterval) return;
    
    const stepTime = 60 / this.bpm / 2; // Eighth notes
    
    this.musicInterval = setInterval(() => {
      if (!this.musicEnabled || !this.ctx) return;
      
      const time = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      // Cyberpunk deep sawtooth bass
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.notes[this.musicStep], time);
      
      // LP filter sweep for "wah-wah" synth sound
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, time);
      filter.frequency.exponentialRampToValueAtTime(800, time + 0.1);
      filter.Q.setValueAtTime(5, time);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      // Accent on beat 1 and 5
      const isAccent = this.musicStep % 4 === 0;
      const volume = isAccent ? 0.07 : 0.045;
      
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepTime - 0.01);
      
      osc.start(time);
      osc.stop(time + stepTime);
      
      // Step increment
      this.musicStep = (this.musicStep + 1) % this.notes.length;
    }, stepTime * 1000);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  /**
   * Plays levels cleared fanfare
   */
  playVictory() {
    if (!this.ctx || !this.sfxEnabled) return;
    
    this.stopMusic();
    const fanFare = [
      [261.63, 0.15], [329.63, 0.15], [392.00, 0.15], 
      [523.25, 0.25], [392.00, 0.15], [523.25, 0.5]
    ]; // C4, E4, G4, C5, G4, C5
    
    let accumulatedTime = 0;
    fanFare.forEach(([freq, duration]) => {
      const time = this.ctx.currentTime + accumulatedTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.linearRampToValueAtTime(0.001, time + duration - 0.02);
      
      osc.start(time);
      osc.stop(time + duration);
      
      accumulatedTime += duration;
    });
    
    // Restart music in background after 3 seconds
    setTimeout(() => {
      if (this.musicEnabled) this.startMusic();
    }, 2800);
  }

  /**
   * Plays melancholy game over tune
   */
  playGameOver() {
    if (!this.ctx || !this.sfxEnabled) return;
    
    this.stopMusic();
    this.silenceEngine();
    
    const sadMelody = [
      [293.66, 0.3], [277.18, 0.3], [261.63, 0.3], [246.94, 0.6] // D4, C#4, C4, B3
    ];
    
    let accumulatedTime = 0;
    sadMelody.forEach(([freq, duration]) => {
      const time = this.ctx.currentTime + accumulatedTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.linearRampToValueAtTime(freq - 10, time + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.linearRampToValueAtTime(0.001, time + duration);
      
      osc.start(time);
      osc.stop(time + duration);
      
      accumulatedTime += duration;
    });
  }

  /**
   * Toggle functions
   */
  setSFXEnabled(val) {
    this.sfxEnabled = val;
    if (!val) {
      this.silenceEngine();
    }
  }

  setMusicEnabled(val) {
    this.musicEnabled = val;
    if (val) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }
}

export const SOUND = new SoundManager();
