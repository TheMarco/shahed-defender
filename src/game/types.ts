import * as THREE from 'three';

export type GameState = 'BOOT' | 'LOADING' | 'MENU' | 'PLAYING' | 'WAVE_TRANSITION' | 'GAME_OVER' | 'PAUSED';

export type DroneState = 'alive' | 'dying' | 'breached' | 'dead';

export type DronePath = 'straight' | 'arc' | 'scurve' | 'spiral' | 'dive_swoop';

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
  // Path system
  pathType: DronePath;
  pathAmplitude: number;    // how wide the curve is (world units)
  pathRight: THREE.Vector3; // perpendicular to velocity (horizontal)
  pathUp: THREE.Vector3;    // perpendicular to velocity (vertical-ish)
  totalDistance: number;     // total distance from spawn to target
  distanceTraveled: number; // how far along the path
  bankAmount: number;       // 0 = no banking, >0 = banks when turning
  prevLateralOffset: number; // for computing bank from lateral delta
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
