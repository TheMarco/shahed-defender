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

  update(dt: number, time: number, input: InputController, turret: Turret, droneManager: DroneManager): void {
    if (!input.leftButton || !input.isLocked) return;

    const interval = 1 / this.weapon.fireRate;
    if (time - this.weapon.lastFireTime < interval) return;
    this.weapon.lastFireTime = time;

    this.fire(turret, droneManager);
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
  }
}
