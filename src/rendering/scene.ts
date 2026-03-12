import * as THREE from 'three';
import { CONFIG } from '../game/config';

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a0a04);
  scene.fog = new THREE.Fog(0x443322, CONFIG.environment.fogNear, CONFIG.environment.fogFar);
  return scene;
}
