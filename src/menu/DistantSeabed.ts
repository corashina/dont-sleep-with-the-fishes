import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Texture,
  TorusGeometry,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';
import {
  findClearMenuX,
  MENU_PROTECTED_FOOTPRINTS,
  menuGroundedY,
  menuSeabedHeight,
  menuVisibleCenterLimit,
  type MenuGroundFootprint,
} from './MenuSceneLayout';
import type { MenuSceneComponent } from './MenuSceneComponent';

export const DISTANT_RIDGE_COUNT = 3;
export const DISTANT_MOUNTAIN_COUNT = 3;
export const LEFT_SEABED_INSTANCE_COUNT = 20;
export const SEABED_ROCK_INSTANCE_COUNT = 200;
export const SEABED_STONE_INSTANCE_COUNT = 240;
export const SEABED_PLANT_INSTANCE_COUNT = 300;
export const MOUNTAIN_PLANT_INSTANCE_COUNT = 160;
export const DISTANT_DEBRIS_COUNT = 20;
export const NEAR_WRECK_DEBRIS_COUNT = 14;

const FOREGROUND_SHARE = {
  rock: 0.18,
  stone: 0.28,
  plant: 0.16,
} as const;
const FOREGROUND_NEAR_Z = 6.3;
const FOREGROUND_FAR_Z = 2.3;

const RIDGES = [
  { width: 76, depth: 16, z: -34, height: 0.9, phase: 0.2 },
  { width: 96, depth: 22, z: -52, height: 1.35, phase: 1.1 },
  { width: 118, depth: 28, z: -72, height: 1.9, phase: 2.0 },
] as const;

const MOUNTAINS = [
  { width: 124, depth: 24, x: -14, z: -32, height: 15.5, phase: 0.35, color: 0x748984 },
  { width: 158, depth: 30, x: 18, z: -49, height: 22.5, phase: 1.7, color: 0x6d8380 },
  { width: 206, depth: 38, x: -6, z: -69, height: 29.5, phase: 2.8, color: 0x667b79 },
] as const;

function terrainEdgeBlend(
  x: number,
  z: number,
  width: number,
  depth: number,
): number {
  const edgeDistance = Math.min(width / 2 - Math.abs(x), depth / 2 - Math.abs(z));
  const progress = Math.max(0, Math.min(1, edgeDistance / 3));
  return progress * progress * (3 - 2 * progress);
}

type MountainSpec = (typeof MOUNTAINS)[number];

