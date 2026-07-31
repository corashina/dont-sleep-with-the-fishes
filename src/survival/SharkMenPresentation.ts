import {
  AnimationClip,
  AnimationMixer,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ItemInstanceId } from '../game/ItemState';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import type { EventModelPresentation } from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { ActionOutcome, ItemCondition } from './survivalTypes';

interface AuthoredSharkPath {
  readonly centerX: number;
  readonly centerZ: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly speed: number;
  readonly phase: number;
}

interface MutableSupplyPose {
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

type SharkMenItemChoiceId = 'harpoonGun' | 'swimRing' | 'scubaSet';

type ActiveSharkMenAnimation =
  | {
      readonly kind: 'reveal';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'item';
      readonly choiceId: SharkMenItemChoiceId;
      readonly instanceId: ItemInstanceId;
      elapsed: number;
      readonly duration: number;
      readonly resolve: (handled: boolean) => void;
    }
  | {
      readonly kind: 'context';
      readonly choiceId: 'sleep';
      elapsed: number;
      readonly duration: number;
      readonly resolve: (handled: boolean) => void;
    }
  | {
      readonly kind: 'reaction';
      readonly choiceId: string;
      readonly instanceId: ItemInstanceId | null;
      readonly condition: ItemCondition | null;
      readonly hasDamage: boolean;
      readonly scubaSuccess: boolean;
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

const SHARK_PATHS: readonly AuthoredSharkPath[] = Object.freeze([
  Object.freeze({
    centerX: -2.35,
    centerZ: -3.1,
    radiusX: 0.38,
    radiusZ: 0.3,
    speed: 0.16,
    phase: 0.18,
  }),
  Object.freeze({
    centerX: 2.15,
    centerZ: -3.45,
    radiusX: 0.36,
    radiusZ: 0.28,
    speed: -0.14,
    phase: 1.42,
  }),
  Object.freeze({
    centerX: 2.15,
    centerZ: -4.5,
    radiusX: 0.82,
    radiusZ: 0.64,
    speed: 0.26,
    phase: 2.65,
  }),
  Object.freeze({
    centerX: 3.35,
    centerZ: -1.5,
    radiusX: 0.64,
    radiusZ: 0.92,
    speed: -0.2,
    phase: 4.16,
  }),
  Object.freeze({
    centerX: -3.3,
    centerZ: 0.25,
    radiusX: 0.74,
    radiusZ: 0.58,
    speed: 0.24,
    phase: 5.28,
  }),
]);

const REVEAL_DURATION = 1.8;
const ITEM_DURATION = 1.1;
const CONTEXT_DURATION = 1;
const REACTION_DURATION = 1.6;
const HAND_POSITION = Object.freeze({ x: 1.48, y: 0.18, z: -1.45 });

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function pulse(
  progress: number,
  start: number,
  peak: number,
  end: number,
): number {
  if (progress <= start || progress >= end) return 0;
  return progress < peak
    ? smoothstep((progress - start) / (peak - start))
    : 1 - smoothstep((progress - peak) / (end - peak));
}

function validSwimClip(animations: readonly AnimationClip[]): AnimationClip | null {
  for (const clip of animations) {
    if (
      !clip.name.toLocaleLowerCase('en-US').includes('swim')
      || !Number.isFinite(clip.duration)
      || clip.duration <= 0
      || clip.tracks.length === 0
      || clip.tracks.some((track) => !track.validate())
    ) continue;
    return clip;
  }
  return null;
}

function tintModelMaterials(
  root: Group,
  tint: Color,
  amount: number,
): void {
  if (amount <= 0) return;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const source = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const tinted = source.map((material) => {
      const clone = material.clone();
      if (clone instanceof MeshStandardMaterial) {
        clone.color.lerp(tint, amount);
        clone.roughness = Math.max(0.72, clone.roughness);
      }
      return clone;
    });
    object.material = Array.isArray(object.material) ? tinted : tinted[0]!;
  });
}

