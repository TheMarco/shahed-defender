import * as THREE from 'three';

interface Effect {
  mesh: THREE.Object3D;
  lifetime: number;
  elapsed: number;
  update: (dt: number, elapsed: number) => void;
  cleanup?: () => void;
}

export class EffectsManager {
  private effects: Effect[] = [];
  private scene: THREE.Scene;
  private fireTexture: THREE.Texture;
  private smokeTexture: THREE.Texture;
  private sparkTexture: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fireTexture = this.createFireTexture();
    this.smokeTexture = this.createSmokeTexture();
    this.sparkTexture = this.createSparkTexture();
  }

  private createFireTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 180, 50, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 80, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(100, 20, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  private createSmokeTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(60, 60, 60, 0.8)');
    gradient.addColorStop(0.5, 'rgba(40, 40, 40, 0.4)');
    gradient.addColorStop(1, 'rgba(20, 20, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  private createSparkTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 230, 150, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 150, 50, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.copy(position);
    const spriteMaterials: THREE.SpriteMaterial[] = [];
    const flashPos = direction.clone().multiplyScalar(0.3);

    // Small bright core flash
    const coreMat = new THREE.SpriteMaterial({
      map: this.sparkTexture,
      color: new THREE.Color(1.8, 1.4, 0.6),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    spriteMaterials.push(coreMat);
    const coreSprite = new THREE.Sprite(coreMat);
    coreSprite.position.copy(flashPos);
    coreSprite.scale.setScalar(0.4);
    group.add(coreSprite);

    // Soft outer glow
    const glowMat = new THREE.SpriteMaterial({
      map: this.fireTexture,
      color: new THREE.Color(1.2, 0.8, 0.3),
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    spriteMaterials.push(glowMat);
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.position.copy(flashPos);
    glowSprite.scale.setScalar(0.8);
    group.add(glowSprite);

    // 2-3 tiny sparks
    interface MuzzleSpark { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; }
    const sparks: MuzzleSpark[] = [];
    const sparkCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < sparkCount; i++) {
      const sMat = new THREE.SpriteMaterial({
        map: this.sparkTexture,
        color: new THREE.Color(1.5, 1.0, 0.4),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      spriteMaterials.push(sMat);
      const sSprite = new THREE.Sprite(sMat);
      sSprite.scale.setScalar(0.06 + Math.random() * 0.06);
      sSprite.position.copy(flashPos);
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      );
      const vel = direction.clone().multiplyScalar(25 + Math.random() * 20).add(spread);
      group.add(sSprite);
      sparks.push({ sprite: sSprite, mat: sMat, vel });
    }

    this.scene.add(group);

    const lifetime = 0.06;
    this.effects.push({
      mesh: group,
      lifetime,
      elapsed: 0,
      update: (dt, elapsed) => {
        const t = elapsed / lifetime;
        coreMat.opacity = 0.7 * (1 - t);
        coreSprite.scale.setScalar(0.4 + t * 0.3);
        glowMat.opacity = 0.4 * (1 - t);
        glowSprite.scale.setScalar(0.8 + t * 0.5);

        for (const s of sparks) {
          s.sprite.position.add(s.vel.clone().multiplyScalar(dt));
          s.vel.multiplyScalar(0.85);
          s.mat.opacity = Math.max(0, 0.8 - t * 1.5);
        }
      },
      cleanup: () => {
        for (const mat of spriteMaterials) {
          mat.dispose();
        }
      },
    });
  }

  spawnTracer(origin: THREE.Vector3, direction: THREE.Vector3, range: number): void {
    const group = new THREE.Group();
    group.position.copy(origin);

    const spriteMaterials: THREE.SpriteMaterial[] = [];

    // Tracer body: thin billboard plane
    const tracerLen = 18;
    const tracerGeo = new THREE.PlaneGeometry(0.3, tracerLen);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2, 1.6, 0.5),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const tracerPlane = new THREE.Mesh(tracerGeo, tracerMat);
    tracerPlane.lookAt(direction);
    // Rotate to align along direction
    group.add(tracerPlane);

    // Also add a second perpendicular plane for visibility from all angles
    const tracerGeo2 = new THREE.PlaneGeometry(0.3, tracerLen);
    const tracerMat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2, 1.6, 0.5),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const tracerPlane2 = new THREE.Mesh(tracerGeo2, tracerMat2);
    tracerPlane2.rotation.z = Math.PI / 2;
    group.add(tracerPlane2);

    // Head sprite: bright point at front
    const headMat = new THREE.SpriteMaterial({
      map: this.sparkTexture,
      color: new THREE.Color(4, 3, 1),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    spriteMaterials.push(headMat);
    const headSprite = new THREE.Sprite(headMat);
    headSprite.scale.setScalar(0.8);
    headSprite.position.set(0, tracerLen * 0.5, 0);
    group.add(headSprite);

    // Make group look along direction
    const target = origin.clone().add(direction);
    group.lookAt(target);

    // Slight random spread
    group.rotation.x += (Math.random() - 0.5) * 0.003;
    group.rotation.y += (Math.random() - 0.5) * 0.003;

    this.scene.add(group);

    const vel = direction.clone().multiplyScalar(800);

    this.effects.push({
      mesh: group,
      lifetime: 0.15,
      elapsed: 0,
      update: (dt) => {
        group.position.add(vel.clone().multiplyScalar(dt));
        const dist = group.position.distanceTo(origin);
        const fadeOut = Math.max(0, 0.9 - (dist / range) * 0.9);
        tracerMat.opacity = fadeOut;
        tracerMat2.opacity = fadeOut;
        headMat.opacity = fadeOut;
      },
      cleanup: () => {
        tracerMat.dispose();
        tracerMat2.dispose();
        tracerGeo.dispose();
        tracerGeo2.dispose();
        for (const mat of spriteMaterials) {
          mat.dispose();
        }
      },
    });
  }

  spawnHitSpark(position: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.copy(position);
    const spriteMaterials: THREE.SpriteMaterial[] = [];

    // Impact flash
    const flashMat = new THREE.SpriteMaterial({
      map: this.sparkTexture,
      color: new THREE.Color(4, 3, 1.5),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    spriteMaterials.push(flashMat);
    const flashSprite = new THREE.Sprite(flashMat);
    flashSprite.scale.setScalar(2);
    group.add(flashSprite);

    // Sparks with trails
    interface SparkParticle {
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      vel: THREE.Vector3;
      trail: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial }[];
    }
    const sparks: SparkParticle[] = [];
    const sparkCount = 18;

    for (let i = 0; i < sparkCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.sparkTexture,
        color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.5 + Math.random() * 0.5).multiplyScalar(2.5),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.2 + Math.random() * 0.15);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 35,
        Math.random() * 25,
        (Math.random() - 0.5) * 35
      );

      // Trail segments (3 per spark)
      const trail: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial }[] = [];
      for (let t = 0; t < 3; t++) {
        const tMat = new THREE.SpriteMaterial({
          map: this.sparkTexture,
          color: new THREE.Color(2, 1.2, 0.3),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        spriteMaterials.push(tMat);
        const tSprite = new THREE.Sprite(tMat);
        tSprite.scale.setScalar(0.1 + (2 - t) * 0.03);
        group.add(tSprite);
        trail.push({ sprite: tSprite, mat: tMat });
      }

      group.add(sprite);
      sparks.push({ sprite, mat, vel, trail });
    }

    this.scene.add(group);

    const lifetime = 0.5;
    this.effects.push({
      mesh: group,
      lifetime,
      elapsed: 0,
      update: (dt, elapsed) => {
        const t = elapsed / lifetime;

        // Flash
        if (elapsed < 0.08) {
          flashMat.opacity = 1 - elapsed / 0.08;
          flashSprite.scale.setScalar(2 + elapsed / 0.08 * 4);
        } else {
          flashMat.opacity = 0;
        }

        // Sparks
        for (const s of sparks) {
          const prevPos = s.sprite.position.clone();
          s.sprite.position.add(s.vel.clone().multiplyScalar(dt));
          s.vel.y -= 45 * dt; // gravity
          s.vel.multiplyScalar(0.97);
          s.mat.opacity = Math.max(0, 1 - t * 1.3);

          // Update trail positions (follow the spark with delay)
          for (let ti = s.trail.length - 1; ti > 0; ti--) {
            s.trail[ti].sprite.position.copy(s.trail[ti - 1].sprite.position);
            s.trail[ti].mat.opacity = s.mat.opacity * (0.5 - ti * 0.15);
          }
          if (s.trail.length > 0) {
            s.trail[0].sprite.position.copy(prevPos);
            s.trail[0].mat.opacity = s.mat.opacity * 0.6;
          }
        }
      },
      cleanup: () => {
        for (const mat of spriteMaterials) {
          mat.dispose();
        }
      },
    });
  }

  spawnExplosion(position: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.copy(position);
    group.scale.setScalar(0.3);
    const spriteMaterials: THREE.SpriteMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];

    // ===== INITIAL FLASH (0-0.08s) — brief HDR bloom =====
    const flashMat = new THREE.SpriteMaterial({
      map: this.fireTexture,
      color: new THREE.Color(5, 4, 2.5),
      transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    spriteMaterials.push(flashMat);
    const flashSprite = new THREE.Sprite(flashMat);
    flashSprite.scale.setScalar(3);
    group.add(flashSprite);

    const flashRingMat = new THREE.SpriteMaterial({
      map: this.sparkTexture,
      color: new THREE.Color(3, 2.5, 1.5),
      transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    spriteMaterials.push(flashRingMat);
    const flashRing = new THREE.Sprite(flashRingMat);
    flashRing.scale.setScalar(5);
    group.add(flashRing);

    // ===== FIREBALL (0-2s): 40 fire sprites =====
    interface FireParticle { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; baseY: number; maxScale: number; riseSpeed: number; }
    const fireParticles: FireParticle[] = [];
    for (let i = 0; i < 40; i++) {
      const isCore = i < 12;
      const isMid = i < 24;
      const hue = isCore ? 0.11 + Math.random() * 0.02 : isMid ? 0.05 + Math.random() * 0.06 : 0.01 + Math.random() * 0.04;
      const lightness = isCore ? 0.9 + Math.random() * 0.1 : isMid ? 0.5 + Math.random() * 0.4 : 0.3 + Math.random() * 0.4;
      const colorMul = isCore ? 4.0 : isMid ? 2.5 : 1.5;
      const mat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color().setHSL(hue, 1, lightness).multiplyScalar(colorMul),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const spread = isCore ? 3 : isMid ? 5 : 7;
      sprite.position.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      );
      sprite.scale.setScalar(0.5);
      const maxScale = isCore ? 20 + Math.random() * 8 : isMid ? 12 + Math.random() * 8 : 6 + Math.random() * 6;
      group.add(sprite);
      fireParticles.push({ sprite, mat, baseY: sprite.position.y, maxScale, riseSpeed: 3 + Math.random() * 5 });
    }

    // ===== FIRE STREAMERS (0-1.5s): 8 arcing fire tendrils =====
    interface FireStreamer {
      sprites: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial }[];
      vel: THREE.Vector3;
      headPos: THREE.Vector3;
      trailTimer: number;
    }
    const fireStreamers: FireStreamer[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const pitch = 0.3 + Math.random() * 0.7;
      const speed = 30 + Math.random() * 40;
      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed,
        Math.sin(angle) * Math.cos(pitch) * speed,
      );
      // Head sprite
      const headMat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color(4, 3, 1),
        transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(headMat);
      const headSprite = new THREE.Sprite(headMat);
      headSprite.scale.setScalar(3);
      group.add(headSprite);
      fireStreamers.push({
        sprites: [{ sprite: headSprite, mat: headMat }],
        vel,
        headPos: new THREE.Vector3(0, 0, 0),
        trailTimer: 0,
      });
    }

    // ===== BURST PARTICLES (0.05-1s): 14 fire sprites flying outward =====
    interface BurstParticle { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; }
    const burstParticles: BurstParticle[] = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color().setHSL(0.05 + Math.random() * 0.06, 1, 0.5 + Math.random() * 0.3).multiplyScalar(2.5),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(4);
      const angle = Math.random() * Math.PI * 2;
      const upward = 0.2 + Math.random() * 0.5;
      const speed = 25 + Math.random() * 40;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed * (1 - upward),
        speed * upward,
        Math.sin(angle) * speed * (1 - upward),
      );
      group.add(sprite);
      burstParticles.push({ sprite, mat, vel });
    }

    // ===== SHOCKWAVE RINGS (0-0.5s): 4 rings =====
    interface ShockwaveRing { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; }
    const shockwaves: ShockwaveRing[] = [];
    const createShockwave = (rotX: number, rotY: number, rotZ: number, color: number): void => {
      const ringGeo = new THREE.RingGeometry(0.5, 3.0, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(2.0),
        transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      extraMaterials.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.set(rotX, rotY, rotZ);
      group.add(ring);
      shockwaves.push({ mesh: ring, mat: ringMat });
    };
    createShockwave(-Math.PI / 2, 0, 0, 0xffdd77);
    createShockwave(0, 0, 0, 0xff9933);
    createShockwave(Math.PI * 0.3, Math.PI * 0.5, 0, 0xff7722);
    createShockwave(Math.PI * 0.7, Math.PI * 0.2, 0, 0xff6611);

    // ===== DEBRIS (0-4s): 70 chunks — mix of box, panel, and shard shapes =====
    interface DebrisChunk {
      mesh: THREE.Mesh; vel: THREE.Vector3;
      rotAxis: THREE.Vector3; rotSpeed: number; trailTimer: number;
    }
    const debris: DebrisChunk[] = [];
    for (let i = 0; i < 78; i++) {
      let geo: THREE.BufferGeometry;
      if (i < 8) {
        // Large fragments — wing sections, fuselage halves, visible from far away
        const sx = 1.5 + Math.random() * 2.5;
        const sy = 0.15 + Math.random() * 0.3;
        const sz = 0.8 + Math.random() * 1.5;
        geo = i < 4
          ? new THREE.BoxGeometry(sx, sy, sz)
          : new THREE.PlaneGeometry(sx, sz);
      } else if (i < 30) {
        // Box chunks — fuselage fragments
        const sx = 0.1 + Math.random() * 0.7;
        const sy = 0.05 + Math.random() * 0.4;
        const sz = 0.1 + Math.random() * 0.6;
        geo = new THREE.BoxGeometry(sx, sy, sz);
      } else if (i < 50) {
        // Flat panels — wing/body panels ripped off
        const pw = 0.4 + Math.random() * 1.2;
        const ph = 0.3 + Math.random() * 0.8;
        geo = new THREE.PlaneGeometry(pw, ph);
      } else {
        // Thin shards — small sharp fragments
        const sw = 0.05 + Math.random() * 0.15;
        const sh = 0.2 + Math.random() * 0.8;
        const sd = 0.05 + Math.random() * 0.1;
        geo = new THREE.BoxGeometry(sw, sh, sd);
      }
      const shade = 0.08 + Math.random() * 0.2;
      // Some pieces are darker (carbon/plastic), some metallic
      const isMetal = Math.random() > 0.4;
      const mat = new THREE.MeshStandardMaterial({
        color: isMetal
          ? new THREE.Color(shade * 1.2, shade * 1.1, shade * 0.9)
          : new THREE.Color(shade * 0.6, shade * 0.55, shade * 0.5),
        roughness: isMetal ? 0.4 : 0.9,
        metalness: isMetal ? 0.8 : 0.2,
        transparent: true, opacity: 1,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0.6, 0.25, 0),
        emissiveIntensity: 1.0,
      });
      extraMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const isLarge = i < 8;
      const angle = Math.random() * Math.PI * 2;
      const pitch = -0.2 + Math.random() * 1.4;
      const speed = isLarge ? 12 + Math.random() * 30 : 20 + Math.random() * 90;
      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed + (isLarge ? 15 : 10),
        Math.sin(angle) * Math.cos(pitch) * speed,
      );
      const rotAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      group.add(mesh);
      debris.push({ mesh, vel, rotAxis, rotSpeed: isLarge ? 2 + Math.random() * 6 : 5 + Math.random() * 25, trailTimer: 0 });
    }

    // ===== SHRAPNEL (0-2s): 50 fast tiny bright fragments =====
    interface ShrapnelPiece { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; }
    const shrapnel: ShrapnelPiece[] = [];
    for (let i = 0; i < 50; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.sparkTexture,
        color: new THREE.Color().setHSL(0.06 + Math.random() * 0.08, 0.6, 0.4 + Math.random() * 0.3).multiplyScalar(2.0),
        transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.15 + Math.random() * 0.25);
      const angle = Math.random() * Math.PI * 2;
      const pitch = Math.random() * Math.PI;
      const speed = 60 + Math.random() * 120;
      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.sin(pitch) * speed,
        Math.cos(pitch) * speed * 0.6 + 15,
        Math.sin(angle) * Math.sin(pitch) * speed,
      );
      group.add(sprite);
      shrapnel.push({ sprite, mat, vel });
    }

    // ===== SMOKE (0.1-6s): 12 smoke sprites =====
    interface SmokeParticle { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; startDelay: number; maxScale: number; }
    const smokeParticles: SmokeParticle[] = [];
    for (let i = 0; i < 12; i++) {
      const darkness = 0.15 + Math.random() * 0.15;
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: new THREE.Color(darkness, darkness * 0.95, darkness * 0.9),
        transparent: true, opacity: 0,
        blending: THREE.NormalBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3,
      );
      sprite.scale.setScalar(1.5);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2 + 1.0, 3 + Math.random() * 4, (Math.random() - 0.5) * 2,
      );
      const maxScale = 7 + Math.random() * 5;
      group.add(sprite);
      smokeParticles.push({ sprite, mat, vel, startDelay: 0.1 + i * 0.08, maxScale });
    }

    // ===== EMBERS (0-3.5s): 120 bright sparks =====
    interface EmberParticle { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; }
    const emberParticles: EmberParticle[] = [];
    for (let i = 0; i < 120; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.sparkTexture,
        color: new THREE.Color().setHSL(0.04 + Math.random() * 0.1, 1, 0.5 + Math.random() * 0.5).multiplyScalar(3.0),
        transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.2 + Math.random() * 0.4);
      const angle = Math.random() * Math.PI * 2;
      const pitch = Math.random() * Math.PI * 0.85;
      const speed = 25 + Math.random() * 90;
      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.sin(pitch) * speed,
        Math.cos(pitch) * speed,
        Math.sin(angle) * Math.sin(pitch) * speed,
      );
      group.add(sprite);
      emberParticles.push({ sprite, mat, vel });
    }

    // ===== SECONDARY EXPLOSIONS: 5 delayed blasts =====
    interface SecondaryBurst {
      sprites: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; offset: THREE.Vector3 }[];
      delay: number; duration: number;
    }
    const secondaryBursts: SecondaryBurst[] = [];
    const burstDelays = [0.2, 0.4, 0.65, 0.9, 1.2];
    for (const delay of burstDelays) {
      const sprites: SecondaryBurst['sprites'] = [];
      for (let j = 0; j < 8; j++) {
        const mat = new THREE.SpriteMaterial({
          map: this.fireTexture,
          color: new THREE.Color().setHSL(0.03 + Math.random() * 0.08, 1, 0.5 + Math.random() * 0.4).multiplyScalar(2.5),
          transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        spriteMaterials.push(mat);
        const sprite = new THREE.Sprite(mat);
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          Math.random() * 5,
          (Math.random() - 0.5) * 10,
        );
        sprite.position.copy(offset);
        sprite.scale.setScalar(0.5);
        group.add(sprite);
        sprites.push({ sprite, mat, offset });
      }
      secondaryBursts.push({ sprites, delay, duration: 0.6 });
    }

    // ===== GROUND FIRE: 6 burning patches =====
    interface GroundFire { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; flickerPhase: number; }
    const groundFires: GroundFire[] = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color(2.5, 1.2, 0.3),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * 6;
      sprite.position.set(
        Math.cos(angle) * dist,
        -position.y + 0.5,
        Math.sin(angle) * dist,
      );
      sprite.scale.set(2 + Math.random() * 2, 3 + Math.random() * 3, 1);
      group.add(sprite);
      groundFires.push({ sprite, mat, flickerPhase: Math.random() * Math.PI * 2 });
    }

    // ===== GROUND SCORCH =====
    const scorchGeo = new THREE.PlaneGeometry(0, 0);
    const scorchMat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    extraMaterials.push(scorchMat);
    const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
    scorchMesh.rotation.x = -Math.PI / 2;
    scorchMesh.position.set(0, -position.y + 0.05, 0);
    group.add(scorchMesh);

    // ===== HEAT SHIMMER =====
    const shimmerMat = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      color: new THREE.Color(0.5, 0.4, 0.3),
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    spriteMaterials.push(shimmerMat);
    const shimmerSprite = new THREE.Sprite(shimmerMat);
    shimmerSprite.position.set(0, 5, 0);
    shimmerSprite.scale.setScalar(10);
    group.add(shimmerSprite);

    this.scene.add(group);

    // ===== POINT LIGHTS =====
    const light = new THREE.PointLight(0xffaa44, 300, 200);
    light.position.copy(position);
    this.scene.add(light);
    let lightRemoved = false;

    const fillLight = new THREE.PointLight(0xff6600, 100, 120);
    fillLight.position.copy(position).add(new THREE.Vector3(0, 3, 0));
    this.scene.add(fillLight);
    let fillLightRemoved = false;

    const lifetime = 3.0;

    this.effects.push({
      mesh: group,
      lifetime,
      elapsed: 0,
      update: (dt, elapsed) => {
        // -- Initial flash (0-0.08s) — brief and punchy --
        if (elapsed < 0.08) {
          const ft = elapsed / 0.08;
          flashMat.opacity = (1 - ft) * (1 - ft); // quadratic falloff
          flashSprite.scale.setScalar(3 + ft * 5);
          flashRingMat.opacity = 0.8 * (1 - ft);
          flashRing.scale.setScalar(5 + ft * 5);
        } else {
          flashMat.opacity = 0;
          flashRingMat.opacity = 0;
        }

        // -- Fireball (0-1.2s) — faster fade --
        for (const fp of fireParticles) {
          if (elapsed < 1.2) {
            const ft = elapsed / 1.2;
            const scaleCurve = ft < 0.15 ? ft / 0.15 : 1 - (ft - 0.15) / 0.85;
            fp.sprite.scale.setScalar(1 + scaleCurve * fp.maxScale);
            fp.mat.opacity = Math.max(0, scaleCurve * 0.8);
            fp.sprite.position.y += dt * fp.riseSpeed;
            fp.mat.opacity *= 0.85 + Math.random() * 0.15;
          } else {
            fp.mat.opacity = 0;
          }
        }

        // -- Fire streamers (0-1.5s) --
        for (const fs of fireStreamers) {
          if (elapsed < 1.5) {
            const st = elapsed / 1.5;
            fs.headPos.add(fs.vel.clone().multiplyScalar(dt));
            fs.vel.y -= 20 * dt; // gravity arc
            fs.vel.multiplyScalar(0.97);
            fs.sprites[0].sprite.position.copy(fs.headPos);
            fs.sprites[0].mat.opacity = Math.max(0, 1 - st);
            fs.sprites[0].sprite.scale.setScalar(3 * (1 - st * 0.5));

            // Spawn trail particles
            fs.trailTimer += dt;
            if (fs.trailTimer > 0.03) {
              fs.trailTimer = 0;
              const trailMat = new THREE.SpriteMaterial({
                map: this.fireTexture,
                color: new THREE.Color(2 + Math.random(), 1 + Math.random() * 0.5, 0.2),
                transparent: true, opacity: 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false,
              });
              spriteMaterials.push(trailMat);
              const trailSprite = new THREE.Sprite(trailMat);
              trailSprite.position.copy(fs.headPos);
              trailSprite.scale.setScalar(1.5 + Math.random());
              group.add(trailSprite);

              this.effects.push({
                mesh: trailSprite,
                lifetime: 0.5,
                elapsed: 0,
                update: (_pdt, pElapsed) => {
                  const pt = pElapsed / 0.5;
                  trailMat.opacity = Math.max(0, 0.7 * (1 - pt));
                  trailSprite.scale.setScalar((1.5 + Math.random()) * (1 + pt));
                  trailSprite.position.y += _pdt * 2;
                },
                cleanup: () => { group.remove(trailSprite); trailMat.dispose(); },
              });
            }
          } else {
            fs.sprites[0].mat.opacity = 0;
          }
        }

        // -- Burst particles (0.05-1s) --
        for (const bp of burstParticles) {
          if (elapsed >= 0.05 && elapsed < 1.0) {
            const bt = (elapsed - 0.05) / 0.95;
            bp.sprite.position.add(bp.vel.clone().multiplyScalar(dt));
            bp.vel.multiplyScalar(0.92);
            bp.mat.opacity = Math.max(0, 0.9 * (1 - bt));
            bp.sprite.scale.setScalar(4 + bt * 8);
          } else if (elapsed >= 1.0) {
            bp.mat.opacity = 0;
          }
        }

        // -- Shockwaves (0-0.5s) --
        for (const sw of shockwaves) {
          if (elapsed < 0.5) {
            const rt = elapsed / 0.5;
            sw.mesh.scale.setScalar(1 + rt * 50);
            sw.mat.opacity = Math.max(0, 0.9 * (1 - rt));
          } else {
            sw.mat.opacity = 0;
          }
        }

        // -- Debris (0-4s) --
        const debrisMaxTime = 4.0;
        const debrisT = Math.min(1, elapsed / debrisMaxTime);
        for (const d of debris) {
          d.mesh.position.add(d.vel.clone().multiplyScalar(dt));
          d.vel.y -= 22 * dt;
          d.vel.multiplyScalar(0.995);
          d.mesh.rotateOnAxis(d.rotAxis, d.rotSpeed * dt);
          const debrisOpacity = debrisT < 0.7 ? 1 : Math.max(0, 1 - (debrisT - 0.7) / 0.3);
          (d.mesh.material as THREE.MeshStandardMaterial).opacity = debrisOpacity;
          // Emissive cools over time (hot metal cooling)
          const coolFactor = Math.max(0, 1 - elapsed * 0.3);
          (d.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = coolFactor;
          (d.mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.6 * coolFactor, 0.25 * coolFactor, 0);

          // Debris smoke trails
          d.trailTimer += dt;
          if (d.trailTimer > 0.08 && elapsed < 2.5) {
            d.trailTimer = 0;
            const trailMat = new THREE.SpriteMaterial({
              map: this.smokeTexture,
              color: new THREE.Color(0.15, 0.14, 0.12),
              transparent: true, opacity: 0.4,
              blending: THREE.NormalBlending, depthWrite: false,
            });
            spriteMaterials.push(trailMat);
            const trailSprite = new THREE.Sprite(trailMat);
            trailSprite.position.copy(d.mesh.position);
            trailSprite.scale.setScalar(0.5);
            group.add(trailSprite);
            this.effects.push({
              mesh: trailSprite, lifetime: 1.0, elapsed: 0,
              update: (_pdt, pElapsed) => {
                const pt = pElapsed / 1.0;
                trailMat.opacity = Math.max(0, 0.4 * (1 - pt));
                trailSprite.scale.setScalar(0.5 + pt * 2);
                trailSprite.position.y += _pdt * 1.5;
              },
              cleanup: () => { group.remove(trailSprite); trailMat.dispose(); },
            });
          }
        }

        // -- Smoke (0.08-6s) --
        for (const sp of smokeParticles) {
          if (elapsed < sp.startDelay) continue;
          const smokeAge = elapsed - sp.startDelay;
          const smokeDuration = lifetime - sp.startDelay;
          const smokeT = smokeAge / smokeDuration;
          sp.sprite.position.add(sp.vel.clone().multiplyScalar(dt));
          sp.vel.multiplyScalar(0.985);
          sp.vel.y = Math.max(sp.vel.y * 0.99, 0.3);
          const growFactor = 2 + smokeAge * (sp.maxScale / smokeDuration) * 3;
          sp.sprite.scale.setScalar(Math.min(growFactor, sp.maxScale));
          let smokeOpacity: number;
          if (smokeT < 0.05) {
            smokeOpacity = (smokeT / 0.05) * 0.3;
          } else if (smokeT < 0.35) {
            smokeOpacity = 0.3 * (1 - (smokeT - 0.05) / 0.3);
          } else {
            smokeOpacity = 0;
          }
          sp.mat.opacity = Math.max(0, smokeOpacity);
        }

        // -- Embers (0-3.5s) --
        for (const ep of emberParticles) {
          if (elapsed < 3.5) {
            ep.sprite.position.add(ep.vel.clone().multiplyScalar(dt));
            ep.vel.y -= 12 * dt;
            ep.vel.multiplyScalar(0.98);
            const et = elapsed / 3.5;
            ep.mat.opacity = Math.max(0, 1 - et);
            // Slight flicker
            ep.mat.opacity *= 0.8 + Math.random() * 0.2;
          } else {
            ep.mat.opacity = 0;
          }
        }

        // -- Shrapnel (0-2s) — fast bright fragments --
        for (const sp of shrapnel) {
          if (elapsed < 2.0) {
            sp.sprite.position.add(sp.vel.clone().multiplyScalar(dt));
            sp.vel.y -= 30 * dt;
            sp.vel.multiplyScalar(0.96);
            const st = elapsed / 2.0;
            sp.mat.opacity = Math.max(0, 1 - st * st);
            sp.sprite.scale.setScalar((0.15 + Math.random() * 0.1) * (1 - st * 0.5));
          } else {
            sp.mat.opacity = 0;
          }
        }

        // -- Secondary explosions --
        for (const sb of secondaryBursts) {
          if (elapsed >= sb.delay && elapsed < sb.delay + sb.duration) {
            const sbt = (elapsed - sb.delay) / sb.duration;
            for (const s of sb.sprites) {
              const scaleCurve = sbt < 0.15 ? sbt / 0.15 : 1 - (sbt - 0.15) / 0.85;
              s.sprite.scale.setScalar(1.5 + scaleCurve * 10);
              s.mat.opacity = Math.max(0, scaleCurve * 0.9);
              s.sprite.position.y = s.offset.y + sbt * 4;
            }
          } else if (elapsed >= sb.delay + sb.duration) {
            for (const s of sb.sprites) { s.mat.opacity = 0; }
          }
        }

        // -- Ground fire (0.2-4s) --
        for (const gf of groundFires) {
          if (elapsed > 0.2 && elapsed < 4.0) {
            const gft = (elapsed - 0.2) / 3.8;
            const flicker = 0.6 + Math.sin(elapsed * 15 + gf.flickerPhase) * 0.2 + Math.sin(elapsed * 23 + gf.flickerPhase * 2) * 0.15;
            gf.mat.opacity = Math.max(0, flicker * (1 - gft * gft));
            gf.sprite.scale.y = (3 + Math.random() * 2) * (1 - gft * 0.5);
          } else {
            gf.mat.opacity = 0;
          }
        }

        // -- Ground scorch --
        if (elapsed < 0.5) {
          scorchMat.opacity = (elapsed / 0.5) * 0.8;
        } else if (elapsed > lifetime - 1.0) {
          scorchMat.opacity = 0.8 * Math.max(0, (lifetime - elapsed) / 1.0);
        }

        // -- Heat shimmer (0.3-5s) --
        if (elapsed > 0.3 && elapsed < 5.0) {
          const shimT = (elapsed - 0.3) / 4.7;
          shimmerMat.opacity = Math.max(0, 0.2 * (1 - shimT));
          shimmerSprite.position.y = 5 + shimT * 12;
          shimmerSprite.scale.setScalar(10 + shimT * 18);
        } else {
          shimmerMat.opacity = 0;
        }

        // -- Primary light (0-0.25s) — quick flash --
        if (!lightRemoved) {
          if (elapsed < 0.25) {
            const flickerBase = 1 - elapsed / 0.25;
            const flicker = flickerBase * flickerBase * (0.7 + Math.random() * 0.3);
            light.intensity = 300 * flicker;
          } else {
            this.scene.remove(light); light.dispose(); lightRemoved = true;
          }
        }

        // -- Fill light (0-0.4s) --
        if (!fillLightRemoved) {
          if (elapsed < 0.4) {
            fillLight.intensity = 100 * (1 - elapsed / 0.4) * (0.8 + Math.random() * 0.2);
          } else {
            this.scene.remove(fillLight); fillLight.dispose(); fillLightRemoved = true;
          }
        }
      },
      cleanup: () => {
        if (!lightRemoved) { this.scene.remove(light); light.dispose(); }
        if (!fillLightRemoved) { this.scene.remove(fillLight); fillLight.dispose(); }
        for (const mat of spriteMaterials) { mat.dispose(); }
        for (const mat of extraMaterials) { mat.dispose(); }
      },
    });
  }

  /**
   * Spawn a dramatic first-person gun explosion attached to the camera.
   * Uses its own real-time clock so it isn't affected by deathTimeScale.
   */
  spawnGunExplosion(camera: THREE.PerspectiveCamera, gunGroup: THREE.Group): void {
    gunGroup.visible = false;

    const gunWorldPos = new THREE.Vector3();
    gunGroup.getWorldPosition(gunWorldPos);

    const group = new THREE.Group();
    group.position.copy(gunWorldPos);
    const extraMaterials: THREE.Material[] = [];
    const spriteMaterials: THREE.SpriteMaterial[] = [];
    const GRAVITY = 9.8;

    // Helper: direction biased into camera view (forward = -Z, spread X, upward Y)
    const viewDir = (): THREE.Vector3 => {
      const x = (Math.random() - 0.5) * 2;
      const y = 0.15 + Math.random() * 0.85;
      const z = -(0.15 + Math.random() * 0.85);
      return new THREE.Vector3(x, y, z).normalize();
    };

    // ===== GUN DEBRIS — 150 metal fragments =====
    interface GunDebris {
      mesh: THREE.Mesh; vel: THREE.Vector3;
      rotAxis: THREE.Vector3; rotSpeed: number;
    }
    const gunDebris: GunDebris[] = [];
    for (let i = 0; i < 150; i++) {
      let geo: THREE.BufferGeometry;
      if (i < 5) {
        // Massive gun parts — thick barrel halves, big receiver slabs
        geo = i < 3
          ? new THREE.CylinderGeometry(0.12, 0.10, 0.8 + Math.random() * 0.6, 8)
          : new THREE.BoxGeometry(0.5 + Math.random() * 0.3, 0.15 + Math.random() * 0.1, 0.25 + Math.random() * 0.2);
      } else if (i < 15) {
        // Large chunks — barrel sections, housing plates, grip halves
        const t = Math.floor(Math.random() * 3);
        if (t === 0) geo = new THREE.CylinderGeometry(0.08, 0.06, 0.4 + Math.random() * 0.4, 6);
        else if (t === 1) geo = new THREE.BoxGeometry(0.3 + Math.random() * 0.2, 0.12 + Math.random() * 0.08, 0.2 + Math.random() * 0.15);
        else geo = new THREE.BoxGeometry(0.25 + Math.random() * 0.15, 0.25 + Math.random() * 0.15, 0.04 + Math.random() * 0.03);
      } else if (i < 50) {
        // Medium panels, bolts, brackets
        const t = Math.floor(Math.random() * 3);
        if (t === 0) geo = new THREE.BoxGeometry(0.15 + Math.random() * 0.15, 0.05 + Math.random() * 0.04, 0.12 + Math.random() * 0.12);
        else if (t === 1) geo = new THREE.CylinderGeometry(0.025, 0.025, 0.1 + Math.random() * 0.12, 5);
        else geo = new THREE.BoxGeometry(0.18 + Math.random() * 0.1, 0.18 + Math.random() * 0.1, 0.02);
      } else {
        // Small shards
        const s = 0.05 + Math.random() * 0.08;
        geo = new THREE.BoxGeometry(s, s * (0.3 + Math.random()), s * (0.3 + Math.random()));
      }

      const isMetal = Math.random() > 0.15;
      const shade = 0.12 + Math.random() * 0.35;
      const mat = new THREE.MeshStandardMaterial({
        color: isMetal
          ? new THREE.Color(shade * 1.3, shade * 1.1, shade * 0.8)
          : new THREE.Color(shade * 0.3, shade * 0.3, shade * 0.25),
        roughness: isMetal ? 0.25 : 0.7,
        metalness: isMetal ? 0.95 : 0.2,
        transparent: true, opacity: 1, side: THREE.DoubleSide,
        emissive: new THREE.Color(0.7, 0.3, 0.05),
        emissiveIntensity: 0.8,
      });
      extraMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);

      const isMassive = i < 5;
      const isLarge = i >= 5 && i < 15;
      const isMedium = i >= 15 && i < 50;
      const speed = isMassive ? 3 + Math.random() * 5
        : isLarge ? 5 + Math.random() * 8
        : isMedium ? 8 + Math.random() * 14
        : 10 + Math.random() * 22;
      const vel = viewDir().multiplyScalar(speed);

      const rotAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      group.add(mesh);
      gunDebris.push({
        mesh, vel, rotAxis,
        rotSpeed: isMassive ? 2 + Math.random() * 4 : isLarge ? 5 + Math.random() * 8 : 12 + Math.random() * 25,
      });
    }

    // ===== FIRE TRAILS — attached to first 50 debris pieces =====
    interface FireTrail { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; baseScale: number; }
    const fireTrails: FireTrail[] = [];
    for (let i = 0; i < 50; i++) {
      const debris = gunDebris[i];
      const isBig = i < 15;
      const mat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color().setHSL(0.06 + Math.random() * 0.06, 1, 0.35 + Math.random() * 0.15),
        transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      const baseScale = isBig ? 0.6 + Math.random() * 0.6 : 0.25 + Math.random() * 0.35;
      sprite.scale.setScalar(baseScale);
      debris.mesh.add(sprite);
      fireTrails.push({ sprite, mat, baseScale });
    }

    // ===== FREE FIRE — rises from explosion origin =====
    interface FireBall { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; maxScale: number; }
    const fireballs: FireBall[] = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.fireTexture,
        color: new THREE.Color().setHSL(0.04 + Math.random() * 0.08, 1, 0.3 + Math.random() * 0.15),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.3) * 0.3,
        -(Math.random() * 0.5),
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        2 + Math.random() * 3,
        -(Math.random() * 2),
      );
      group.add(sprite);
      fireballs.push({ sprite, mat, vel, maxScale: 1.5 + Math.random() * 2.0 });
    }

    // ===== SPARKS — 150 hot dots =====
    interface SparkP { mesh: THREE.Mesh; vel: THREE.Vector3; }
    const sparks: SparkP[] = [];
    for (let i = 0; i < 150; i++) {
      const geo = new THREE.SphereGeometry(0.015 + Math.random() * 0.03, 4, 4);
      const brightness = 0.5 + Math.random() * 0.5;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(brightness, brightness * 0.5, brightness * 0.1),
        transparent: true, opacity: 1,
      });
      extraMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const speed = 10 + Math.random() * 30;
      const vel = viewDir().multiplyScalar(speed);
      group.add(mesh);
      sparks.push({ mesh, vel });
    }

    // ===== SMOKE — 30 thick dark plumes (NormalBlending, no bloom) =====
    interface SmokeP { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; delay: number; maxScale: number; }
    const smoke: SmokeP[] = [];
    for (let i = 0; i < 30; i++) {
      const darkness = 0.06 + Math.random() * 0.1;
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: new THREE.Color(darkness, darkness * 0.9, darkness * 0.8),
        transparent: true, opacity: 0,
        blending: THREE.NormalBlending, depthWrite: false,
      });
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.3) * 0.3,
        -(Math.random() * 0.5),
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.0,
        1.5 + Math.random() * 3.0,
        -(0.5 + Math.random() * 2.0),
      );
      group.add(sprite);
      smoke.push({ sprite, mat, vel, delay: i * 0.04, maxScale: 3.0 + Math.random() * 2.5 });
    }

    // ===== BRIEF POINT LIGHT =====
    const light = new THREE.PointLight(0xffaa33, 20, 30);
    light.position.copy(gunWorldPos);
    this.scene.add(light);
    let lightRemoved = false;

    this.scene.add(group);

    // Real-time clock — unaffected by deathTimeScale
    const startTime = performance.now();
    const lifetime = 5.0;
    let prevTime = startTime;

    this.effects.push({
      mesh: group,
      lifetime: 999,
      elapsed: 0,
      update: () => {
        const now = performance.now();
        const realDt = Math.min((now - prevTime) / 1000, 0.05);
        const realElapsed = (now - startTime) / 1000;
        prevTime = now;

        if (realElapsed >= lifetime) return;

        // -- Debris: real gravity, tumbling, cooling glow --
        for (const d of gunDebris) {
          d.mesh.position.add(d.vel.clone().multiplyScalar(realDt));
          d.vel.y -= GRAVITY * realDt;
          d.vel.multiplyScalar(1 - 0.15 * realDt); // light air drag
          d.mesh.rotateOnAxis(d.rotAxis, d.rotSpeed * realDt);

          const mat = d.mesh.material as THREE.MeshStandardMaterial;
          const tLife = realElapsed / lifetime;
          mat.opacity = tLife < 0.75 ? 1 : Math.max(0, 1 - (tLife - 0.75) / 0.25);
          const cool = Math.max(0, 1 - realElapsed * 0.35);
          mat.emissiveIntensity = cool * 0.8;
          mat.emissive.setRGB(0.7 * cool, 0.25 * cool, 0.02 * cool);
        }

        // -- Fire trails on debris: flicker and fade --
        for (const ft of fireTrails) {
          if (realElapsed < 1.8) {
            const t = realElapsed / 1.8;
            ft.mat.opacity = Math.max(0, 0.7 * (1 - t * t));
            ft.sprite.scale.setScalar(ft.baseScale * (1 - t * 0.5) * (0.8 + Math.random() * 0.4));
          } else {
            ft.mat.opacity = 0;
          }
        }

        // -- Free fireballs: rise from origin --
        for (const fb of fireballs) {
          if (realElapsed < 2.0) {
            const t = realElapsed / 2.0;
            fb.sprite.position.add(fb.vel.clone().multiplyScalar(realDt));
            fb.vel.y -= 1.5 * realDt;
            fb.vel.multiplyScalar(1 - 0.8 * realDt);
            const curve = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
            fb.mat.opacity = Math.max(0, curve * 0.6 * (0.7 + Math.random() * 0.3));
            fb.sprite.scale.setScalar(0.3 + curve * fb.maxScale);
          } else {
            fb.mat.opacity = 0;
          }
        }

        // -- Sparks: real gravity arcing --
        for (const s of sparks) {
          s.mesh.position.add(s.vel.clone().multiplyScalar(realDt));
          s.vel.y -= GRAVITY * realDt;
          s.vel.multiplyScalar(1 - 1.5 * realDt);
          const mat = s.mesh.material as THREE.MeshBasicMaterial;
          const st = realElapsed / 3.0;
          mat.opacity = st < 1 ? Math.max(0, 1 - st) : 0;
        }

        // -- Smoke: thick dark clouds billow upward --
        for (const sp of smoke) {
          if (realElapsed < sp.delay) continue;
          const age = realElapsed - sp.delay;
          const dur = lifetime - sp.delay;
          const st = age / dur;
          sp.sprite.position.add(sp.vel.clone().multiplyScalar(realDt));
          sp.vel.multiplyScalar(1 - 0.8 * realDt);
          sp.vel.y = Math.max(sp.vel.y * 0.97, 0.2);
          sp.sprite.scale.setScalar(Math.min(0.3 + age * 2.5, sp.maxScale));
          let op: number;
          if (st < 0.06) op = (st / 0.06) * 0.6;
          else if (st < 0.5) op = 0.6 * (1 - (st - 0.06) / 0.44);
          else op = 0;
          sp.mat.opacity = Math.max(0, op);
        }

        // -- Light: brief flash --
        if (!lightRemoved) {
          if (realElapsed < 0.3) {
            const f = 1 - realElapsed / 0.3;
            light.intensity = 20 * f * f;
          } else {
            this.scene.remove(light); light.dispose(); lightRemoved = true;
          }
        }
      },
      cleanup: () => {
        if (!lightRemoved) { this.scene.remove(light); light.dispose(); }
        for (const mat of spriteMaterials) { mat.dispose(); }
        for (const mat of extraMaterials) { mat.dispose(); }
      },
    });

    setTimeout(() => {
      const idx = this.effects.findIndex(e => e.mesh === group);
      if (idx !== -1) {
        this.effects[idx].elapsed = this.effects[idx].lifetime;
      }
    }, lifetime * 1000);
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const eff = this.effects[i];
      eff.elapsed += dt;
      eff.update(dt, eff.elapsed);

      if (eff.elapsed >= eff.lifetime) {
        this.scene.remove(eff.mesh);
        eff.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        if (eff.cleanup) eff.cleanup();
        this.effects.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const eff of this.effects) {
      this.scene.remove(eff.mesh);
      if (eff.cleanup) eff.cleanup();
    }
    this.effects.length = 0;
  }
}