function mountainSurfaceHeight(spec: MountainSpec, x: number, z: number): number {
  const depth = Math.min(1, Math.max(0, z / spec.depth + 0.5));
  const ridgeCrest = Math.pow(Math.sin(depth * Math.PI), 1.25);
  const peaks = 0.58
    + Math.sin(x * 0.045 + spec.phase) * 0.18
    + Math.sin(x * 0.085 - spec.phase * 0.7) * 0.12
    + Math.cos((x + z) * 0.07 + spec.phase) * 0.06;
  const sideProgress = Math.min(1, Math.abs(x) / (spec.width * 0.5));
  const sideFade = 0.28
    + Math.pow(Math.cos(sideProgress * Math.PI * 0.5), 2) * 0.72;
  const blend = terrainEdgeBlend(x, z, spec.width, spec.depth);
  const baseHeight = menuSeabedHeight(x + spec.x, z + spec.z);
  const lift = (0.04 + Math.max(0, peaks) * sideFade
    * ridgeCrest * spec.height) * blend;
  return baseHeight + lift;
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const DEBRIS = [
  [-14.0, -0.05, -8.0, 0.8, -0.35], [13.0, -0.08, -11.0, 1.0, -0.5],
  [-19.0, -0.10, -15.0, 0.7, -0.62], [20.0, -0.12, -18.0, 1.15, -0.72],
  [-25.0, -0.10, -23.0, 0.75, 0.42], [26.0, -0.12, -26.0, 1.1, 0.28],
  [-31.0, -0.14, -31.0, 0.85, 0.15], [32.0, -0.16, -34.0, 1.0, 0.05],
  [-38.0, -0.18, -40.0, 1.2, -0.4], [39.0, -0.18, -43.0, 0.9, 0.6],
  [-45.0, -0.20, -49.0, 1.3, -0.8], [46.0, -0.20, -52.0, 1.0, 0.9],
  [-11.0, -0.16, -38.0, 0.8, 0.25], [12.0, -0.18, -45.0, 1.1, -0.15],
  [-57.0, -0.22, -57.0, 0.9, -0.25], [58.0, -0.22, -60.0, 1.05, 0.35],
  [-66.0, -0.24, -46.0, 1.0, 0.6], [67.0, -0.24, -49.0, 1.15, -0.5],
  [-68.0, -0.25, -34.0, 1.1, -0.7], [68.0, -0.25, -37.0, 0.95, 0.75],
] as const;

type WreckDebrisKind = 'plank' | 'plate' | 'rib' | 'pipe';

interface WreckDebrisSpec {
  readonly kind: WreckDebrisKind;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: readonly [number, number, number];
}

const NEAR_WRECK_DEBRIS: readonly WreckDebrisSpec[] = [
  { kind: 'plank', x: -14, z: -12.1, scale: 1.1, rotation: [0.04, -0.45, 0.08] },
  { kind: 'plate', x: -9.5, z: -12.3, scale: 0.9, rotation: [0.08, 0.3, -0.12] },
  { kind: 'rib', x: -5, z: -12, scale: 1.05, rotation: [1.42, -0.2, 0.15] },
  { kind: 'pipe', x: 4.8, z: -12.2, scale: 1.2, rotation: [1.48, 0.55, -0.08] },
  { kind: 'plank', x: 9.4, z: -12.4, scale: 0.85, rotation: [-0.05, 0.7, 0.06] },
  { kind: 'plate', x: 14.2, z: -12.1, scale: 1.15, rotation: [0.12, -0.6, 0.09] },
  { kind: 'pipe', x: -15.5, z: -26.5, scale: 0.95, rotation: [1.5, -0.35, 0.12] },
  { kind: 'rib', x: -10.5, z: -26.7, scale: 1.2, rotation: [1.37, 0.4, -0.08] },
  { kind: 'plank', x: -5.5, z: -26.4, scale: 1.25, rotation: [0.03, 0.65, -0.06] },
  { kind: 'plate', x: -1.8, z: -26.8, scale: 0.8, rotation: [0.16, -0.75, 0.1] },
  { kind: 'rib', x: 3.8, z: -26.6, scale: 0.9, rotation: [1.45, -0.6, 0.14] },
  { kind: 'pipe', x: 8.2, z: -26.4, scale: 1.15, rotation: [1.38, 0.25, -0.1] },
  { kind: 'plank', x: 12.2, z: -26.7, scale: 1, rotation: [-0.04, -0.5, 0.07] },
  { kind: 'plate', x: 16.2, z: -26.5, scale: 1.05, rotation: [0.1, 0.55, -0.12] },
] as const;

type Detail = readonly [number, number, number, number, number];

export class DistantSeabed implements MenuSceneComponent {
  readonly root = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly textures = new Set<Texture>();
  private readonly detailBounds = new Box3();
  private readonly detailFootprints: MenuGroundFootprint[] = [];
  private disposed = false;

  constructor(sandTexture: Texture) {
    const distantSand = sandTexture.clone();
    distantSand.name = 'menu:distant-aerial-beach';
    distantSand.repeat.set(1, 1);
    distantSand.minFilter = LinearFilter;
    distantSand.generateMipmaps = false;
    distantSand.needsUpdate = true;
    this.textures.add(distantSand);
    const sand = this.terrainMaterial(0x8fa59a, distantSand);
    const rock = this.material(0xffffff, 1);
    const stone = this.material(0xffffff, 1);
    const plant = this.material(0xffffff, 0.95);
    const wood = this.material(0x5a4938, 1);
    const ridges = new Group();
    const rocks = new Group();
    const stones = new Group();
    const plants = new Group();
    const debris = new Group();
    const nearWreckDebris = new Group();
    const mountains = new Group();
    const mountainDetails = new Group();
    ridges.name = 'menu:distant-ridges';
    mountains.name = 'menu:distant-mountains';
    rocks.name = 'menu:distant-rocks';
    stones.name = 'menu:distant-stones';
    plants.name = 'menu:distant-plants';
    debris.name = 'menu:distant-debris';
    nearWreckDebris.name = 'menu:near-wreck-debris';
    mountainDetails.name = 'menu:mountain-details';
    const horizon = this.createHorizon();

    RIDGES.forEach((spec, index) => {
      const geometry = this.geometry(new PlaneGeometry(spec.width, spec.depth, 12, 6));
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        const wave = Math.sin(x * 0.19 + spec.phase) * 0.48
          + Math.cos(z * 0.23 - spec.phase) * 0.32
          + Math.sin((x + z) * 0.11) * 0.2;
        const blend = terrainEdgeBlend(x, z, spec.width, spec.depth);
        const baseHeight = menuSeabedHeight(x, z + spec.z);
        const lift = (0.04 + Math.max(0, wave + 0.15) * spec.height) * blend;
        position.setY(vertex, baseHeight + lift);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, sand);
      mesh.name = `menu:distant-ridge-${index + 1}`;
      mesh.position.z = spec.z;
      ridges.add(mesh);
    });

    MOUNTAINS.forEach((spec, index) => {
      const geometry = this.geometry(new PlaneGeometry(spec.width, spec.depth, 48, 18));
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        position.setY(vertex, mountainSurfaceHeight(spec, x, z));
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      const mesh = new Mesh(
        geometry,
        this.terrainMaterial(spec.color, distantSand),
      );
      mesh.name = `menu:distant-mountain-${index + 1}`;
      mesh.position.x = spec.x;
      mesh.position.z = spec.z;
      mountains.add(mesh);
    });

    const rockGeometry = this.groundGeometry(
      this.geometry(new DodecahedronGeometry(0.55, 0)),
    );
    const stoneGeometry = this.groundGeometry(
      this.geometry(new DodecahedronGeometry(0.48, 0)),
    );
    const plantGeometry = this.groundGeometry(
      this.geometry(new ConeGeometry(0.12, 1.3, 5)),
    );
    rocks.add(this.createSeabedScatter(
      'menu:scatter-rocks',
      SEABED_ROCK_INSTANCE_COUNT,
      rockGeometry,
      rock,
      'rock',
      0x72a5,
    ));
    stones.add(this.createSeabedScatter(
      'menu:scatter-stones',
      SEABED_STONE_INSTANCE_COUNT,
      stoneGeometry,
      stone,
      'stone',
      0x14c9,
    ));
    plants.add(this.createSeabedScatter(
      'menu:scatter-plants',
      SEABED_PLANT_INSTANCE_COUNT,
      plantGeometry,
      plant,
      'plant',
      0x9ef1,
    ));
    const mountainPlantGeometry = this.groundGeometry(
      this.geometry(new ConeGeometry(0.08, 0.8, 4)),
    );
    mountainDetails.add(
      this.createMountainScatter(
        'menu:mountain-plants',
        MOUNTAIN_PLANT_INSTANCE_COUNT,
        mountainPlantGeometry,
        plant,
        'plant',
        0xa734,
      ),
    );
    const debrisGeometry = this.geometry(new BoxGeometry(1.25, 0.08, 0.22));
    this.addDetails(debris, 'menu:distant-debris', DEBRIS, debrisGeometry, wood);
    const debrisGeometries: Readonly<Record<WreckDebrisKind, BufferGeometry>> = {
      plank: this.geometry(new BoxGeometry(1.5, 0.1, 0.24)),
      plate: this.geometry(new BoxGeometry(1.1, 0.08, 0.75)),
      rib: this.geometry(new TorusGeometry(0.55, 0.06, 4, 7, Math.PI * 0.72)),
      pipe: this.geometry(new CylinderGeometry(0.1, 0.13, 1.25, 6)),
    };
    const debrisMaterials: Readonly<Record<WreckDebrisKind, MeshStandardMaterial>> = {
      plank: wood,
      plate: this.material(0x754433, 1),
      rib: this.material(0x354446, 0.9),
      pipe: this.material(0x4a5654, 0.88),
    };
    this.addNearWreckDebris(nearWreckDebris, debrisGeometries, debrisMaterials);

    this.root.name = 'menu:distant-seabed';
    this.root.add(
      horizon,
      ridges,
      mountains,
      mountainDetails,
      rocks,
      stones,
      plants,
      debris,
      nearWreckDebris,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials, this.textures);
  }

  private geometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private groundGeometry<T extends BufferGeometry>(geometry: T): T {
    geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    return geometry;
  }

  private createSeabedScatter(
    name: string,
    count: number,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    kind: 'rock' | 'stone' | 'plant',
    seed: number,
  ): InstancedMesh {
    const batch = new InstancedMesh(geometry, material, count);
    const random = deterministicRandom(seed);
    const transform = new Object3D();
    const color = new Color();
    const palette = this.seabedPalette(kind);
    const radius = kind === 'plant' ? 0.22 : 0.55;
    const regularCount = count - LEFT_SEABED_INSTANCE_COUNT;
    const foregroundCount = Math.floor(regularCount * FOREGROUND_SHARE[kind]);

    for (let index = 0; index < count; index += 1) {
      const leftCluster = index < LEFT_SEABED_INSTANCE_COUNT;
      const regularIndex = index - LEFT_SEABED_INSTANCE_COUNT;
      const foreground = !leftCluster && regularIndex < foregroundCount;
      const depthProgress = this.seabedDepthProgress(
        index,
        regularIndex,
        regularCount,
        foregroundCount,
        leftCluster,
        foreground,
      );
      const z = this.seabedScatterZ(depthProgress, leftCluster, foreground, random);
      const limit = Math.max(
        6,
        menuVisibleCenterLimit(menuSeabedHeight(0, z), z, radius)
          * (leftCluster || foreground ? 1.55 : 0.98),
      );
      const x = this.scatterX(
        random,
        z,
        limit,
        radius,
        (leftCluster || foreground) && kind !== 'stone',
        leftCluster,
        kind === 'rock',
      );
      const distanceScale = leftCluster
        ? 0.54 + depthProgress * 0.22
        : foreground
        ? 0.58 + depthProgress * 0.18
        : 0.78 + depthProgress * 0.9;
      const base = (0.55 + random() * 0.85) * distanceScale;
      transform.position.set(x, menuSeabedHeight(x, z) - 0.035, z);
      this.setSeabedScatterTransform(transform, kind, base, random);
      transform.updateMatrix();
      batch.setMatrixAt(index, transform.matrix);
      color.set(palette[index % palette.length]!);
      color.offsetHSL((random() - 0.5) * 0.025, 0, (random() - 0.5) * 0.05);
      batch.setColorAt(index, color);
    }

    batch.name = name;
    batch.castShadow = false;
    batch.receiveShadow = false;
    batch.frustumCulled = false;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    return batch;
  }

  private seabedPalette(kind: 'rock' | 'stone' | 'plant'): readonly number[] {
    if (kind === 'plant') return [0x315a4d, 0x466d58, 0x58745c];
    if (kind === 'stone') return [0x485a57, 0x586963, 0x68756c];
    return [0x34494b, 0x415558, 0x52635f];
  }

  private seabedDepthProgress(
    index: number,
    regularIndex: number,
    regularCount: number,
    foregroundCount: number,
    leftCluster: boolean,
    foreground: boolean,
  ): number {
    if (leftCluster) return (index + 0.5) / LEFT_SEABED_INSTANCE_COUNT;
    if (foreground) return (regularIndex + 0.5) / foregroundCount;
    return (regularIndex - foregroundCount + 0.5) / (regularCount - foregroundCount);
  }

  private seabedScatterZ(
    depthProgress: number,
    leftCluster: boolean,
    foreground: boolean,
    random: () => number,
  ): number {
    if (leftCluster) return 6.2 - depthProgress * 5.8 + (random() - 0.5) * 0.12;
    if (foreground) {
      return FOREGROUND_NEAR_Z
        + (FOREGROUND_FAR_Z - FOREGROUND_NEAR_Z) * depthProgress
        + (random() - 0.5) * 0.18;
    }
    return 2 - depthProgress * 82 + (random() - 0.5) * 1.6;
  }

  private setSeabedScatterTransform(
    transform: Object3D,
    kind: 'rock' | 'stone' | 'plant',
    base: number,
    random: () => number,
  ): void {
    const plant = kind === 'plant';
    transform.rotation.set(
      (random() - 0.5) * (plant ? 0.16 : 0.28),
      random() * Math.PI * 2,
      (random() - 0.5) * (plant ? 0.18 : 0.3),
    );
    if (plant) {
      transform.scale.set(base * (0.72 + random() * 0.7), base * (0.85 + random() * 1.05), base * (0.72 + random() * 0.7));
      return;
    }
    if (kind === 'stone') {
      transform.scale.set(base * (1.15 + random() * 1.25), base * (0.18 + random() * 0.24), base * (0.8 + random() * 0.9));
      return;
    }
    transform.scale.set(base * (0.72 + random() * 0.85), base * (0.55 + random() * 0.8), base * (0.72 + random() * 0.85));
  }

  private createMountainScatter(
    name: string,
    count: number,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    kind: 'rock' | 'plant',
    seed: number,
  ): InstancedMesh {
    const batch = new InstancedMesh(geometry, material, count);
    const random = deterministicRandom(seed);
    const transform = new Object3D();
    const color = new Color();
    const palette = kind === 'plant'
      ? [0x3b5f50, 0x4d6b58, 0x59705c]
      : [0x526561, 0x61726d, 0x718079];

    for (let index = 0; index < count; index += 1) {
      const mountainIndex = index % MOUNTAINS.length;
      const spec = MOUNTAINS[mountainIndex]!;
      const x = (random() * 2 - 1) * spec.width * 0.42;
      const z = (random() * 2 - 1) * spec.depth * 0.32;
      const distanceScale = 1 - mountainIndex * 0.18;
      const base = (0.55 + random() * 1.1) * distanceScale;
      transform.position.set(
        spec.x + x,
        mountainSurfaceHeight(spec, x, z) - 0.025,
        spec.z + z,
      );
      transform.rotation.set(
        (random() - 0.5) * 0.18,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.2,
      );
      if (kind === 'plant') {
        transform.scale.set(
          base * (0.7 + random() * 0.65),
          base * (0.8 + random() * 1.1),
          base * (0.7 + random() * 0.65),
        );
      } else {
        transform.scale.set(
          base * (0.75 + random() * 0.8),
          base * (0.5 + random() * 0.75),
          base * (0.75 + random() * 0.8),
        );
      }
      transform.updateMatrix();
      batch.setMatrixAt(index, transform.matrix);
      color.set(palette[index % palette.length]!);
      color.offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.04);
      batch.setColorAt(index, color);
    }

    batch.name = name;
    batch.castShadow = false;
    batch.receiveShadow = false;
    batch.frustumCulled = false;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    return batch;
  }

  private scatterX(
    random: () => number,
    z: number,
    limit: number,
    radius: number,
    sideBias = false,
    leftOnly = false,
    clearBoatSightline = false,
  ): number {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const side = this.scatterSide(random, leftOnly);
      const magnitude = this.scatterMagnitude(random, sideBias, leftOnly);
      const x = side * magnitude * limit;
      if (!this.scatterPositionBlocked(x, z, radius, clearBoatSightline)) return x;
    }
    return limit * (leftOnly || random() < 0.5 ? -0.92 : 0.92);
  }

  private scatterSide(random: () => number, leftOnly: boolean): number {
    return leftOnly || random() < 0.5 ? -1 : 1;
  }

  private scatterMagnitude(
    random: () => number,
    sideBias: boolean,
    leftOnly: boolean,
  ): number {
    if (leftOnly) return 0.72 + random() * 0.28;
    return sideBias ? 0.48 + random() * 0.52 : random();
  }

  private scatterPositionBlocked(
    x: number,
    z: number,
    radius: number,
    clearBoatSightline: boolean,
  ): boolean {
    if (clearBoatSightline && Math.abs(x) < 2.4 && z > -4.4 && z < 1.8) return true;
    return MENU_PROTECTED_FOOTPRINTS.some((footprint) => (
      Math.abs(x - footprint.position[0]) < footprint.halfSize[0] + radius
      && Math.abs(z - footprint.position[2]) < footprint.halfSize[1] + radius
    ));
  }

  private createHorizon(): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const geometry = this.geometry(new PlaneGeometry(500, 260, 1, 6));
    const position = geometry.getAttribute('position');
    const colors = new Float32BufferAttribute(position.count * 3, 3);
    const lower = new Color(0x315b5c);
    const upper = new Color(0x0a252e);
    const color = new Color();
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const progress = Math.min(1, Math.max(0, position.getY(vertex) / 260 + 0.5));
      color.lerpColors(lower, upper, progress);
      colors.setXYZ(vertex, color.r, color.g, color.b);
    }
    geometry.setAttribute('color', colors);
    const material = new MeshBasicMaterial({
      depthWrite: false,
      fog: false,
      vertexColors: true,
    });
    this.materials.add(material);
    const horizon = new Mesh(geometry, material);
    horizon.name = 'menu:distant-horizon';
    horizon.position.set(0, 35, -115);
    horizon.renderOrder = -2;
    return horizon;
  }

  private material(
    color: number,
    roughness: number,
    map?: Texture,
  ): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    if (map) material.map = map;
    this.materials.add(material);
    return material;
  }

  private terrainMaterial(color: number, map: Texture): MeshStandardMaterial {
    const material = this.material(color, 1, map);
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
vec4 sampledDiffuseColor = texture2D(map, vMapUv);
float sandLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float sandContrast = clamp((sandLuma - 0.38) * 4.5 + 0.55, 0.15, 1.25);
vec3 sandColor = mix(vec3(sandContrast), sampledDiffuseColor.rgb, 0.2);
diffuseColor *= vec4(sandColor, sampledDiffuseColor.a);
#endif`,
      );
    };
    material.customProgramCacheKey = () => 'menu:distant-aerial-beach-v1';
    return material;
  }

  private addDetails(
    group: Group,
    name: string,
    details: readonly Detail[],
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ): void {
    const dorothy = MENU_PROTECTED_FOOTPRINTS.find(({ id }) => id === 'dorothy')!;
    details.forEach(([x, y, z, scale, yaw], index) => {
      const mesh = new Mesh(geometry, material);
      mesh.name = `${name}-${index + 1}`;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      mesh.rotation.y = yaw;
      mesh.updateMatrixWorld(true);
      this.detailBounds.setFromObject(mesh);
      const halfX = (this.detailBounds.max.x - this.detailBounds.min.x) * 0.5;
      const halfZ = (this.detailBounds.max.z - this.detailBounds.min.z) * 0.5;
      const overlapsDorothyDepth = z + halfZ > dorothy.position[2] - dorothy.halfSize[1]
        && z - halfZ < dorothy.position[2] + dorothy.halfSize[1];
      const placedZ = overlapsDorothyDepth
        ? dorothy.position[2] - dorothy.halfSize[1] - halfZ - 0.5
        : z;
      const visibleLimit = menuVisibleCenterLimit(
        this.detailBounds.min.y,
        placedZ + halfZ,
        halfX,
      );
      mesh.position.x = findClearMenuX(
        x,
        placedZ,
        halfX,
        halfZ,
        0.2,
        this.detailFootprints,
        -visibleLimit,
        visibleLimit,
      );
      mesh.position.z = placedZ;
      const shadowsEnabled = placedZ > -28;
      mesh.castShadow = shadowsEnabled;
      mesh.receiveShadow = shadowsEnabled;
      this.detailFootprints.push({
        id: mesh.name,
        position: [mesh.position.x, y, placedZ],
        halfSize: [halfX, halfZ],
      });
      group.add(mesh);
    });
  }

  private addNearWreckDebris(
    group: Group,
    geometries: Readonly<Record<WreckDebrisKind, BufferGeometry>>,
    materials: Readonly<Record<WreckDebrisKind, MeshStandardMaterial>>,
  ): void {
    NEAR_WRECK_DEBRIS.forEach((spec, index) => {
      const mesh = new Mesh(geometries[spec.kind], materials[spec.kind]);
      mesh.name = `menu:near-wreck-debris-${index + 1}`;
      mesh.position.set(0, 0, spec.z);
      mesh.scale.setScalar(spec.scale);
      mesh.rotation.set(...spec.rotation);
      mesh.updateMatrixWorld(true);
      this.detailBounds.setFromObject(mesh);
      const halfX = (this.detailBounds.max.x - this.detailBounds.min.x) * 0.5;
      const halfZ = (this.detailBounds.max.z - this.detailBounds.min.z) * 0.5;
      const localBottom = this.detailBounds.min.y;
      const visibleLimit = menuVisibleCenterLimit(
        localBottom,
        spec.z + halfZ,
        halfX,
      );
      const x = findClearMenuX(
        spec.x,
        spec.z,
        halfX,
        halfZ,
        0.24,
        this.detailFootprints,
        -visibleLimit,
        visibleLimit,
      );
      mesh.position.x = x;
      mesh.position.y = menuGroundedY(x, spec.z, localBottom);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.detailFootprints.push({
        id: mesh.name,
        position: [x, mesh.position.y, spec.z],
        halfSize: [halfX, halfZ],
      });
      group.add(mesh);
    });
  }
}
