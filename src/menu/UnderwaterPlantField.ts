import {
  Color, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh,
  MeshStandardMaterial, Object3D, type BufferGeometry,
} from 'three';
import {
  MENU_PLANT_PATCHES, MENU_PROTECTED_FOOTPRINTS,
  menuSandChannelContains, menuSeabedHeight,
} from './MenuSceneLayout';
import { createMenuPlantGeometry, type MenuPlantKind } from './MenuPlantGeometry';

const PLANTS = [
  { kind: 'grass', perPatch: 3, color: 0x53684c },
  { kind: 'kelp', perPatch: 2, color: 0x596c41 },
  { kind: 'frond', perPatch: 2, color: 0x3f6b59 },
] as const;

export class UnderwaterPlantField {
  readonly root = new Group();
  private readonly time = { value: 0 };
  private readonly planted: Array<readonly [number, number]> = [];
  private disposed = false;

  constructor() {
    this.root.name = 'menu:plant-field';
    for (const spec of PLANTS) this.root.add(this.createPatchBatch(spec));
  }

  private createPatchBatch(spec: {
    kind: MenuPlantKind; perPatch: number; color: number;
  }): InstancedMesh<BufferGeometry, MeshStandardMaterial> {
    const capacity = MENU_PLANT_PATCHES.length * spec.perPatch;
    const geometry = createMenuPlantGeometry(spec.kind);
    const phases = new Float32Array(capacity);
    geometry.setAttribute('phase', new InstancedBufferAttribute(phases, 1));
    const material = new MeshStandardMaterial({
      color: spec.color, roughness: 1, metalness: 0, side: DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPlantTime = this.time;
      shader.vertexShader = 'attribute float phase;\nuniform float uPlantTime;\nvarying float vPlantHeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vPlantHeight = uv.y;
        float bend = uv.y * uv.y;
        transformed.x += sin(uPlantTime * 0.62 + phase + position.y * 1.9) * bend * 0.16;
        transformed.z += cos(uPlantTime * 0.47 + phase) * bend * 0.07;
      `);
      shader.fragmentShader = 'varying float vPlantHeight;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.48, 1.12, smoothstep(0.0, 1.0, vPlantHeight));
      `);
    };
    material.customProgramCacheKey = () => 'menu:rooted-leaves';
    const batch = new InstancedMesh(geometry, material, capacity);
    batch.name = `menu:${spec.kind}-patches`;
    const transform = new Object3D();
    const tint = new Color();
    let placed = 0;
    for (let patch = 0; patch < MENU_PLANT_PATCHES.length; patch += 1) {
      const [cx, cz, radius] = MENU_PLANT_PATCHES[patch]!;
      if (cz > 2 && spec.kind !== 'grass') continue;
      for (let leaf = 0; leaf < spec.perPatch; leaf += 1) {
        const slot = spec.kind === 'grass' ? leaf * 2
          : spec.kind === 'kelp' ? leaf * 4 + 1 : leaf * 3 + 3;
        const angle = slot * Math.PI * 2 / 7 + patch * 1.7;
        const spread = radius * (0.85 + Math.cos(patch + slot * 1.6) * 0.08);
        const x = cx + Math.cos(angle) * spread;
        const z = cz + Math.sin(angle) * spread;
        if (menuSandChannelContains(x, z, 0.5)) continue;
        if (MENU_PROTECTED_FOOTPRINTS.some(({ position, halfSize }) => (
          Math.abs(x - position[0]) < halfSize[0] + 0.45
          && Math.abs(z - position[2]) < halfSize[1] + 0.45
        ))) continue;
        if (this.planted.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.7)) continue;
        this.planted.push([x, z]);
        const scale = 0.7 + ((patch * 3 + leaf) % 7) * 0.07;
        transform.position.set(x, menuSeabedHeight(x, z) - 0.025, z);
        transform.rotation.set(0, angle + 0.5, 0);
        transform.scale.setScalar(scale);
        transform.updateMatrix();
        batch.setMatrixAt(placed, transform.matrix);
        tint.setHSL(0.12 + (patch % 3) * 0.025, 0.1, 0.82 + (leaf % 3) * 0.035);
        batch.setColorAt(placed, tint);
        phases[placed] = patch * 0.51 + leaf * 0.8;
        placed += 1;
      }
    }
    batch.count = placed;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    // Include the complete GPU sway envelope in CPU visibility bounds.
    batch.boundingBox!.expandByScalar(0.3);
    batch.boundingSphere!.radius += 0.3;
    batch.updateMatrix();
    batch.matrixAutoUpdate = false;
    return batch;
  }

  setTime(time: number): void {
    this.time.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const child of this.root.children) {
      const batch = child as InstancedMesh<BufferGeometry, MeshStandardMaterial>;
      batch.dispose();
      batch.geometry.dispose();
      batch.material.dispose();
    }
  }
}