function createRailHand(
  skin: Material,
  nail: Material,
): Group {
  const hand = new Group();
  hand.name = 'shark-men-hand';
  hand.position.set(HAND_POSITION.x, HAND_POSITION.y, HAND_POSITION.z);
  hand.rotation.set(-0.18, 0.1, -0.18);
  hand.scale.setScalar(1.15);

  const palm = new Mesh(new BoxGeometry(0.64, 0.56, 0.24), skin);
  palm.name = 'shark-men-palm';
  palm.position.y = 0.08;
  palm.rotation.z = -0.05;
  palm.scale.set(1, 1.08, 0.9);
  hand.add(palm);

  const fingerGeometry = new BoxGeometry(0.12, 0.58, 0.14);
  const nailGeometry = new ConeGeometry(0.07, 0.2, 4);
  for (let index = 0; index < 4; index += 1) {
    const finger = new Mesh(fingerGeometry, skin);
    finger.name = `shark-men-finger-${index + 1}`;
    finger.position.set(
      -0.245 + index * 0.16,
      0.53 + (index === 1 || index === 2 ? 0.04 : 0),
      -0.015 + index * 0.008,
    );
    finger.rotation.z = (index - 1.5) * 0.035;
    hand.add(finger);

    const claw = new Mesh(nailGeometry, nail);
    claw.name = `shark-men-nail-${index + 1}`;
    claw.position.set(finger.position.x, finger.position.y + 0.36, -0.018);
    claw.rotation.z = finger.rotation.z;
    hand.add(claw);
  }

  const wrist = new Mesh(new CylinderGeometry(0.25, 0.33, 0.7, 7), skin);
  wrist.name = 'shark-men-wrist';
  wrist.position.set(0.04, -0.48, 0.02);
  wrist.rotation.z = 0.04;
  hand.add(wrist);
  return hand;
}

function createStrike(material: Material): Group {
  const root = new Group();
  root.name = 'shark-men-strike';
  root.position.set(0.62, 0.84, -2.06);
  const geometry = new BoxGeometry(0.065, 0.92, 0.045);
  for (let index = 0; index < 3; index += 1) {
    const slash = new Mesh(geometry, material);
    slash.position.x = (index - 1) * 0.19;
    slash.position.y = (index % 2) * 0.08;
    slash.rotation.z = -0.48;
    root.add(slash);
  }
  root.visible = false;
  return root;
}

function createFoodResults(material: Material): Group[] {
  const geometry = new CylinderGeometry(0.12, 0.12, 0.19, 10);
  const roots: Group[] = [];
  for (let index = 0; index < 4; index += 1) {
    const root = new Group();
    root.name = `shark-men-food-${index + 1}`;
    root.position.set(
      -0.44 + (index % 2) * 0.31,
      0.42 + Math.floor(index / 2) * 0.23,
      -1.72 - (index % 2) * 0.04,
    );
    root.rotation.set(0.05 * index, 0.24 * index, -0.05 + 0.035 * index);
    const can = new Mesh(geometry, material);
    can.rotation.z = Math.PI / 2;
    root.add(can);
    root.visible = false;
    roots.push(root);
  }
  return roots;
}

export class SharkMenPresentation {
  readonly root = new Group();
  readonly boatRoot = new Group();
  private readonly pathRoots: Group[] = [];
  private readonly modelRoots: Group[] = [];
  private readonly fins: Group[] = [];
  private readonly mixers: AnimationMixer[] = [];
  private readonly waveSamples: WaveSample[] = [];
  private readonly pathBasePositions: Vector3[] = [];
  private readonly finBasePositions: Vector3[] = [];
  private readonly finBaseQuaternions: Quaternion[] = [];
  private readonly finBaseScales: Vector3[] = [];
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraBasePosition = new Vector3();
  private readonly cameraBaseQuaternion = new Quaternion();
  private readonly handBasePosition = new Vector3();
  private readonly handBaseQuaternion = new Quaternion();
  private readonly handBaseScale = new Vector3();
  private readonly itemPose: MutableSupplyPose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
  private readonly hand: Group;
  private readonly strike: Group;
  private readonly foodResults: Group[];
  private active: ActiveSharkMenAnimation | null = null;
  private waveScale = 1;
  private disposed = false;

