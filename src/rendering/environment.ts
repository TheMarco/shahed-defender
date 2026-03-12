import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

import { CONFIG } from '../game/config';

export function createEnvironment(scene: THREE.Scene): void {
  createSky(scene);
  createOcean(scene);
  createShip(scene);
  createBeachhead(scene);
  createTurretNest(scene);
  createSkyline(scene);
  createPalmTrees(scene);
  createBeachDebris(scene);
  // createGroundHaze(scene);
}

// ============================================================
// SKY
// ============================================================

function createSky(scene: THREE.Scene): void {
  const skyGeo = new THREE.SphereGeometry(900, 64, 64);
  const skyTex = new THREE.TextureLoader().load('textures/sky.jpg');
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x0a0e2a) },
      midColor: { value: new THREE.Color(0x1a0a30) },
      horizonColor: { value: new THREE.Color(0xff6622) },
      sunGlowColor: { value: new THREE.Color(0xffcc44) },
      sunDirection: { value: new THREE.Vector3(0.5, 0.15, -0.8).normalize() },
      uSkyTex: { value: skyTex },
    },
    vertexShader: `
      varying vec3 vDirection;
      varying vec2 vUv;
      void main() {
        vDirection = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunGlowColor, sunDirection;
      uniform sampler2D uSkyTex;
      varying vec3 vDirection;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2d(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 dir = normalize(vDirection);
        float h = dir.y;

        vec3 color;
        if (h < 0.0) {
          color = horizonColor * 0.3;
        } else if (h < 0.15) {
          float t = h / 0.15;
          color = mix(horizonColor, mix(horizonColor, vec3(0.8, 0.2, 0.15), 0.5), t);
        } else if (h < 0.3) {
          float t = (h - 0.15) / 0.15;
          vec3 pinkBand = vec3(0.6, 0.15, 0.3);
          color = mix(mix(horizonColor, vec3(0.8, 0.2, 0.15), 0.5), pinkBand, t);
        } else if (h < 0.55) {
          float t = (h - 0.3) / 0.25;
          vec3 pinkBand = vec3(0.6, 0.15, 0.3);
          color = mix(pinkBand, midColor, t);
        } else if (h < 0.8) {
          float t = (h - 0.55) / 0.25;
          color = mix(midColor, mix(midColor, topColor, 0.5), t);
        } else {
          float t = (h - 0.8) / 0.2;
          color = mix(mix(midColor, topColor, 0.5), topColor, t);
        }

        // Sun disc and glow
        float sunDot = max(dot(dir, sunDirection), 0.0);
        float sunDisc = smoothstep(0.997, 0.999, sunDot);
        float sunGlow = pow(sunDot, 8.0) * 0.6;
        float sunHalo = pow(sunDot, 3.0) * 0.2;
        color += sunGlowColor * sunDisc * 3.0;
        color += sunGlowColor * sunGlow;
        color += horizonColor * sunHalo;

        // Cloud wisps near horizon
        if (h > 0.02 && h < 0.35) {
          float cloudNoise = noise2d(dir.xz * 8.0) * 0.5
                           + noise2d(dir.xz * 16.0) * 0.25
                           + noise2d(dir.xz * 32.0) * 0.125;
          float cloudMask = smoothstep(0.45, 0.7, cloudNoise);
          cloudMask *= smoothstep(0.02, 0.08, h) * smoothstep(0.35, 0.15, h);
          vec3 cloudColor = mix(vec3(0.9, 0.5, 0.3), vec3(0.4, 0.15, 0.2), h / 0.35);
          color = mix(color, cloudColor, cloudMask * 0.5);
        }

        // Stars from texture at high elevation, blended additively
        if (h > 0.3) {
          vec3 starTex = texture2D(uSkyTex, vUv).rgb;
          float starBlend = smoothstep(0.3, 0.6, h);
          color += starTex * starBlend * 1.5;
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ============================================================
// OCEAN
// ============================================================

function createOcean(scene: THREE.Scene): void {
  const size = CONFIG.environment.oceanSize;
  const geo = new THREE.PlaneGeometry(size, size, 256, 256);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.3, -0.8).normalize() },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
      uWaterDeep: { value: new THREE.Color(0x1a4a6b) },
      uWaterShallow: { value: new THREE.Color(0x3a8a9e) },
      uFoamColor: { value: new THREE.Color(0xeeffff) },
      fogColor: { value: new THREE.Color(0x443322) },
      fogNear: { value: CONFIG.environment.fogNear },
      fogFar: { value: CONFIG.environment.fogFar },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vElevation;
      void main() {
        vec3 pos = position;
        float wave1 = sin(pos.x * 0.03 + uTime * 0.8) * 1.2;
        float wave2 = sin(pos.y * 0.05 + uTime * 0.6) * 0.8;
        float wave3 = sin(pos.x * 0.08 - pos.y * 0.06 + uTime * 1.2) * 0.4;
        float wave4 = sin(pos.x * 0.15 + pos.y * 0.12 + uTime * 1.8) * 0.2;
        float elevation = wave1 + wave2 + wave3 + wave4;
        pos.z = elevation;
        vElevation = elevation;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        float eps = 0.5;
        float hx = sin((position.x + eps) * 0.03 + uTime * 0.8) * 1.2
                  + sin((position.x + eps) * 0.08 - position.y * 0.06 + uTime * 1.2) * 0.4;
        float hy = sin(position.x * 0.03 + uTime * 0.8) * 1.2
                  + sin((position.y + eps) * 0.05 + uTime * 0.6) * 0.8;
        vNormal = normalize(vec3(elevation - hx, eps, elevation - hy));
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection, uSunColor, uWaterDeep, uWaterShallow, uFoamColor, fogColor;
      uniform float fogNear, fogFar;
      varying vec3 vWorldPosition, vNormal;
      varying float vElevation;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 normal = normalize(vNormal);
        float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        vec3 waterColor = mix(uWaterDeep, uWaterShallow, fresnel * 0.6 + 0.2);
        vec3 halfDir = normalize(uSunDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 256.0);
        vec3 specular = uSunColor * spec * 2.0;
        float foam = smoothstep(1.5, 2.2, vElevation);
        waterColor = mix(waterColor, uFoamColor, foam * 0.4);
        float sunReflect = pow(max(dot(reflect(-uSunDirection, normal), viewDir), 0.0), 64.0);
        waterColor += uSunColor * sunReflect * 0.5;
        vec3 finalColor = waterColor + specular;
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep(fogNear, fogFar, depth);
        finalColor = mix(finalColor, fogColor, fogFactor);
        gl_FragColor = vec4(finalColor, 0.9);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const ocean = new THREE.Mesh(geo, mat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.5, -size * 0.45); // Push ocean forward (negative Z), away from the city behind
  scene.add(ocean);
  (scene as any)._ocean = ocean;
}

// ============================================================
// CARGO SHIP — loaded OBJ model on the ocean horizon
// ============================================================

function createShip(scene: THREE.Scene): void {
  const mtlLoader = new MTLLoader();
  mtlLoader.setPath('models/ship/');
  mtlLoader.load('Cargo Ship.mtl', (materials) => {
    materials.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath('models/ship/');
    objLoader.load('Cargo Ship.obj', (obj) => {
      addShipToScene(scene, obj);
    });
  }, undefined, () => {
    // MTL failed — try OBJ alone with default materials
    const objLoader = new OBJLoader();
    objLoader.setPath('models/ship/');
    objLoader.load('Cargo Ship.obj', (obj) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 0.7, metalness: 0.3,
          });
        }
      });
      addShipToScene(scene, obj);
    });
  });
}

function addShipToScene(scene: THREE.Scene, obj: THREE.Object3D): void {
  const ship = new THREE.Group();

  // Center horizontally but align bottom of hull near the waterline
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // Shift so the bottom of the bounding box is at Y=0, then lower slightly for waterline
  obj.position.set(-center.x, -box.min.y - size.y * 0.15, -center.z);
  ship.add(obj);

  // The OBJ model is ~220 units long (Z), ~57 tall (Y), ~35 wide (X).
  // The old procedural ship was ~43 units long at scale 3 = ~129 world units.
  // Scale the OBJ to roughly match: 0.6 gives ~132 unit length.
  ship.scale.setScalar(0.6);

  // Rotate 90° so the length runs sideways (side profile visible)
  ship.rotation.y = Math.PI / 2;

  // Position on the ocean horizon
  ship.position.set(-80, -1.5, -500);

  // Store base Y and phase for bobbing animation
  ship.userData.baseY = ship.position.y;
  ship.userData.bobPhase = Math.random() * Math.PI * 2;

  scene.add(ship);
  (scene as any)._ship = ship;
}

// ============================================================
// BEACH with enhanced sand shader
// ============================================================

function createBeachhead(scene: THREE.Scene): void {
  const beachGeo = new THREE.PlaneGeometry(800, 400, 200, 100);

  const sandTex = new THREE.TextureLoader().load('textures/sand.png');
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;

  const beachMat = new THREE.ShaderMaterial({
    uniforms: {
      uSandTex: { value: sandTex },
      uWetSand: { value: new THREE.Color(0x7a6a45) },
      fogColor: { value: new THREE.Color(0x443322) },
      fogNear: { value: CONFIG.environment.fogNear },
      fogFar: { value: CONFIG.environment.fogFar },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec2 vTexCoord;
      varying float vHeight;
      varying float vDistFromWater;
      void main() {
        vec3 pos = position;
        float inland = pos.y;
        float baseHeight = smoothstep(-5.0, 10.0, inland) * 3.0;
        float dunes = sin(pos.x * 0.04 + 0.7) * cos(inland * 0.06 + 0.3) * 2.5
                    + sin(pos.x * 0.09 + inland * 0.05) * 1.0;
        dunes *= smoothstep(15.0, 60.0, inland);
        pos.z = baseHeight + dunes;
        vHeight = pos.z;
        vDistFromWater = inland;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        // Tile the sand texture across the beach
        vTexCoord = vWorldPosition.xz * 0.15;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uSandTex;
      uniform vec3 uWetSand, fogColor;
      uniform float fogNear, fogFar;
      varying vec3 vWorldPosition;
      varying vec2 vTexCoord;
      varying float vHeight, vDistFromWater;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        // Sample the sand texture — blend two scales to reduce tiling
        vec3 tex1 = texture2D(uSandTex, vTexCoord).rgb;
        vec3 tex2 = texture2D(uSandTex, vTexCoord * 0.31 + 0.5).rgb;
        vec3 sandColor = mix(tex1, tex2, 0.25);

        // Darken near waterline for wet sand
        float wetness = 1.0 - smoothstep(-2.0, 12.0, vDistFromWater);
        sandColor *= mix(1.0, 0.55, wetness);

        // Ripple marks near waterline
        float ripple = sin(vWorldPosition.x * 2.5 + vDistFromWater * 1.2) * 0.5 + 0.5;
        ripple *= smoothstep(15.0, 2.0, vDistFromWater) * smoothstep(-3.0, 0.0, vDistFromWater);
        sandColor -= ripple * 0.04;

        // Tidal lines — thin dark bands
        float tidal1 = 1.0 - smoothstep(0.0, 0.3, abs(vDistFromWater - 3.0));
        float tidal2 = 1.0 - smoothstep(0.0, 0.2, abs(vDistFromWater - 6.5));
        sandColor -= (tidal1 + tidal2) * 0.035;

        // Shell / pebble specks
        float specks = step(0.97, hash(floor(vWorldPosition.xz * 5.0)));
        sandColor += specks * vec3(0.12, 0.10, 0.06);

        // Dark patches (kelp/seaweed stains)
        float patches = noise(vWorldPosition.xz * 0.3);
        patches = smoothstep(0.55, 0.65, patches) * smoothstep(20.0, 5.0, vDistFromWater);
        sandColor -= patches * 0.06;

        // Fog
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = smoothstep(fogNear, fogFar, depth);
        sandColor = mix(sandColor, fogColor, fogFactor);

        gl_FragColor = vec4(sandColor, 1.0);
      }
    `,
  });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.5, 195);
  scene.add(beach);

  // Shoreline foam
  const foamGeo = new THREE.PlaneGeometry(600, 8, 300, 1);
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xddeeff, transparent: true, opacity: 0.2, depthWrite: false,
  });
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.12, -2);
  scene.add(foam);
}

