import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import {
  addTransformedMesh as addMesh,
  type VectorTuple,
} from '../rendering/addTransformedMesh';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { ItemInstanceId } from '../game/ItemState';
import { clamp01, smoothstep, type TimedAnimation } from './animationMath';
import { scaleEventItemDuration } from './eventItemTiming';
import type { ActionOutcome } from './survivalTypes';

export interface DangerousWatersBoatReaction {
  driftX: number;
  pitch: number;
  yaw: number;
  roll: number;
  cameraYaw: number;
  cameraZ: number;
  lightScale: number;
  supplyRoll: number;
  supplyLift: number;
}

type DangerousWatersChoiceId = 'map' | 'compass' | 'sleep';
type MotionKind = 'reveal' | 'choice' | 'safe' | 'damage' | 'severe';

type ActiveMotion = TimedAnimation<MotionKind, {
  readonly choiceId: DangerousWatersChoiceId | null;
  readonly itemUse: boolean;
  readonly cancel: () => void;
}>;

interface PoolMember {
  readonly mesh: Mesh;
  readonly base: Vector3;
  readonly baseRotation: Vector3;
  readonly travel: Vector3;
}

interface DangerousWatersMaterials {
  readonly stone: MeshStandardMaterial;
  readonly stoneLight: MeshStandardMaterial;
  readonly wetStone: MeshStandardMaterial;
  readonly barnacle: MeshStandardMaterial;
  readonly fragment: MeshStandardMaterial;
}

const REVEAL_DURATION = 2.4;
const CHOICE_DURATION = 1.1;
export const DANGEROUS_WATERS_ITEM_DURATION = scaleEventItemDuration(CHOICE_DURATION);
const REACTION_DURATION = 0.9;
const FRAGMENT_COUNT = 8;

const DISTANT_ROCK_PLACEMENTS: readonly Readonly<{
  name: string;
  position: VectorTuple;
  scale: VectorTuple;
  turn: number;
}>[] = Object.freeze([
  { name: 'distant-01', position: [-23, -0.88, -29], scale: [1.6, 1.02, 1.28], turn: 0.28 },
  { name: 'distant-02', position: [-18, -0.92, -37], scale: [1.15, 0.82, 0.96], turn: -0.36 },
  { name: 'distant-03', position: [-15, -0.86, -27], scale: [1.75, 1.18, 1.36], turn: 0.12 },
  { name: 'distant-04', position: [-12, -0.94, -45], scale: [1.05, 0.72, 0.92], turn: 0.42 },
  { name: 'distant-05', position: [-9, -0.9, -33], scale: [1.3, 0.9, 1.08], turn: -0.2 },
  { name: 'distant-06', position: [-5, -0.96, -52], scale: [0.95, 0.68, 0.84], turn: 0.34 },
  { name: 'distant-07', position: [-2, -0.88, -29], scale: [1.55, 1.05, 1.24], turn: -0.08 },
  { name: 'distant-08', position: [2, -0.94, -41], scale: [1.1, 0.78, 0.96], turn: 0.46 },
  { name: 'distant-09', position: [6, -0.9, -31], scale: [1.42, 0.98, 1.16], turn: -0.3 },
  { name: 'distant-10', position: [10, -0.96, -49], scale: [0.98, 0.7, 0.9], turn: 0.18 },
  { name: 'distant-11', position: [13, -0.87, -27], scale: [1.68, 1.12, 1.32], turn: 0.38 },
  { name: 'distant-12', position: [16, -0.92, -38], scale: [1.25, 0.86, 1.04], turn: -0.16 },
  { name: 'distant-13', position: [20, -0.86, -30], scale: [1.52, 1.04, 1.22], turn: 0.24 },
  { name: 'distant-14', position: [24, -0.97, -53], scale: [0.92, 0.64, 0.82], turn: -0.4 },
  { name: 'distant-15', position: [-27, -0.91, -48], scale: [1.3, 0.88, 1.06], turn: 0.16 },
  { name: 'distant-16', position: [-21, -0.95, -56], scale: [0.9, 0.62, 0.8], turn: -0.28 },
  { name: 'distant-17', position: [-1, -0.89, -59], scale: [1.38, 0.94, 1.12], turn: 0.36 },
  { name: 'distant-18', position: [7, -0.96, -58], scale: [0.86, 0.6, 0.78], turn: -0.14 },
  { name: 'distant-19', position: [18, -0.9, -59], scale: [1.46, 0.98, 1.18], turn: 0.3 },
  { name: 'distant-20', position: [28, -0.93, -44], scale: [1.18, 0.8, 1], turn: -0.34 },
  { name: 'distant-21', position: [27, -0.88, -35], scale: [1.58, 1.06, 1.26], turn: 0.2 },
  { name: 'distant-22', position: [-15, -0.7, -25], scale: [2.5, 1.7, 1.9], turn: -0.24 },
  { name: 'distant-23', position: [-10, -0.76, -29], scale: [2.1, 1.42, 1.64], turn: 0.32 },
  { name: 'distant-24', position: [-5, -0.72, -24], scale: [2.35, 1.58, 1.82], turn: -0.1 },
  { name: 'distant-25', position: [2.5, -0.74, -27], scale: [2.2, 1.48, 1.7], turn: 0.26 },
  { name: 'distant-26', position: [8, -0.7, -25], scale: [2.55, 1.72, 1.94], turn: -0.3 },
  { name: 'distant-27', position: [14, -0.78, -29], scale: [2.25, 1.52, 1.76], turn: 0.14 },
  { name: 'distant-28', position: [-14, -0.82, -36], scale: [2.05, 1.38, 1.6], turn: 0.4 },
  { name: 'distant-29', position: [18, -0.8, -38], scale: [2.4, 1.62, 1.86], turn: -0.18 },
  { name: 'distant-30', position: [-24, -0.74, -25], scale: [2.7, 1.8, 2.05], turn: 0.18 },
  { name: 'distant-31', position: [-32, -0.8, -34], scale: [2.4, 1.62, 1.88], turn: -0.3 },
  { name: 'distant-32', position: [-41, -0.88, -44], scale: [2.15, 1.45, 1.7], turn: 0.36 },
  { name: 'distant-33', position: [25, -0.72, -26], scale: [2.75, 1.84, 2.1], turn: -0.22 },
  { name: 'distant-34', position: [33, -0.82, -35], scale: [2.45, 1.65, 1.9], turn: 0.32 },
  { name: 'distant-35', position: [43, -0.9, -46], scale: [2.2, 1.48, 1.74], turn: -0.38 },
]);