  constructor(
    model: EventModelPresentation | null,
    private readonly cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
  ) {
    this.root.name = 'shark-men-presentation';
    this.boatRoot.name = 'shark-men-boat-presentation';
    this.root.add(this.boatRoot);
    this.root.userData.strikeCount = 0;
    const finGeometry = new ConeGeometry(0.34, 0.88, 3);
    const finMaterial = new MeshStandardMaterial({
      color: 0x3f646b,
      emissive: 0x091719,
      emissiveIntensity: 0.16,
      roughness: 0.86,
      metalness: 0.02,
      flatShading: true,
    });
    const waterLineMaterial = new MeshStandardMaterial({
      color: 0x365f68,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    });
    const skinMaterial = new MeshStandardMaterial({
      color: 0x607878,
      emissive: 0x0a1515,
      emissiveIntensity: 0.14,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    });
    const nailMaterial = new MeshStandardMaterial({
      color: 0x11191b,
      roughness: 0.76,
      flatShading: true,
    });
    const strikeMaterial = new MeshStandardMaterial({
      color: 0x9f3328,
      emissive: 0x3e0805,
      emissiveIntensity: 0.35,
      roughness: 0.84,
      flatShading: true,
    });
    const foodMaterial = new MeshStandardMaterial({
      color: 0xa87439,
      emissive: 0x241407,
      emissiveIntensity: 0.12,
      roughness: 0.82,
      flatShading: true,
    });
    const modelTint = new Color(0x2a5660);
    const swimClip = model === null ? null : validSwimClip(model.animations);

    for (let index = 0; index < SHARK_PATHS.length; index += 1) {
      const path = SHARK_PATHS[index]!;
      const pathRoot = new Group();
      pathRoot.name = `shark-men-path-${index + 1}`;
      pathRoot.position.set(path.centerX, 0, path.centerZ);
      this.pathBasePositions.push(pathRoot.position.clone());

      const fin = new Group();
      fin.name = `shark-men-fin-${index + 1}`;
      fin.position.set(0, -0.08, 0.12);
      fin.rotation.set(-0.04, 0, index % 2 === 0 ? -0.035 : 0.035);
      if (index < 2) fin.scale.setScalar(1.35);
      const finMesh = new Mesh(finGeometry, finMaterial);
      finMesh.position.y = 0.31;
      finMesh.scale.z = 0.18;
      fin.add(finMesh);
      const waterLine = new Mesh(
        new CylinderGeometry(0.38, 0.47, 0.055, 9),
        waterLineMaterial,
      );
      waterLine.position.y = -0.03;
      waterLine.scale.z = 0.52;
      fin.add(waterLine);
      fin.visible = false;
      pathRoot.add(fin);

      if (model !== null) {
        const modelRoot = cloneSkeleton(model.root) as Group;
        modelRoot.name = `shark-men-model-${index + 1}`;
        modelRoot.position.set(0, -0.94, -0.1);
        modelRoot.rotation.set(0.04, Math.PI, -0.03);
        modelRoot.scale.setScalar(0.74 + index * 0.018);
        tintModelMaterials(modelRoot, modelTint, index * 0.035);
        pathRoot.add(modelRoot);
        this.modelRoots.push(modelRoot);
        if (swimClip !== null) {
          const mixer = new AnimationMixer(modelRoot);
          mixer.clipAction(swimClip).play();
          this.mixers.push(mixer);
        }
      }

      this.root.add(pathRoot);
      this.pathRoots.push(pathRoot);
      this.fins.push(fin);
      this.finBasePositions.push(fin.position.clone());
      this.finBaseQuaternions.push(fin.quaternion.clone());
      this.finBaseScales.push(fin.scale.clone());
      this.waveSamples.push({
        height: 0,
        displacementX: 0,
        displacementZ: 0,
        normal: { x: 0, y: 1, z: 0 },
      });
    }

    this.hand = createRailHand(skinMaterial, nailMaterial);
    this.handBasePosition.copy(this.hand.position);
    this.handBaseQuaternion.copy(this.hand.quaternion);
    this.handBaseScale.copy(this.hand.scale);
    this.hand.visible = false;
    this.strike = createStrike(strikeMaterial);
    this.foodResults = createFoodResults(foodMaterial);
    this.boatRoot.add(this.hand, this.strike, ...this.foodResults);
    this.root.visible = false;
    this.boatRoot.visible = false;
    collectMeshResources(this.root, this.ownedGeometries, this.ownedMaterials);
    this.rememberCameraBase();
  }