// ============================================================
// TURRET NEST
// ============================================================

function createTurretNest(scene: THREE.Scene): void {
  const tz = 12;
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8b7d5b, roughness: 1.0, metalness: 0.0 });
  const bagHeight = 0.45;
  const wallRadius = 3.5;
  const rows = 4;

  for (let row = 0; row < rows; row++) {
    const numBags = 7 + row;
    const arcStart = -Math.PI * 0.5;
    const arcEnd = Math.PI * 0.5;
    const stagger = row % 2 === 0 ? 0 : (arcEnd - arcStart) / numBags * 0.5;
    for (let i = 0; i < numBags; i++) {
      const t = i / (numBags - 1);
      const angle = arcStart + t * (arcEnd - arcStart) + stagger;
      const r = wallRadius + row * 0.2;
      const bagGeo = new THREE.BoxGeometry(
        1.3 * (0.85 + Math.random() * 0.3),
        bagHeight * (0.8 + Math.random() * 0.4),
        0.7 * (0.85 + Math.random() * 0.3)
      );
      const bag = new THREE.Mesh(bagGeo, sandbagMat);
      bag.position.set(Math.sin(angle) * r, row * bagHeight + bagHeight * 0.5, -Math.cos(angle) * r + tz);
      bag.rotation.set((Math.random() - 0.5) * 0.06, angle + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.04);
      scene.add(bag);
    }
  }

  const platformGeo = new THREE.CylinderGeometry(2.2, 2.8, 0.3, 16);
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x606058, roughness: 0.95, metalness: 0.05 });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, 0.15, tz);
  scene.add(platform);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.85, metalness: 0.1 });
  const crateData = [
    { x: 4.2, z: tz + 0.5, w: 0.9, h: 0.6, d: 1.1, ry: 0.15 },
    { x: 4.5, z: tz + 1.3, w: 0.7, h: 0.5, d: 0.8, ry: -0.1 },
    { x: -4.3, z: tz + 0.3, w: 1.0, h: 0.55, d: 1.0, ry: -0.2 },
    { x: -4.0, z: tz + 1.1, w: 0.6, h: 0.45, d: 0.7, ry: 0.05 },
  ];
  for (const c of crateData) {
    const geo = new THREE.BoxGeometry(c.w, c.h, c.d);
    const crate = new THREE.Mesh(geo, crateMat);
    crate.position.set(c.x, c.h * 0.5, c.z);
    crate.rotation.y = c.ry;
    scene.add(crate);
  }
}

