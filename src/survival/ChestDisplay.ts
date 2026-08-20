import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import { clamp01Unchecked } from './animationMath';
import type { ChestSnapshot } from './survivalTypes';

export const CHEST_DISPLAY_SCALE = 0.5;
export const CHEST_DISAPPEAR_DURATION = 0.6;

interface ChestMaterialState {
  readonly opacity: number;
  readonly transparent: boolean;
  readonly depthWrite: boolean;
}

export interface ChestEventPose {
  readonly rattle: number;
  readonly mouthOpen: number;
  readonly bite: number;
  readonly bound: number;
  readonly broken: number;
  readonly overboard: number;
}

const CLOSED_POSE: ChestEventPose = Object.freeze({
  rattle: 0,
  mouthOpen: 0,
  bite: 0,
  bound: 0,
  broken: 0,
  overboard: 0,
});

function findImportedLid(root: Group): Object3D | null {
  let lid: Object3D | null = null;
  root.traverse((object) => {
    if (lid !== null || object === root) return;
    const name = object.name.toLowerCase();
    if (
      name === 'lid'
      || name === 'chest_top'
      || name.endsWith(':lid')
      || name.endsWith('-lid')
      || name.endsWith('_lid')
    ) {
      lid = object;
    }
  });
  return lid;
}

export class ChestDisplay {
  readonly root = new Group();
  private readonly lid = new Group();
  private readonly mimicParts = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly materialStates = new Map<Material, ChestMaterialState>();
  private readonly basePosition = new Vector3(0, 0.22, 0.55);
  private readonly baseQuaternion = new Quaternion();
  private readonly lidBaseQuaternion = new Quaternion();
  private lastSnapshot: ChestSnapshot = { state: 'none', acquiredDay: null };
  private disappearElapsed = CHEST_DISAPPEAR_DURATION;
  private disappearing = false;
  private disposed = false;

  constructor(chestClosed: Group | null = null) {
    this.root.name = 'persistent-chest';
    this.root.position.copy(this.basePosition);
    this.root.rotation.y = Math.PI;
    this.root.scale.setScalar(CHEST_DISPLAY_SCALE);
    this.baseQuaternion.copy(this.root.quaternion);
    this.root.visible = false;

    const tooth = this.material(0xc7b88f, 0.88);
    const mouth = this.material(0x241215, 0.98);
    const gum = this.material(0x734040, 0.9);
    const tongue = this.material(0x82474a, 0.86);

    const importedLid = chestClosed === null ? null : findImportedLid(chestClosed);
    if (chestClosed !== null && importedLid !== null && importedLid.parent !== null) {
      chestClosed.position.y -= 0.47;
      this.root.add(chestClosed);
      this.installStableLidPivot(importedLid);
      this.root.userData.modelKind = 'imported';
    } else {
      if (chestClosed !== null) {
        chestClosed.visible = false;
        chestClosed.name = chestClosed.name || 'unused-chest-template';
        this.root.add(chestClosed);
      }
      const wood = this.material(0x59402f, 0.96);
      const darkWood = this.material(0x302720, 1);
      const iron = this.material(0x4b5555, 0.72, 0.32);
      this.buildProceduralChest(wood, darkWood, iron);
      this.root.userData.modelKind = 'procedural';
    }

    this.mimicParts.name = 'chest-mimic-parts';
    this.box(
      this.mimicParts,
      'mimic-mouth-shadow',
      [0.64, 0.17, 0.06],
      [0, 0.17, 0.3],
      mouth,
    );
    this.box(
      this.mimicParts,
      'mimic-gum-upper',
      [0.66, 0.055, 0.075],
      [0, 0.27, 0.335],
      gum,
    );
    this.box(
      this.mimicParts,
      'mimic-gum-lower',
      [0.64, 0.055, 0.075],
      [0, 0.095, 0.34],
      gum,
    );
    this.addTeeth(tooth);
    const tongueGeometry = new SphereGeometry(0.13, 7, 5);
    const tongueMesh = new Mesh(tongueGeometry, tongue);
    tongueMesh.name = 'mimic-tongue';
    tongueMesh.position.set(0.055, 0.12, 0.37);
    tongueMesh.scale.set(1.55, 0.34, 0.68);
    tongueMesh.rotation.z = -0.11;
    this.mimicParts.add(tongueMesh);
    this.root.add(this.mimicParts);

    collectMeshResources(this.root, this.geometries, this.materials);
    this.materials.forEach((material) => {
      this.materialStates.set(material, {
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      });
    });
    this.lidBaseQuaternion.copy(this.lid.quaternion);
    this.restorePose();
  }

