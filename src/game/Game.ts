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
  private impactAlertActive = false;

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
    this.weapon.onKill = (scoreValue, position, droneId) => {
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

  private async startRun(): Promise<void> {
    this.overlay.hideTitle();
    this.overlay.hideGameOver();
    this.hud.show();
    await this.audio.startMusic();
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

    // Debug: ?explode in URL triggers instant death for testing
    if (new URLSearchParams(window.location.search).has('explode')) {
      setTimeout(() => this.gameOver(), 500);
    }
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
    this.audio.stopImpactAlert();
    this.impactAlertActive = false;
    this.radar.setAlert(false);
    this.droneManager.clearAll();
    this.effects.clear();
    this.waveManager.reset();
    this.score.reset();
    this.baseHealth.reset();
    this.turret.gunGroup.visible = true;
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
        // Skip all gameplay during death sequence — only effects run
        if (this.deathSequenceActive) break;

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

        // Impact alert — single alarm when any drone is ~4 seconds from breach
        let anyAlerting = false;
        for (const drone of this.droneManager.drones) {
          if (drone.state !== 'alive') continue;
          const zRemaining = CONFIG.drone.breachDistance - drone.position.z;
          const zSpeed = drone.velocity.z * drone.speed;
          if (zSpeed > 0 && zRemaining / zSpeed <= 4) {
            anyAlerting = true;
            break;
          }
        }
        if (anyAlerting && !this.impactAlertActive) {
          this.audio.startImpactAlert();
          this.impactAlertActive = true;
        } else if (!anyAlerting && this.impactAlertActive) {
          this.audio.stopImpactAlert();
          this.impactAlertActive = false;
        }
        this.radar.setAlert(anyAlerting);

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
    this.audio.stopImpactAlert();
    this.impactAlertActive = false;
    this.radar.setAlert(false);

    // Clear ALL screen overlays so the 3D explosion is fully visible
    const whiteFlash = document.getElementById('white-flash')!;
    const damageFlash = document.getElementById('damage-flash')!;
    const lowHealth = document.getElementById('low-health-overlay')!;
    const damageVignette = document.getElementById('damage-vignette')!;
    for (const el of [whiteFlash, damageFlash, lowHealth, damageVignette]) {
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }

    // Slow-motion for dramatic effect
    this.deathTimeScale = 0.15;

    // Shake + blow up the gun (uses real-time clock, unaffected by deathTimeScale)
    this.turret.applyShake(4.0);
    this.effects.spawnGunExplosion(this.camera, this.turret.gunGroup);

    // Gradually ramp time back up
    setTimeout(() => { this.deathTimeScale = 0.3; }, 800);
    setTimeout(() => { this.deathTimeScale = 0.5; }, 1400);
    setTimeout(() => { this.deathTimeScale = 0.8; }, 2000);
    setTimeout(() => { this.deathTimeScale = 1.0; }, 2500);

    // Show game over after the gun explosion plays out (~4.5 seconds)
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
    }, 4500);
  }
}
