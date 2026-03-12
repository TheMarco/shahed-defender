import * as THREE from 'three';

export type GameState = 'BOOT' | 'LOADING' | 'MENU' | 'PLAYING' | 'WAVE_TRANSITION' | 'GAME_OVER' | 'PAUSED';

export type DroneState = 'alive' | 'dying' | 'breached' | 'dead';

export interface DroneData {
  id: number;
  state: DroneState;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  health: number;
  maxHealth: number;
  wobbleAmplitude: number;
  wobbleFrequency: number;
  wobbleOffset: number;
  spawnTime: number;
  baseDamage: number;
  scoreValue: number;
  mesh: THREE.Object3D | null;
  propeller: THREE.Object3D | null;
  propAngle: number;
  hitSphere: THREE.Sphere;
  dyingTimer: number;
}

export interface WeaponData {
  fireRate: number;
  shotDamage: number;
  range: number;
  canFire: boolean;
  lastFireTime: number;
}

export interface RunStats {
  wave: number;
  score: number;
  dronesDestroyed: number;
  baseHealth: number;
  maxHealth: number;
  bestScore: number;
}

export interface HitResult {
  drone: DroneData;
  point: THREE.Vector3;
  distance: number;
}