  sync(chest: ChestSnapshot): void {
    if (this.disposed) return;
    const previousState = this.lastSnapshot.state;
    this.lastSnapshot = chest;
    if (chest.state === 'none' && previousState !== 'none') {
      this.startDisappear();
      return;
    }
    if (chest.state === 'none') {
      if (!this.disappearing) this.root.visible = false;
      return;
    }
    this.cancelDisappear();
    this.restorePose();
  }

  update(delta: number): void {
    if (this.disposed || !this.disappearing || delta <= 0) return;
    this.disappearElapsed = Math.min(
      CHEST_DISAPPEAR_DURATION,
      this.disappearElapsed + delta,
    );
    const progress = this.disappearElapsed / CHEST_DISAPPEAR_DURATION;
    const opacity = 1 - progress * progress * (3 - 2 * progress);
    this.materialStates.forEach((state, material) => {
      material.opacity = state.opacity * opacity;
    });
    const scale = CHEST_DISPLAY_SCALE * (1 - progress * 0.08);
    this.root.scale.setScalar(scale);

    if (progress >= 1) {
      this.disappearing = false;
      this.root.userData.disappearing = false;
      this.root.visible = false;
      this.restoreMaterialState();
      this.root.scale.setScalar(CHEST_DISPLAY_SCALE);
    }
  }

  stageMimic(): void {
    if (this.disposed) return;
    this.cancelDisappear();
    this.root.visible = true;
    this.mimicParts.visible = true;
    this.applyEventPose(CLOSED_POSE);
  }

  applyEventPose(pose: ChestEventPose): void {
    if (this.disposed) return;
    const mouthOpen = clamp01Unchecked(pose.mouthOpen);
    const bite = clamp01Unchecked(pose.bite);
    const bound = clamp01Unchecked(pose.bound);
    const broken = clamp01Unchecked(pose.broken);
    const overboard = clamp01Unchecked(pose.overboard);
    const rattle = Math.min(1, Math.max(-1, pose.rattle));

    this.root.visible = overboard < 1;
    this.root.position.copy(this.basePosition);
    this.root.position.x += rattle * 0.085 + broken * 0.14;
    this.root.position.y += bite * 0.12 - overboard * 1.65;
    this.root.position.z += bite * 0.68;
    this.root.position.z += overboard * 1.25;
    this.root.quaternion.copy(this.baseQuaternion);
    this.root.rotateY(rattle * 0.12);
    this.root.rotateX(overboard * 1.08);
    this.root.rotateZ(broken * 0.72);

    this.lid.quaternion.copy(this.lidBaseQuaternion);
    this.lid.rotateX(-mouthOpen * (1 - bound) * 1.12);
    this.mimicParts.visible = true;
    this.mimicParts.position.y = mouthOpen * 0.025 - bound * 0.04;
    this.mimicParts.scale.set(
      1 + bite * 0.08,
      0.16 + mouthOpen * 0.84,
      1 + bite * 0.12,
    );
    this.mimicParts.rotation.z = broken * -0.16;

    this.root.userData.rattle = rattle;
    this.root.userData.mouthOpen = mouthOpen * (1 - bound);
    this.root.userData.bite = bite;
    this.root.userData.bound = bound;
    this.root.userData.broken = broken;
    this.root.userData.overboard = overboard;
  }

  restorePose(): void {
    if (this.disposed) return;
    const mimic = this.lastSnapshot.state === 'mimic';
    this.root.visible = this.lastSnapshot.state !== 'none';
    this.applyEventPose({
      ...CLOSED_POSE,
      mouthOpen: mimic ? 0.46 : 0,
    });
    this.root.visible = this.lastSnapshot.state !== 'none';
    this.mimicParts.visible = mimic;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
  }

  private startDisappear(): void {
    this.disappearing = true;
    this.disappearElapsed = 0;
    this.root.userData.disappearing = true;
    this.root.visible = true;
    this.root.scale.setScalar(CHEST_DISPLAY_SCALE);
    this.materialStates.forEach((_state, material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
    });
  }

