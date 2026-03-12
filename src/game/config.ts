export const CONFIG = {
  baseHealth: 100,
  breachDamage: 10,

  weapon: {
    fireRate: 16,
    shotDamage: 1,
    range: 3000,
    tracerLifetime: 0.08,
    tracerLength: 20,
    recoilAmount: 0.012,
    recoilRecovery: 8,
  },

  drone: {
    baseHealth: 5,
    baseSpeed: 28,
    spawnDistance: 350,
    spawnHeight: { min: 15, max: 45 },
    spawnSpreadX: 200,
    breachDistance: 10,
    wobbleAmplitudeMin: 0.3,
    wobbleAmplitudeMax: 1.2,
    wobbleFrequencyMin: 1.0,
    wobbleFrequencyMax: 2.2,
    scoreValue: 100,
    modelScale: 8,
    hitSphereRadius: 6,
  },

  waves: {
    baseCount: 5,
    countMultiplier: 2.5,
    initialSpawnInterval: 1.2,
    spawnIntervalDecay: 0.045,
    minSpawnInterval: 0.18,
    speedIncreasePerWave: 1.5,
    interWaveDelay: 2.5,
  },

  camera: {
    fov: 70,
    zoomFov: 35,
    recoilKick: 0.25,
    damageShake: 0.5,
    minPitch: -0.15,
    maxPitch: 0.95,
    sensitivity: 0.002,
    zoomSensitivity: 0.001,
  },

  scoring: {
    killPoints: 100,
    waveBonusMultiplier: 250,
  },

  environment: {
    oceanSize: 2000,
    fogNear: 100,
    fogFar: 800,
    sunPosition: { x: 200, y: 80, z: -300 },
  },
};
