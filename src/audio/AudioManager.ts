export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private loading = false;

  // Master gain nodes
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Music
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicPlaying = false;

  // Buffers
  private shotBuffer: AudioBuffer | null = null;
  private explosionClose: AudioBuffer | null = null;
  private explosionMedium: AudioBuffer | null = null;
  private explosionFar: AudioBuffer | null = null;
  private impactBuffer: AudioBuffer | null = null;
  private shahedBuffer: AudioBuffer | null = null;
  private airRaidBuffer: AudioBuffer | null = null;
  private impactAlertBuffer: AudioBuffer | null = null;

  // Drone motor sound state — one looping source per drone
  private droneMotors: Map<number, {
    source: AudioBufferSourceNode;
    gain: GainNode;
    playbackRate: AudioParam;
  }> = new Map();

  // Impact alert — single global instance
  private impactAlertSource: AudioBufferSourceNode | null = null;
  private impactAlertGain: GainNode | null = null;

  // Air raid siren state
  private airRaidSource: AudioBufferSourceNode | null = null;
  private airRaidGain: GainNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.ctx.destination);
    }
    // iOS keeps context suspended until a user gesture — resume is
    // called from resumeOnInteraction() inside a touch/click handler
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Call this from a user gesture handler (click/touchend) to unlock
   * audio on iOS. Safe to call multiple times.
   */
  resumeOnInteraction(): void {
    // Create context on first interaction if it doesn't exist yet
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Decode audio buffers once context is running
    if (!this.decodePromise && this.rawBuffers.size > 0) {
      this.decodeAll();
    }
  }

  /** Get the SFX output node (all game sounds route through this) */
  private get sfxOut(): AudioNode {
    return this.sfxGain || this.ensureContext().destination;
  }

  // Raw ArrayBuffers fetched before AudioContext exists
  private rawBuffers: Map<string, ArrayBuffer> = new Map();
  private decodePromise: Promise<void> | null = null;

  async preload(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    // Fetch raw bytes — no AudioContext needed yet
    const paths = [
      'audio/shooting.mp3',
      'audio/explosion-close.mp3',
      'audio/explosion-medium.mp3',
      'audio/explosion-far.mp3',
      'audio/impact.mp3',
      'audio/shahed.mp3',
      'audio/air-raid.mp3',
      'audio/impact-alert.mp3',
      'audio/music.mp3',
    ];

    await Promise.all(paths.map(async (path) => {
      try {
        const resp = await fetch(path);
        const buf = await resp.arrayBuffer();
        this.rawBuffers.set(path, buf);
      } catch {
        console.warn(`Could not fetch ${path}`);
      }
    }));

    this.loading = false;
  }

  /** Decode raw buffers into AudioBuffers. Must be called after context is unlocked. */
  private decodeAll(): Promise<void> {
    if (this.decodePromise) return this.decodePromise;
    this.decodePromise = this._decodeAll();
    return this.decodePromise;
  }

  private async _decodeAll(): Promise<void> {
    const ctx = this.ensureContext();

    const decode = async (path: string): Promise<AudioBuffer | null> => {
      const raw = this.rawBuffers.get(path);
      if (!raw) return null;
      try {
        return await ctx.decodeAudioData(raw);
      } catch {
        console.warn(`Could not decode ${path}`);
        return null;
      }
    };

    const [shot, close, medium, far, impact, shahed, airRaid, impactAlert, music] = await Promise.all([
      decode('audio/shooting.mp3'),
      decode('audio/explosion-close.mp3'),
      decode('audio/explosion-medium.mp3'),
      decode('audio/explosion-far.mp3'),
      decode('audio/impact.mp3'),
      decode('audio/shahed.mp3'),
      decode('audio/air-raid.mp3'),
      decode('audio/impact-alert.mp3'),
      decode('audio/music.mp3'),
    ]);
    this.shotBuffer = shot;
    this.explosionClose = close;
    this.explosionMedium = medium;
    this.explosionFar = far;
    this.impactBuffer = impact;
    this.shahedBuffer = shahed;
    this.airRaidBuffer = airRaid;
    this.impactAlertBuffer = impactAlert;
    this.musicBuffer = music;
    this.rawBuffers.clear(); // free memory
  }

  // --- Background music ---

  async startMusic(): Promise<void> {
    await this.decodeAll();
    if (this.musicPlaying || !this.musicBuffer) return;
    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicGain!);
    source.start(ctx.currentTime);
    this.musicSource = source;
    this.musicPlaying = true;
    source.onended = () => {
      this.musicPlaying = false;
      this.musicSource = null;
    };
  }

  stopMusic(): void {
    if (!this.musicSource) return;
    try {
      const ctx = this.ensureContext();
      this.musicSource.stop(ctx.currentTime + 0.1);
    } catch { /* already stopped */ }
    this.musicSource = null;
    this.musicPlaying = false;
  }

  private playBuffer(buffer: AudioBuffer | null, volume: number = 0.5, playbackRate: number = 1): void {
    if (!buffer) return;
    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    source.connect(gain);
    gain.connect(this.sfxOut);
    source.start(ctx.currentTime);
  }

  // --- Shooting ---

  playShot(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();

    if (this.shotBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.shotBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      source.connect(gain);
      gain.connect(this.sfxOut);
      source.start(ctx.currentTime, 0, 0.12);
      return;
    }

    // Fallback: synthesized
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxOut);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  }

  // --- Explosions ---

  playExplosion(distance: number): void {
    if (this.muted) return;

    const rate = 0.9 + Math.random() * 0.2;

    if (distance < 80) {
      this.playBuffer(this.explosionClose, 0.7, rate);
    } else if (distance < 180) {
      this.playBuffer(this.explosionMedium, 0.5, rate);
    } else {
      this.playBuffer(this.explosionFar, 0.35, rate);
    }

    if (!this.explosionClose && !this.explosionMedium && !this.explosionFar) {
      this.playExplosionSynthesized();
    }
  }

  private playExplosionSynthesized(): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.sfxOut);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }

  // --- Impact (shahed hits player base) ---

  playImpact(): void {
    if (this.muted) return;
    if (this.impactBuffer) {
      this.playBuffer(this.impactBuffer, 0.8);
      return;
    }
    // Fallback: synthesized thud
    const ctx = this.ensureContext();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.1);
      osc.connect(gain);
      gain.connect(this.sfxOut);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.1);
    }
  }

  // --- Hit marker sound (bullet hits drone) ---

  playHit(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxOut);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  // --- Drone motor sounds ---
  // Each drone gets a looping shahed.mp3 with gain/pitch driven by distance

  startDroneMotor(droneId: number): void {
    if (this.muted || !this.shahedBuffer || this.droneMotors.has(droneId)) return;
    const ctx = this.ensureContext();

    const source = ctx.createBufferSource();
    source.buffer = this.shahedBuffer;
    source.loop = true;
    // Start at a random offset for variety
    source.loopStart = 0;
    source.loopEnd = this.shahedBuffer.duration;
    source.playbackRate.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0; // starts silent, updated per frame
    source.connect(gain);
    gain.connect(this.sfxOut);

    const offset = Math.random() * this.shahedBuffer.duration;
    source.start(ctx.currentTime, offset);

    this.droneMotors.set(droneId, {
      source,
      gain,
      playbackRate: source.playbackRate,
    });
  }

  /**
   * Update a drone's motor sound based on distance to player.
   * @param droneId - unique drone id
   * @param distance - distance from drone to camera
   * @param maxDistance - spawn distance (full quiet)
   * @param normalizedProgress - 0 = just spawned, 1 = at breach. Used for dive-bomb pitch.
   */
  updateDroneMotor(droneId: number, distance: number, maxDistance: number, normalizedProgress: number): void {
    const motor = this.droneMotors.get(droneId);
    if (!motor) return;
    if (this.muted) {
      motor.gain.gain.value = 0;
      return;
    }

    const ctx = this.ensureContext();

    // Volume: linear ramp from ~0 at maxDistance to 0.6 at distance=0
    const t = 1 - Math.min(1, distance / maxDistance);
    const volume = t * t * 0.6; // quadratic for more natural feel — quiet when far, ramps up close

    // Pitch: base 0.8, ramps up approaching breach (dive-bomber effect)
    let pitch = 0.8 + normalizedProgress * 0.4; // gentle rise from 0.8 to 1.2
    if (normalizedProgress > 0.6) {
      // Last 40%: aggressive pitch increase, like a dive bomber
      const diveFactor = (normalizedProgress - 0.6) / 0.4; // 0 to 1
      pitch += diveFactor * diveFactor * 1.4; // exponential ramp, up to ~2.6 total
    }

    // Smooth the values to avoid clicks
    const now = ctx.currentTime;
    motor.gain.gain.setTargetAtTime(volume, now, 0.05);
    motor.playbackRate.setTargetAtTime(pitch, now, 0.05);
  }

  stopDroneMotor(droneId: number): void {
    const motor = this.droneMotors.get(droneId);
    if (!motor) return;
    try {
      // Quick fade out to avoid click
      const ctx = this.ensureContext();
      motor.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      motor.source.stop(ctx.currentTime + 0.1);
    } catch {
      // Already stopped
    }
    this.droneMotors.delete(droneId);
  }

  stopAllDroneMotors(): void {
    for (const [id] of this.droneMotors) {
      this.stopDroneMotor(id);
    }
    this.droneMotors.clear();
  }

  // --- Impact alert (single global instance) ---

  startImpactAlert(): void {
    if (this.muted || !this.impactAlertBuffer || this.impactAlertSource) return;
    const ctx = this.ensureContext();

    const source = ctx.createBufferSource();
    source.buffer = this.impactAlertBuffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(this.sfxOut);
    source.start(ctx.currentTime);

    this.impactAlertSource = source;
    this.impactAlertGain = gain;
  }

  stopImpactAlert(): void {
    if (!this.impactAlertSource) return;
    try {
      const ctx = this.ensureContext();
      this.impactAlertGain!.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      this.impactAlertSource.stop(ctx.currentTime + 0.1);
    } catch {
      // Already stopped
    }
    this.impactAlertSource = null;
    this.impactAlertGain = null;
  }

  // --- Air raid siren ---

  playAirRaid(): void {
    if (this.muted || !this.airRaidBuffer) return;
    this.stopAirRaid(); // stop any existing

    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = this.airRaidBuffer;
    source.loop = false;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    // Fade out starting at 3.5s, fully silent by 5.5s
    gain.gain.setValueAtTime(0.7, ctx.currentTime + 3.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 5.5);

    source.connect(gain);
    gain.connect(this.sfxOut);
    source.start(ctx.currentTime);
    // Stop source after fade
    source.stop(ctx.currentTime + 6);

    this.airRaidSource = source;
    this.airRaidGain = gain;

    source.onended = () => {
      this.airRaidSource = null;
      this.airRaidGain = null;
    };
  }

  stopAirRaid(): void {
    if (this.airRaidSource) {
      try {
        if (this.airRaidGain) {
          const ctx = this.ensureContext();
          // Fade out over ~1 second
          this.airRaidGain.gain.cancelScheduledValues(ctx.currentTime);
          this.airRaidGain.gain.setValueAtTime(this.airRaidGain.gain.value, ctx.currentTime);
          this.airRaidGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
          this.airRaidSource.stop(ctx.currentTime + 1.1);
        } else {
          this.airRaidSource.stop();
        }
      } catch {
        // Already stopped
      }
      this.airRaidSource = null;
      this.airRaidGain = null;
    }
  }

  // --- Wave start (air raid + synth sting) ---

  async playWaveStart(): Promise<void> {
    await this.decodeAll();
    this.playAirRaid();
  }

  // --- Game over ---

  playGameOver(): void {
    if (this.muted) return;
    this.stopAllDroneMotors();
    this.stopAirRaid();

    const ctx = this.ensureContext();
    const notes = [440, 370, 330, 220];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.25);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.3);
      osc.connect(gain);
      gain.connect(this.sfxOut);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.3);
    });
  }

  // --- Mute ---

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopAllDroneMotors();
      this.stopImpactAlert();
      this.stopAirRaid();
      if (this.musicGain) this.musicGain.gain.value = 0;
      if (this.sfxGain) this.sfxGain.gain.value = 0;
    } else {
      if (this.musicGain) this.musicGain.gain.value = 0.4;
      if (this.sfxGain) this.sfxGain.gain.value = 1.0;
    }
  }
}
