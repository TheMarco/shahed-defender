import * as THREE from 'three';
import { DroneData, DroneState, DronePath } from '../game/types';
import { CONFIG } from '../game/config';
import { randRange } from '../utils/math';

let nextId = 0;

const PATH_TYPES: DronePath[] = ['straight', 'arc', 'scurve', 'spiral', 'dive_swoop'];

export function createDrone(
  mesh: THREE.Object3D,
  spawnPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  wave: number,
  time: number,
): DroneData {
  const dir = targetPos.clone().sub(spawnPos).normalize();
  const speed = CONFIG.drone.baseSpeed + wave * CONFIG.waves.speedIncreasePerWave;

  // Compute perpendicular vectors for path offsets
  const worldUp = new THREE.Vector3(0, 1, 0);
  const pathRight = new THREE.Vector3().crossVectors(worldUp, dir).normalize();
  // If dir is nearly vertical, pick a fallback
  if (pathRight.lengthSq() < 0.01) {
    pathRight.set(1, 0, 0);
  }
  const pathUp = new THREE.Vector3().crossVectors(dir, pathRight).normalize();

  const totalDistance = spawnPos.distanceTo(targetPos);

  // Pick a path type — more variety in later waves
  let pathType: DronePath;
  const roll = Math.random();
  if (wave <= 1) {
    // Wave 1: mostly straight, some arcs
    pathType = roll < 0.6 ? 'straight' : roll < 0.85 ? 'arc' : 'scurve';
  } else if (wave <= 3) {
    // Waves 2-3: mix in more
    pathType = roll < 0.3 ? 'straight' : roll < 0.55 ? 'arc' : roll < 0.75 ? 'scurve' : roll < 0.9 ? 'spiral' : 'dive_swoop';
  } else {
    // Wave 4+: full variety
    pathType = PATH_TYPES[Math.floor(Math.random() * PATH_TYPES.length)];
  }

  // Path amplitude scales with distance so curves are visible
  let pathAmplitude: number;
  switch (pathType) {
    case 'arc':       pathAmplitude = randRange(30, 80) * (Math.random() < 0.5 ? 1 : -1); break;
    case 'scurve':    pathAmplitude = randRange(25, 60) * (Math.random() < 0.5 ? 1 : -1); break;
    case 'spiral':    pathAmplitude = randRange(20, 50); break;
    case 'dive_swoop': pathAmplitude = randRange(30, 70); break;
    default:          pathAmplitude = 0; break;
  }

  // Banking: ~40% of non-straight drones bank visibly
  const bankAmount = (pathType !== 'straight' && Math.random() < 0.4) ? randRange(0.3, 0.8) : 0;

  const drone: DroneData = {
    id: nextId++,
    state: 'alive',
    position: spawnPos.clone(),
    velocity: dir,
    speed,
    health: CONFIG.drone.baseHealth,
    maxHealth: CONFIG.drone.baseHealth,
    wobbleAmplitude: randRange(CONFIG.drone.wobbleAmplitudeMin, CONFIG.drone.wobbleAmplitudeMax),
    wobbleFrequency: randRange(CONFIG.drone.wobbleFrequencyMin, CONFIG.drone.wobbleFrequencyMax),
    wobbleOffset: Math.random() * Math.PI * 2,
    spawnTime: time,
    baseDamage: CONFIG.breachDamage,
    scoreValue: CONFIG.drone.scoreValue,
    mesh,
    propeller: mesh.getObjectByName('prop_spinner') || null,
    propAngle: 0,
    hitSphere: new THREE.Sphere(spawnPos.clone(), CONFIG.drone.hitSphereRadius),
    dyingTimer: 0,
    // Path
    pathType,
    pathAmplitude,
    pathRight: pathRight.clone(),
    pathUp: pathUp.clone(),
    totalDistance,
    distanceTraveled: 0,
    bankAmount,
    prevLateralOffset: 0,
  };

  mesh.position.copy(spawnPos);
  mesh.scale.multiplyScalar(CONFIG.drone.modelScale);

  return drone;
}

