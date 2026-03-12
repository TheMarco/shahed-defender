import * as THREE from 'three';
import { InputController } from '../input/InputController';
import { Turret } from './Turret';
import { DroneManager } from './DroneManager';
import { EffectsManager } from '../rendering/effects';
import { AudioManager } from '../audio/AudioManager';
import { CONFIG } from '../game/config';
import { WeaponData } from '../game/types';

export class WeaponSystem {
  private weapon: WeaponData;
  private raycaster: THREE.Raycaster;
  private effects: EffectsManager;
  private audio: AudioManager;
  private camera: THREE.PerspectiveCamera;
  onKill: ((scoreValue: number, position: THREE.Vector3) => void) | null = null;

  // Heat system
  private heat = 0;
  private readonly maxHeat = 1; // second of continuous fire to overheat
  private readonly cooldownTime = 2; // seconds to cool from overheated
  private overheated = false;
  private gunMaterials: THREE.MeshStandardMaterial[] = [];
  private originalEmissives: Map<THREE.MeshStandardMaterial, THREE.Color> = new Map();

  /** Current heat fraction 0-1 for HUD display */
  get heatFraction(): number { return this.heat / this.maxHeat; }
  get isOverheated(): boolean { return this.overheated; }

  constructor(
    camera: THREE.PerspectiveCamera,
    effects: EffectsManager,
    audio: AudioManager,
  ) {
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.weapon.range;

    this.weapon = {
      fireRate: CONFIG.weapon.fireRate,
      shotDamage: CONFIG.weapon.shotDamage,
      range: CONFIG.weapon.range,
      canFire: true,
      lastFireTime: 0,
    };
  }

  /** Collect gun materials so we can tint them on overheat */
  initGunMaterials(gunGroup: THREE.Group): void {
    gunGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (!this.originalEmissives.has(mat)) {
          this.originalEmissives.set(mat, mat.emissive.clone());
          this.gunMaterials.push(mat);
        }
      }
    });
  }

  update(dt: number, time: number, input: InputController, turret: Turret, droneManager: DroneManager): void {
    const firing = input.leftButton && input.isLocked && !this.overheated;

    // Heat management
    if (firing) {
      this.heat = Math.min(this.heat + dt, this.maxHeat);
      if (this.heat >= this.maxHeat) {
        this.overheated = true;
      }
    } else {
      // Cool down — faster when not overheated, fixed rate when overheated
      const coolRate = this.overheated ? this.maxHeat / this.cooldownTime : 2;
      this.heat = Math.max(0, this.heat - dt * coolRate);
      if (this.overheated && this.heat <= 0) {
        this.overheated = false;
      }
    }

    // Visual heat glow on gun
    this.updateHeatVisual();

    if (!firing) return;

    const interval = 1 / this.weapon.fireRate;
    if (time - this.weapon.lastFireTime < interval) return;
    this.weapon.lastFireTime = time;

    this.fire(turret, droneManager);
  }

  private updateHeatVisual(): void {
    const t = this.heat / this.maxHeat;
    for (const mat of this.gunMaterials) {
      const orig = this.originalEmissives.get(mat)!;
      if (t > 0.1) {
        // Blend from original emissive to red-hot
        const r = orig.r + (1.0 - orig.r) * t;
        const g = orig.g + (0.2 - orig.g) * t * t;
        const b = orig.b + (0.0 - orig.b) * t;
        mat.emissive.setRGB(r, g, b);
        mat.emissiveIntensity = 0.5 + t * 2.5;
      } else {
        mat.emissive.copy(orig);
        mat.emissiveIntensity = 1;
      }
    }
  }

  private fire(turret: Turret, droneManager: DroneManager): void {
    turret.applyRecoil();
    this.audio.playShot();

    const forward = turret.getForward();
    const origin = this.camera.position.clone();
    const muzzlePos = turret.getMuzzleWorldPosition();

    // Muzzle flash at gun tip
    this.effects.spawnMuzzleFlash(muzzlePos, forward);

    // Tracer from gun tip
    this.effects.spawnTracer(muzzlePos, forward, this.weapon.range);

    // Raycast
    this.raycaster.set(origin, forward);
    const hit = droneManager.raycast(this.raycaster);

    if (hit) {
      // Apply damage
      hit.drone.health -= this.weapon.shotDamage;
      this.effects.spawnHitSpark(hit.point);
      this.audio.playHit();

      // Flash drone material briefly
      if (hit.drone.mesh) {
        hit.drone.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat.emissive) {
              mat.emissive.setHex(0xff4400);
              setTimeout(() => mat.emissive.setHex(0x000000), 50);
            }
          }
        });
      }

      if (hit.drone.health <= 0) {
        hit.drone.state = 'dying';
        this.effects.spawnExplosion(hit.drone.hitSphere.center.clone());
        this.audio.playExplosion(hit.distance);
        turret.applyShake(0.3);
        if (this.onKill) {
          this.onKill(hit.drone.scoreValue, hit.drone.position.clone());
        }
      }
    }
  }

  reset(): void {
    this.weapon.lastFireTime = 0;
    this.heat = 0;
    this.overheated = false;
    this.updateHeatVisual();
  }
}
