import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { addTransformedMesh as addMesh } from '../rendering/addTransformedMesh';
import { hasRenderableBounds } from '../rendering/modelPresentation';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { MutableSupplyPose } from './BoatSupplyDisplay';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
} from './animationMath';
import { PLANE_CHOICE_WINDOW_SECONDS } from './eventCatalog';
import type {
  EventChoicePresentation,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

type PlaneAnimationKind =
  | 'reveal'
  | 'choice-flashlight'
  | 'choice-pass'
  | 'result-pass';

const REVEAL_DURATION = 2;
const FLASHLIGHT_DURATION = 1.8;
const PASS_CHOICE_DURATION = 0.32;
const PLANE_SPEED = 20;
const PLANE_START = new Vector3(130, 28, -70);
const PLANE_REVEALED = new Vector3(90, 28, -70);
const PLANE_WINDOW_END = new Vector3(
  PLANE_REVEALED.x - PLANE_SPEED * PLANE_CHOICE_WINDOW_SECONDS,
  PLANE_REVEALED.y,
  PLANE_REVEALED.z,
);
const PLANE_EXIT = new Vector3(-140, 28, -70);
const PLANE_NIGHT_GLOW = 0.2;
const PLANE_RED_GLOW = 0x6e2118;

function brightenPlaneMaterial(planeMaterial: Material): void {
  if (!(planeMaterial instanceof MeshStandardMaterial)) return;
  if (planeMaterial.map === null) {
    planeMaterial.emissive.setHex(PLANE_RED_GLOW);
  } else {
    planeMaterial.emissive.setHex(0xffffff);
    planeMaterial.emissiveMap = planeMaterial.map;
  }
  planeMaterial.emissiveIntensity = PLANE_NIGHT_GLOW;
  planeMaterial.needsUpdate = true;
}

function material(
  color: number,
  options: {
    readonly emissive?: number;
    readonly transparent?: boolean;
    readonly opacity?: number;
    readonly depthWrite?: boolean;
  } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.78,
    emissive: options.emissive ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    flatShading: true,
  });
}