function createMaterials(): DangerousWatersMaterials {
  return {
    stone: new MeshStandardMaterial({
      color: 0x3f4b4a,
      roughness: 0.98,
      flatShading: true,
    }),
    stoneLight: new MeshStandardMaterial({
      color: 0x59625c,
      roughness: 0.96,
      flatShading: true,
    }),
    wetStone: new MeshStandardMaterial({
      color: 0x1b3034,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
    }),
    barnacle: new MeshStandardMaterial({
      color: 0xa49b7f,
      roughness: 1,
      flatShading: true,
    }),
    fragment: new MeshStandardMaterial({
      color: 0x515b56,
      roughness: 1,
      flatShading: true,
    }),
  };
}

function createRockGroup(
  name: string,
  position: VectorTuple,
  scale: VectorTuple,
  materials: DangerousWatersMaterials,
  turn: number,
): Group {
  const root = new Group();
  root.name = name;
  root.position.set(...position);
  root.rotation.y = turn;

  addMesh(
    root,
    `${name}:mass`,
    new DodecahedronGeometry(1, 0),
    materials.stone,
    [0, 0.22, 0],
    [0.06, 0.1, -0.03],
    scale,
  );
  addMesh(
    root,
    `${name}:wet-band`,
    new DodecahedronGeometry(1, 0),
    materials.wetStone,
    [0.03, -0.28, 0.02],
    [0.03, -0.06, 0.02],
    [scale[0] * 1.02, scale[1] * 0.42, scale[2] * 1.03],
  );
  addMesh(
    root,
    `${name}:shelf:upper`,
    new BoxGeometry(1.25, 0.22, 0.82),
    materials.stoneLight,
    [-0.34, scale[1] * 0.62, 0.18],
    [0.06, -0.22, 0.08],
    [scale[0] * 0.62, 1, scale[2] * 0.52],
  );
  addMesh(
    root,
    `${name}:shelf:side`,
    new BoxGeometry(0.88, 0.18, 1.05),
    materials.stoneLight,
    [scale[0] * 0.42, scale[1] * 0.15, -0.12],
    [-0.03, 0.3, -0.04],
    [scale[0] * 0.48, 1, scale[2] * 0.58],
  );
  addMesh(
    root,
    `${name}:crack`,
    new BoxGeometry(0.08, 0.72, 0.055),
    materials.wetStone,
    [-0.18, scale[1] * 0.5, scale[2] * 0.9],
    [0.04, 0, -0.28],
    [1, scale[1] * 0.62, 1],
  );

  for (let index = 0; index < 3; index += 1) {
    addMesh(
      root,
      `${name}:barnacle:${index}`,
      new ConeGeometry(0.11 + index * 0.015, 0.22, 6),
      materials.barnacle,
      [
        -scale[0] * 0.34 + index * scale[0] * 0.25,
        -scale[1] * 0.2 + index * 0.08,
        scale[2] * 0.82,
      ],
      [Math.PI / 2, index * 0.6, 0],
    );
  }
  return root;
}

