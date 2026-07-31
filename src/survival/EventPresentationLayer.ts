import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { ActionOutcome } from './survivalTypes';
import { ChestAttackPresentation } from './ChestAttackPresentation';
import {
  FOCUSED_EVENT_IDS,
  type EventChoicePresentation,
  type FocusedEventId,
  type FocusedEventPresentation,
  type FocusedEventPresentationDependencies,
  type FocusedEventPresentationFactories,
  type FocusedEventPresentationFactory,
} from './FocusedEventPresentation';
import { HandymanPresentation } from './HandymanPresentation';
import { MidnightTourPresentation } from './MidnightTourPresentation';
import { NightTraderPresentation } from './NightTraderPresentation';
import { OtherPeoplePresentation } from './OtherPeoplePresentation';

interface ActiveEventAnimation {
  readonly kind: 'reveal' | 'react';
  readonly eventId: string;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface EventTableau {
  readonly eventId: string;
  readonly root: Group;
  readonly basePosition: Vector3;
  readonly baseQuaternion: Quaternion;
  readonly revealOffset: Vector3;
  heldReactionTilt: number;
}

interface MaritimeMaterials {
  readonly wood: MeshStandardMaterial;
  readonly darkWood: MeshStandardMaterial;
  readonly rope: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  readonly glass: MeshStandardMaterial;
  readonly paper: MeshStandardMaterial;
  readonly fish: MeshStandardMaterial;
  readonly fishDark: MeshStandardMaterial;
  readonly eye: MeshStandardMaterial;
  readonly earth: MeshStandardMaterial;
  readonly foliage: MeshStandardMaterial;
}

interface RescueCuePresentation extends FocusedEventPresentation {
  setRescueCue(progress: number | null): void;
}

type VectorTuple = readonly [number, number, number];

const TABLEAU_EVENT_IDS = [
  'drifting-bottle',
  'check-the-back',
  'mystery-chest',
  'chest-attack',
  'flowers',
  'midnight-tour',
  'death-stare',
] as const;

const REVEAL_DURATION = 0.9;
const REACTION_DURATION = 0.7;

export const AUTHORED_EVENT_PRESENTATION_FACTORIES: FocusedEventPresentationFactories = {
  'chest-attack': (dependencies) => new ChestAttackPresentation(dependencies),
  'midnight-tour': (dependencies) => new MidnightTourPresentation(dependencies),
  'night-trader': (dependencies) => new NightTraderPresentation(dependencies),
  handyman: (dependencies) => new HandymanPresentation(dependencies),
  'other-people': (dependencies) => new OtherPeoplePresentation(dependencies),
};

function createMaterial(
  color: number,
  roughness: number,
  options: {
    readonly metalness?: number;
    readonly transparent?: boolean;
    readonly opacity?: number;
    readonly emissive?: number;
  } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    flatShading: true,
  });
}