  setWaveScale(value: number): void {
    if (this.disposed || !Number.isFinite(value) || value < 0) return;
    this.waveScale = value;
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.rememberCameraBase();
    this.resetPresentation();
    this.root.visible = true;
    this.boatRoot.visible = true;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.root.visible) this.stage();
    this.cancelActive();
    return new Promise<void>((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemChoice(
    choiceId: string,
    instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (this.disposed || !this.isItemChoice(choiceId)) {
      return Promise.resolve(false);
    }
    if (!this.root.visible) this.stage();
    this.cancelActive();
    this.rememberCameraBase();
    this.hideStrike();
    this.hideFoodResults();
    this.resetItemPose();
    if (
      !this.supplyDisplay.pinEventActor(instanceId)
      || !this.supplyDisplay.applyEventItemPose(instanceId, this.itemPose)
    ) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        instanceId,
        elapsed: 0,
        duration: ITEM_DURATION,
        resolve,
      };
    });
  }

  playContextualChoice(choiceId: string): Promise<boolean> {
    if (this.disposed || choiceId !== 'sleep') return Promise.resolve(false);
    if (!this.root.visible) this.stage();
    this.cancelActive();
    this.rememberCameraBase();
    return new Promise<boolean>((resolve) => {
      this.active = {
        kind: 'context',
        choiceId,
        elapsed: 0,
        duration: CONTEXT_DURATION,
        resolve,
      };
    });
  }

  react(
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.root.visible) this.stage();
    this.cancelActive();
    this.rememberCameraBase();
    this.supplyDisplay.clearEventPose();
    this.hideStrike();
    this.hideFoodResults();
    const actor = response.actors[0] ?? null;
    const instanceId = actor?.instanceId ?? null;
    const condition = actor?.condition ?? null;
    if (instanceId !== null) this.supplyDisplay.pinEventActor(instanceId);
    const hasDamage = (outcome.deltas.hull ?? 0) < 0
      || (outcome.deltas.health ?? 0) < 0;
    const scubaSuccess = response.choiceId === 'scubaSet'
      && (outcome.deltas.food ?? 0) > 0
      && !hasDamage;
    const strikes = hasDamage
      && (response.choiceId === 'scubaSet' || response.choiceId === 'sleep')
      ? 1
      : 0;
    this.root.userData.strikeCount = strikes;
    return new Promise<void>((resolve) => {
      this.active = {
        kind: 'reaction',
        choiceId: response.choiceId,
        instanceId,
        condition,
        hasDamage,
        scubaSuccess,
        elapsed: 0,
        duration: REACTION_DURATION,
        resolve,
      };
    });
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.finishActive(this.active);
  }

  clear(): void {
    if (this.disposed) return;
    if (!this.root.visible && !this.boatRoot.visible && this.active === null) return;
    this.cancelActive();
    this.supplyDisplay.clearEventMotion();
    this.restoreCamera();
    this.resetPresentation();
    this.root.visible = false;
    this.boatRoot.visible = false;
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.root.visible) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    for (let index = 0; index < this.mixers.length; index += 1) {
      this.mixers[index]!.update(safeDelta);
    }
    this.applySharkPaths(Number.isFinite(time) ? time : 0);

    const active = this.active;
    if (active === null) return;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration <= 0 ? 1 : active.elapsed / active.duration;
    switch (active.kind) {
      case 'reveal':
        this.applyReveal(progress);
        break;
      case 'item':
        this.applyItemChoice(active.choiceId, active.instanceId, progress);
        break;
      case 'context':
        this.applyContextChoice(progress);
        break;
      case 'reaction':
        this.applyReaction(active, progress);
        break;
    }
    if (progress >= 1) this.finishActive(active);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    for (let index = 0; index < this.mixers.length; index += 1) {
      const mixer = this.mixers[index]!;
      mixer.stopAllAction();
      mixer.uncacheRoot(this.modelRoots[index]!);
    }
    this.root.removeFromParent();
    this.boatRoot.removeFromParent();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private applySharkPaths(time: number): void {
    for (let index = 0; index < SHARK_PATHS.length; index += 1) {
      const path = SHARK_PATHS[index]!;
      const angle = path.phase + time * path.speed;
      const x = path.centerX + Math.cos(angle) * path.radiusX;
      const z = path.centerZ + Math.sin(angle) * path.radiusZ;
      const sample = this.waveSamples[index]!;
      sampleWaveFieldInto(sample, DEFAULT_WAVES, time, x, z, this.waveScale);
      const root = this.pathRoots[index]!;
      root.position.set(
        x + sample.displacementX,
        sample.height,
        z + sample.displacementZ,
      );
      root.rotation.set(
        sample.normal.z * 0.08,
        Math.atan2(
          Math.cos(angle) * path.radiusZ * path.speed,
          -Math.sin(angle) * path.radiusX * path.speed,
        ) - Math.PI / 2,
        -sample.normal.x * 0.08,
      );
    }
  }

  private applyReveal(progress: number): void {
    this.restoreCamera();
    const travel = smoothstep((progress - 0.1) / 0.72);
    const settle = progress < 0.86
      ? travel * 1.06
      : 1.06 + (1 - 1.06) * smoothstep((progress - 0.86) / 0.14);
    for (let index = 0; index < this.fins.length; index += 1) {
      const fin = this.fins[index]!;
      fin.visible = index < 2 && progress >= 0.18 + index * 0.09;
      fin.position.copy(this.finBasePositions[index]!);
      fin.position.y -= (1 - settle) * (0.72 + index * 0.08);
    }
    const handTravel = smoothstep((progress - 0.48) / 0.38);
    this.hand.visible = progress >= 0.42;
    this.hand.position.copy(this.handBasePosition);
    this.hand.position.y -= (1 - handTravel) * 0.96;
    this.hand.position.x += Math.sin(Math.PI * handTravel) * 0.055;
    this.hand.quaternion.copy(this.handBaseQuaternion);
    this.hand.rotateZ(-Math.sin(Math.PI * handTravel) * 0.055);
    const cameraBeat = pulse(progress, 0.32, 0.7, 1);
    this.cameraRig.position.z -= cameraBeat * 0.08;
    this.cameraRig.rotateY(-cameraBeat * 0.035);
  }

  private applyItemChoice(
    choiceId: SharkMenItemChoiceId,
    instanceId: ItemInstanceId,
    progress: number,
  ): void {
    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.resetItemPose();
    const action = Math.sin(Math.PI * clamp01(progress));
    if (choiceId === 'harpoonGun') {
      this.itemPose.x = -0.18 * action;
      this.itemPose.y = 0.42 * action;
      this.itemPose.z = -0.36 * action;
      this.itemPose.pitch = -0.46 * action;
      this.itemPose.yaw = 0.18 * action;
      this.cameraRig.position.z -= 0.045 * action;
    } else if (choiceId === 'swimRing') {
      this.itemPose.x = 0.24 * action;
      this.itemPose.y = 0.34 * action;
      this.itemPose.z = -0.48 * action;
      this.itemPose.roll = 0.28 * action;
      this.itemPose.scaleX = 1 + 0.08 * action;
      this.itemPose.scaleY = 1 + 0.08 * action;
    } else {
      this.itemPose.x = -0.12 * action;
      this.itemPose.y = 0.28 * action;
      this.itemPose.z = -0.32 * action;
      this.itemPose.pitch = -0.22 * action;
      this.cameraRig.rotateY(0.025 * action);
    }
    this.supplyDisplay.applyEventItemPose(instanceId, this.itemPose);
  }

  private applyContextChoice(progress: number): void {
    this.restoreCamera();
    const lower = pulse(progress, 0, 0.54, 1);
    this.cameraRig.position.y -= 0.14 * lower;
    this.cameraRig.position.z += 0.06 * lower;
    this.cameraRig.rotateX(-0.055 * lower);
    this.hand.position.copy(this.handBasePosition);
    this.hand.position.y += 0.05 * lower;
  }

  private applyReaction(
    active: Extract<ActiveSharkMenAnimation, { readonly kind: 'reaction' }>,
    progress: number,
  ): void {
    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.hideStrike();
    this.resetItemPose();
    if (active.choiceId === 'harpoonGun') {
      this.applyHarpoonScatter(progress);
      return;
    }
    if (active.choiceId === 'swimRing') {
      this.applySwimRingReaction(active.instanceId, active.condition, progress);
      if (active.hasDamage) this.applyHullImpact(progress, 0.55);
      return;
    }
    if (active.choiceId === 'scubaSet' && active.scubaSuccess) {
      this.applyScubaSuccess(active.instanceId, progress);
      return;
    }
    if (
      active.hasDamage
      && (active.choiceId === 'scubaSet' || active.choiceId === 'sleep')
    ) {
      if (active.instanceId !== null) {
        const collapse = smoothstep((progress - 0.46) / 0.48);
        this.itemPose.y = 0.16 - collapse * 0.46;
        this.itemPose.roll = collapse * 0.72;
        this.itemPose.scaleY = 1 - collapse * 0.25;
        this.supplyDisplay.applyEventItemPose(active.instanceId, this.itemPose);
      }
      this.applySingleStrike(progress);
      this.applyHullImpact(progress, 1);
      return;
    }
    const retreat = smoothstep(progress);
    this.hand.position.copy(this.handBasePosition);
    this.hand.position.y -= retreat * 0.72;
    this.hand.visible = retreat < 0.98;
    for (let index = 0; index < this.fins.length; index += 1) {
      const fin = this.fins[index]!;
      fin.visible = index < 2 && retreat < 0.98;
      fin.position.copy(this.finBasePositions[index]!);
      fin.position.y -= retreat * 0.5;
    }
  }

  private applyHarpoonScatter(progress: number): void {
    const anticipation = pulse(progress, 0, 0.14, 0.26);
    const scatter = smoothstep((progress - 0.18) / 0.68);
    for (let index = 0; index < this.fins.length; index += 1) {
      const fin = this.fins[index]!;
      const direction = index % 2 === 0 ? -1 : 1;
      fin.visible = true;
      fin.position.copy(this.finBasePositions[index]!);
      fin.position.x += direction * scatter * (0.75 + index * 0.18);
      fin.position.y += scatter * (0.22 + index * 0.05) - anticipation * 0.12;
      fin.position.z += scatter * (0.36 + (index % 3) * 0.12);
      fin.quaternion.copy(this.finBaseQuaternions[index]!);
      fin.rotateZ(direction * scatter * (0.38 + index * 0.06));
      fin.scale.copy(this.finBaseScales[index]!);
      fin.scale.multiplyScalar(1 - scatter * 0.18);
    }
    this.hand.visible = progress < 0.48;
  }

  private applySwimRingReaction(
    instanceId: ItemInstanceId | null,
    condition: ItemCondition | null,
    progress: number,
  ): void {
    if (instanceId === null) return;
    if (condition === 'lost' || condition === 'consumed') {
      const sink = smoothstep(progress / 0.82);
      this.itemPose.x = -0.42 * sink;
      this.itemPose.y = -1.18 * sink;
      this.itemPose.z = -0.66 * sink;
      this.itemPose.pitch = 0.68 * sink;
      this.itemPose.roll = -0.42 * sink;
      this.itemPose.scaleX = 1 - 0.14 * sink;
      this.itemPose.scaleY = 1 - 0.14 * sink;
    } else {
      const stretch = pulse(progress, 0, 0.28, 0.5);
      const collapse = smoothstep((progress - 0.42) / 0.48);
      this.itemPose.y = 0.14 * stretch - 0.34 * collapse;
      this.itemPose.roll = collapse * 1.05;
      this.itemPose.scaleX = 1 - stretch * 0.18 + collapse * 0.28;
      this.itemPose.scaleY = 1 + stretch * 0.72 - collapse * 0.66;
      this.itemPose.scaleZ = 1 - collapse * 0.12;
    }
    this.supplyDisplay.applyEventItemPose(instanceId, this.itemPose);
  }

  private applyScubaSuccess(
    instanceId: ItemInstanceId | null,
    progress: number,
  ): void {
    const raise = smoothstep(progress / 0.66);
    if (instanceId !== null) {
      this.itemPose.x = -0.2 * raise;
      this.itemPose.y = 0.74 * raise;
      this.itemPose.z = -0.22 * raise;
      this.itemPose.pitch = -0.28 * raise;
      this.itemPose.roll = 0.1 * raise;
      this.itemPose.scaleY = 1 - 0.14 * raise;
      this.supplyDisplay.applyEventItemPose(instanceId, this.itemPose);
    }
    const foodReveal = smoothstep((progress - 0.42) / 0.4);
    for (let index = 0; index < this.foodResults.length; index += 1) {
      const food = this.foodResults[index]!;
      food.visible = foodReveal > 0.01;
      food.scale.setScalar(foodReveal);
      food.position.y = 0.42 + Math.floor(index / 2) * 0.23
        - (1 - foodReveal) * 0.18;
    }
  }

  private applySingleStrike(progress: number): void {
    const strike = pulse(progress, 0.2, 0.5, 0.78);
    if (strike <= 0.01) return;
    this.strike.visible = true;
    this.strike.scale.setScalar(0.72 + strike * 0.42);
    this.strike.rotation.z = -0.12 + strike * 0.08;
    this.hand.visible = true;
    this.hand.position.copy(this.handBasePosition);
    this.hand.position.x -= strike * 0.25;
    this.hand.position.y += strike * 0.38;
    this.hand.position.z -= strike * 0.36;
    this.hand.quaternion.copy(this.handBaseQuaternion);
    this.hand.rotateX(-strike * 0.32);
  }

  private applyHullImpact(progress: number, strength: number): void {
    const impact = pulse(progress, 0.31, 0.52, 0.8) * strength;
    this.cameraRig.position.x += 0.11 * impact;
    this.cameraRig.position.y -= 0.055 * impact;
    this.cameraRig.position.z += 0.07 * impact;
    this.cameraRig.rotateZ(0.075 * impact);
    this.cameraRig.rotateY(-0.06 * impact);
  }

  private finishActive(active: ActiveSharkMenAnimation): void {
    if (this.active !== active) return;
    this.active = null;
    switch (active.kind) {
      case 'reveal':
        this.applyReveal(1);
        active.resolve();
        break;
      case 'item':
        this.applyItemChoice(active.choiceId, active.instanceId, 1);
        this.supplyDisplay.clearEventPose();
        this.restoreCamera();
        active.resolve(true);
        break;
      case 'context':
        this.applyContextChoice(1);
        this.restoreCamera();
        active.resolve(true);
        break;
      case 'reaction':
        this.applyReaction(active, 1);
        this.hideStrike();
        this.restoreCamera();
        active.resolve();
        break;
    }
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active === null) return;
    this.supplyDisplay.clearEventMotion();
    this.restoreCamera();
    if (active.kind === 'item' || active.kind === 'context') {
      active.resolve(false);
    } else {
      active.resolve();
    }
  }

  private rememberCameraBase(): void {
    this.cameraBasePosition.copy(this.cameraRig.position);
    this.cameraBaseQuaternion.copy(this.cameraRig.quaternion);
  }

  private restoreCamera(): void {
    this.cameraRig.position.copy(this.cameraBasePosition);
    this.cameraRig.quaternion.copy(this.cameraBaseQuaternion);
  }

  private resetPresentation(): void {
    for (let index = 0; index < this.mixers.length; index += 1) {
      this.mixers[index]!.setTime(0);
    }
    for (let index = 0; index < this.pathRoots.length; index += 1) {
      const path = this.pathRoots[index]!;
      path.position.copy(this.pathBasePositions[index]!);
      path.quaternion.identity();
      path.scale.set(1, 1, 1);
      const fin = this.fins[index]!;
      fin.position.copy(this.finBasePositions[index]!);
      fin.quaternion.copy(this.finBaseQuaternions[index]!);
      fin.scale.copy(this.finBaseScales[index]!);
      fin.visible = false;
    }
    this.hand.position.copy(this.handBasePosition);
    this.hand.quaternion.copy(this.handBaseQuaternion);
    this.hand.scale.copy(this.handBaseScale);
    this.hand.visible = false;
    this.hideStrike();
    this.hideFoodResults();
    this.root.userData.strikeCount = 0;
  }

  private hideStrike(): void {
    this.strike.visible = false;
    this.strike.scale.set(1, 1, 1);
    this.strike.rotation.set(0, 0, 0);
  }

  private hideFoodResults(): void {
    for (let index = 0; index < this.foodResults.length; index += 1) {
      const food = this.foodResults[index]!;
      food.visible = false;
      food.scale.set(1, 1, 1);
      food.position.y = 0.42 + Math.floor(index / 2) * 0.23;
    }
  }

  private resetItemPose(): void {
    const pose = this.itemPose;
    pose.x = 0;
    pose.y = 0;
    pose.z = 0;
    pose.yaw = 0;
    pose.pitch = 0;
    pose.roll = 0;
    pose.scaleX = 1;
    pose.scaleY = 1;
    pose.scaleZ = 1;
  }

  private isItemChoice(choiceId: string): choiceId is SharkMenItemChoiceId {
    return choiceId === 'harpoonGun'
      || choiceId === 'swimRing'
      || choiceId === 'scubaSet';
  }
}
