import * as THREE from 'three';
import { DroneData, HitResult } from '../game/types';
import { createDrone, updateDrone, isDroneBreach, resetDroneIdCounter } from './Drone';
import { AssetLoader } from '../assets/AssetLoader';
import { CONFIG } from '../game/config';
import { randRange } from '../utils/math';

export class DroneManager {
  drones: DroneData[] = [];
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  spawnDrone(wave: number, time: number): void {
    const mesh = this.assetLoader.cloneDrone();
    this.scene.add(mesh);

    const dist = CONFIG.drone.spawnDistance;

    // Pick an approach pattern — low skimmers and flankers only in later waves
    let pattern = Math.random();
    // Before wave 4: no low skimmers. Before wave 3: no flankers.
    if (wave < 4 && pattern >= 0.3 && pattern < 0.5) pattern = 0.8; // reroll to standard
    if (wave < 3 && pattern >= 0.5 && pattern < 0.7) pattern = 0.8;

    let spawnX: number, spawnY: number, spawnZ: number;
    let targetX: number, targetY: number;

    if (pattern < 0.3) {
      // HIGH DIVER — comes from high altitude, steep descent
      spawnX = randRange(-120, 120);
      spawnY = randRange(80, 140);
      spawnZ = -dist * randRange(0.6, 1.0);
      targetX = randRange(-8, 8);
      targetY = randRange(2, 5);
    } else if (pattern < 0.5) {
      // LOW SKIMMER — hugs the water, hard to spot (wave 4+)
      spawnX = randRange(-180, 180);
      spawnY = randRange(12, 22);
      spawnZ = -dist * randRange(0.8, 1.0);
      targetX = randRange(-6, 6);
      targetY = randRange(6, 10);
    } else if (pattern < 0.7) {
      // WIDE FLANKER — comes from far left or right (wave 3+)
      const side = Math.random() < 0.5 ? -1 : 1;
      spawnX = side * randRange(150, 280);
      spawnY = randRange(20, 60);
      spawnZ = -dist * randRange(0.4, 0.8);
      targetX = randRange(-5, 5);
      targetY = randRange(4, 8);
    } else {
      // STANDARD — head-on approach with variation
      const angle = randRange(-0.8, 0.8);
      spawnX = Math.sin(angle) * dist + randRange(-80, 80);
      spawnY = randRange(CONFIG.drone.spawnHeight.min, CONFIG.drone.spawnHeight.max);
      spawnZ = -dist;
      targetX = randRange(-10, 10);
      targetY = randRange(5, 10);
    }

    const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);
    const targetPos = new THREE.Vector3(targetX, targetY, 10);

    const drone = createDrone(mesh, spawnPos, targetPos, wave, time);
    this.drones.push(drone);
  }

  update(dt: number, time: number): DroneData[] {
    const breached: DroneData[] = [];

    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];

      if (drone.state === 'alive') {
        updateDrone(drone, dt, time);

        if (isDroneBreach(drone)) {
          drone.state = 'breached';
          breached.push(drone);
          this.removeDrone(i);
        }
      } else if (drone.state === 'dying') {
        drone.dyingTimer += dt;
        if (drone.dyingTimer > 0.1) {
          drone.state = 'dead';
          this.removeDrone(i);
        }
      } else if (drone.state === 'dead') {
        this.removeDrone(i);
      }
    }

    return breached;
  }

  raycast(raycaster: THREE.Raycaster): HitResult | null {
    let closest: HitResult | null = null;
    let minDist = Infinity;

    const ray = raycaster.ray;

    for (const drone of this.drones) {
      if (drone.state !== 'alive') continue;

      const intersectPoint = new THREE.Vector3();
      if (ray.intersectSphere(drone.hitSphere, intersectPoint)) {
        const dist = ray.origin.distanceTo(intersectPoint);
        if (dist < minDist) {
          minDist = dist;
          closest = {
            drone,
            point: intersectPoint.clone(),
            distance: dist,
          };
        }
      }
    }

    return closest;
  }

  activeCount(): number {
    return this.drones.filter(d => d.state === 'alive').length;
  }

  totalCount(): number {
    return this.drones.length;
  }

  private removeDrone(index: number): void {
    const drone = this.drones[index];
    if (drone.mesh) {
      this.scene.remove(drone.mesh);
    }
    this.drones.splice(index, 1);
  }

  clearAll(): void {
    for (const drone of this.drones) {
      if (drone.mesh) {
        this.scene.remove(drone.mesh);
      }
    }
    this.drones.length = 0;
    resetDroneIdCounter();
  }
}