/** Compute lateral offset for a given progress (0-1) along the path */
function getPathOffset(drone: DroneData, progress: number): { lateral: number; vertical: number } {
  const t = progress;
  const amp = drone.pathAmplitude;
  // Envelope: fades in from 0, peaks mid-path, fades back to 0 at target
  // Ensures the drone always converges on the player
  const envelope = Math.sin(t * Math.PI);

  switch (drone.pathType) {
    case 'arc':
      // Single smooth arc: peaks at midpoint
      return { lateral: envelope * amp, vertical: 0 };

    case 'scurve':
      // S-shape: curves one way then the other
      return { lateral: Math.sin(t * Math.PI * 2) * envelope * amp, vertical: 0 };

    case 'spiral':
      // Corkscrew: both lateral and vertical sinusoidal
      return {
        lateral: Math.sin(t * Math.PI * 3) * envelope * amp,
        vertical: Math.cos(t * Math.PI * 3) * envelope * amp * 0.6,
      };

    case 'dive_swoop': {
      // Dives down then swoops up: parabolic vertical, slight lateral
      const diveT = (t - 0.6);
      const verticalDive = -amp * (1 - (diveT * diveT) / 0.36);
      const lateralDrift = Math.sin(t * Math.PI * 1.5) * amp * 0.3;
      return { lateral: lateralDrift * envelope, vertical: verticalDive * envelope };
    }

    default:
      return { lateral: 0, vertical: 0 };
  }
}

export function updateDrone(drone: DroneData, dt: number, time: number): void {
  if (drone.state !== 'alive') return;

  // Wobble (small high-freq jitter on top of everything)
  const wobbleX = Math.sin(
    time * drone.wobbleFrequency + drone.wobbleOffset
  ) * drone.wobbleAmplitude;
  const wobbleY = Math.cos(
    time * drone.wobbleFrequency * 0.7 + drone.wobbleOffset + 1.5
  ) * drone.wobbleAmplitude * 0.3;

  // Advance along the base path
  const stepDist = drone.speed * dt;
  drone.distanceTraveled += stepDist;
  const progress = Math.min(drone.distanceTraveled / drone.totalDistance, 1);

  // Base position: linear interpolation along the straight line
  drone.position.addScaledVector(drone.velocity, stepDist);

  // Path offset: lateral and vertical deviations
  const offset = getPathOffset(drone, progress);

  // Compute world-space offset position
  const pathOffsetVec = new THREE.Vector3()
    .addScaledVector(drone.pathRight, offset.lateral)
    .addScaledVector(drone.pathUp, offset.vertical);

  // For orientation: compute the movement direction including the curve
  // (derivative of the path offset gives us how the drone is turning)
  const lookAhead = Math.min(progress + 0.02, 1);
  const offsetAhead = getPathOffset(drone, lookAhead);
  const deltaLateral = offsetAhead.lateral - offset.lateral;
  const deltaVertical = offsetAhead.vertical - offset.vertical;

  // Tangent direction = base velocity + curve contribution
  const tangent = drone.velocity.clone()
    .addScaledVector(drone.pathRight, deltaLateral / (0.02 * drone.totalDistance) * drone.speed * 0.02)
    .addScaledVector(drone.pathUp, deltaVertical / (0.02 * drone.totalDistance) * drone.speed * 0.02)
    .normalize();

  // Banking: based on how much lateral offset is changing
  const lateralDelta = offset.lateral - drone.prevLateralOffset;
  drone.prevLateralOffset = offset.lateral;

  // Clamp: never go below ground level (Y=0 is water/sand, keep clearance)
  const MIN_Y = 8;
  const finalPos = drone.position.clone().add(pathOffsetVec);
  finalPos.x += wobbleX;
  finalPos.y += wobbleY;
  if (finalPos.y < MIN_Y) finalPos.y = MIN_Y;

  // Update mesh
  if (drone.mesh) {
    drone.mesh.position.copy(finalPos);

    // Orient along tangent direction
    const forward = tangent;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    const correctedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
    const rotMatrix = new THREE.Matrix4().makeBasis(right, correctedUp, forward);
    drone.mesh.quaternion.setFromRotationMatrix(rotMatrix);

    // Apply bank (roll around forward axis)
    if (drone.bankAmount > 0) {
      const bankAngle = -lateralDelta * drone.bankAmount * 8;
      // Clamp bank to ±35 degrees
      const clampedBank = Math.max(-0.6, Math.min(0.6, bankAngle));
      const bankQuat = new THREE.Quaternion().setFromAxisAngle(forward, clampedBank);
      drone.mesh.quaternion.premultiply(bankQuat);
    }

    // Spin propeller
    if (drone.propeller) {
      drone.propAngle += dt * 150;
      drone.propeller.rotation.y = drone.propAngle;
    }
  }

  // Update hit sphere to actual visual position (clamped)
  drone.hitSphere.center.copy(finalPos);
}

export function damageDrone(drone: DroneData, damage: number): void {
  if (drone.state !== 'alive') return;
  drone.health -= damage;
  if (drone.health <= 0) {
    drone.state = 'dying';
    drone.dyingTimer = 0;
  }
}

export function isDroneBreach(drone: DroneData): boolean {
  return drone.state === 'alive' && drone.position.z >= CONFIG.drone.breachDistance;
}

export function resetDroneIdCounter(): void {
  nextId = 0;
}
