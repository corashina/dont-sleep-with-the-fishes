import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import {
  FISHING_CATCHES,
  type FishingAppearance,
  type FishingCatchDefinition,
  type FishingCatchId,
  type FishingItemCondition,
  type FishingModelFamily,
} from './fishingCatalog';
import {
  fishingCatchModelSpec,
  type FishingCatchModelSpec,
} from './fishingModelManifest';
import { type ItemId } from '../game/ItemState';
import { ITEM_MODEL_SPECS } from '../world/itemModelManifest';
import { applyBrokenMaterialTreatment } from './itemConditionAppearance';

interface FamilyTemplate {
  readonly root: Group;
  readonly bodyMaterial: MeshStandardMaterial;
  readonly accentMaterial: MeshStandardMaterial;
  readonly baseSize: Vector3;
}

interface TemplateBuildContext {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly body: MeshStandardMaterial;
  readonly accent: MeshStandardMaterial;
}

function createMaterial(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true,
  });
}

function createFinGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0,
    0.42, 0, 0,
    0.08, 0.34, 0,
    0, 0, 0,
    0.08, 0.34, 0,
    0.42, 0, 0,
  ]), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addMesh(
  root: Group,
  context: TemplateBuildContext,
  name: string,
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
): Mesh {
  context.geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addFishBody(
  root: Group,
  context: TemplateBuildContext,
  family: FishingModelFamily,
  bodyScale: readonly [number, number, number],
): void {
  const body = addMesh(
    root,
    context,
    `fishing-catch:${family}:body`,
    new SphereGeometry(0.5, 8, 6),
    context.body,
  );
  body.scale.set(...bodyScale);

  const tail = addMesh(
    root,
    context,
    `fishing-catch:${family}:tail`,
    new ConeGeometry(0.32, 0.52, 3),
    context.accent,
  );
  tail.position.x = -0.48;
  tail.rotation.z = -Math.PI / 2;
  tail.scale.set(0.72, 1, 0.42);

  const fin = addMesh(
    root,
    context,
    `fishing-catch:${family}:fin`,
    createFinGeometry(),
    context.accent,
  );
  fin.position.set(-0.08, 0.16, 0);
  fin.scale.set(0.56, 0.48, 0.56);
}

function buildOrdinaryFish(root: Group, context: TemplateBuildContext): void {
  addFishBody(root, context, 'ordinaryFish', [1.42, 0.76, 0.72]);
  const eye = addMesh(
    root,
    context,
    'fishing-catch:ordinaryFish:eye',
    new SphereGeometry(0.045, 6, 4),
    context.accent,
  );
  eye.position.set(0.51, 0.09, 0.27);
}

function buildCrab(root: Group, context: TemplateBuildContext): void {
  const body = addMesh(
    root,
    context,
    'fishing-catch:crab:body',
    new SphereGeometry(0.5, 8, 5),
    context.body,
  );
  body.scale.set(0.92, 0.42, 0.78);
  for (const sign of [-1, 1] as const) {
    const claw = addMesh(
      root,
      context,
      `fishing-catch:crab:claw-${sign}`,
      new ConeGeometry(0.18, 0.42, 5),
      context.accent,
    );
    claw.position.set(sign * 0.58, 0.02, -0.08);
    claw.rotation.z = sign * Math.PI / 2;
    for (let index = 0; index < 3; index += 1) {
      const leg = addMesh(
        root,
        context,
        `fishing-catch:crab:leg-${sign}-${index}`,
        new CylinderGeometry(0.025, 0.035, 0.48, 5),
        context.body,
      );
      leg.position.set(sign * (0.34 + index * 0.07), -0.24, (index - 1) * 0.22);
      leg.rotation.z = sign * 0.82;
    }
  }
}

function buildSquid(root: Group, context: TemplateBuildContext): void {
  const body = addMesh(
    root,
    context,
    'fishing-catch:squid:body',
    new ConeGeometry(0.34, 0.92, 7),
    context.body,
  );
  body.rotation.z = Math.PI / 2;
  body.position.x = 0.16;
  const head = addMesh(
    root,
    context,
    'fishing-catch:squid:head',
    new SphereGeometry(0.28, 7, 5),
    context.accent,
  );
  head.position.x = -0.36;
  for (let index = 0; index < 4; index += 1) {
    const tentacle = addMesh(
      root,
      context,
      `fishing-catch:squid:tentacle-${index}`,
      new CylinderGeometry(0.025, 0.04, 0.56 + index * 0.05, 5),
      context.body,
    );
    tentacle.position.set(-0.68 - index * 0.035, (index - 1.5) * 0.09, (index % 2) * 0.12 - 0.06);
    tentacle.rotation.z = Math.PI / 2 + (index - 1.5) * 0.08;
  }
}

function buildSeaweed(root: Group, context: TemplateBuildContext): void {
  const body = addMesh(
    root,
    context,
    'fishing-catch:seaweed:body',
    new CylinderGeometry(0.09, 0.16, 0.92, 5),
    context.body,
  );
  body.position.y = 0.1;
  for (const sign of [-1, 1] as const) {
    const frond = addMesh(
      root,
      context,
      `fishing-catch:seaweed:frond-${sign}`,
      new ConeGeometry(0.12, 0.72, 5),
      context.accent,
    );
    frond.position.set(sign * 0.14, 0.25, 0);
    frond.rotation.z = sign * 0.28;
  }
}

function buildBoot(root: Group, context: TemplateBuildContext): void {
  const body = addMesh(
    root,
    context,
    'fishing-catch:boot:body',
    new BoxGeometry(0.44, 0.72, 0.42),
    context.body,
  );
  body.position.set(-0.12, 0.18, 0);
  const sole = addMesh(
    root,
    context,
    'fishing-catch:boot:sole',
    new BoxGeometry(0.78, 0.16, 0.46),
    context.accent,
  );
  sole.position.set(0.12, -0.25, 0);
}

function buildBottle(root: Group, context: TemplateBuildContext): void {
  const body = addMesh(
    root,
    context,
    'fishing-catch:bottle:body',
    new CylinderGeometry(0.24, 0.28, 0.75, 7),
    context.body,
  );
  const neck = addMesh(
    root,
    context,
    'fishing-catch:bottle:neck',
    new CylinderGeometry(0.12, 0.16, 0.26, 7),
    context.body,
  );
  neck.position.y = 0.49;
  const cap = addMesh(
    root,
    context,
    'fishing-catch:bottle:cap',
    new CylinderGeometry(0.13, 0.13, 0.1, 7),
    context.accent,
  );
  cap.position.y = 0.67;
}

function buildFamily(
  family: FishingModelFamily,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): FamilyTemplate {
  const body = createMaterial(0xffffff);
  const accent = createMaterial(0x777777);
  materials.add(body);
  materials.add(accent);
  const context = { geometries, materials, body, accent };
  const root = new Group();
  root.name = `fishing-catch:${family}`;
  root.userData.fishingFamily = family;
  root.visible = false;

  switch (family) {
    case 'ordinaryFish': buildOrdinaryFish(root, context); break;
    case 'crab': buildCrab(root, context); break;
    case 'squid': buildSquid(root, context); break;
    case 'seaweed': buildSeaweed(root, context); break;
    case 'boot': buildBoot(root, context); break;
    case 'bottle': buildBottle(root, context); break;
  }

  root.updateMatrixWorld(true);
  const baseSize = new Box3().setFromObject(root, true).getSize(new Vector3());
  return { root, bodyMaterial: body, accentMaterial: accent, baseSize };
}

function applyAppearance(template: FamilyTemplate, appearance: FishingAppearance): void {
  template.bodyMaterial.color.setHex(appearance.color);
  template.accentMaterial.color.setHex(appearance.accentColor);
  template.root.scale.set(
    appearance.length / template.baseSize.x,
    appearance.height / template.baseSize.y,
    appearance.width / template.baseSize.z,
  );
  template.root.updateMatrixWorld(true);
}

function catchModelSpec(
  definition: FishingCatchDefinition,
): FishingCatchModelSpec | undefined {
  if (definition.presentation.kind === 'fishing') {
    return fishingCatchModelSpec(definition.id);
  }
  const item = ITEM_MODEL_SPECS[definition.presentation.itemId];
  return {
    url: item.url,
    targetLength: item.targetLongestDimension,
    rotation: item.rotation,
    maxTriangles: item.maxTriangles,
  };
}

export class FishingCatchLibrary {
  private active: ActiveCatch | null = null;
  private requestId = 0;
  private disposed = false;

  constructor(private readonly loader: FishingCatchModelLoader = new GltfFishingCatchModelLoader()) {}

  async prepare(catchId: FishingCatchId): Promise<Object3D | null> {
    if (this.disposed) throw new Error('Fishing catch library is disposed.');
    const definition = FISHING_CATCHES.find(({ id }) => id === catchId);
    if (!definition) throw new Error(`Unknown fishing catch: ${catchId}`);
    this.releaseActive();
    const requestId = ++this.requestId;
    const spec = catchModelSpec(definition);

    let active: ActiveCatch | null = null;
    if (spec) {
      try {
        const root = await this.loader.load(spec.url);
        active = prepareLoadedCatch(root, catchId, spec);
        if (definition.presentation.kind === 'item') {
          active.root.userData.fishingModelSource = 'item-model';
          active.root.userData.fishingItemId = definition.presentation.itemId;
          if (definition.presentation.condition === 'broken') {
            for (const material of active.materials) applyBrokenMaterialTreatment(material);
          }
        }
      } catch {
        if (!this.isCurrent(requestId)) return null;
      }
    }
    if (!this.isCurrent(requestId)) {
      if (active) disposeActiveCatch(active);
      return null;
    }

    active ??= definition.presentation.kind === 'fishing'
      ? prepareProceduralCatch(
        definition.presentation.family,
        definition.presentation.appearance,
        catchId,
      )
      : prepareProceduralItemCatch(
        definition.presentation.itemId,
        definition.presentation.condition,
      );
    this.active = active;
    return active.root;
  }

  hide(): void {
    if (this.disposed) return;
    this.requestId += 1;
    this.releaseActive();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requestId += 1;
    this.releaseActive();
  }

  private isCurrent(requestId: number): boolean {
    return !this.disposed && requestId === this.requestId;
  }

  private releaseActive(): void {
    if (!this.active) return;
    disposeActiveCatch(this.active);
    this.active = null;
  }
}

export interface FishingCatchModelLoader {
  load(url: string): Promise<Object3D>;
}

class GltfFishingCatchModelLoader implements FishingCatchModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Object3D> {
    return (await this.loader.loadAsync(url)).scene;
  }
}

