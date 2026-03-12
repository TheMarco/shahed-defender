import * as THREE from 'three';
import { CONFIG } from '../game/config';

export function setupLighting(scene: THREE.Scene): void {
  // Strong orange directional sun light
  const sun = new THREE.DirectionalLight(0xffe0b0, 3.5);
  const sp = CONFIG.environment.sunPosition;
  sun.position.set(sp.x, sp.y, sp.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);

  // Subtle orange-pink fill from the horizon
  const horizonFill = new THREE.DirectionalLight(0xff9966, 1.2);
  horizonFill.position.set(-100, 10, -200);
  scene.add(horizonFill);

  // Slightly stronger ambient
  const ambient = new THREE.AmbientLight(0x667799, 0.8);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffeedd, 0x445566, 0.9);
  scene.add(hemi);
}
