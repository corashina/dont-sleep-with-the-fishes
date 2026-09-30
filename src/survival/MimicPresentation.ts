import { BufferGeometry, Group, Material, Mesh, MeshStandardMaterial, PointLight, Quaternion, Vector3 } from 'three';
import { createWaterExclusion, type WaterExclusionRegion } from '../ocean/WaterExclusion';
import { createLifeboat } from '../world/Lifeboat';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import { applySeaFogMaterial } from '../world/SeaFogMaterial';
import { smoothstepUnchecked as smoothstep } from './animationMath';
import type {
  EventChoicePresentation, FocusedEventPresentation, FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import { ItemAimTarget } from './ItemAimTarget';
import { MimicSupplies } from './MimicSupplies';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';

const DISTANCE = 9.5;
const FOG_DISTANCE = 38;
const FACING_PLAYER = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
type Animation = 'reveal' | 'pass' | 'lit';
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export class MimicPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly boat: Group;
  private readonly aim: ItemAimTarget;
  private readonly rim = new PointLight(0xa6c6de, 0, 15, 1.5);
  private readonly inspection = new PointLight(0xffedb5, 0, 10, 1.5);
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly exclusion: WaterExclusionRegion;
  private readonly exclusions: WaterExclusionRegion[];
  private readonly motion: Group;
  private readonly supplies = new MimicSupplies();
  private readonly animation = new TimedPresentationAnimation<Animation>(
    (kind, _time, progress) => this.sample(kind, progress),
    (kind) => {
      if (kind === 'reveal') this.root.userData.state = 'watching';
      else {
        this.hide();
        this.root.userData.state = 'held-result';
      }
    },
  );
  private staged = false;
  private disposed = false;
  private distance = FOG_DISTANCE;

  constructor(private readonly dependencies: FocusedEventPresentationDependencies) {
    const { lifeboatAssets, waterExclusions, boatMotionRoot } = dependencies;
    if (lifeboatAssets === undefined || waterExclusions === undefined || boatMotionRoot === undefined) {
      throw new Error('Mimic requires player boat assets, motion, and water exclusions.');
    }
    this.exclusions = waterExclusions;
    this.motion = boatMotionRoot;
    const build = createLifeboat(lifeboatAssets);
    this.boat = build.root;
    this.boat.name = 'mimic-boat';
    this.root.name = 'focused-event:mimic';
    this.aim = new ItemAimTarget(this.boat);
    this.aim.name = 'mimic-empty-seat';
    this.rim.name = 'mimic-cold-light';
    this.inspection.name = 'mimic-seat-light';
    this.root.add(this.boat, this.aim, this.rim, this.inspection);
    collectMeshResources(this.boat, this.geometries, this.materials);
    for (const material of this.materials) {
      if (material instanceof MeshStandardMaterial) applySeaFogMaterial(material);
    }
    build.storageRoot.add(this.supplies.root);
    // Keep solid depth-tested surfaces. The atmosphere conceals the distant copy.
    this.boat.traverse((object) => { if (object instanceof Mesh) object.castShadow = false; });
    const water = build.waterExclusion;
    this.exclusion = createWaterExclusion(this.boat, water.halfWidth, water.halfLength,
      water.taperStart, water.minimumLocalY, water.heightProfile, water.longitudinalProfile);
    this.clear();
  }

  itemAimTarget(): ItemAimTarget | null { return this.staged && this.boat.visible ? this.aim : null; }

  stage(): void {
    if (this.disposed) return;
    this.clear();
    this.supplies.capture(this.dependencies.supplyDisplay.records());
    this.staged = true;
    this.root.visible = true;
    this.boat.visible = true;
    this.distance = FOG_DISTANCE;
    this.exclusions.push(this.exclusion);
    this.syncPose();
    this.root.userData.state = 'staged';
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.animation.start('reveal', 12);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (choice.choiceId !== 'sleep' && choice.choiceId !== 'flashlight') {
      throw new Error(`Unsupported Mimic choice: ${choice.choiceId}`);
    }
    return Promise.resolve();
  }

  react(result: EventResultPresentation, _outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'mimic' || !['mimic-pass', 'mimic-lit'].includes(result.resultId)) {
      throw new Error(`Unsupported Mimic result: ${result.eventId}/${result.resultId}`);
    }
    this.animation.settle();
    const kind = result.resultId === 'mimic-lit' ? 'lit' : 'pass';
    this.root.userData.state = kind;
    this.sample(kind, 0);
    return this.animation.start(kind, kind === 'lit' ? 11.5 : 10);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged || !Number.isFinite(delta) || delta < 0) return;
    this.animation.update(time, delta);
    this.syncPose();
  }

  settleForVisibilityChange(): void { if (!this.disposed) this.animation.settle(); }

  clear(): void {
    this.animation.cancel();
    this.staged = false;
    this.supplies.clear();
    this.hide();
    this.root.visible = false;
    this.root.userData.state = 'idle';
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.rim.dispose();
    this.inspection.dispose();
    disposeResourceSets(this.geometries, this.materials);
    this.root.removeFromParent();
    this.root.clear();
  }

  private sample(kind: Animation, progress: number): void {
    if (kind === 'reveal') {
      const approach = smoothstep(progress);
      this.distance = FOG_DISTANCE + (DISTANCE - FOG_DISTANCE) * approach;
      this.rim.intensity = 9 * approach;
    } else {
      const departure = smoothstep(clamp((progress - 0.35) / 0.65));
      this.distance = DISTANCE + departure * (FOG_DISTANCE - DISTANCE);
      this.rim.intensity = 9 * (1 - departure);
      this.inspection.intensity = kind === 'lit'
        ? 16 * smoothstep(clamp(progress / 0.12)) * (1 - departure) : 0;
    }
    this.syncPose();
  }

  private syncPose(): void {
    // Copy the actual smoothed player pose, not a second wave sample.
    this.boat.position.copy(this.motion.position);
    this.boat.position.z -= this.distance;
    this.boat.quaternion.copy(this.motion.quaternion).multiply(FACING_PLAYER);
    this.aim.position.copy(this.boat.position);
    this.aim.position.y += 0.25;
    this.rim.position.copy(this.boat.position).addScaledVector(this.root.up, 3.5);
    this.inspection.position.copy(this.boat.position).addScaledVector(this.root.up, 1.8);
    this.boat.updateWorldMatrix(true, false);
    this.exclusion.worldToLocal.copy(this.boat.matrixWorld).invert();
  }

  private hide(): void {
    this.boat.visible = false;
    this.rim.intensity = 0;
    this.inspection.intensity = 0;
    const index = this.exclusions.indexOf(this.exclusion);
    if (index !== -1) this.exclusions.splice(index, 1);
  }
}
