import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
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

export interface DangerousWatersItemPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

type DangerousWatersChoiceId = 'map' | 'compass' | 'sleep';
type MotionKind = 'reveal' | 'choice' | 'safe' | 'damage' | 'severe';

interface ActiveMotion {
  readonly kind: MotionKind;
  readonly choiceId: DangerousWatersChoiceId | null;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface PoolMember {
  readonly mesh: Mesh;
  readonly base: Vector3;
  readonly baseRotation: Vector3;
  readonly travel: Vector3;
}

interface RockWaveMember {
  readonly root: Group;
  readonly base: Vector3;
  readonly baseRotation: Vector3;
  readonly phaseX: number;
  readonly phaseZ: number;
}

interface DangerousWatersMaterials {
  readonly stone: MeshStandardMaterial;
  readonly stoneLight: MeshStandardMaterial;
  readonly wetStone: MeshStandardMaterial;
  readonly barnacle: MeshStandardMaterial;
  readonly creature: MeshStandardMaterial;
  readonly creatureDark: MeshStandardMaterial;
  readonly eye: MeshStandardMaterial;
  readonly foam: MeshBasicMaterial;
  readonly fragment: MeshStandardMaterial;
}

type VectorTuple = readonly [number, number, number];

const REVEAL_DURATION = 2.4;
const CHOICE_DURATION = 1.1;
const REACTION_DURATION = 0.9;
const FOAM_COUNT = 12;
const FRAGMENT_COUNT = 8;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function keyedTravel(progress: number): number {
  const value = clamp01(progress);
  if (value < 0.16) return -0.045 * Math.sin((value / 0.16) * Math.PI);
  if (value < 0.82) return smoothstep((value - 0.16) / 0.66) * 1.045;
  return 1.045 + (1 - 1.045) * smoothstep((value - 0.82) / 0.18);
}

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
    creature: new MeshStandardMaterial({
      color: 0x183238,
      roughness: 0.92,
      flatShading: true,
    }),
    creatureDark: new MeshStandardMaterial({
      color: 0x09191d,
      roughness: 1,
      flatShading: true,
    }),
    eye: new MeshStandardMaterial({
      color: 0xd26d3e,
      emissive: 0x5a190c,
      emissiveIntensity: 1.1,
      roughness: 0.38,
      flatShading: true,
    }),
    foam: new MeshBasicMaterial({
      color: 0xa8c9cb,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    fragment: new MeshStandardMaterial({
      color: 0x515b56,
      roughness: 1,
      flatShading: true,
    }),
  };
}

function addMesh(
  parent: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  position: VectorTuple = [0, 0, 0],
  rotation: VectorTuple = [0, 0, 0],
  scale: VectorTuple = [1, 1, 1],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
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

function createLurker(materials: DangerousWatersMaterials): Group {
  const root = new Group();
  root.name = 'dangerous-waters-lurker';
  root.position.set(3.25, 0.72, -8.6);
  root.rotation.y = -0.42;

  addMesh(
    root,
    'dangerous-waters-lurker:head',
    new SphereGeometry(0.88, 9, 6),
    materials.creature,
    [0, 0.28, 0],
    [0.03, 0.08, -0.06],
    [1.3, 0.76, 0.9],
  );
  addMesh(
    root,
    'dangerous-waters-lurker:brow:left',
    new SphereGeometry(0.27, 7, 5),
    materials.creatureDark,
    [-0.35, 0.46, 0.69],
    [0, 0, 0.18],
    [1.25, 0.62, 0.45],
  );
  addMesh(
    root,
    'dangerous-waters-lurker:brow:right',
    new SphereGeometry(0.23, 7, 5),
    materials.creatureDark,
    [0.31, 0.51, 0.71],
    [0, 0, -0.14],
    [1.08, 0.7, 0.43],
  );
  addMesh(
    root,
    'dangerous-waters-lurker:eye:left',
    new SphereGeometry(0.095, 7, 5),
    materials.eye,
    [-0.35, 0.46, 0.86],
    [0, 0, 0],
    [1, 0.72, 0.46],
  );
  addMesh(
    root,
    'dangerous-waters-lurker:eye:right',
    new SphereGeometry(0.075, 7, 5),
    materials.eye,
    [0.31, 0.51, 0.88],
    [0, 0, 0],
    [1, 0.72, 0.46],
  );
  addMesh(
    root,
    'dangerous-waters-lurker:mouth',
    new BoxGeometry(0.62, 0.055, 0.045),
    materials.creatureDark,
    [-0.02, 0.08, 0.84],
    [0, 0, -0.06],
  );

  const fin = new Group();
  fin.name = 'dangerous-waters-lurker:grip-fin';
  fin.position.set(-0.95, -0.18, 0.12);
  fin.rotation.set(0.18, -0.25, 0.42);
  addMesh(
    fin,
    'dangerous-waters-lurker:grip-palm',
    new DodecahedronGeometry(0.32, 0),
    materials.creature,
    [0, 0, 0],
    [0, 0, 0],
    [1.3, 0.55, 0.9],
  );
  for (let index = 0; index < 3; index += 1) {
    addMesh(
      fin,
      `dangerous-waters-lurker:finger:${index}`,
      new ConeGeometry(0.065, 0.48 - index * 0.045, 6),
      materials.creature,
      [-0.21 + index * 0.2, -0.3, 0.02],
      [0, 0, -0.12 + index * 0.1],
    );
  }
  root.add(fin);
  return root;
}

export class DangerousWatersPresentation {
  readonly root = new Group();
  private readonly passage = new Group();
  private readonly lurker: Group;
  private readonly foam = new Group();
  private readonly fragments = new Group();
  private readonly foregroundRock: Group;
  private readonly materials = createMaterials();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly foamMembers: PoolMember[] = [];
  private readonly fragmentMembers: PoolMember[] = [];
  private readonly rockWaveMembers: RockWaveMember[];
  private readonly passageBase = new Vector3();
  private readonly itemPose: DangerousWatersItemPose = {
    x: 0, y: 0, z: 0,
    yaw: 0, pitch: 0, roll: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  };
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
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private activeMotion: ActiveMotion | null = null;
  private heldKind: MotionKind = 'reveal';
  private heldProgress = 0;
  private heldChoiceId: DangerousWatersChoiceId | null = null;
  private disposed = false;

  constructor() {
    this.root.name = 'dangerous-waters-presentation';
    this.root.visible = false;
    this.passage.name = 'dangerous-waters-passage';
    this.foam.name = 'dangerous-waters-foam';
    this.fragments.name = 'dangerous-waters-fragments';

    this.foregroundRock = createRockGroup(
      'dangerous-waters-rock:foreground',
      [-3.8, -0.72, -3.4],
      [2.1, 1.05, 1.45],
      this.materials,
      0.22,
    );
    const portRock = createRockGroup(
      'dangerous-waters-rock:port',
      [-5.35, -0.42, -8.5],
      [2.85, 2.15, 1.85],
      this.materials,
      -0.12,
    );
    const starboardRock = createRockGroup(
      'dangerous-waters-rock:starboard',
      [4.95, -0.5, -10.2],
      [3.25, 2.45, 2.1],
      this.materials,
      0.18,
    );
    this.lurker = createLurker(this.materials);
    this.passage.add(this.foregroundRock, portRock, starboardRock, this.lurker);
    this.root.add(this.passage, this.foam, this.fragments);
    this.rockWaveMembers = [
      this.createRockWaveMember(this.foregroundRock, 0.16, -0.11),
      this.createRockWaveMember(portRock, -0.09, 0.14),
      this.createRockWaveMember(starboardRock, 0.12, 0.07),
    ];
    this.passageBase.copy(this.passage.position);
    this.buildFoamPool();
    this.buildFragmentPool();
    collectMeshResources(this.root, this.ownedGeometries, this.ownedMaterials);
    this.applyPose('reveal', 0, null, 0);
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActiveMotion();
    this.root.visible = true;
    this.heldKind = 'reveal';
    this.heldProgress = 0;
    this.heldChoiceId = null;
    this.applyPose('reveal', 0, null, 0);
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
    return this.startMotion('choice', choiceId, CHOICE_DURATION);
  }

  react(outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
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

  copyItemPose(target: DangerousWatersItemPose): boolean {
    if (
      this.disposed
      || (this.activeMotion?.kind !== 'choice' && this.heldKind !== 'choice')
      || (this.activeMotion?.choiceId ?? this.heldChoiceId) === 'sleep'
      || (this.activeMotion?.choiceId ?? this.heldChoiceId) === null
    ) return false;
    target.x = this.itemPose.x;
    target.y = this.itemPose.y;
    target.z = this.itemPose.z;
    target.yaw = this.itemPose.yaw;
    target.pitch = this.itemPose.pitch;
    target.roll = this.itemPose.roll;
    target.scaleX = this.itemPose.scaleX;
    target.scaleY = this.itemPose.scaleY;
    target.scaleZ = this.itemPose.scaleZ;
    return true;
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveMotion();
    this.heldKind = 'reveal';
    this.heldProgress = 0;
    this.heldChoiceId = null;
    this.applyPose('reveal', 0, null, 0);
    this.root.visible = false;
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.heldChoiceId = null;
    if (this.activeMotion === null) {
      this.heldKind = 'reveal';
      this.heldProgress = 1;
      this.applyPose('reveal', 1, null, 0);
      return;
    }
    const motion = this.activeMotion;
    this.activeMotion = null;
    this.heldKind = motion.kind === 'choice' ? 'reveal' : motion.kind;
    this.heldProgress = 1;
    this.applyPose(this.heldKind, 1, null, 0);
    motion.resolve();
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.root.visible || delta < 0) return;
    const motion = this.activeMotion;
    if (motion === null) {
      this.applyPose(this.heldKind, this.heldProgress, null, time);
      return;
    }

    motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.max(0, delta));
    const progress = motion.elapsed / motion.duration;
    this.applyPose(motion.kind, progress, motion.choiceId, time);
    if (progress < 1) return;

    this.activeMotion = null;
    this.heldKind = motion.kind;
    this.heldProgress = 1;
    this.heldChoiceId = motion.kind === 'choice' ? motion.choiceId : null;
    this.applyPose(this.heldKind, 1, this.heldChoiceId, time);
    motion.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private buildFoamPool(): void {
    const geometry = new TorusGeometry(0.34, 0.055, 4, 9, Math.PI);
    for (let index = 0; index < FOAM_COUNT; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const laneIndex = Math.floor(index / 2);
      const base = new Vector3(
        side * (2.9 + laneIndex * 0.34),
        -0.14,
        -2.8 - laneIndex * 1.42,
      );
      const mesh = addMesh(
        this.foam,
        `dangerous-waters-foam:${index}`,
        geometry,
        this.materials.foam,
        [base.x, base.y, base.z],
        [Math.PI / 2, side < 0 ? -0.28 : 0.28, 0],
        [1 + (index % 3) * 0.16, 0.65, 0.8],
      );
      this.foamMembers.push({
        mesh,
        base,
        baseRotation: new Vector3(
          Math.PI / 2,
          side < 0 ? -0.28 : 0.28,
          0,
        ),
        travel: new Vector3(side * 0.08, 0, -0.12 - laneIndex * 0.02),
      });
    }
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
      this.activeMotion = {
        kind,
        choiceId,
        elapsed: 0,
        duration,
        resolve,
      };
      this.applyPose(kind, 0, choiceId, 0);
    });
  }