interface ActiveCatch {
  readonly root: Group;
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly textures: Set<Texture>;
}

function collectTextures(materials: Iterable<Material>): Set<Texture> {
  const textures = new Set<Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
  return textures;
}

function collectActiveCatch(root: Group): ActiveCatch {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  return { root, geometries, materials, textures: collectTextures(materials) };
}

function triangleCount(root: Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const position = object.geometry.getAttribute('position');
    if (!position) throw new Error('Fishing model has no position data.');
    triangles += (object.geometry.index?.count ?? position.count) / 3;
  });
  return triangles;
}

function prepareLoadedCatch(
  sourceRoot: Object3D,
  catchId: FishingCatchId,
  spec: FishingCatchModelSpec,
): ActiveCatch {
  const root = new Group();
  root.name = `fishing-catch:${catchId}:model`;
  root.userData.fishingCatchId = catchId;
  root.userData.fishingModelSource = 'poly-pizza';
  root.add(sourceRoot);

  const active = collectActiveCatch(root);
  const triangles = triangleCount(root);
  if (active.geometries.size === 0 || triangles <= 0 || triangles > spec.maxTriangles) {
    disposeActiveCatch(active);
    throw new Error(`Fishing model ${catchId} failed its geometry budget.`);
  }

  sourceRoot.rotation.set(...spec.rotation);
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  if (![size.x, size.y, size.z].every((dimension) => Number.isFinite(dimension) && dimension > 0)) {
    disposeActiveCatch(active);
    throw new Error(`Fishing model ${catchId} has invalid bounds.`);
  }
  sourceRoot.position.sub(center);
  root.scale.setScalar(spec.targetLength / size.x);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.flatShading = true;
      material.roughness = Math.max(material.roughness, 0.72);
      material.metalness = Math.min(material.metalness, 0.05);
      material.needsUpdate = true;
    }
  });
  root.updateMatrixWorld(true);
  return active;
}