function createMaterials(): MaritimeMaterials {
  return {
    wood: createMaterial(0x6a4932, 0.94),
    darkWood: createMaterial(0x3d2d25, 0.98),
    rope: createMaterial(0x59462f, 1),
    metal: createMaterial(0x526064, 0.78, { metalness: 0.34 }),
    glass: createMaterial(0x557d7b, 0.42, { transparent: true, opacity: 0.62 }),
    paper: createMaterial(0xb7a782, 0.96),
    fish: createMaterial(0x42686e, 0.88),
    fishDark: createMaterial(0x1d343b, 0.94),
    eye: createMaterial(0xc9aa68, 0.48, { emissive: 0x302008 }),
    earth: createMaterial(0x403a31, 1),
    foliage: createMaterial(0x344f42, 0.96),
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

function bottleTableau(materials: MaritimeMaterials): Group {
  const root = new Group();
  addMesh(root, 'bottle-body', new CylinderGeometry(0.13, 0.17, 0.62, 7), materials.glass);
  addMesh(root, 'bottle-neck', new CylinderGeometry(0.07, 0.105, 0.24, 7), materials.glass, [0, 0.42, 0]);
  addMesh(root, 'bottle-cork', new CylinderGeometry(0.068, 0.068, 0.11, 7), materials.rope, [0, 0.57, 0]);
  addMesh(root, 'bottle-paper', new BoxGeometry(0.17, 0.28, 0.025), materials.paper, [0.015, 0.02, 0]);
  addMesh(
    root,
    'bottle-retrieval-line',
    new CylinderGeometry(0.012, 0.016, 1.35, 5),
    materials.rope,
    [0.72, 0.05, 0.02],
    [0, 0, Math.PI / 2 - 0.08],
  );
  root.rotation.z = Math.PI / 2 + 0.13;
  return root;
}

function fishTableau(materials: MaritimeMaterials, enormous = false): Group {
  const root = new Group();
  const scale = enormous ? 2.25 : 0.9;
  addMesh(root, 'fish-body', new SphereGeometry(0.55, 8, 5), enormous ? materials.fishDark : materials.fish, [0, 0, 0], [0, 0.08, 0], [1.25 * scale, 0.68 * scale, 0.55 * scale]);
  addMesh(root, 'fish-tail-top', new ConeGeometry(0.28 * scale, 0.58 * scale, 4), materials.fishDark, [0.84 * scale, 0.18 * scale, 0], [0, 0, -Math.PI / 2]);
  addMesh(root, 'fish-tail-bottom', new ConeGeometry(0.24 * scale, 0.5 * scale, 4), materials.fishDark, [0.82 * scale, -0.2 * scale, 0], [0, 0, -Math.PI / 2]);
  addMesh(root, 'fish-fin', new ConeGeometry(0.16 * scale, 0.42 * scale, 4), materials.fishDark, [-0.05 * scale, 0.36 * scale, 0], [0, 0, 0.08]);
  addMesh(root, 'fish-eye', new SphereGeometry(0.09 * scale, 7, 5), materials.eye, [-0.45 * scale, 0.12 * scale, 0.28 * scale]);
  if (enormous) {
    addMesh(root, 'fish-eye-second', new SphereGeometry(0.07 * scale, 7, 5), materials.eye, [-0.40 * scale, 0.11 * scale, -0.31 * scale]);
    addMesh(root, 'fish-jaw', new BoxGeometry(0.95 * scale, 0.10 * scale, 0.50 * scale), materials.fish, [-0.42 * scale, -0.35 * scale, 0], [0, 0, -0.08]);
  } else {
    addMesh(
      root,
      'stern-fish-splash',
      new TorusGeometry(0.52, 0.055, 5, 10, Math.PI * 1.35),
      materials.glass,
      [0.05, -0.24, 0],
      [Math.PI / 2, 0.22, 0.1],
    );
  }
  return root;
}

function chestTableau(materials: MaritimeMaterials): Group {
  const root = new Group();
  addMesh(root, 'chest-box', new BoxGeometry(0.92, 0.5, 0.64), materials.darkWood);
  addMesh(root, 'chest-lid', new CylinderGeometry(0.32, 0.32, 0.92, 6, 1, false, 0, Math.PI), materials.wood, [0, 0.28, 0], [0, 0, Math.PI / 2]);
  for (const x of [-0.32, 0.32]) {
    addMesh(root, `chest-strap:${x}`, new TorusGeometry(0.34, 0.025, 5, 10, Math.PI), materials.metal, [x, 0.28, 0], [0, Math.PI / 2, 0]);
  }
  addMesh(root, 'chest-lock', new BoxGeometry(0.16, 0.20, 0.07), materials.metal, [0, 0.04, 0.355]);
  root.rotation.y = -0.18;
  return root;
}

function mimicChestTableau(materials: MaritimeMaterials): Group {
  const root = chestTableau(materials);
  root.name = 'mimic-chest';
  addMesh(root, 'mimic-mouth', new BoxGeometry(0.64, 0.12, 0.08), materials.fishDark, [0, 0.12, 0.39]);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) {
    addMesh(
      root,
      `mimic-tooth:${x}`,
      new ConeGeometry(0.05, 0.16, 5),
      materials.paper,
      [x, 0.2, 0.45],
      [Math.PI, 0, 0],
    );
  }
  addMesh(root, 'mimic-eye-left', new SphereGeometry(0.07, 6, 4), materials.eye, [-0.22, 0.45, 0.26]);
  addMesh(root, 'mimic-eye-right', new SphereGeometry(0.07, 6, 4), materials.eye, [0.22, 0.45, 0.26]);
  return root;
}

function flowersTableau(materials: MaritimeMaterials): Group {
  const root = new Group();
  const positions: readonly VectorTuple[] = [
    [-0.45, 0, -0.12],
    [-0.18, 0.03, 0.18],
    [0.12, -0.01, -0.16],
    [0.38, 0.02, 0.11],
    [0.02, 0.04, 0.3],
  ];
  positions.forEach(([x, y, z], index) => {
    addMesh(
      root,
      `flower-pad:${index}`,
      new CylinderGeometry(0.2, 0.23, 0.035, 8),
      materials.foliage,
      [x, y, z],
    );
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 0.4;
      addMesh(
        root,
        `flower-petal:${index}:${petal}`,
        new SphereGeometry(0.075, 6, 4),
        materials.paper,
        [x + Math.cos(angle) * 0.08, y + 0.065, z + Math.sin(angle) * 0.08],
        [0, angle, 0],
        [1.3, 0.45, 0.8],
      );
    }
    addMesh(
      root,
      `flower-center:${index}`,
      new SphereGeometry(0.045, 6, 4),
      materials.eye,
      [x, y + 0.075, z],
    );
  });
  return root;
}

