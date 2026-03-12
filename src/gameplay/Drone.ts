import * as THREE from 'three';
import { DroneData, DroneState } from '../game/types';
import { CONFIG } from '../game/config';
import { randRange } from '../utils/math';

let nextId = 0;

export function createDrone(
  mesh: THREE.Object3D,
  spawnPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  wave: number,
  time: number,
): DroneData {
  const dir = targetPos.clone().sub(spawnPos).normalize();
  const speed = CONFIG.drone.baseSpeed + wave * CONFIG.waves.speedIncreasePerWave;

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
  };

  mesh.position.copy(spawnPos);
  mesh.scale.multiplyScalar(CONFIG.drone.modelScale);

  return drone;
}

export function updateDrone(drone: DroneData, dt: number, time: number): void {
  if (drone.state !== 'alive') return;

  const wobbleX = Math.sin(
    time * drone.wobbleFrequency + drone.wobbleOffset
  ) * drone.wobbleAmplitude;

  const wobbleY = Math.cos(
    time * drone.wobbleFrequency * 0.7 + drone.wobbleOffset + 1.5
  ) * drone.wobbleAmplitude * 0.3;

  // Move toward target
  drone.position.x += drone.velocity.x * drone.speed * dt;
  drone.position.y += drone.velocity.y * drone.speed * dt;
  drone.position.z += drone.velocity.z * drone.speed * dt;

  // Update mesh with wobble
  if (drone.mesh) {
    drone.mesh.position.copy(drone.position);
    drone.mesh.position.x += wobbleX;
    drone.mesh.position.y += wobbleY;

    // Orient the drone so its nose (+Z after inner pivot fix) points along velocity.
    // We build a rotation matrix from the velocity direction.
    const forward = drone.velocity.clone().normalize();
    // Build a proper orientation: forward is +Z, up is world +Y
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    // Recompute up to be orthogonal
    const correctedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
    const rotMatrix = new THREE.Matrix4().makeBasis(right, correctedUp, forward);
    drone.mesh.quaternion.setFromRotationMatrix(rotMatrix);

    // Spin propeller around its local Y axis (the shaft in OBJ space)
    if (drone.propeller) {
      drone.propAngle += dt * 150;
      drone.propeller.rotation.y = drone.propAngle;
    }
  }

  // Update hit sphere
  drone.hitSphere.center.copy(drone.position);
  drone.hitSphere.center.x += wobbleX;
  drone.hitSphere.center.y += wobbleY;
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
