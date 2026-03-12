import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GameStateManager } from './state';
import { CONFIG } from './config';
import { createRenderer, createComposer } from '../rendering/renderer';
import { createScene } from '../rendering/scene';
import { createCamera } from '../rendering/camera';
import { setupLighting } from '../rendering/lighting';
import { createEnvironment, updateEnvironment } from '../rendering/environment';
import { EffectsManager } from '../rendering/effects';
import { InputController } from '../input/InputController';
import { Turret } from '../gameplay/Turret';
import { WeaponSystem } from '../gameplay/WeaponSystem';
import { DroneManager } from '../gameplay/DroneManager';
import { WaveManager } from '../gameplay/WaveManager';
import { BaseHealthSystem } from '../gameplay/BaseHealthSystem';
import { ScoreSystem } from '../gameplay/ScoreSystem';
import { HUD } from '../ui/HUD';
import { Overlay } from '../ui/Overlay';
import { Radar } from '../ui/Radar';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../assets/AssetLoader';

declare const OpenGameSDK: any;

export class Game {
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private state!: GameStateManager;
  private input!: InputController;
  private turret!: Turret;
  private weapon!: WeaponSystem;
  private droneManager!: DroneManager;
  private waveManager!: WaveManager;
  private baseHealth!: BaseHealthSystem;
  private score!: ScoreSystem;
  private effects!: EffectsManager;
  private hud!: HUD;
  private overlay!: Overlay;
  private radar!: Radar;
  private audio!: AudioManager;
  private assetLoader!: AssetLoader;
  private playfunSDK: any;

  private elapsedTime = 0;
  private cameraWorldPos = new THREE.Vector3();
  private deathSequenceActive = false;
  private deathTimeScale = 1;