function islandTableau(materials: MaritimeMaterials): Group {
  const root = new Group();
  addMesh(root, 'island-rock', new ConeGeometry(2.8, 1.1, 7), materials.earth, [0, -0.25, 0], [0, 0.2, 0], [1, 1, 0.72]);
  addMesh(root, 'island-shelf', new BoxGeometry(2.1, 0.25, 1.35), materials.darkWood, [0.35, 0.22, -0.06], [0.02, -0.12, 0.02]);
  addMesh(root, 'island-tree-trunk', new CylinderGeometry(0.11, 0.17, 1.55, 6), materials.wood, [-0.5, 1.08, 0.02], [0.08, 0, -0.18]);
  for (let index = 0; index < 5; index += 1) {
    addMesh(root, `island-frond:${index}`, new ConeGeometry(0.23, 1.15, 4), materials.foliage, [-0.63, 1.82, 0], [0.25, index * 1.25, Math.PI / 2]);
  }
  return root;
}

function createTableau(
  eventId: string,
  content: Group,
  position: VectorTuple,
  revealOffset: VectorTuple,
): EventTableau {
  const root = new Group();
  root.name = `event-prop:${eventId}`;
  root.position.set(...position);
  root.add(content);
  root.visible = false;
  return {
    eventId,
    root,
    basePosition: root.position.clone(),
    baseQuaternion: root.quaternion.clone(),
    revealOffset: new Vector3(...revealOffset),
    heldReactionTilt: 0,
  };
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function keyedRevealProgress(progress: number): number {
  if (progress < 0.16) return -0.06 * Math.sin((progress / 0.16) * Math.PI);
  if (progress < 0.82) return smoothstep((progress - 0.16) / 0.66) * 1.06;
  return 1.06 + (1 - 1.06) * smoothstep((progress - 0.82) / 0.18);
}

export class EventPresentationLayer {
  readonly root = new Group();
  private readonly tableaus = new Map<string, EventTableau>();
  private readonly focused = new Map<string, FocusedEventPresentation>();
  private readonly ownedFocused = new Set<FocusedEventPresentation>();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly positionScratch = new Vector3();
  private readonly quaternionScratch = new Quaternion();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private activeAnimation: ActiveEventAnimation | null = null;
  private activeFocused: FocusedEventPresentation | null = null;
  private stagedEventId: string | null = null;
  private held = false;
  private reactionDirection = 1;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
    focusedFactories: FocusedEventPresentationFactories = {},
  ) {
    this.root.name = 'event-presentation-layer';
    const materials = createMaterials();
    const tableaus = [
      createTableau('drifting-bottle', bottleTableau(materials), [2.7, 0.04, -3.4], [1.15, -0.45, 0.2]),
      createTableau('check-the-back', fishTableau(materials), [0.4, -0.08, 3.8], [0.25, -0.55, 1.2]),
      createTableau('mystery-chest', chestTableau(materials), [-2.55, 0.02, -2.9], [-1.0, -0.42, 0.35]),
      createTableau('chest-attack', mimicChestTableau(materials), [-1.45, 0.14, -2.55], [-0.7, -0.32, 0.3]),
      createTableau('flowers', flowersTableau(materials), [2.45, -0.08, -3.65], [1.0, -0.26, 0.35]),
      createTableau('midnight-tour', islandTableau(materials), [-8.0, -0.18, -20], [-2.4, -0.55, -1.2]),
      createTableau('death-stare', fishTableau(materials, true), [0, -0.8, -7.4], [0, -2.3, -1.4]),
    ];
    for (const tableau of tableaus) {
      this.tableaus.set(tableau.eventId, tableau);
      this.root.add(tableau.root);
    }
    collectMeshResources(this.root, this.ownedGeometries, this.ownedMaterials);
    for (const eventId of FOCUSED_EVENT_IDS) {
      const factory = focusedFactories[eventId]
        ?? AUTHORED_EVENT_PRESENTATION_FACTORIES[eventId];
      if (factory !== undefined) this.registerFocusedFactory(eventId, factory);
    }
  }

  registerFocusedFactory(
    eventId: FocusedEventId,
    factory: FocusedEventPresentationFactory,
  ): boolean {
    if (this.disposed || this.focused.has(eventId)) return false;
    let presenter: FocusedEventPresentation | null;
    try {
      presenter = factory(this.dependencies);
    } catch {
      return false;
    }
    if (presenter === null || this.ownedFocused.has(presenter)) return false;
    presenter.root.visible = false;
    this.focused.set(eventId, presenter);
    this.ownedFocused.add(presenter);
    this.root.add(presenter.root);
    return true;
  }

  hasFocused(eventId: string): boolean {
    return this.focused.has(eventId);
  }

  stage(eventId: string): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.clearActiveFocused();
    const focused = this.focused.get(eventId) ?? null;
    this.activeFocused = focused;
    this.stagedEventId = focused === null && this.tableaus.has(eventId)
      ? eventId
      : null;
    this.held = false;
    this.resetGenericTableaus();
    if (focused === null) return;
    focused.root.visible = true;
    focused.stage();
  }

  reveal(eventId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const focused = this.focused.get(eventId) ?? null;
    if (
      this.activeFocused !== focused
      || (focused === null && this.stagedEventId !== eventId)
    ) {
      this.stage(eventId);
    }
    if (this.activeFocused !== null) return this.activeFocused.reveal();
    if (this.stagedEventId === null) return Promise.resolve();
    return this.startAnimation('reveal', eventId);
  }

  playChoice(
    eventId: string,
    choice: EventChoicePresentation,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const focused = this.focused.get(eventId) ?? null;
    if (this.activeFocused !== focused) this.stage(eventId);
    return this.activeFocused?.playChoice(choice) ?? Promise.resolve();
  }

  react(eventId: string, outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const focused = this.focused.get(eventId) ?? null;
    if (
      this.activeFocused !== focused
      || (focused === null && this.stagedEventId !== eventId)
    ) {
      this.stage(eventId);
    }
    if (this.activeFocused !== null) {
      const result = outcome.eventResult;
      if (result === undefined || result.eventId !== eventId) {
        throw new Error(`Focused event ${eventId} requires a matching event result.`);
      }
      return this.activeFocused.react(result, outcome);
    }
    if (this.stagedEventId === null) return Promise.resolve();
    this.held = true;
    this.reactionDirection = outcome.accepted && !Object.values(outcome.deltas).some(
      (value) => typeof value === 'number' && value < 0,
    ) ? 1 : -1;
    return this.startAnimation('react', eventId);
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.clearActiveFocused();
    this.stagedEventId = null;
    this.held = false;
    this.resetGenericTableaus();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    if (this.activeFocused !== null) {
      this.activeFocused.settleForVisibilityChange();
      return;
    }
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    this.held = true;
    const tableau = this.tableaus.get(animation.eventId)!;
    tableau.heldReactionTilt = animation.kind === 'react'
      ? this.reactionDirection * 0.035
      : 0;
    this.resetTableauPose(tableau);
    this.applyRevealPose(tableau, 1, tableau.heldReactionTilt);
    animation.resolve();
  }

  setRescueCue(progress: number | null): void {
    if (this.disposed) return;
    const presenter = this.focused.get('other-people');
    if (
      presenter === undefined
      || presenter === this.activeFocused
      || !this.supportsRescueCue(presenter)
    ) return;
    presenter.setRescueCue(progress);
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    if (this.activeFocused !== null) {
      this.activeFocused.update(time, delta);
      return;
    }
    const staged = this.stagedEventId === null
      ? null
      : this.tableaus.get(this.stagedEventId)!;

    if (staged !== null) this.applyWavePose(staged, time);

    const animation = this.activeAnimation;
    if (animation === null) {
      if (staged !== null) {
        this.applyRevealPose(staged, this.held ? 1 : 0, staged.heldReactionTilt);
      }
      return;
    }

    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, delta),
    );
    const progress = animation.elapsed / animation.duration;
    const tableau = this.tableaus.get(animation.eventId)!;
    if (animation.kind === 'reveal') {
      this.applyRevealPose(tableau, progress, 0);
    } else {
      this.applyReactionPose(tableau, progress);
    }
    if (progress < 1) return;
    this.activeAnimation = null;
    this.held = true;
    tableau.heldReactionTilt = animation.kind === 'react'
      ? this.reactionDirection * 0.035
      : 0;
    this.applyRevealPose(tableau, 1, tableau.heldReactionTilt);
    animation.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.disposed = true;
    this.activeFocused = null;
    for (const presenter of this.ownedFocused) presenter.dispose();
    this.focused.clear();
    this.ownedFocused.clear();
    this.root.removeFromParent();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private clearActiveFocused(): void {
    const focused = this.activeFocused;
    this.activeFocused = null;
    if (focused === null) return;
    focused.clear();
    if (focused.root.userData.holdOnClear !== true) {
      focused.root.visible = false;
    }
  }

  private resetGenericTableaus(): void {
    for (const id of TABLEAU_EVENT_IDS) {
      const tableau = this.tableaus.get(id)!;
      tableau.heldReactionTilt = 0;
      this.resetTableauPose(tableau);
      tableau.root.visible = id === this.stagedEventId;
      this.applyRevealPose(tableau, id === this.stagedEventId ? 0 : 1, 0);
    }
  }

  private supportsRescueCue(
    presenter: FocusedEventPresentation,
  ): presenter is RescueCuePresentation {
    return typeof (
      presenter as Partial<RescueCuePresentation>
    ).setRescueCue === 'function';
  }

  private startAnimation(
    kind: ActiveEventAnimation['kind'],
    eventId: string,
  ): Promise<void> {
    this.cancelActiveAnimation();
    const duration = kind === 'reveal' ? REVEAL_DURATION : REACTION_DURATION;
    return new Promise((resolve) => {
      this.activeAnimation = { kind, eventId, elapsed: 0, duration, resolve };
      const tableau = this.tableaus.get(eventId)!;
      this.resetTableauPose(tableau);
      if (kind === 'reveal') {
        this.applyRevealPose(tableau, 0, 0);
      }
    });
  }

  private applyWavePose(tableau: EventTableau, time: number): void {
    sampleWaveFieldInto(
      this.waveSample,
      this.dependencies.waves,
      time,
      tableau.basePosition.x,
      tableau.basePosition.z,
      1,
    );
    tableau.root.position.copy(tableau.basePosition);
    tableau.root.position.x += this.waveSample.displacementX * 0.12;
    tableau.root.position.y += this.waveSample.height * 0.34;
    tableau.root.position.z += this.waveSample.displacementZ * 0.12;
    tableau.root.quaternion.copy(tableau.baseQuaternion);
    this.positionScratch.set(
      this.waveSample.normal.z * 0.12,
      0,
      -this.waveSample.normal.x * 0.12,
    );
    tableau.root.rotation.x += this.positionScratch.x;
    tableau.root.rotation.z += this.positionScratch.z;
  }

  private resetTableauPose(tableau: EventTableau): void {
    tableau.root.position.copy(tableau.basePosition);
    tableau.root.quaternion.copy(tableau.baseQuaternion);
  }

  private applyRevealPose(
    tableau: EventTableau,
    progress: number,
    heldTilt: number,
  ): void {
    const travel = keyedRevealProgress(Math.min(1, Math.max(0, progress)));
    this.positionScratch.copy(tableau.revealOffset).multiplyScalar(1 - travel);
    tableau.root.position.add(this.positionScratch);
    this.quaternionScratch.setFromAxisAngle(
      tableau.root.up,
      (1 - travel) * 0.12 + heldTilt,
    );
    tableau.root.quaternion.multiply(this.quaternionScratch);
  }

  private applyReactionPose(tableau: EventTableau, progress: number): void {
    const eased = smoothstep(Math.min(1, Math.max(0, progress)));
    const impact = Math.sin(Math.PI * eased);
    const settle = Math.sin(Math.PI * 2 * eased) * (1 - eased);
    this.positionScratch.set(
      this.reactionDirection * impact * 0.18,
      impact * 0.22,
      -impact * 0.08,
    );
    tableau.root.position.add(this.positionScratch);
    this.quaternionScratch.setFromAxisAngle(
      tableau.root.up,
      this.reactionDirection * (impact * 0.12 + settle * 0.05),
    );
    tableau.root.quaternion.multiply(this.quaternionScratch);
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }
}