// ============================================================
// LA SKYLINE — mountains, suburban sprawl, downtown, haze layers
// ============================================================

function createSkyline(scene: THREE.Scene): void {
  const seed = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };


  // --- Downtown skyline (z=400) — main buildings ---
  const skylineZ = 400;
  const skylineWidth = 800;
  const buildingCount = 75;

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = []; // per-vertex building color ID
  const indices: number[] = [];
  let vertIdx = 0;

  for (let i = 0; i < buildingCount; i++) {
    const t = i / buildingCount;
    const x = (t - 0.5) * skylineWidth;
    const w = 5 + seed(i * 3.7) * 18;
    let h = 10 + seed(i * 7.3) * 55;

    // Downtown cluster in center
    const centerDist = Math.abs(t - 0.5) * 2;
    h *= 1.0 - centerDist * 0.55;

    // Landmark towers (LA skyline iconic shapes)
    if (i === 35) h = 95;  // US Bank Tower
    if (i === 37) h = 82;  // Wilshire Grand (tallest, slight offset)
    if (i === 33) h = 75;  // Aon Center
    if (i === 31) h = 68;  // Gas Company Tower
    if (i === 39) h = 60;
    if (i === 29) h = 55;

    const x0 = x - w * 0.5;
    const x1 = x + w * 0.5;

    positions.push(x0, -10, skylineZ, x1, -10, skylineZ, x1, h, skylineZ, x0, h, skylineZ);
    uvs.push(0, 0, w / 10, 0, w / 10, h / 10, 0, h / 10);
    // Encode building ID in color attribute for shader
    const bid = seed(i * 13.7);
    colors.push(bid, bid, bid, bid);
    indices.push(vertIdx, vertIdx + 1, vertIdx + 2, vertIdx, vertIdx + 2, vertIdx + 3);
    vertIdx += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('buildingId', new THREE.Float32BufferAttribute(colors, 1));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float buildingId;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vBuildingId;
      void main() {
        vUv = uv;
        vBuildingId = buildingId;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vBuildingId;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // Building facade color varies per building
        float bid = vBuildingId;

        // Varied building materials — darker silhouettes at dusk
        vec3 glass = vec3(0.10, 0.13, 0.18);
        vec3 concrete = vec3(0.18, 0.16, 0.14);
        vec3 darkSteel = vec3(0.06, 0.05, 0.07);
        vec3 warmBrick = vec3(0.16, 0.10, 0.08);

        vec3 buildingColor;
        if (bid < 0.3) {
          buildingColor = mix(glass, concrete, bid / 0.3);
        } else if (bid < 0.55) {
          buildingColor = mix(concrete, warmBrick, (bid - 0.3) / 0.25);
        } else if (bid < 0.75) {
          buildingColor = mix(darkSteel, glass, (bid - 0.55) / 0.2);
        } else {
          buildingColor = mix(warmBrick, darkSteel, (bid - 0.75) / 0.25);
        }

        // Subtle sunset light on one side
        float sunSide = smoothstep(0.4, 0.7, vUv.x);
        buildingColor += vec3(0.06, 0.03, 0.01) * sunSide * smoothstep(0.3, 0.8, vUv.y);

        // Faint glass reflection on upper floors of glass buildings
        if (bid < 0.3) {
          float glassReflect = smoothstep(0.6, 0.95, vUv.y) * 0.08;
          buildingColor += vec3(0.2, 0.15, 0.1) * glassReflect;
        }

        // Window grid
        vec2 windowGrid = fract(vUv * vec2(5.0, 8.0));
        float windowMask = step(0.2, windowGrid.x) * (1.0 - step(0.8, windowGrid.x))
                         * step(0.15, windowGrid.y) * (1.0 - step(0.85, windowGrid.y));

        vec2 windowId = floor(vUv * vec2(5.0, 8.0));
        float lit = step(0.45, hash(windowId * 17.31 + bid * 100.0)); // ~55% of windows lit

        // Window colors — bright against dark facades
        vec3 warmLight = vec3(1.0, 0.85, 0.5);
        vec3 coolLight = vec3(0.6, 0.8, 1.0);
        vec3 orangeLight = vec3(1.0, 0.6, 0.2);
        float colorChoice = hash(windowId * 29.7 + bid * 50.0);
        vec3 windowColor = colorChoice < 0.5 ? warmLight : (colorChoice < 0.8 ? coolLight : orangeLight);
        windowColor *= 0.4 * windowMask * lit;
        windowColor *= smoothstep(0.0, 0.2, vUv.y); // ground floors darker

        // Aircraft warning lights
        float blink = step(0.5, sin(uTime * 3.0 + bid * 6.28)) * 0.5 + 0.5;
        float isTop = step(0.93, vUv.y) * step(0.45, vUv.x) * (1.0 - step(0.55, vUv.x));
        vec3 redLight = vec3(1.0, 0.1, 0.05) * isTop * blink * 0.5;

        vec3 finalColor = buildingColor + windowColor + redLight;

        // Atmospheric perspective — darker dusk haze
        finalColor = mix(finalColor, vec3(0.15, 0.12, 0.12), 0.08);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });

  const skyline = new THREE.Mesh(geo, mat);
  scene.add(skyline);
  (scene as any)._skyline = skyline;

  // --- LAYER 4: Foreground low-rise buildings (z=350) ---
  const fgPositions: number[] = [];
  const fgUvs: number[] = [];
  const fgIds: number[] = [];
  const fgIndices: number[] = [];
  let fgVert = 0;
  const fgZ = 350;

  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const x = (t - 0.5) * 700;
    const w = 4 + seed(i * 5.1) * 10;
    let h = 4 + seed(i * 9.3) * 12;
    // Skip the center to not block downtown view
    const cDist = Math.abs(t - 0.5) * 2;
    if (cDist < 0.3) h *= cDist / 0.3;

    fgPositions.push(x - w * 0.5, -10, fgZ, x + w * 0.5, -10, fgZ, x + w * 0.5, h, fgZ, x - w * 0.5, h, fgZ);
    fgUvs.push(0, 0, w / 8, 0, w / 8, h / 8, 0, h / 8);
    const fid = seed(i * 17.3);
    fgIds.push(fid, fid, fid, fid);
    fgIndices.push(fgVert, fgVert + 1, fgVert + 2, fgVert, fgVert + 2, fgVert + 3);
    fgVert += 4;
  }

  const fgGeo = new THREE.BufferGeometry();
  fgGeo.setAttribute('position', new THREE.Float32BufferAttribute(fgPositions, 3));
  fgGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fgUvs, 2));
  fgGeo.setAttribute('buildingId', new THREE.Float32BufferAttribute(fgIds, 1));
  fgGeo.setIndex(fgIndices);

  const fgMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float buildingId;
      varying vec2 vUv;
      varying float vBuildingId;
      void main() {
        vUv = uv;
        vBuildingId = buildingId;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vBuildingId;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float bid = vBuildingId;
        // Low-rise: darker at dusk
        vec3 stucco = vec3(0.22, 0.20, 0.18);
        vec3 brick = vec3(0.20, 0.12, 0.10);
        vec3 painted = vec3(0.24, 0.22, 0.20);
        vec3 buildingColor = bid < 0.33 ? stucco : (bid < 0.66 ? brick : painted);
        buildingColor += (hash(vec2(bid * 100.0, 0.0)) - 0.5) * 0.04;

        // Windows — some lit
        vec2 wg = fract(vUv * vec2(4.0, 6.0));
        float wm = step(0.25, wg.x) * (1.0 - step(0.75, wg.x))
                  * step(0.2, wg.y) * (1.0 - step(0.8, wg.y));
        vec2 wid = floor(vUv * vec2(4.0, 6.0));
        float lit = step(0.55, hash(wid * 13.3 + bid * 80.0));
        vec3 wc = vec3(1.0, 0.8, 0.45) * 0.3 * wm * lit;

        vec3 finalColor = buildingColor + wc;
        // Dark dusk haze
        finalColor = mix(finalColor, vec3(0.12, 0.10, 0.10), 0.06);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });

  const fgBuildings = new THREE.Mesh(fgGeo, fgMat);
  scene.add(fgBuildings);
  (scene as any)._fgBuildings = fgBuildings;

}