  async init(): Promise<void> {
    // Rendering
    this.renderer = createRenderer();
    this.scene = createScene();
    this.camera = createCamera();
    this.scene.add(this.camera);

    setupLighting(this.scene);
    createEnvironment(this.scene);

    // Post-processing
    this.composer = createComposer(this.renderer, this.scene, this.camera);

    // State
    this.state = new GameStateManager();
    this.state.setState('LOADING');

    // UI
    this.hud = new HUD();
    this.overlay = new Overlay();
    this.radar = new Radar();
    this.audio = new AudioManager();

    // Load assets
    this.assetLoader = new AssetLoader();
    await Promise.all([
      this.assetLoader.loadAll(),
      this.audio.preload(),
    ]);

    // Input
    this.input = new InputController(this.renderer.domElement);

    // Effects
    this.effects = new EffectsManager(this.scene);

    // Gameplay systems
    this.turret = new Turret(this.camera);
    this.weapon = new WeaponSystem(this.camera, this.effects, this.audio);
    this.weapon.initGunMaterials(this.turret.gunGroup);
    this.droneManager = new DroneManager(this.scene, this.assetLoader);
    this.waveManager = new WaveManager();
    this.baseHealth = new BaseHealthSystem(this.state);
    this.score = new ScoreSystem(this.state);

    // Wire up events
    this.weapon.onKill = (scoreValue, position) => {
      this.score.addKill(scoreValue);
      this.playfunSDK?.addPoints(scoreValue);
    };

    this.waveManager.onWaveStart = (wave) => {
      this.state.stats.wave = wave;
      this.hud.showWaveBanner(wave);
      this.audio.playWaveStart();
    };

    this.waveManager.onWaveClear = (wave) => {
      const bonus = wave * CONFIG.scoring.waveBonusMultiplier;
      this.score.addWaveBonus(wave);
      this.playfunSDK?.addPoints(bonus);
    };

    this.baseHealth.onDamage = (amount: number) => {
      this.hud.flashDamage(amount);
      this.turret.applyShake(Math.min(0.8 + amount * 0.3, 2.5));
      this.audio.playImpact();
    };

    // Fire button (touch devices)
    if (this.input.isTouchDevice) {
      const fireBtn = document.getElementById('fire-button')!;
      fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.input.leftButton = true;
        this.input.fireButton = true;
      }, { passive: false });
      fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.input.leftButton = false;
        this.input.fireButton = false;
      }, { passive: false });
      fireBtn.addEventListener('touchcancel', () => {
        this.input.leftButton = false;
        this.input.fireButton = false;
      });
    }

    // Unlock audio on first user gesture (required for iOS)
    const unlockAudio = () => this.audio.resumeOnInteraction();
    document.addEventListener('click', unlockAudio, { once: false });
    document.addEventListener('touchstart', unlockAudio, { once: false });
    document.addEventListener('touchend', unlockAudio, { once: false });

    // Click handler — on document so overlays don't block it
    document.addEventListener('click', () => {
      if (this.state.current === 'MENU') {
        this.startRun();
      } else if (this.state.current === 'PLAYING' || this.state.current === 'WAVE_TRANSITION') {
        if (!this.input.isLocked) {
          this.input.requestPointerLock();
        }
      }
    });

    // Touch handler for starting/restarting the game
    if (this.input.isTouchDevice) {
      document.addEventListener('touchend', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.touch-control')) return;
        if (this.state.current === 'MENU') {
          this.startRun();
        } else if (this.state.current === 'GAME_OVER') {
          this.restartRun();
        }
      });
    }

    // Key handlers
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r' && this.state.current === 'GAME_OVER') {
        this.restartRun();
      }
      if (e.key.toLowerCase() === 'm') {
        this.audio.toggleMute();
      }
    });

    // Play.fun SDK
    try {
      this.playfunSDK = new OpenGameSDK({ ui: { usePointsWidget: true } });
      await this.playfunSDK.init({ gameId: '10b9288f-e86f-4c4f-9dfd-dd91ffa2d560' });
      console.log('Play.fun SDK ready');
    } catch (e) {
      console.warn('Play.fun SDK failed to init:', e);
    }

    // Ready
    this.overlay.hideLoading();
    this.overlay.showTitle();
    this.state.setState('MENU');

    // Start loop
    this.clock.start();
    this.loop();
  }

  private startRun(): void {
    this.overlay.hideTitle();
    this.overlay.hideGameOver();
    this.hud.show();
    this.audio.startMusic();
    this.state.resetRun();

    if (this.input.isTouchDevice) {
      this.input.isLocked = true;
      const fireBtn = document.getElementById('fire-button')!;
      fireBtn.style.display = 'flex';
    } else {
      this.input.requestPointerLock();
    }

    this.radar.show();
    this.state.setState('PLAYING');
    this.waveManager.startWave(1);
  }

  private restartRun(): void {
    // Save best score
    if (this.state.stats.score > this.state.stats.bestScore) {
      this.state.stats.bestScore = this.state.stats.score;
      localStorage.setItem('shahed_best', String(this.state.stats.bestScore));
    }

    this.deathSequenceActive = false;
    this.deathTimeScale = 1;
    this.audio.stopAllDroneMotors();
    this.droneManager.clearAll();
    this.effects.clear();
    this.waveManager.reset();
    this.score.reset();
    this.baseHealth.reset();
    this.turret.reset();
    this.weapon.reset();
    this.hud.reset();
    this.state.resetRun();

    this.overlay.hideGameOver();
    this.hud.show();

    if (this.input.isTouchDevice) {
      this.input.isLocked = true;
      const fireBtn = document.getElementById('fire-button')!;
      fireBtn.style.display = 'flex';
    } else {
      this.input.requestPointerLock();
    }

    this.radar.show();
    this.state.setState('PLAYING');
    this.waveManager.startWave(1);
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const rawDt = Math.min(this.clock.getDelta(), 0.05); // Cap delta
    const dt = rawDt * this.deathTimeScale;
    this.elapsedTime += dt;
    this.update(dt);
    this.composer.render();
  };

  private update(dt: number): void {
    // Always update environment visuals
    updateEnvironment(this.scene, this.elapsedTime);
    this.effects.update(dt);

    switch (this.state.current) {
      case 'MENU':
        break;

      case 'PLAYING':
      case 'WAVE_TRANSITION': {
        if (this.input.isLocked) {
          this.turret.update(dt, this.input);
          this.weapon.update(dt, this.elapsedTime, this.input, this.turret, this.droneManager);
        }

        // Update drones - handle breaches
        const breached = this.droneManager.update(dt, this.elapsedTime);
        for (const drone of breached) {
          this.baseHealth.damage(drone.baseDamage);
          this.audio.stopDroneMotor(drone.id);
        }

        // Update drone motor sounds
        this.camera.getWorldPosition(this.cameraWorldPos);
        const spawnDist = CONFIG.drone.spawnDistance;
        for (const drone of this.droneManager.drones) {
          if (drone.state === 'alive') {
            // Start motor if not already playing
            this.audio.startDroneMotor(drone.id);
            // Distance from drone to camera
            const dist = drone.position.distanceTo(this.cameraWorldPos);
            // Progress: 0 at spawn, 1 at breach distance
            const totalTravel = spawnDist + CONFIG.drone.breachDistance;
            const traveled = spawnDist - (dist - CONFIG.drone.breachDistance);
            const progress = Math.max(0, Math.min(1, traveled / totalTravel));
            this.audio.updateDroneMotor(drone.id, dist, spawnDist, progress);
          } else if (drone.state === 'dying' || drone.state === 'dead') {
            this.audio.stopDroneMotor(drone.id);
          }
        }

        // Wave management
        this.waveManager.update(dt, this.elapsedTime, this.droneManager);

        // HUD
        this.hud.update(this.state.stats);
        this.hud.updateHeat(this.weapon.heatFraction, this.weapon.isOverheated);
        this.radar.update(this.turret.yaw, this.droneManager.drones);

        // Death check
        if (this.baseHealth.isDead()) {
          this.gameOver();
        }
        break;
      }

      case 'GAME_OVER':
        // Keep updating effects for visual lingering
        this.droneManager.update(dt, this.elapsedTime);
        break;
    }
  }

  private gameOver(): void {
    if (this.deathSequenceActive) return;
    this.deathSequenceActive = true;

    // Save best score
    if (this.state.stats.score > this.state.stats.bestScore) {
      this.state.stats.bestScore = this.state.stats.score;
      localStorage.setItem('shahed_best', String(this.state.stats.bestScore));
    }

    // --- DEATH SEQUENCE ---
    this.audio.stopAllDroneMotors();

    // Massive initial shake
    this.turret.applyShake(4.0);

    // Slow-motion for dramatic effect
    this.deathTimeScale = 0.15;

    // Blinding white flash
    const whiteFlash = document.getElementById('white-flash')!;
    whiteFlash.style.transition = 'opacity 0.05s ease';
    whiteFlash.style.opacity = '1';

    // Red damage overlay pulses
    const damageFlash = document.getElementById('damage-flash')!;
    damageFlash.style.transition = 'opacity 0.1s ease';
    damageFlash.style.opacity = '0.7';

    // Turret/camera base position
    const basePos = new THREE.Vector3(0, 8, 12);

    // Phase 1: Initial massive explosion right at the turret (0ms)
    this.effects.spawnExplosion(basePos.clone().add(new THREE.Vector3(0, -2, -2)));
    this.effects.spawnExplosion(basePos.clone().add(new THREE.Vector3(1, 0, 0)));

    // Phase 2: Cascading explosions spreading outward (200-1200ms)
    const cascadeExplosions = [
      { delay: 200, offset: new THREE.Vector3(-4, -1, -5) },
      { delay: 350, offset: new THREE.Vector3(5, 0, -3) },
      { delay: 500, offset: new THREE.Vector3(-2, 2, -8) },
      { delay: 650, offset: new THREE.Vector3(6, -1, -6) },
      { delay: 800, offset: new THREE.Vector3(-7, 1, -4) },
      { delay: 950, offset: new THREE.Vector3(3, 3, -10) },
      { delay: 1100, offset: new THREE.Vector3(-5, -2, -7) },
      { delay: 1200, offset: new THREE.Vector3(0, 4, -12) },
    ];
    for (const e of cascadeExplosions) {
      setTimeout(() => {
        this.effects.spawnExplosion(basePos.clone().add(e.offset));
        this.turret.applyShake(2.0 + Math.random());
        // Pulse red
        damageFlash.style.opacity = String(0.3 + Math.random() * 0.4);
      }, e.delay);
    }

    // Phase 3: Final big blast (1500ms)
    setTimeout(() => {
      this.effects.spawnExplosion(basePos.clone().add(new THREE.Vector3(0, 0, -4)));
      this.effects.spawnExplosion(basePos.clone().add(new THREE.Vector3(-3, 1, -6)));
      this.effects.spawnExplosion(basePos.clone().add(new THREE.Vector3(3, -1, -5)));
      this.turret.applyShake(5.0);
      whiteFlash.style.transition = 'opacity 0.05s ease';
      whiteFlash.style.opacity = '0.6';
    }, 1500);

    // Fade white flash after initial burst
    setTimeout(() => {
      whiteFlash.style.transition = 'opacity 0.8s ease';
      whiteFlash.style.opacity = '0';
    }, 150);

    // Second white flash for the final blast
    setTimeout(() => {
      setTimeout(() => {
        whiteFlash.style.transition = 'opacity 1.5s ease';
        whiteFlash.style.opacity = '0';
      }, 100);
    }, 1500);

    // Gradually ramp time back up
    setTimeout(() => { this.deathTimeScale = 0.3; }, 600);
    setTimeout(() => { this.deathTimeScale = 0.5; }, 1200);
    setTimeout(() => { this.deathTimeScale = 0.8; }, 1800);
    setTimeout(() => { this.deathTimeScale = 1.0; }, 2200);

    // Fade red overlay
    setTimeout(() => {
      damageFlash.style.transition = 'opacity 1s ease';
      damageFlash.style.opacity = '0';
    }, 2000);

    // Show game over after the full sequence (~3 seconds)
    setTimeout(() => {
      this.deathSequenceActive = false;
      this.deathTimeScale = 1;
      this.state.setState('GAME_OVER');
      this.hud.hide();
      this.radar.hide();
      this.overlay.showGameOver(this.state.stats);
      this.audio.playGameOver();

      // Save points to Play.fun
      this.playfunSDK?.endGame().catch(() => {});

      if (this.input.isTouchDevice) {
        this.input.isLocked = false;
        const fireBtn = document.getElementById('fire-button')!;
        fireBtn.style.display = 'none';
      } else {
        document.exitPointerLock();
      }
    }, 3000);
  }
}