  private applyPose(
    kind: MotionKind,
    progress: number,
    choiceId: DangerousWatersChoiceId | null,
    time: number,
  ): void {
    this.resetPose();
    const value = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyRevealPose(value);
        break;
      case 'choice':
        this.applyChoicePose(value, choiceId);
        break;
      case 'safe':
        this.applySafePose(value);
        break;
      case 'damage':
        this.applyDamagePose(value, 1);
        break;
      case 'severe':
        this.applySeverePose(value);
        break;
    }
    this.applyWaterline(time, value);
  }

  private resetPose(): void {
    this.passage.position.copy(this.passageBase);
    this.lurker.scale.set(1, 1, 1);
    this.materials.foam.opacity = 0.18;
    this.itemPose.x = 0;
    this.itemPose.y = 0;
    this.itemPose.z = 0;
    this.itemPose.yaw = 0;
    this.itemPose.pitch = 0;
    this.itemPose.roll = 0;
    this.itemPose.scaleX = 1;
    this.itemPose.scaleY = 1;
    this.itemPose.scaleZ = 1;
    this.boatReaction.pitch = 0;
    this.boatReaction.driftX = 0;
    this.boatReaction.yaw = 0;
    this.boatReaction.roll = 0;
    this.boatReaction.cameraYaw = 0;
    this.boatReaction.cameraZ = 0;
    this.boatReaction.lightScale = 1;
    this.boatReaction.supplyRoll = 0;
    this.boatReaction.supplyLift = 0;
    for (const rock of this.rockWaveMembers) {
      rock.root.position.copy(rock.base);
      rock.root.rotation.set(
        rock.baseRotation.x,
        rock.baseRotation.y,
        rock.baseRotation.z,
      );
    }
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

  private applyRevealPose(progress: number): void {
    const travel = keyedTravel(progress);
    const peek = smoothstep((progress - 0.42) / 0.2);
    const sink = smoothstep((progress - 0.82) / 0.16);
    this.passage.position.x += (1 - travel) * 3.2;
    this.lurker.scale.y = Math.min(1, peek * 2) * (1 - sink);
    this.materials.foam.opacity = 0.12 + smoothstep(progress) * 0.32;
    this.boatReaction.driftX = Math.sin(Math.PI * progress) * -0.34;
    this.boatReaction.cameraYaw = smoothstep(progress) * -0.09;
    this.boatReaction.yaw = Math.sin(Math.PI * progress) * 0.035;
    this.boatReaction.roll = Math.sin(Math.PI * progress) * -0.018;
  }

  private applyChoicePose(
    progress: number,
    choiceId: DangerousWatersChoiceId | null,
  ): void {
    const pulse = progress >= 1 ? 0 : Math.sin(Math.PI * progress);
    const lift = smoothstep(Math.min(1, progress / 0.55));
    this.lurker.scale.y = 1;
    if (choiceId === 'map') {
      this.passage.position.x -= pulse * 0.9;
      this.itemPose.y = lift * 0.56;
      this.itemPose.z = -lift * 0.2;
      this.itemPose.pitch = -lift * 0.32;
      this.itemPose.roll = lift * 0.08;
      this.itemPose.scaleX = 1 + lift * 0.3;
      this.itemPose.scaleY = 1 - lift * 0.06;
      this.itemPose.scaleZ = 1 + lift * 0.2;
      this.boatReaction.yaw = -pulse * 0.025;
    } else if (choiceId === 'compass') {
      this.passage.position.x -= pulse * 0.45;
      this.itemPose.y = lift * 0.48;
      this.itemPose.z = -lift * 0.18;
      this.itemPose.pitch = -lift * 0.18;
      this.itemPose.yaw = (
        Math.sin(6 * Math.PI * progress) * 0.3 * (1 - progress)
        + lift * 0.18
      );
      this.itemPose.scaleX = 1 + lift * 0.16;
      this.itemPose.scaleY = 1 + lift * 0.16;
      this.itemPose.scaleZ = 1 + lift * 0.16;
      this.boatReaction.yaw = -pulse * 0.014;
    } else if (choiceId === 'sleep') {
      this.passage.position.z += pulse * 0.8;
      this.boatReaction.lightScale = 1 - pulse * 0.36;
      this.boatReaction.pitch = pulse * 0.025;
      this.materials.foam.opacity = 0.34 + pulse * 0.32;
    }
  }

  private applySafePose(progress: number): void {
    const eased = smoothstep(progress);
    this.passage.position.x -= eased * 2.2;
    this.lurker.scale.y = 1 - eased;
    this.materials.foam.opacity = 0.44 * (1 - eased);
    this.boatReaction.yaw = -Math.sin(Math.PI * progress) * 0.028;
  }

  private applyDamagePose(progress: number, severity: number): void {
    const impact = Math.sin(Math.PI * progress);
    const hold = smoothstep((progress - 0.55) / 0.45);
    this.lurker.scale.y = 1;
    this.foregroundRock.position.x += (impact * 0.7 + hold * 0.18) * severity;
    this.materials.foam.opacity = 0.3 + impact * 0.48;
    this.boatReaction.pitch = (impact * 0.07 + hold * 0.018) * severity;
    this.boatReaction.roll = (impact * -0.045 + hold * -0.035) * severity;
    this.boatReaction.cameraZ = (impact * -0.09 + hold * -0.055) * severity;
    this.boatReaction.supplyRoll = (impact * 0.08 + hold * 0.052) * severity;
    this.boatReaction.supplyLift = (impact * 0.1 + hold * 0.035) * severity;
  }

  private applySeverePose(progress: number): void {
    const impact = Math.sin(Math.PI * progress);
    const hold = smoothstep((progress - 0.55) / 0.45);
    this.applyDamagePose(progress, 1.65);
    this.foregroundRock.position.x += impact * 0.445 + hold * 0.52;
    this.foregroundRock.position.z += hold * 2.8;
    this.materials.foam.opacity = 0.38 + impact * 0.57;
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

  private applyWaterline(time: number, progress: number): void {
    for (const rock of this.rockWaveMembers) {
      sampleWaveFieldInto(
        this.waveSample,
        DEFAULT_WAVES,
        time,
        rock.base.x + rock.phaseX,
        rock.base.z + rock.phaseZ,
        1,
      );
      rock.root.position.y += this.waveSample.height * 0.08;
      rock.root.rotation.x += this.waveSample.normal.z * 0.025;
      rock.root.rotation.z -= this.waveSample.normal.x * 0.025;
    }
    for (let index = 0; index < this.foamMembers.length; index += 1) {
      const foam = this.foamMembers[index]!;
      sampleWaveFieldInto(
        this.waveSample,
        DEFAULT_WAVES,
        time,
        foam.base.x,
        foam.base.z,
        1,
      );
      foam.mesh.position.x = foam.base.x
        + this.waveSample.displacementX * 0.08
        + foam.travel.x * progress;
      foam.mesh.position.y = foam.base.y + this.waveSample.height * 0.32;
      foam.mesh.position.z = foam.base.z
        + this.waveSample.displacementZ * 0.08
        + foam.travel.z * progress;
    }
  }

  private cancelActiveMotion(): void {
    const motion = this.activeMotion;
    this.activeMotion = null;
    motion?.resolve();
  }

  private createRockWaveMember(
    root: Group,
    phaseX: number,
    phaseZ: number,
  ): RockWaveMember {
    return {
      root,
      base: root.position.clone(),
      baseRotation: new Vector3(root.rotation.x, root.rotation.y, root.rotation.z),
      phaseX,
      phaseZ,
    };
  }
}