// ============================================================
// PALM TREES — procedural trunks + fronds with wind sway
// ============================================================

function createPalmTrees(scene: THREE.Scene): void {
  const treeCount = 28;
  const treeGroup = new THREE.Group();
  scene.add(treeGroup);
  (scene as any)._palmTrees = treeGroup;

  const rng = (i: number, offset: number) => {
    const s = Math.sin(i * 127.1 + offset * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // Camera at (0, 8, 12) looking toward -Z (sea).
  // Trees visible to the sides and behind.
  // Hardcode a few nearby trees we know should be visible
  // Camera at (0,8,12). Trees must NOT be at z≈12 or they're at the camera.
  // Nearby = z=25-50 (visible looking inland) and z=-5 to 5 (visible looking at ocean)
  const placements: { x: number; z: number; height: number; rotY: number }[] = [
    // Trees well behind the player
    { x: -10, z: 55, height: 16, rotY: 0.5 },
    { x: 12, z: 60, height: 18, rotY: 1.2 },
    { x: -18, z: 70, height: 14, rotY: 2.0 },
    { x: 20, z: 65, height: 17, rotY: 3.5 },
    { x: -8, z: 75, height: 16, rotY: 4.1 },
    { x: 15, z: 80, height: 18, rotY: 5.0 },
    { x: -25, z: 50, height: 14, rotY: 0.8 },
    { x: 22, z: 55, height: 17, rotY: 2.5 },
    { x: -14, z: 85, height: 13, rotY: 1.5 },
    { x: 28, z: 48, height: 16, rotY: 4.0 },
  ];
  for (let i = 0; i < treeCount; i++) {
    const x = (rng(i, 1) - 0.5) * 300;
    const z = 20 + rng(i, 2) * 100;
    if (Math.abs(x) < 20) continue;
    if (z < 45) continue; // keep all trees well behind the player
    const height = 10 + rng(i, 3) * 8;
    const rotY = rng(i, 5) * Math.PI * 2;
    placements.push({ x, z, height, rotY });
  }

  const mtlLoader = new MTLLoader();
  mtlLoader.setPath('models/palmtree/');
  mtlLoader.load('Date Palm.mtl', (materials) => {
    materials.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath('models/palmtree/');
    objLoader.load('Date Palm.obj', (obj) => {
      tintPalmLeaves(obj);
      placePalmTrees(obj, placements, treeGroup);
    });
  }, undefined, () => {
    // MTL failed — load OBJ alone
    const objLoader = new OBJLoader();
    objLoader.setPath('models/palmtree/');
    objLoader.load('Date Palm.obj', (obj) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x5c4033, roughness: 0.8,
          });
        }
      });
      tintPalmLeaves(obj);
      placePalmTrees(obj, placements, treeGroup);
    });
  });
}

