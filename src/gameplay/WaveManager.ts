import { DroneManager } from './DroneManager';
import { CONFIG } from '../game/config';

export class WaveManager {
  currentWave = 1;
  private totalToSpawn = 0;
  private spawnedCount = 0;
  private spawnTimer = 0;
  private active = false;
  private transitionTimer = 0;
  private inTransition = false;

  onWaveStart: ((wave: number) => void) | null = null;
  onWaveClear: ((wave: number) => void) | null = null;

  getWaveDroneCount(wave: number): number {
    return Math.floor(CONFIG.waves.baseCount + wave * CONFIG.waves.countMultiplier);
  }

  getSpawnInterval(wave: number): number {
    return Math.max(
      CONFIG.waves.minSpawnInterval,
      CONFIG.waves.initialSpawnInterval - wave * CONFIG.waves.spawnIntervalDecay
    );
  }

  startWave(wave: number): void {
    this.currentWave = wave;
    this.totalToSpawn = this.getWaveDroneCount(wave);
    this.spawnedCount = 0;
    this.spawnTimer = 0;
    this.active = true;
    this.inTransition = false;
    if (this.onWaveStart) this.onWaveStart(wave);
  }

  update(dt: number, time: number, droneManager: DroneManager): 'playing' | 'wave_clear' | 'transitioning' {
    if (this.inTransition) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this.inTransition = false;
        this.startWave(this.currentWave + 1);
        return 'playing';
      }
      return 'transitioning';
    }

    if (!this.active) return 'playing';

    // Spawn drones
    this.spawnTimer -= dt;
    while (this.spawnedCount < this.totalToSpawn && this.spawnTimer <= 0) {
      droneManager.spawnDrone(this.currentWave, time);
      this.spawnedCount++;
      this.spawnTimer += this.getSpawnInterval(this.currentWave);
    }

    // Check wave clear
    const allSpawned = this.spawnedCount >= this.totalToSpawn;
    const noneActive = droneManager.activeCount() === 0 && droneManager.totalCount() === 0;

    if (allSpawned && noneActive) {
      this.active = false;
      if (this.onWaveClear) this.onWaveClear(this.currentWave);
      this.beginTransition();
      return 'wave_clear';
    }

    return 'playing';
  }

  private beginTransition(): void {
    this.inTransition = true;
    this.transitionTimer = CONFIG.waves.interWaveDelay;
  }

  reset(): void {
    this.currentWave = 1;
    this.totalToSpawn = 0;
    this.spawnedCount = 0;
    this.spawnTimer = 0;
    this.active = false;
    this.inTransition = false;
    this.transitionTimer = 0;
  }
}