  private cancelDisappear(): void {
    if (!this.disappearing) return;
    this.disappearing = false;
    this.disappearElapsed = CHEST_DISAPPEAR_DURATION;
    this.root.userData.disappearing = false;
    this.restoreMaterialState();
    this.root.scale.setScalar(CHEST_DISPLAY_SCALE);
  }

  private restoreMaterialState(): void {
    this.materialStates.forEach((state, material) => {
      material.opacity = state.opacity;
      material.transparent = state.transparent;
      material.depthWrite = state.depthWrite;
      material.needsUpdate = true;
    });
  }

  private installStableLidPivot(importedLid: Object3D): void {
    const parent = importedLid.parent!;
    this.lid.name = 'chest-lid';
    this.lid.position.copy(importedLid.position);
    this.lid.quaternion.copy(importedLid.quaternion);
    this.lid.scale.copy(importedLid.scale);
    parent.add(this.lid);
    importedLid.position.set(0, 0, 0);
    importedLid.quaternion.identity();
    importedLid.scale.set(1, 1, 1);
    this.lid.add(importedLid);
  }

  private buildProceduralChest(
    wood: Material,
    darkWood: Material,
    iron: Material,
  ): void {
    this.box(this.root, 'chest-body', [0.78, 0.38, 0.54], [0, 0, 0], wood);
    this.box(
      this.root,
      'chest-foot-left',
      [0.12, 0.09, 0.5],
      [-0.25, -0.22, 0],
      darkWood,
    );
    this.box(
      this.root,
      'chest-foot-right',
      [0.12, 0.09, 0.5],
      [0.25, -0.22, 0],
      darkWood,
    );
    this.box(
      this.root,
      'chest-band-left',
      [0.09, 0.43, 0.57],
      [-0.25, 0.01, 0],
      iron,
    );
    this.box(
      this.root,
      'chest-band-right',
      [0.09, 0.43, 0.57],
      [0.25, 0.01, 0],
      iron,
    );

    this.lid.name = 'chest-lid';
    this.lid.position.set(0, 0.22, 0.25);
    this.box(
      this.lid,
      'chest-lid-shell',
      [0.82, 0.2, 0.58],
      [0, 0, -0.25],
      wood,
    );
    this.box(
      this.lid,
      'chest-lid-band',
      [0.1, 0.23, 0.6],
      [0, 0, -0.25],
      iron,
    );
    this.root.add(this.lid);
    this.box(
      this.root,
      'chest-lock',
      [0.16, 0.2, 0.08],
      [0, 0.07, 0.31],
      iron,
    );
  }

  private addTeeth(material: Material): void {
    const upper = [
      [-0.255, 0.235, 0.365, 0.135],
      [-0.105, 0.23, 0.37, 0.17],
      [0.065, 0.232, 0.368, 0.145],
      [0.235, 0.228, 0.363, 0.18],
    ] as const;
    const lower = [
      [-0.205, 0.125, 0.37, 0.13],
      [-0.025, 0.122, 0.373, 0.16],
      [0.165, 0.126, 0.368, 0.12],
    ] as const;
    upper.forEach(([x, y, z, height], index) => {
      const mesh = new Mesh(new ConeGeometry(0.043, height, 5), material);
      mesh.name = `mimic-tooth-upper-${index + 1}`;
      mesh.position.set(x, y, z);
      mesh.rotation.x = Math.PI;
      mesh.rotation.z = index % 2 === 0 ? -0.06 : 0.08;
      this.mimicParts.add(mesh);
    });
    lower.forEach(([x, y, z, height], index) => {
      const mesh = new Mesh(new ConeGeometry(0.04, height, 5), material);
      mesh.name = `mimic-tooth-lower-${index + 1}`;
      mesh.position.set(x, y, z);
      mesh.rotation.z = index % 2 === 0 ? 0.08 : -0.05;
      this.mimicParts.add(mesh);
    });
  }

  private material(
    color: number,
    roughness: number,
    metalness = 0,
  ): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: true,
    });
  }

  private box(
    parent: Group,
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: Material,
  ): void {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    parent.add(mesh);
  }
}