function tintPalmLeaves(obj: THREE.Object3D): void {
  // The model uses one material for everything. Clone it and tint green for leaves.
  // Since we can't distinguish trunk from leaves by material, we tint the whole
  // model with a green color multiply — the trunk texture will stay brownish,
  // lighter parts (leaves) will go green.
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshPhongMaterial;
      if (mat && mat.color) {
        mat.color.setHex(0x4a7a3a); // green tint
      }
    }
  });
}

function placePalmTrees(
  obj: THREE.Object3D,
  placements: { x: number; z: number; height: number; rotY: number }[],
  treeGroup: THREE.Group,
): void {
  // Measure raw model
  obj.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(obj);
  const rawSize = rawBox.getSize(new THREE.Vector3());

  // Find tallest axis — that's the trunk
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);

  // Build a template: inner group with rotation to stand upright, centered
  const inner = new THREE.Group();
  inner.add(obj);

  if (rawSize.z >= rawSize.y && rawSize.z >= rawSize.x) {
    obj.rotation.x = -Math.PI / 2; // Z was tallest, rotate to Y-up
  } else if (rawSize.x >= rawSize.y && rawSize.x >= rawSize.z) {
    obj.rotation.z = Math.PI / 2; // X was tallest
  }

  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const center = box.getCenter(new THREE.Vector3());
  // Shift so base is at origin
  inner.position.set(-center.x, -box.min.y, -center.z);

  const modelHeight = box.getSize(new THREE.Vector3()).y;
  console.log('Palm model height after rotation:', modelHeight.toFixed(1));

  for (const p of placements) {
    // Outer wrapper per tree — handles position, scale, Y rotation
    const wrapper = new THREE.Group();
    const tree = inner.clone();
    wrapper.add(tree);
    const s = p.height / modelHeight;
    wrapper.scale.setScalar(s);
    wrapper.position.set(p.x, 0, p.z);
    wrapper.rotation.y = p.rotY;
    treeGroup.add(wrapper);
  }

  console.log('Placed', placements.length, 'palm trees');
}