function prepareProceduralCatch(
  family: FishingModelFamily,
  appearance: FishingAppearance,
  catchId: FishingCatchId,
): ActiveCatch {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const template = buildFamily(family, geometries, materials);
  applyAppearance(template, appearance);
  template.root.userData.fishingCatchId = catchId;
  template.root.userData.fishingModelSource = 'procedural';
  template.root.visible = true;
  return {
    root: template.root,
    geometries,
    materials,
    textures: new Set<Texture>(),
  };
}

function prepareProceduralItemCatch(
  itemId: ItemId,
  condition: FishingItemCondition,
): ActiveCatch {
  const root = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const body = createMaterial(0x69787a);
  const accent = createMaterial(0xc2aa74);
  materials.add(body);
  materials.add(accent);

  const mesh = (
    name: string,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ): Mesh => {
    geometries.add(geometry);
    const child = new Mesh(geometry, material);
    child.name = name;
    child.castShadow = true;
    child.receiveShadow = true;
    root.add(child);
    return child;
  };

  if (itemId === 'baitTin') {
    mesh('utility:bait:tin', new CylinderGeometry(0.28, 0.3, 0.2, 8), body);
    const lid = mesh('utility:bait:lid', new CylinderGeometry(0.25, 0.25, 0.035, 8), accent);
    lid.position.y = 0.115;
  } else if (itemId === 'ductTape') {
    mesh('utility:tape:roll', new TorusGeometry(0.26, 0.1, 5, 10), body);
  } else if (itemId === 'compass') {
    mesh('utility:compass:case', new CylinderGeometry(0.28, 0.3, 0.1, 10), body);
    const needle = mesh('utility:compass:needle', new ConeGeometry(0.08, 0.32, 3), accent);
    needle.position.y = 0.08;
    needle.rotation.z = Math.PI / 2;
  } else if (itemId === 'fishingNet') {
    const handle = mesh('utility:net:handle', new CylinderGeometry(0.035, 0.045, 0.9, 6), body);
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.42;
    const rim = mesh('utility:net:rim', new TorusGeometry(0.32, 0.035, 5, 10), accent);
    rim.position.x = 0.34;
  } else {
    mesh('utility:energy-bar:wrapper', new BoxGeometry(0.72, 0.16, 0.28), body);
    const band = mesh('utility:energy-bar:band', new BoxGeometry(0.2, 0.18, 0.3), accent);
    band.position.x = 0.08;
  }

  if (condition === 'broken') {
    for (const material of materials) applyBrokenMaterialTreatment(material);
  }
  root.name = `fishing-catch:${itemId}:procedural`;
  root.userData.fishingModelSource = 'procedural-item';
  root.userData.fishingItemId = itemId;
  return { root, geometries, materials, textures: new Set<Texture>() };
}

function disposeActiveCatch(active: ActiveCatch): void {
  active.root.visible = false;
  active.root.removeFromParent();
  disposeResourceSets(active.textures, active.geometries, active.materials);
}