export class DangerousWatersPresentation {
  readonly root = new Group();
  readonly itemAimTarget = new Group();
  private readonly passage = new Group();
  private readonly fragments = new Group();
  private readonly foregroundRock: Group;
  private readonly materials = createMaterials();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly fragmentMembers: PoolMember[] = [];
  private readonly boatReaction: DangerousWatersBoatReaction = {
    driftX: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    cameraYaw: 0,
    cameraZ: 0,
    lightScale: 1,
    supplyRoll: 0,
    supplyLift: 0,
  };
  private activeMotion: ActiveMotion | null = null;
  private heldKind: MotionKind = 'reveal';
  private heldProgress = 0;
  private heldChoiceId: DangerousWatersChoiceId | null = null;
  private resultBaseChoiceId: DangerousWatersChoiceId | null = null;
  private disposed = false;

  constructor() {
    this.root.name = 'dangerous-waters-presentation';
    this.root.visible = false;
    this.passage.name = 'dangerous-waters-passage';
    this.fragments.name = 'dangerous-waters-fragments';

    this.foregroundRock = createRockGroup(
      'dangerous-waters-rock:foreground',
      [-5.2, -0.72, -6.8],
      [2.1, 1.05, 1.45],
      this.materials,
      0.22,
    );
    const portRock = createRockGroup(
      'dangerous-waters-rock:port',
      [-9.2, -0.42, -12.5],
      [2.85, 2.15, 1.85],
      this.materials,
      -0.12,
    );
    const starboardRock = createRockGroup(
      'dangerous-waters-rock:starboard',
      [8.7, -0.5, -14.8],
      [3.25, 2.45, 2.1],
      this.materials,
      0.18,
    );
    const portFarRock = createRockGroup(
      'dangerous-waters-rock:port-far',
      [-12.6, -0.7, -20.4],
      [1.8, 1.35, 1.4],
      this.materials,
      0.31,
    );
    const starboardNearRock = createRockGroup(
      'dangerous-waters-rock:starboard-near',
      [5.4, -0.76, -8.1],
      [1.45, 0.92, 1.2],
      this.materials,
      -0.24,
    );
    const channelRock = createRockGroup(
      'dangerous-waters-rock:channel',
      [1.2, -0.86, -18.2],
      [1.2, 0.78, 1.05],
      this.materials,
      0.12,
    );
    const horizonRock = createRockGroup(
      'dangerous-waters-rock:horizon',
      [-3.4, -0.82, -24.5],
      [1.6, 1.1, 1.25],
      this.materials,
      -0.18,
    );
    const distantRocks = DISTANT_ROCK_PLACEMENTS.map((placement) => (
      createRockGroup(
        `dangerous-waters-rock:${placement.name}`,
        placement.position,
        placement.scale,
        this.materials,
        placement.turn,
      )
    ));
    this.itemAimTarget.name = 'dangerous-waters-item-aim-target';
    this.itemAimTarget.position.set(0, 0.5, -8);
    this.passage.add(
      this.foregroundRock,
      portRock,
      starboardRock,
      portFarRock,
      starboardNearRock,
      channelRock,
      horizonRock,
      ...distantRocks,
      this.itemAimTarget,
    );
    this.root.add(this.passage, this.fragments);
    this.buildFragmentPool();
    collectMeshResources(this.root, this.ownedGeometries, this.ownedMaterials);
    this.applyPose('reveal', 0, null);
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActiveMotion();
    this.root.visible = true;
    this.heldKind = 'reveal';
    this.heldProgress = 0;
    this.heldChoiceId = null;
    this.resultBaseChoiceId = null;
    this.applyPose('reveal', 0, null);
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.root.visible) this.stage();
    return this.startMotion('reveal', null, REVEAL_DURATION);
  }

  playChoice(choiceId: string): Promise<void> {
    if (
      this.disposed
      || (choiceId !== 'map' && choiceId !== 'compass' && choiceId !== 'sleep')
    ) return Promise.resolve();
    this.resultBaseChoiceId = null;
    return this.startMotion('choice', choiceId, CHOICE_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || (choiceId !== 'map' && choiceId !== 'compass')
    ) return Promise.resolve(false);
    this.cancelActiveMotion();
    this.resultBaseChoiceId = null;
    return new Promise((resolve) => {
      this.beginMotion(
        'choice',
        choiceId,
        DANGEROUS_WATERS_ITEM_DURATION,
        true,
        () => resolve(true),
        () => resolve(false),
      );
    });
  }

  react(outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.resultBaseChoiceId = this.heldKind === 'choice'
      ? this.heldChoiceId
      : null;
    this.heldChoiceId = null;
    const hullDamage = Math.max(0, -(outcome.deltas.hull ?? 0));
    const kind: MotionKind = hullDamage >= 25
      ? 'severe'
      : hullDamage > 0
        ? 'damage'
        : 'safe';
    return this.startMotion(kind, null, REACTION_DURATION);
  }

  copyBoatReaction(target: DangerousWatersBoatReaction): boolean {
    if (this.disposed || !this.root.visible) return false;
    target.driftX = this.boatReaction.driftX;
    target.pitch = this.boatReaction.pitch;
    target.yaw = this.boatReaction.yaw;
    target.roll = this.boatReaction.roll;
    target.cameraYaw = this.boatReaction.cameraYaw;
    target.cameraZ = this.boatReaction.cameraZ;
    target.lightScale = this.boatReaction.lightScale;
    target.supplyRoll = this.boatReaction.supplyRoll;
    target.supplyLift = this.boatReaction.supplyLift;
    return true;
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveMotion();
    this.heldKind = 'reveal';
    this.heldProgress = 0;
    this.heldChoiceId = null;
    this.resultBaseChoiceId = null;
    this.applyPose('reveal', 0, null);
    this.root.visible = false;
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.heldChoiceId = null;
    this.resultBaseChoiceId = null;
    if (this.activeMotion === null) {
      this.heldKind = 'reveal';
      this.heldProgress = 1;
      this.applyPose('reveal', 1, null);
      return;
    }
    const motion = this.activeMotion;
    this.activeMotion = null;
    this.heldKind = motion.kind === 'choice' ? 'reveal' : motion.kind;
    this.heldProgress = 1;
    this.applyPose(this.heldKind, 1, null);
    motion.resolve();
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.root.visible || delta < 0) return;
    const motion = this.activeMotion;
    if (motion === null) {
      const choiceId = this.heldKind === 'choice' ? this.heldChoiceId : null;
      this.applyPose(this.heldKind, this.heldProgress, choiceId);
      return;
    }

    motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.max(0, delta));
    const progress = motion.elapsed / motion.duration;
    this.applyPose(motion.kind, progress, motion.choiceId);
    if (progress < 1) return;

    this.activeMotion = null;
    this.heldKind = motion.kind;
    this.heldProgress = 1;
    this.heldChoiceId = motion.kind === 'choice' ? motion.choiceId : null;
    this.applyPose(this.heldKind, 1, this.heldChoiceId);
    motion.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private buildFragmentPool(): void {
    const geometry = new TetrahedronGeometry(0.12, 0);
    for (let index = 0; index < FRAGMENT_COUNT; index += 1) {
      const angle = -0.6 + index * 0.28;
      const base = new Vector3(-2.25, -0.08, -2.65);
      const mesh = addMesh(
        this.fragments,
        `dangerous-waters-fragment:${index}`,
        geometry,
        this.materials.fragment,
        [base.x, base.y, base.z],
        [index * 0.37, index * 0.51, index * 0.23],
        [0.72 + (index % 3) * 0.18, 0.72, 0.72],
      );
      mesh.visible = false;
      this.fragmentMembers.push({
        mesh,
        base,
        baseRotation: new Vector3(
          index * 0.37,
          index * 0.51,
          index * 0.23,
        ),
        travel: new Vector3(
          Math.cos(angle) * (0.7 + index * 0.06),
          0.7 + (index % 4) * 0.16,
          Math.sin(angle) * (0.55 + index * 0.05),
        ),
      });
    }
  }

  private startMotion(
    kind: MotionKind,
    choiceId: DangerousWatersChoiceId | null,
    duration: number,
  ): Promise<void> {
    this.cancelActiveMotion();
    return new Promise((resolve) => {
      this.beginMotion(kind, choiceId, duration, false, resolve, resolve);
    });
  }

  private beginMotion(
    kind: MotionKind,
    choiceId: DangerousWatersChoiceId | null,
    duration: number,
    itemUse: boolean,
    resolve: () => void,
    cancel: () => void,
  ): void {
    this.activeMotion = {
      kind,
      choiceId,
      elapsed: 0,
      duration,
      itemUse,
      resolve,
      cancel,
    };
    this.applyPose(kind, 0, choiceId);
  }

  private applyPose(
    kind: MotionKind,
    progress: number,
    choiceId: DangerousWatersChoiceId | null,
  ): void {
    this.resetPose();
    const value = clamp01(progress);
    switch (kind) {
      case 'reveal':
        break;
      case 'choice':
        this.applyChoicePose(value, choiceId);
        break;
      case 'safe':
        this.applySettledRoutePose(this.resultBaseChoiceId);
        this.applySafePose(value);
        break;
      case 'damage':
        this.applySettledRoutePose(this.resultBaseChoiceId);
        this.applyDamagePose(value, 1);
        break;
      case 'severe':
        this.applySettledRoutePose(this.resultBaseChoiceId);
        this.applySeverePose(value);
        break;
    }
  }

  private resetPose(): void {
    this.passage.position.set(0, 0, 0);
    this.boatReaction.pitch = 0;
    this.boatReaction.driftX = 0;
    this.boatReaction.yaw = 0;
    this.boatReaction.roll = 0;
    this.boatReaction.cameraYaw = 0;
    this.boatReaction.cameraZ = 0;
    this.boatReaction.lightScale = 1;
    this.boatReaction.supplyRoll = 0;
    this.boatReaction.supplyLift = 0;
    for (const fragment of this.fragmentMembers) {
      fragment.mesh.visible = false;
      fragment.mesh.position.copy(fragment.base);
      fragment.mesh.rotation.set(
        fragment.baseRotation.x,
        fragment.baseRotation.y,
        fragment.baseRotation.z,
      );
    }
  }

  private applyChoicePose(
    progress: number,
    choiceId: DangerousWatersChoiceId | null,
  ): void {
    const pulse = progress >= 1 ? 0 : Math.sin(Math.PI * progress);
    const lift = smoothstep(Math.min(1, progress / 0.55));
    if (choiceId === 'map') {
      this.boatReaction.yaw -= pulse * 0.025 + lift * 0.02;
    } else if (choiceId === 'compass') {
      this.boatReaction.yaw -= pulse * 0.014 + lift * 0.035;
    } else if (choiceId === 'sleep') {
      this.boatReaction.driftX -= lift * 0.12;
      this.boatReaction.lightScale -= pulse * 0.36 + lift * 0.22;
      this.boatReaction.pitch += pulse * 0.025 + lift * 0.012;
    }
  }

  private applySafePose(progress: number): void {
    const eased = smoothstep(progress);
    this.boatReaction.driftX -= eased * 0.48;
    this.boatReaction.yaw -= Math.sin(Math.PI * progress) * 0.028;
  }

  private applyDamagePose(progress: number, severity: number): void {
    const impact = Math.sin(Math.PI * progress);
    const hold = smoothstep((progress - 0.55) / 0.45);
    this.boatReaction.pitch += (impact * 0.07 + hold * 0.018) * severity;
    this.boatReaction.roll += (impact * -0.045 + hold * -0.035) * severity;
    this.boatReaction.cameraZ += (impact * -0.09 + hold * -0.055) * severity;
    this.boatReaction.supplyRoll += (impact * 0.08 + hold * 0.052) * severity;
    this.boatReaction.supplyLift += (impact * 0.1 + hold * 0.035) * severity;
  }

  private applySeverePose(progress: number): void {
    this.applyDamagePose(progress, 1.65);
    const fragmentTravel = smoothstep((progress - 0.24) / 0.5);
    for (const fragment of this.fragmentMembers) {
      fragment.mesh.visible = progress >= 0.24 && progress < 0.9;
      fragment.mesh.position.x = fragment.base.x + fragment.travel.x * fragmentTravel;
      fragment.mesh.position.y = fragment.base.y
        + fragment.travel.y * fragmentTravel
        - fragmentTravel * fragmentTravel * 0.62;
      fragment.mesh.position.z = fragment.base.z + fragment.travel.z * fragmentTravel;
      fragment.mesh.rotation.x = fragment.baseRotation.x + fragmentTravel * 2.4;
      fragment.mesh.rotation.y = fragment.baseRotation.y + fragmentTravel * 3.2;
    }
  }

  private applySettledRoutePose(
    choiceId: DangerousWatersChoiceId | null,
  ): void {
    if (choiceId !== null) this.applyChoicePose(1, choiceId);
  }

  private cancelActiveMotion(): void {
    const motion = this.activeMotion;
    this.activeMotion = null;
    motion?.cancel();
  }
}
