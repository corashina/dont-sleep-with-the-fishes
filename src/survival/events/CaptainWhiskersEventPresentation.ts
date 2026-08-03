import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample, type WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import { keyedRevealProgress, pulse, smoothstep } from '../animationMath';
import type {
  DedicatedEventEnvironment,
  DedicatedEventId,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { StationaryEventCamera } from '../StationaryEventCamera';

export const CAPTAIN_WHISKERS_EVENT_IDS = [
  'sick-companion',
  'shadow-figure',
  'sea-watcher',
  'guarded-sleep',
] as const satisfies readonly DedicatedEventId[];

export type CaptainWhiskersEventId = typeof CAPTAIN_WHISKERS_EVENT_IDS[number];

const REVEAL_DURATION = 0.9;
const CHOICE_DURATION = 0.65;
const REACTION_DURATION = 0.8;
const EYE_COUNT = 6;

function signedSmoothstep(value: number): number {
  return value < 0 ? -smoothstep(-value) : smoothstep(value);
}

type AnimationKind = 'reveal' | 'choice' | 'item' | 'reaction';

interface ActiveAnimation {
  readonly kind: AnimationKind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: (played?: boolean) => void;
}

interface SeaWatcherEye {
  readonly mesh: Mesh;
  readonly wave: WaveSample;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CaptainWhiskersEventConstructionHooks {
  readonly onEyeCreated?: (eye: Mesh) => void;
}

function isCaptainWhiskersEventId(id: DedicatedEventId): id is CaptainWhiskersEventId {
  return (CAPTAIN_WHISKERS_EVENT_IDS as readonly string[]).includes(id);
}

export class CaptainWhiskersEventPresentation implements DedicatedEventPresentation {
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly poseRoot: Group;
  private readonly headRoot: Group;
  private readonly falseCat: Group | null;
  private readonly eyes: readonly SeaWatcherEye[];
  private readonly basePosePosition = new Float64Array(3);
  private readonly basePoseRotation = new Float64Array(3);
  private readonly baseHeadRotation = new Float64Array(3);
  private active: ActiveAnimation | null = null;
  private staged = false;
  private disposed = false;

  constructor(
    readonly eventId: CaptainWhiskersEventId,
    private readonly environment: DedicatedEventEnvironment,
    hooks: CaptainWhiskersEventConstructionHooks = {},
  ) {
    if (!isCaptainWhiskersEventId(eventId)) {
      throw new Error(`Unsupported Captain Whiskers event: ${eventId}`);
    }
    const poseRoot = environment.captainWhiskers.root
      .getObjectByName('captain-whiskers-pose');
    const headRoot = environment.captainWhiskers.root
      .getObjectByName('captain-whiskers-head-pose');
    if (!(poseRoot instanceof Group) || !(headRoot instanceof Group)) {
      throw new Error('Captain Whiskers event presentation requires pose roots.');
    }
    this.poseRoot = poseRoot;
    this.headRoot = headRoot;
    this.cameraLook = environment.camera === undefined
      ? null
      : new StationaryEventCamera(environment.camera);
    this.worldRoot.name = `${eventId}-world`;
    this.boatRoot.name = `${eventId}-boat`;
    this.captureBasePose();

    let falseCat: Group | null = null;
    let eyes: readonly SeaWatcherEye[] = [];
    try {
      if (eventId === 'shadow-figure') falseCat = this.createFalseCat();
      if (eventId === 'sea-watcher') eyes = this.createSeaWatcherEyes(hooks);
      this.falseCat = falseCat;
      this.eyes = eyes;
      this.hideScene();
    } catch (error) {
      try {
        runCleanupSteps([
          () => this.worldRoot.clear(),
          () => this.boatRoot.clear(),
          () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
        ]);
      } catch {
        // Preserve the construction error after all owned resources run.
      }
      throw error;
    }
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.captureBasePose();
    this.cameraLook?.capture();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.applyStrength(0, 0);
  }

  reveal(): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    this.applyStrength(0, 0);
    return this.startAnimation('reveal', REVEAL_DURATION) as Promise<void>;
  }

  playChoice(_choiceId: string): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    return this.startAnimation('choice', CHOICE_DURATION) as Promise<void>;
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (!this.canAnimate()) return Promise.resolve(false);
    this.cancelActive();
    return this.startAnimation('item', CHOICE_DURATION) as Promise<boolean>;
  }

  react(_result: EventOutcomePresentation): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    return this.startAnimation('reaction', REACTION_DURATION) as Promise<void>;
  }

  skip(): void {
    if (this.disposed || !this.staged) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    if (active === null) {
      this.applyStrength(1, time);
      return;
    }
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    let strength = 1;
    if (active.kind === 'reveal') strength = keyedRevealProgress(progress);
    else if (active.kind === 'reaction') strength = 1 - pulse(progress, 0, 0.38, 0.78) * 0.28;
    else strength = 1 + pulse(progress, 0, 0.38, 0.82) * 0.12;
    this.applyStrength(strength, time);
    if (progress === 1) this.finishActive(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed || !this.staged) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    this.active = null;
    active?.resolve(active.kind === 'item' ? false : undefined);
    runCleanupSteps([
      () => this.restoreBaseState(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private canAnimate(): boolean {
    return !this.disposed && this.staged;
  }

  private startAnimation(kind: AnimationKind, duration: number): Promise<void | boolean> {
    return new Promise((resolve) => {
      this.active = { kind, elapsed: 0, duration, resolve };
    });
  }

  private finishActive(time: number): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    this.applyStrength(1, time);
    active.resolve(active.kind === 'item' ? true : undefined);
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    active?.resolve(active.kind === 'item' ? false : undefined);
  }

  private captureBasePose(): void {
    this.basePosePosition[0] = this.poseRoot.position.x;
    this.basePosePosition[1] = this.poseRoot.position.y;
    this.basePosePosition[2] = this.poseRoot.position.z;
    this.basePoseRotation[0] = this.poseRoot.rotation.x;
    this.basePoseRotation[1] = this.poseRoot.rotation.y;
    this.basePoseRotation[2] = this.poseRoot.rotation.z;
    this.baseHeadRotation[0] = this.headRoot.rotation.x;
    this.baseHeadRotation[1] = this.headRoot.rotation.y;
    this.baseHeadRotation[2] = this.headRoot.rotation.z;
  }

  private restoreBaseState(): void {
    this.poseRoot.position.set(
      this.basePosePosition[0]!,
      this.basePosePosition[1]!,
      this.basePosePosition[2]!,
    );
    this.poseRoot.rotation.set(
      this.basePoseRotation[0]!,
      this.basePoseRotation[1]!,
      this.basePoseRotation[2]!,
    );
    this.headRoot.rotation.set(
      this.baseHeadRotation[0]!,
      this.baseHeadRotation[1]!,
      this.baseHeadRotation[2]!,
    );
    this.cameraLook?.restore();
  }

  private restoreAndHide(): void {
    this.restoreBaseState();
    this.staged = false;
    this.hideScene();
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    if (this.falseCat !== null) this.falseCat.visible = false;
    for (const eye of this.eyes) eye.mesh.visible = false;
  }

  private applyStrength(strength: number, time: number): void {
    const value = Number.isFinite(strength) ? strength : 0;
    if (this.eventId === 'sick-companion') {
      this.poseRoot.position.y = this.basePosePosition[1]! - value * 0.07;
      this.poseRoot.rotation.x = this.basePoseRotation[0]! + value * 0.38;
      this.poseRoot.rotation.y = this.basePoseRotation[1]! - value * 0.13;
      this.headRoot.rotation.x = this.baseHeadRotation[0]! + value * 0.24;
      this.headRoot.rotation.y = this.baseHeadRotation[1]! - value * 0.08;
      this.cameraLook?.apply(-0.2 * value, 0.11 * value);
      return;
    }
    if (this.eventId === 'guarded-sleep') {
      this.poseRoot.position.y = this.basePosePosition[1]! + value * 0.055;
      this.poseRoot.rotation.x = this.basePoseRotation[0]! - value * 0.18;
      this.poseRoot.rotation.y = this.basePoseRotation[1]! + value * 0.1;
      this.headRoot.rotation.x = this.baseHeadRotation[0]! - value * 0.11;
      this.headRoot.rotation.y = this.baseHeadRotation[1]! + value * 0.34;
      this.cameraLook?.apply(0.13 * value, -0.035 * value);
      return;
    }
    if (this.eventId === 'shadow-figure') {
      if (this.falseCat === null) return;
      const travel = signedSmoothstep(value);
      this.falseCat.visible = Math.abs(value) > 0.01;
      this.falseCat.position.y = -0.1 + travel * 0.18;
      this.falseCat.rotation.y = -0.58 + travel * 0.1;
      this.falseCat.scale.setScalar(0.82 + travel * 0.18);
      this.cameraLook?.apply(-0.27 * value, 0.025 * value);
      return;
    }
    this.applySeaWatcher(value, time);
  }

  private applySeaWatcher(strength: number, time: number): void {
    const reveal = signedSmoothstep(strength);
    const visibleScale = Math.abs(reveal);
    const amplitudeScale = this.environment.readWorldWaveAmplitudeScale();
    for (let index = 0; index < this.eyes.length; index += 1) {
      const eye = this.eyes[index]!;
      this.environment.sampleWorldWaveInto(
        eye.wave,
        time,
        eye.x,
        eye.z,
        amplitudeScale,
      );
      eye.mesh.visible = Math.abs(strength) > 0.015;
      eye.mesh.position.set(
        eye.x + eye.wave.displacementX * 0.12,
        0.08 + eye.wave.height + reveal * (0.12 + (index % 2) * 0.035),
        eye.z + eye.wave.displacementZ * 0.12,
      );
      eye.mesh.rotation.set(
        eye.wave.normal.z * 0.04,
        eye.yaw,
        -eye.wave.normal.x * 0.04,
      );
      eye.mesh.scale.set(
        eye.scaleX * visibleScale,
        eye.scaleY * visibleScale,
        0.24 * visibleScale,
      );
    }
    this.cameraLook?.apply(0, -0.035 * reveal);
  }

  private createFalseCat(): Group {
    const clone = this.environment.captainWhiskers.root.clone(true);
    clone.name = 'shadow-figure:false-cat';
    clone.position.set(-1.45, -0.1, -1.15);
    clone.rotation.set(0, -0.58, 0.04);
    clone.visible = false;
    clone.getObjectByName('captain-whiskers-interaction')!.visible = true;
    clone.getObjectByName('captain-whiskers-petting-hand')!.visible = false;
    clone.getObjectByName('captain-whiskers-food')!.visible = false;
    const materialClones = new Map<Material, Material>();
    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const dark = source.map((material) => {
        let owned = materialClones.get(material);
        if (owned === undefined) {
          const created = material.clone();
          if (created instanceof MeshStandardMaterial) {
            created.color.setHex(0x11171a);
            created.emissive.setHex(0x020304);
            created.emissiveIntensity = 0.04;
            created.roughness = 0.98;
            created.metalness = 0;
          }
          materialClones.set(material, created);
          this.ownedMaterials.add(created);
          owned = created;
        }
        return owned;
      });
      object.material = Array.isArray(object.material) ? dark : dark[0]!;
    });
    this.boatRoot.add(clone);
    return clone;
  }

  private createSeaWatcherEyes(
    hooks: CaptainWhiskersEventConstructionHooks,
  ): readonly SeaWatcherEye[] {
    const geometry = new SphereGeometry(0.24, 7, 4);
    const material = new MeshStandardMaterial({
      color: 0xb6c7ac,
      emissive: 0x6f957c,
      emissiveIntensity: 0.5,
      roughness: 0.58,
      metalness: 0,
      flatShading: true,
    });
    this.ownedGeometries.add(geometry);
    this.ownedMaterials.add(material);
    const eyes: SeaWatcherEye[] = [];
    for (let index = 0; index < EYE_COUNT; index += 1) {
      const angle = -2.52 + index * 0.94;
      const radius = 3.4 + (index % 2) * 0.75;
      const x = Math.sin(angle) * radius;
      const z = -0.6 + Math.cos(angle) * radius;
      const eye = new Mesh(geometry, material);
      eye.name = `sea-watcher:eye-${index + 1}`;
      eye.visible = false;
      eye.rotation.y = angle + Math.PI;
      this.worldRoot.add(eye);
      eyes.push({
        mesh: eye,
        wave: createWaveSample(),
        x,
        z,
        yaw: angle + Math.PI,
        scaleX: 0.82 + (index % 3) * 0.09,
        scaleY: 0.48 + (index % 2) * 0.08,
      });
      hooks.onEyeCreated?.(eye);
    }
    return eyes;
  }
}
