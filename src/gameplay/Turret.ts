import * as THREE from 'three';
import { InputController } from '../input/InputController';
import { CONFIG } from '../game/config';
import { clamp, lerp } from '../utils/math';
import { createMinigun } from '../rendering/environment';

export class Turret {
  yaw = 0;
  pitch = 0.2;
  private recoilOffset = 0;
  private shakeOffset = new THREE.Vector2();
  private shakeDecay = 0;
  private shakeTime = 0;
  private fovPunch = 0;
  private directionalKick = 0;
  private isZoomed = false;
  private currentFov: number;
  private targetFov: number;
  camera: THREE.PerspectiveCamera;

  readonly gunGroup: THREE.Group;
  private barrelCluster: THREE.Object3D | null = null;
  private barrelSpin = 0;
  private barrelSpinSpeed = 0;
  private isFiring = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentFov = CONFIG.camera.fov;
    this.targetFov = CONFIG.camera.fov;

    // Build and attach minigun to camera
    this.gunGroup = createMinigun();
    // Position gun in front of camera, slightly down-right (FPS weapon style)
    this.gunGroup.position.set(0.18, -0.22, -0.6);
    this.gunGroup.scale.setScalar(1);
    this.camera.add(this.gunGroup);

    this.barrelCluster = this.gunGroup.getObjectByName('barrel_cluster') || null;
  }

  update(dt: number, input: InputController): void {
    // Mouse aim
    const { dx, dy } = input.consumeMovement();
    const sens = this.isZoomed ? CONFIG.camera.zoomSensitivity : CONFIG.camera.sensitivity;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = clamp(this.pitch, CONFIG.camera.minPitch, CONFIG.camera.maxPitch);

    // Zoom
    this.isZoomed = input.rightButton;
    this.targetFov = this.isZoomed ? CONFIG.camera.zoomFov : CONFIG.camera.fov;
    this.currentFov = lerp(this.currentFov, this.targetFov, dt * 12);

    // FOV punch recovery
    this.fovPunch = lerp(this.fovPunch, 0, dt * 8);
    this.camera.fov = this.currentFov + this.fovPunch;
    this.camera.updateProjectionMatrix();

    // Recoil recovery
    this.recoilOffset = lerp(this.recoilOffset, 0, dt * CONFIG.weapon.recoilRecovery);

    // Directional kick recovery (camera pitches up on heavy hits)
    this.directionalKick = lerp(this.directionalKick, 0, dt * 6);

    // Shake decay with sin-wave based frequency variation
    if (this.shakeDecay > 0) {
      this.shakeTime += dt;
      this.shakeDecay -= dt * 4;
      // Multi-frequency sin waves for organic, impactful shake
      const freq1 = Math.sin(this.shakeTime * 45) * 0.6;
      const freq2 = Math.sin(this.shakeTime * 73) * 0.3;
      const freq3 = Math.sin(this.shakeTime * 120) * 0.1;
      const noise = freq1 + freq2 + freq3;
      const noiseY = Math.sin(this.shakeTime * 55) * 0.5 + Math.sin(this.shakeTime * 97) * 0.35 + Math.sin(this.shakeTime * 130) * 0.15;
      this.shakeOffset.set(
        noise * this.shakeDecay * 0.05,
        noiseY * this.shakeDecay * 0.05
      );
    } else {
      this.shakeOffset.set(0, 0);
      this.shakeTime = 0;
    }

    // Apply rotation (includes directional kick for heavy impacts)
    const euler = new THREE.Euler(
      this.pitch + this.recoilOffset + this.shakeOffset.y + this.directionalKick,
      this.yaw + this.shakeOffset.x,
      0,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(euler);

    // Barrel spin
    this.isFiring = input.leftButton && input.isLocked;
    const targetSpinSpeed = this.isFiring ? 35 : 0;
    this.barrelSpinSpeed = lerp(this.barrelSpinSpeed, targetSpinSpeed, dt * (this.isFiring ? 8 : 3));
    this.barrelSpin += this.barrelSpinSpeed * dt;

    if (this.barrelCluster) {
      this.barrelCluster.rotation.z = this.barrelSpin;
    }

    // Gun position: slight zoom offset
    if (this.isZoomed) {
      this.gunGroup.position.lerp(new THREE.Vector3(0, -0.18, -0.5), dt * 10);
    } else {
      this.gunGroup.position.lerp(new THREE.Vector3(0.18, -0.22, -0.6), dt * 10);
    }
  }

  applyRecoil(): void {
    this.recoilOffset += CONFIG.weapon.recoilAmount;
  }

  applyShake(intensity: number): void {
    this.shakeDecay = Math.min(this.shakeDecay + intensity, 3);
    // Directional kick: camera pitches up on heavy hits
    this.directionalKick += intensity * 0.03;
    // FOV punch: brief FOV increase on impact
    this.fovPunch += intensity * 4;
  }

  getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  getMuzzleWorldPosition(): THREE.Vector3 {
    const muzzleLocal = new THREE.Vector3(0, 0, -1.8);
    return muzzleLocal.applyMatrix4(this.gunGroup.matrixWorld);
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 0.2;
    this.recoilOffset = 0;
    this.shakeDecay = 0;
    this.shakeTime = 0;
    this.fovPunch = 0;
    this.directionalKick = 0;
    this.isZoomed = false;
    this.currentFov = CONFIG.camera.fov;
    this.targetFov = CONFIG.camera.fov;
    this.barrelSpin = 0;
    this.barrelSpinSpeed = 0;
  }
}
