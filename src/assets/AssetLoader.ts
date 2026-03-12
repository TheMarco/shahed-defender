import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export class AssetLoader {
  private loadingBar: HTMLElement | null;
  droneModel: THREE.Group | null = null;

  constructor() {
    this.loadingBar = document.getElementById('loading-bar');
  }

  async loadAll(): Promise<void> {
    this.setProgress(10);
    await this.loadDroneModel();
    this.setProgress(100);
  }

  private async loadDroneModel(): Promise<void> {
    return new Promise((resolve, reject) => {
      const mtlLoader = new MTLLoader();
      mtlLoader.setPath('models/');
      mtlLoader.load('shahed.mtl', (materials) => {
        materials.preload();
        this.setProgress(40);

        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath('models/');
        objLoader.load(
          'shahed.obj',
          (obj) => {
            this.setProgress(80);
            this.droneModel = this.buildDroneFromObj(obj);
            resolve();
          },
          (progress) => {
            if (progress.total > 0) {
              const pct = 40 + (progress.loaded / progress.total) * 40;
              this.setProgress(pct);
            }
          },
          (error) => {
            console.error('Failed to load OBJ:', error);
            this.droneModel = this.createFallbackDrone();
            resolve();
          }
        );
      }, undefined, (error) => {
        console.error('Failed to load MTL:', error);
        const objLoader = new OBJLoader();
        objLoader.setPath('models/');
        objLoader.load('shahed.obj', (obj) => {
          // Apply default material
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xaaaaaa,
                roughness: 0.6,
                metalness: 0.3,
              });
            }
          });
          this.droneModel = this.buildDroneFromObj(obj);
          resolve();
        }, undefined, () => {
          this.droneModel = this.createFallbackDrone();
          resolve();
        });
      });
    });
  }

  /**
   * Split the OBJ model into body + propeller, so the propeller can spin independently.
   * In the OBJ, nose is at -Y, tail/prop at +Y, wings on X, thin on Z.
   * The propeller blades are at Y > ~1.08 (raw OBJ coords, before centering).
   */
  private buildDroneFromObj(obj: THREE.Object3D): THREE.Group {
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Propeller split threshold: Y > 1.08 in raw OBJ space
    // The body narrows to |X|<0.17 at Y>1.05; propeller extends to |X|~0.29
    const PROP_Y_THRESHOLD = 1.08;

    // Collect all meshes from the loaded OBJ
    const meshes: THREE.Mesh[] = [];
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });

    // Split each mesh's geometry into body and propeller faces
    const bodyMeshes: THREE.Mesh[] = [];
    const propMeshes: THREE.Mesh[] = [];

    for (const mesh of meshes) {
      // Get world-space positions (OBJ might have nested transforms)
      mesh.updateWorldMatrix(true, false);
      const geo = mesh.geometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const normalAttr = geo.getAttribute('normal') as THREE.BufferAttribute | null;
      const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | null;
      const index = geo.getIndex();

      const faceCount = index ? index.count / 3 : posAttr.count / 3;

      const bodyIndices: number[] = [];
      const propIndices: number[] = [];

      for (let f = 0; f < faceCount; f++) {
        const i0 = index ? index.getX(f * 3) : f * 3;
        const i1 = index ? index.getX(f * 3 + 1) : f * 3 + 1;
        const i2 = index ? index.getX(f * 3 + 2) : f * 3 + 2;

        // Get Y values in OBJ space (before centering)
        // The positions in the buffer are in local mesh space.
        // We need to transform to world to get OBJ-space Y.
        const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
        const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(mesh.matrixWorld);
        const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(mesh.matrixWorld);

        // A face is propeller if ANY vertex is beyond the threshold
        const isProp = v0.y > PROP_Y_THRESHOLD || v1.y > PROP_Y_THRESHOLD || v2.y > PROP_Y_THRESHOLD;

        if (isProp) {
          propIndices.push(i0, i1, i2);
        } else {
          bodyIndices.push(i0, i1, i2);
        }
      }

      // Build body geometry
      if (bodyIndices.length > 0) {
        const bodyGeo = geo.clone();
        bodyGeo.setIndex(bodyIndices);
        const bodyMesh = new THREE.Mesh(bodyGeo, mesh.material);
        bodyMesh.matrix.copy(mesh.matrixWorld);
        bodyMesh.matrixAutoUpdate = false;
        bodyMeshes.push(bodyMesh);
      }

      // Build propeller geometry
      if (propIndices.length > 0) {
        const propGeo = geo.clone();
        propGeo.setIndex(propIndices);
        const propMesh = new THREE.Mesh(propGeo, mesh.material);
        propMesh.matrix.copy(mesh.matrixWorld);
        propMesh.matrixAutoUpdate = false;
        propMeshes.push(propMesh);
      }
    }

    // Propeller pivot: center of the propeller hub in raw OBJ space.
    // The hub is approximately at X=0, Z=0, Y≈1.13 based on vertex analysis.
    const propPivotY = 1.13;

    // Body meshes: translate by -center to center the model
    const centerTx = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
    for (const bm of bodyMeshes) {
      bm.matrix.premultiply(centerTx);
    }

    // Propeller meshes: translate so the propeller hub becomes the local origin
    const propOffsetTx = new THREE.Matrix4().makeTranslation(-center.x, -propPivotY, -center.z);
    for (const pm of propMeshes) {
      pm.matrix.premultiply(propOffsetTx);
    }

    // Propeller spinner group: positioned at the propeller hub in centered space
    const propSpinner = new THREE.Group();
    propSpinner.name = 'prop_spinner';
    propSpinner.position.set(0, propPivotY - center.y, 0);
    for (const pm of propMeshes) propSpinner.add(pm);

    // Body group
    const bodyGroup = new THREE.Group();
    for (const bm of bodyMeshes) bodyGroup.add(bm);

    // Inner pivot: -90deg around X maps -Y(nose)→+Z, +Y(tail)→-Z
    const innerPivot = new THREE.Group();
    innerPivot.rotation.x = -Math.PI / 2;
    innerPivot.add(bodyGroup);
    innerPivot.add(propSpinner);

    // Motion blur disc at propeller
    const propRadius = 0.3;
    const discGeo = new THREE.CircleGeometry(propRadius, 24);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x999999,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    propSpinner.add(disc);

    const wrapper = new THREE.Group();
    wrapper.add(innerPivot);
    if (maxDim > 0) {
      wrapper.scale.setScalar(1 / maxDim);
    }

    return wrapper;
  }

  private createFallbackDrone(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.4 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.08, 1, 8), mat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-0.5, -0.4);
    wingShape.lineTo(0, 0.1);
    wingShape.lineTo(0.5, -0.4);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.03, bevelEnabled: false });
    const wing = new THREE.Mesh(wingGeo, mat);
    wing.rotation.x = -Math.PI / 2;
    wing.position.set(0, 0, 0.1);
    group.add(wing);

    group.scale.setScalar(1);
    return group;
  }

  cloneDrone(): THREE.Object3D {
    if (!this.droneModel) throw new Error('Drone model not loaded');
    return this.droneModel.clone();
  }

  private setProgress(pct: number) {
    if (this.loadingBar) {
      this.loadingBar.style.width = `${Math.min(100, pct)}%`;
    }
  }
}
