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
  Vector3,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';
import {
  FISHING_CATCHES,
  type FishingAppearance,
  type FishingCatchId,
  type FishingModelFamily,
} from './fishingCatalog';

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

const FAMILY_ORDER: readonly FishingModelFamily[] = [
  'ordinaryFish',
  'flatfish',
  'crab',
  'squid',
  'swordfish',
  'seaweed',
  'boot',
  'bottle',
];

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

function buildFlatfish(root: Group, context: TemplateBuildContext): void {
  addFishBody(root, context, 'flatfish', [1.34, 0.35, 1.06]);
  const eye = addMesh(
    root,
    context,
    'fishing-catch:flatfish:eye',
    new SphereGeometry(0.052, 6, 4),
    context.accent,
  );
  eye.position.set(0.37, 0.19, 0.17);
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

function buildSwordfish(root: Group, context: TemplateBuildContext): void {
  addFishBody(root, context, 'swordfish', [1.5, 0.72, 0.62]);
  const sword = addMesh(
    root,
    context,
    'fishing-catch:swordfish:sword',
    new ConeGeometry(0.065, 0.94, 6),
    context.accent,
  );
  sword.position.x = 1.16;
  sword.rotation.z = -Math.PI / 2;
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
    case 'flatfish': buildFlatfish(root, context); break;
    case 'crab': buildCrab(root, context); break;
    case 'squid': buildSquid(root, context); break;
    case 'swordfish': buildSwordfish(root, context); break;
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

export class FishingCatchLibrary {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly templates = new Map<FishingModelFamily, FamilyTemplate>();
  private active: Group | null = null;
  private disposed = false;

  constructor() {
    for (const family of FAMILY_ORDER) {
      this.templates.set(family, buildFamily(family, this.geometries, this.materials));
    }
  }

  prepare(catchId: FishingCatchId): Object3D {
    if (this.disposed) throw new Error('Fishing catch library is disposed.');
    const definition = FISHING_CATCHES.find(({ id }) => id === catchId);
    if (!definition) throw new Error(`Unknown fishing catch: ${catchId}`);
    for (const template of this.templates.values()) template.root.visible = false;
    const template = this.templates.get(definition.family);
    if (!template) throw new Error(`Missing fishing catch family: ${definition.family}`);
    applyAppearance(template, definition.appearance);
    template.root.userData.fishingCatchId = catchId;
    template.root.visible = true;
    this.active = template.root;
    return template.root;
  }

  hide(): void {
    if (this.disposed) return;
    for (const template of this.templates.values()) template.root.visible = false;
    this.active = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = null;
    for (const template of this.templates.values()) {
      template.root.visible = false;
      template.root.removeFromParent();
    }
    this.templates.clear();
    disposeResourceSets(this.geometries, this.materials);
  }
}