// ============================================================
// BEACH DEBRIS — driftwood, rocks, barriers
// ============================================================

function createBeachDebris(scene: THREE.Scene): void {
  const debrisGroup = new THREE.Group();

  const driftwoodMat = new THREE.MeshStandardMaterial({ color: 0x8a7e6b, roughness: 0.95, metalness: 0.0 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85, metalness: 0.1 });

  const rng = (i: number) => {
    const s = Math.sin(i * 97.3 + 271.5) * 43758.5453;
    return s - Math.floor(s);
  };

  // Driftwood pieces
  const driftwoodData = [
    { x: -15, z: 6, len: 3.5, ry: 0.3 },
    { x: 22, z: 8, len: 2.8, ry: -0.6 },
    { x: -35, z: 15, len: 4.2, ry: 1.2 },
    { x: 40, z: 20, len: 2.0, ry: 0.8 },
    { x: -8, z: 30, len: 3.0, ry: -0.2 },
    { x: 55, z: 35, len: 2.5, ry: 1.5 },
    { x: -50, z: 25, len: 3.8, ry: 0.9 },
  ];
  for (const dw of driftwoodData) {
    const geo = new THREE.CylinderGeometry(0.08, 0.12, dw.len, 5);
    const mesh = new THREE.Mesh(geo, driftwoodMat);
    mesh.position.set(dw.x, 0.1, dw.z);
    mesh.rotation.set(0.05, dw.ry, Math.PI / 2 - 0.1);
    debrisGroup.add(mesh);
  }

  // Rocks near waterline
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.IcosahedronGeometry(0.3 + rng(i) * 0.5, 1);
    // Deform vertices for organic look
    const posArr = geo.attributes.position;
    for (let v = 0; v < posArr.count; v++) {
      const nx = posArr.getX(v);
      const ny = posArr.getY(v);
      const nz = posArr.getZ(v);
      const displacement = 1 + (rng(i * 100 + v) - 0.5) * 0.4;
      posArr.setXYZ(v, nx * displacement, ny * displacement * 0.6, nz * displacement);
    }
    posArr.needsUpdate = true;
    geo.computeVertexNormals();

    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(
      (rng(i * 2) - 0.5) * 120,
      0.1,
      -2 + rng(i * 3) * 10
    );
    rock.rotation.set(rng(i * 4) * 0.5, rng(i * 5) * Math.PI, rng(i * 6) * 0.3);
    debrisGroup.add(rock);
  }

  // Military barriers (czech hedgehogs / tank traps)
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.5 });
  const barrierPositions = [
    { x: -12, z: 5 }, { x: 14, z: 6 }, { x: -25, z: 3 }, { x: 30, z: 4 },
    { x: -40, z: 7 }, { x: 45, z: 5 },
  ];
  for (const bp of barrierPositions) {
    const barrier = createCzechHedgehog(barrierMat);
    barrier.position.set(bp.x, 0.8, bp.z);
    barrier.rotation.y = rng(bp.x * 7) * Math.PI;
    barrier.scale.setScalar(0.7 + rng(bp.x * 11) * 0.3);
    debrisGroup.add(barrier);
  }

  scene.add(debrisGroup);
}