export class PlanePresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly aircraft = new Group();
  private readonly beam = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly exitStart = new Vector3();
  private readonly planeStart = PLANE_START.clone();
  private readonly planeRevealed = PLANE_REVEALED.clone();
  private readonly planeWindowEnd = PLANE_WINDOW_END.clone();
  private readonly planeExit = PLANE_EXIT.clone();
  private readonly cruiseDirection = new Vector3();
  private readonly supplyPose: MutableSupplyPose = {
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
  private readonly animation = new TimedPresentationAnimation<PlaneAnimationKind>(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    (kind) => this.finishAnimation(kind),
  );
  private selectedInstanceId: ItemInstanceId | null = null;
  private supplyPinned = false;
  private side: EventSide = -1;
  private planePitch = 0;
  private planeYaw = Math.PI / 2;
  private cruising = false;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.root.name = 'focused-event:plane';
    this.root.visible = false;
    this.root.userData.motionSource = 'steady-authored-path';
    this.root.userData.holdOnClear = false;
    this.aircraft.name = 'plane-aircraft';
    this.aircraft.add(this.requiredAirplaneModel());
    this.buildFlashlightBeam();
    this.root.add(this.aircraft, this.beam);
    collectMeshResources(this.root, this.geometries, this.materials);
    this.configureSide(0);
    this.resetActors();
  }

  itemAimTarget(): Group | null {
    return this.aircraft.visible ? this.aircraft : null;
  }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.releaseSupply();
    this.configureSide(variantSeed);
    this.cruising = false;
    this.staged = true;
    this.root.visible = true;
    this.root.userData.holdOnClear = false;
    this.aircraft.visible = true;
    this.aircraft.position.copy(this.planeStart);
    this.aircraft.rotation.set(this.planePitch, this.planeYaw, -0.06);
    this.beam.visible = false;
    this.root.userData.state = 'staged';
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    switch (choice.choiceId) {
      case 'flareGun':
        this.root.userData.state = 'flare-sent';
        return Promise.resolve();
      case 'flashlight':
        this.prepareSupply(choice);
        this.root.userData.state = 'signalling';
        return this.startAnimation('choice-flashlight', FLASHLIGHT_DURATION);
      case 'sleep':
        this.releaseSupply();
        this.beam.visible = false;
        this.root.userData.state = 'letting-pass';
        return this.startAnimation('choice-pass', PASS_CHOICE_DURATION);
      default:
        throw new Error(`Unsupported Plane choice: ${choice.choiceId}`);
    }
  }

  react(
    result: EventResultPresentation,
    _outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'plane') {
      throw new Error(`Plane received result for ${result.eventId}.`);
    }
    switch (result.resultId) {
      case 'plane-signaled':
        this.animation.settle();
        this.releaseSupply();
        this.beam.visible = false;
        this.root.userData.state = 'signal-sent';
        return Promise.resolve();
      case 'plane-pass':
        this.cruising = false;
        this.exitStart.copy(this.aircraft.position);
        this.facePath(this.exitStart, this.planeExit);
        this.root.userData.state = 'passing';
        return this.startAnimation(
          'result-pass',
          this.exitStart.distanceTo(this.planeExit) / PLANE_SPEED,
        );
      default:
        throw new Error(`Unsupported Plane result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.releaseSupply();
    this.cruising = false;
    this.staged = false;
    this.root.visible = false;
    this.root.userData.holdOnClear = false;
    this.resetActors();
    this.root.userData.state = 'idle';
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const wasCruising = this.cruising;
    this.animation.update(time, delta);
    if (wasCruising && this.cruising) {
      this.aircraft.position.addScaledVector(
        this.cruiseDirection,
        PLANE_SPEED * delta,
      );
    }
  }

  settleForVisibilityChange(): void {
    if (!this.disposed) this.animation.settle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.releaseSupply();
    this.cruising = false;
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private requiredAirplaneModel(): Group {
    const model = this.dependencies.propModels.createEventModel('airplane')?.root;
    if (model === undefined || !hasRenderableBounds(model)) {
      throw new Error('Missing required Plane event model.');
    }
    model.name = 'event-model:airplane';
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (Array.isArray(object.material)) {
        object.material.forEach(brightenPlaneMaterial);
      } else {
        brightenPlaneMaterial(object.material);
      }
    });
    return model;
  }

  private startAnimation(
    kind: PlaneAnimationKind,
    duration: number,
  ): Promise<void> {
    this.animation.settle();
    const running = this.animation.start(kind, duration);
    this.applyAnimation(kind, 0);
    return running;
  }

  private applyAnimation(kind: PlaneAnimationKind, progress: number): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.aircraft.position.lerpVectors(
          this.planeStart,
          this.planeRevealed,
          normalized,
        );
        break;
      case 'choice-flashlight':
        this.applyFlashlight(normalized);
        break;
      case 'choice-pass':
        this.beam.visible = false;
        break;
      case 'result-pass':
        this.aircraft.position.lerpVectors(
          this.exitStart,
          this.planeExit,
          normalized,
        );
        break;
    }
  }

  private finishAnimation(kind: PlaneAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.facePath(this.planeRevealed, this.planeWindowEnd);
        this.cruising = true;
        this.root.userData.state = 'revealed';
        break;
      case 'choice-flashlight':
        this.root.userData.state = 'flashlight-sent';
        break;
      case 'choice-pass':
        this.root.userData.state = 'choice-pass';
        break;
      case 'result-pass':
        this.aircraft.visible = false;
        this.root.userData.state = 'held-pass';
        break;
    }
  }

  private applyFlashlight(progress: number): void {
    const aim = smoothstep(progress / 0.24);
    this.applySupplyAim(aim);
    const phase = Math.min(5.999999, progress * 6);
    const on = progress < 1 && Math.floor(phase) % 2 === 0;
    this.beam.visible = on;
    const visual = this.beam.children[0];
    if (visual instanceof Mesh && visual.material instanceof MeshStandardMaterial) {
      visual.material.opacity = on ? 0.14 : 0;
    }
  }

  private prepareSupply(choice: EventChoicePresentation): void {
    this.releaseSupply();
    this.selectedInstanceId = choice.instanceId;
    this.supplyPinned = choice.instanceId !== null
      && this.dependencies.supplyDisplay.pinEventActor(choice.instanceId);
    this.resetSupplyPose();
  }

  private applySupplyAim(progress: number): void {
    if (!this.supplyPinned || this.selectedInstanceId === null) return;
    this.supplyPose.x = 0.42 * progress;
    this.supplyPose.y = 0.4 * progress;
    this.supplyPose.z = -0.7 * progress;
    this.supplyPose.yaw = -0.18 * progress;
    this.supplyPose.pitch = -0.45 * progress;
    this.supplyPose.roll = -0.06 * progress;
    this.dependencies.supplyDisplay.applyEventItemPose(
      this.selectedInstanceId,
      this.supplyPose,
    );
  }

  private releaseSupply(): void {
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.selectedInstanceId = null;
    this.supplyPinned = false;
    this.resetSupplyPose();
  }

  private resetSupplyPose(): void {
    this.supplyPose.x = 0;
    this.supplyPose.y = 0;
    this.supplyPose.z = 0;
    this.supplyPose.yaw = 0;
    this.supplyPose.pitch = 0;
    this.supplyPose.roll = 0;
    this.supplyPose.scaleX = 1;
    this.supplyPose.scaleY = 1;
    this.supplyPose.scaleZ = 1;
  }

  private resetActors(): void {
    this.aircraft.visible = false;
    this.aircraft.position.copy(this.planeStart);
    this.aircraft.rotation.set(this.planePitch, this.planeYaw, -0.06);
    this.beam.visible = false;
  }

  private configureSide(variantSeed: number): void {
    this.side = eventSideFromSeed(variantSeed);
    this.planeStart.copy(PLANE_START);
    this.planeStart.x *= this.side;
    this.planeRevealed.copy(PLANE_REVEALED);
    this.planeRevealed.x *= this.side;
    this.planeWindowEnd.copy(PLANE_WINDOW_END);
    this.planeWindowEnd.x *= this.side;
    this.planeExit.copy(PLANE_EXIT);
    this.planeExit.x *= this.side;
    this.cruiseDirection.copy(this.planeWindowEnd)
      .sub(this.planeRevealed)
      .normalize();
    this.setPathAngles(this.planeStart, this.planeRevealed);
    this.root.userData.eventSide = this.side === -1 ? 'left' : 'right';
  }

  private facePath(from: Vector3, to: Vector3): void {
    this.setPathAngles(from, to);
    this.aircraft.rotation.set(this.planePitch, this.planeYaw, -0.06);
  }

  private setPathAngles(from: Vector3, to: Vector3): void {
    const x = to.x - from.x;
    const y = to.y - from.y;
    const z = to.z - from.z;
    this.planePitch = Math.atan2(y, Math.hypot(x, z));
    this.planeYaw = Math.atan2(-x, -z) + Math.PI / 2;
  }

  private buildFlashlightBeam(): void {
    this.beam.name = 'plane-flashlight-beam';
    addMesh(
      this.beam,
      'plane-flashlight-beam-visual',
      new CylinderGeometry(0.05, 2.4, 48, 8, 1, true),
      material(0xe7dfc5, {
        emissive: 0x665d46,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      [1.2, 5.2, -24],
      [Math.PI / 2.18, 0.02, 0.03],
    );
  }
}