function createCzechHedgehog(mat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.5, 4);
  // 3 crossed beams
  const angles = [
    { rx: 0, rz: Math.PI / 4 },
    { rx: Math.PI / 4, rz: 0 },
    { rx: 0, rz: -Math.PI / 4 },
  ];
  for (const a of angles) {
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.rotation.set(a.rx, 0, a.rz);
    group.add(beam);
  }
  return group;
}

// ============================================================
// GOD RAYS — billboard light shafts from the sun
// ============================================================

function createGodRays(scene: THREE.Scene): void {
  const sunDir = new THREE.Vector3(0.5, 0.15, -0.8).normalize();
  const sunPos = sunDir.clone().multiplyScalar(500);
  const rays: THREE.Mesh[] = [];

  const rayMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.04 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uOpacity;
      varying vec2 vUv;
      void main() {
        // Fade at edges
        float edgeFade = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float vertFade = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float alpha = edgeFade * vertFade * uOpacity;
        // Subtle pulse
        alpha *= 0.8 + sin(uTime * 0.4 + vUv.y * 3.0) * 0.2;
        vec3 color = vec3(1.0, 0.85, 0.5);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 5; i++) {
    const width = 15 + Math.random() * 25;
    const height = 200 + Math.random() * 100;
    const rayGeo = new THREE.PlaneGeometry(width, height);
    const ray = new THREE.Mesh(rayGeo, rayMat.clone());

    // Position along sun direction with spread
    const offset = (i - 2) * 40;
    ray.position.set(
      sunPos.x + offset * 0.5,
      height * 0.3,
      sunPos.z + offset * 0.3
    );
    ray.lookAt(0, 0, 0);
    ray.rotation.z += (Math.random() - 0.5) * 0.2;

    scene.add(ray);
    rays.push(ray);
  }

  (scene as any)._godRays = rays;
}

// ============================================================
// GROUND HAZE — atmospheric layer over sand
// ============================================================

function createGroundHaze(scene: THREE.Scene): void {
  const hazeGeo = new THREE.PlaneGeometry(800, 800);
  const hazeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        float dist = length(vWorldPos.xz - vec2(0.0, 12.0));
        // Fade with distance from camera
        float distFade = smoothstep(10.0, 200.0, dist) * smoothstep(500.0, 200.0, dist);

        // Animated noise
        float n = noise(vWorldPos.xz * 0.02 + uTime * 0.1);
        n += noise(vWorldPos.xz * 0.05 - uTime * 0.05) * 0.5;
        float alpha = distFade * n * 0.06;

        vec3 hazeColor = vec3(0.9, 0.7, 0.5);
        gl_FragColor = vec4(hazeColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.rotation.x = -Math.PI / 2;
  haze.position.set(0, 2.0, 50);
  scene.add(haze);
  (scene as any)._haze = haze;
}

// ============================================================
// MINIGUN (exported for turret)
// ============================================================

export function createMinigun(): THREE.Group {
  const gun = new THREE.Group();

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.35, metalness: 0.9 });
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.85 });
  const warmMetal = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 0.5, metalness: 0.7 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.5 });

  const barrelCluster = new THREE.Group();
  barrelCluster.name = 'barrel_cluster';
  const numBarrels = 6;
  const barrelRadius = 0.025;
  const clusterRadius = 0.06;
  const barrelLength = 1.4;

  for (let i = 0; i < numBarrels; i++) {
    const angle = (i / numBarrels) * Math.PI * 2;
    const bx = Math.cos(angle) * clusterRadius;
    const by = Math.sin(angle) * clusterRadius;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLength, 8);
    const barrel = new THREE.Mesh(barrelGeo, darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(bx, by, -barrelLength / 2);
    barrelCluster.add(barrel);
    const muzzleGeo = new THREE.CylinderGeometry(barrelRadius * 1.3, barrelRadius * 1.3, 0.03, 8);
    const muzzle = new THREE.Mesh(muzzleGeo, gunMetal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(bx, by, -barrelLength - 0.01);
    barrelCluster.add(muzzle);
  }

  const spindleGeo = new THREE.CylinderGeometry(0.015, 0.015, barrelLength + 0.3, 8);
  const spindle = new THREE.Mesh(spindleGeo, gunMetal);
  spindle.rotation.x = Math.PI / 2;
  spindle.position.set(0, 0, -barrelLength / 2 - 0.1);
  barrelCluster.add(spindle);

  const frontClampGeo = new THREE.TorusGeometry(clusterRadius + barrelRadius, 0.012, 8, numBarrels * 2);
  const frontClamp = new THREE.Mesh(frontClampGeo, gunMetal);
  frontClamp.position.set(0, 0, -barrelLength * 0.85);
  barrelCluster.add(frontClamp);
  const rearClamp = new THREE.Mesh(frontClampGeo.clone(), gunMetal);
  rearClamp.position.set(0, 0, -0.15);
  barrelCluster.add(rearClamp);

  barrelCluster.position.set(0, 0, -0.2);
  gun.add(barrelCluster);

  const receiverGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 12);
  const receiver = new THREE.Mesh(receiverGeo, warmMetal);
  receiver.rotation.x = Math.PI / 2;
  receiver.position.set(0, 0, 0);
  gun.add(receiver);

  const motorGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.25, 12);
  const motor = new THREE.Mesh(motorGeo, blackMat);
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0, 0, 0.3);
  gun.add(motor);

  const railGeo = new THREE.BoxGeometry(0.03, 0.025, 0.5);
  const rail = new THREE.Mesh(railGeo, gunMetal);
  rail.position.set(0, 0.11, -0.05);
  gun.add(rail);

  const gripGeo = new THREE.BoxGeometry(0.04, 0.15, 0.06);
  const grip = new THREE.Mesh(gripGeo, blackMat);
  grip.position.set(0, -0.14, 0.2);
  grip.rotation.x = 0.2;
  gun.add(grip);

  const spadeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.13, 6);
  const spadeL = new THREE.Mesh(spadeGeo, blackMat);
  spadeL.position.set(-0.1, -0.12, 0.3);
  spadeL.rotation.z = -0.4;
  gun.add(spadeL);
  const spadeR = new THREE.Mesh(spadeGeo.clone(), blackMat);
  spadeR.position.set(0.1, -0.12, 0.3);
  spadeR.rotation.z = 0.4;
  gun.add(spadeR);

  const crossGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
  const cross = new THREE.Mesh(crossGeo, blackMat);
  cross.rotation.z = Math.PI / 2;
  cross.position.set(0, -0.18, 0.3);
  gun.add(cross);

  const ammoBoxGeo = new THREE.BoxGeometry(0.14, 0.12, 0.18);
  const ammoBox = new THREE.Mesh(ammoBoxGeo, new THREE.MeshStandardMaterial({ color: 0x4a4a2a, roughness: 0.8, metalness: 0.3 }));
  ammoBox.position.set(0.16, -0.05, 0.1);
  gun.add(ammoBox);

  const chuteGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6);
  const chute = new THREE.Mesh(chuteGeo, gunMetal);
  chute.rotation.z = Math.PI / 2;
  chute.position.set(0.08, 0.01, 0.1);
  gun.add(chute);

  const flashHiderGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.08, 12);
  const flashHider = new THREE.Mesh(flashHiderGeo, darkMetal);
  flashHider.rotation.x = Math.PI / 2;
  flashHider.position.set(0, 0, -barrelLength - 0.22);
  gun.add(flashHider);

  return gun;
}

// ============================================================
// UPDATE — animate ocean, skyline lights, palm sway, haze
// ============================================================

export function updateEnvironment(scene: THREE.Scene, time: number): void {
  // Ocean waves
  const ocean = (scene as any)._ocean as THREE.Mesh | undefined;
  if (ocean) {
    (ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Skyline blinking lights
  const skyline = (scene as any)._skyline as THREE.Mesh | undefined;
  if (skyline) {
    (skyline.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Foreground buildings
  const fgBuildings = (scene as any)._fgBuildings as THREE.Mesh | undefined;
  if (fgBuildings) {
    (fgBuildings.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Ground haze
  const haze = (scene as any)._haze as THREE.Mesh | undefined;
  if (haze) {
    (haze.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Ship bobbing
  const ship = (scene as any)._ship as THREE.Group | undefined;
  if (ship) {
    const baseY = ship.userData.baseY as number;
    const phase = ship.userData.bobPhase as number;
    ship.position.y = baseY + Math.sin(time * 0.6 + phase) * 0.4;
    ship.rotation.x = Math.sin(time * 0.8 + phase + 1) * 0.015;
    ship.rotation.z = Math.sin(time * 0.5 + phase + 2) * 0.01;
  }

  // Palm tree frond wind sway
  const palmTrees = (scene as any)._palmTrees as THREE.Group | undefined;
  if (palmTrees) {
    palmTrees.traverse((child) => {
      if (child.userData.windPhase !== undefined) {
        const phase = child.userData.windPhase as number;
        const baseRotX = child.userData.baseRotX as number;
        child.rotation.x = baseRotX + Math.sin(time * 1.5 + phase) * 0.06;
        child.rotation.z += Math.cos(time * 1.2 + phase * 0.7) * 0.001;
      }
    });
  }
}
