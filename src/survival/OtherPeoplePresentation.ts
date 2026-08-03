import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { addTransformedMesh as addMesh } from '../rendering/addTransformedMesh';
import {
  disposeRejectedModel,
  hasRenderableBounds,
} from '../rendering/modelPresentation';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type { MutableSupplyPose } from './BoatSupplyDisplay';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import type {
  EventChoicePresentation,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';

type OtherPeopleAnimationKind =
  | 'reveal'
  | 'choice-flare'
  | 'choice-flashlight'
  | 'choice-pass'
  | 'result-rescue'
  | 'result-missed'
  | 'result-pass';

type ActiveAnimation = TimedAnimation<OtherPeopleAnimationKind>;

const REVEAL_DURATION = 3.4;
const FLARE_DURATION = 1.25;
const FLASHLIGHT_DURATION = 1.8;
const PASS_CHOICE_DURATION = 0.32;
const RESCUE_DURATION = 3.2;
const EXIT_DURATION = 4.2;
const SHIP_YAW = -0.08;
const RESCUE_YAW = SHIP_YAW + 0.58;
const SHIP_BASE = new Vector3(-8.5, 0.68, -48);
const SHIP_APPROACH = new Vector3(-3.8, 0.8, -21);
const SHIP_EXIT = new Vector3(11, 0.68, -45.4);
const FLARE_START = new Vector3(1.4, 1.8, -1.8);
const FLARE_END = new Vector3(-2.4, 19, -23);
const HORIZON_LIGHT_INTENSITY = 0.82;
const CRUISE_SPEED = 0.7;
const RED_WASH_COLOR = 0xff3b2f;
const NO_RED_WASH_TARGETS = Object.freeze([] as string[]);
const RED_WASH_TARGETS = Object.freeze([
  'lifeboat',
  'container-ship',
]);

function keyedTravel(progress: number): number {
  const clamped = clamp01(progress);
  if (clamped < 0.14) {
    return -0.035 * smoothstep(clamped / 0.14);
  }
  if (clamped < 0.82) {
    return -0.035
      + 1.075 * smoothstep((clamped - 0.14) / 0.68);
  }
  return 1.04
    + (1 - 1.04) * smoothstep((clamped - 0.82) / 0.18);
}

function createMaterial(
  color: number,
  roughness: number,
  options: {
    readonly metalness?: number;
    readonly emissive?: number;
    readonly transparent?: boolean;
    readonly opacity?: number;
    readonly depthWrite?: boolean;
  } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    flatShading: true,
  });
}

export class OtherPeoplePresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly ship = new Group();
  private readonly portBeacon = new Group();
  private readonly starboardBeacon = new Group();
  private readonly portBeaconLight = new PointLight(
    0xe7c993,
    0,
    9,
    1.8,
  );
  private readonly starboardBeaconLight = new PointLight(
    0xe7c993,
    0,
    9,
    1.8,
  );
  private readonly flare = new Group();
  private readonly shipFillLight = new PointLight(0xa8c6cf, 3, 48, 1.15);
  private readonly shipDeckLight = new PointLight(0xe8b56c, 2.2, 30, 1.35);
  private readonly flareGlow = new PointLight(
    0xff4836,
    3.4,
    16,
    1.7,
  );
  private readonly beamVisual = new Group();
  private readonly lifeboatLightTarget = new Object3D();
  private readonly shipLightTarget = new Object3D();
  private readonly flareLifeboatWash = new SpotLight(
    RED_WASH_COLOR,
    0,
    46,
    Math.PI * 0.38,
    0.7,
    1.1,
  );
  private readonly flareShipWash = new SpotLight(
    RED_WASH_COLOR,
    0,
    54,
    Math.PI * 0.34,
    0.68,
    1.1,
  );
  private readonly flashlightBeam = new SpotLight(
    0xeee3c2,
    0,
    72,
    Math.PI * 0.075,
    0.42,
    1.05,
  );
  private readonly staticGeometries = new Set<BufferGeometry>();
  private readonly staticMaterials = new Set<Material>();
  private readonly shipStartPosition = new Vector3();
  private readonly cameraLook: StationaryEventCamera;
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
  private activeAnimation: ActiveAnimation | null = null;
  private selectedInstanceId: ItemInstanceId | null = null;
  private shipStartYaw = SHIP_YAW;
  private rescueLifeboatWashStart = 0;
  private rescueShipWashStart = 0;
  private supplyPinned = false;
  private portRevealed = false;
  private starboardRevealed = false;
  private shipRevealed = false;
  private staged = false;
  private terminalRescue = false;
  private naturalRescueCue = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.cameraLook = new StationaryEventCamera(dependencies.camera);
    this.root.name = 'focused-event:other-people';
    this.root.visible = false;
    this.root.userData.motionSource = 'steady-authored-path';
    this.root.userData.holdOnClear = false;

    this.ship.name = 'other-people-ship';
    this.ship.userData.motionSource = 'steady-authored-path';
    this.ship.position.copy(SHIP_BASE);
    this.ship.rotation.y = SHIP_YAW;
    this.buildShip();
    this.shipFillLight.name = 'other-people-ship-fill';
    this.shipFillLight.position.set(0, 11, 8);
    this.shipDeckLight.name = 'other-people-ship-deck-light';
    this.shipDeckLight.position.set(6.5, 7.5, 1.5);
    this.ship.add(this.shipFillLight, this.shipDeckLight);

    this.buildBeacon(
      this.portBeacon,
      this.portBeaconLight,
      'other-people-horizon-light-port',
    );
    this.buildBeacon(
      this.starboardBeacon,
      this.starboardBeaconLight,
      'other-people-horizon-light-starboard',
    );
    this.buildFlare();
    this.buildFlashlightBeam();
    this.configureLightTargets();
    this.root.add(
      this.ship,
      this.portBeacon,
      this.starboardBeacon,
      this.flare,
      this.beamVisual,
      this.lifeboatLightTarget,
      this.shipLightTarget,
      this.flareLifeboatWash,
      this.flareShipWash,
      this.flashlightBeam,
    );
    collectMeshResources(
      this.root,
      this.staticGeometries,
      this.staticMaterials,
    );
    this.resetActors();
  }

  stage(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.restoreCamera();
    this.releaseSupply();
    this.captureCamera();
    this.naturalRescueCue = false;
    this.terminalRescue = false;
    this.staged = true;
    this.root.visible = true;
    this.root.userData.holdOnClear = false;
    this.resetActors();
    this.ship.visible = true;
    this.ship.position.copy(SHIP_BASE);
    this.ship.rotation.y = SHIP_YAW;
    this.updateBeaconPose();
    this.updateOpenWaterDistance();
    this.root.userData.state = 'staged';
    this.root.userData.revealOrder = [];
    this.root.userData.signalPulses = 0;
    this.root.userData.flareLaunches = 0;
    this.root.userData.answerPulses = 0;
    this.root.userData.courseTurns = 0;
    this.root.userData.redWashTargets = NO_RED_WASH_TARGETS;
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
    this.ensureShipPresented();
    switch (choice.choiceId) {
      case 'flareGun':
        this.prepareSupply(choice);
        this.root.userData.state = 'firing-flare';
        return this.startAnimation('choice-flare', FLARE_DURATION);
      case 'flashlight':
        this.prepareSupply(choice);
        this.root.userData.state = 'signalling';
        return this.startAnimation(
          'choice-flashlight',
          FLASHLIGHT_DURATION,
        );
      case 'pass':
        this.releaseSupply();
        this.setPlayerSignalsDark();
        this.root.userData.state = 'letting-pass';
        return this.startAnimation(
          'choice-pass',
          PASS_CHOICE_DURATION,
        );
      default:
        throw new Error(
          `Unsupported Other People choice: ${choice.choiceId}`,
        );
    }
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'other-people') {
      throw new Error(
        `Other People received result for ${result.eventId}.`,
      );
    }
    void outcome;
    this.ensureShipPresented();
    this.shipStartPosition.copy(this.ship.position);
    this.shipStartYaw = this.ship.rotation.y;
    this.root.userData.answerPulses = 0;
    this.root.userData.courseTurns = 0;
    switch (result.resultId) {
      case 'people-rescue':
        this.cancelActiveAnimation(true);
        this.rescueLifeboatWashStart =
          this.flareLifeboatWash.intensity;
        this.rescueShipWashStart = this.flareShipWash.intensity;
        this.root.userData.state = 'answering';
        return this.startAnimation('result-rescue', RESCUE_DURATION);
      case 'people-missed':
        this.setPlayerSignalsDark();
        this.root.userData.state = 'missing';
        return this.startAnimation('result-missed', EXIT_DURATION);
      case 'people-pass':
        this.setPlayerSignalsDark();
        this.root.userData.signalPulses = 0;
        this.root.userData.flareLaunches = 0;
        this.root.userData.state = 'passing';
        return this.startAnimation('result-pass', EXIT_DURATION);
      default:
        throw new Error(
          `Unsupported Other People result: ${result.resultId}`,
        );
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.releaseSupply();
    this.restoreCamera();
    this.setPlayerSignalsDark();
    this.flare.visible = false;
    this.staged = false;
    this.naturalRescueCue = false;
    if (this.terminalRescue) {
      this.root.visible = true;
      this.ship.visible = true;
      this.portBeacon.visible = true;
      this.starboardBeacon.visible = true;
      this.setBeaconIntensity(HORIZON_LIGHT_INTENSITY);
      this.updateBeaconPose();
      this.root.userData.holdOnClear = true;
      this.root.userData.state = 'held-rescue';
      return;
    }
    this.resetActors();
    this.root.visible = false;
    this.root.userData.holdOnClear = false;
    this.root.userData.state = 'idle';
  }

  update(_time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const animation = this.activeAnimation;
    if (animation !== null) {
      animation.elapsed = Math.min(
        animation.duration,
        animation.elapsed + Math.max(0, delta),
      );
      const progress = animation.duration <= 0
        ? 1
        : animation.elapsed / animation.duration;
      this.applyAnimation(animation.kind, progress);
      if (progress >= 1) {
        this.activeAnimation = null;
        this.finishAnimation(animation.kind);
        animation.resolve();
      }
    }
    if (this.staged && this.ship.visible && !this.terminalRescue) {
      this.advanceCruise(delta);
    }
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.releaseSupply();
    this.restoreCamera();
    this.setPlayerSignalsDark();
    this.disposed = true;
    this.staged = false;
    this.terminalRescue = false;
    this.naturalRescueCue = false;
    this.root.userData.holdOnClear = false;
    this.root.removeFromParent();
    this.flareLifeboatWash.shadow.dispose();
    this.flareShipWash.shadow.dispose();
    this.flashlightBeam.shadow.dispose();
    this.portBeaconLight.shadow.dispose();
    this.starboardBeaconLight.shadow.dispose();
    this.flareGlow.shadow.dispose();
    disposeResourceSets(
      this.staticGeometries,
      this.staticMaterials,
    );
    this.root.clear();
  }

  setRescueCue(progress: number | null): void {
    if (this.disposed) return;
    if (progress === null) {
      if (!this.naturalRescueCue) return;
      this.terminalRescue = false;
      this.root.userData.holdOnClear = false;
      this.root.visible = false;
      this.root.userData.state = 'idle';
      return;
    }
    if (!this.naturalRescueCue) {
      this.cancelActiveAnimation(false);
      this.releaseSupply();
      this.restoreCamera();
      this.resetActors();
      this.naturalRescueCue = true;
      this.root.visible = true;
      this.ship.visible = true;
      this.portBeacon.visible = true;
      this.starboardBeacon.visible = true;
    }
    this.root.visible = true;
    this.ship.visible = true;
    this.portBeacon.visible = true;
    this.starboardBeacon.visible = true;
    this.setPlayerSignalsDark();
    const normalized = clamp01(progress);
    const approach = keyedTravel(normalized);
    this.ship.position.lerpVectors(
      SHIP_BASE,
      SHIP_APPROACH,
      approach,
    );
    this.ship.rotation.y = SHIP_YAW
      + (RESCUE_YAW - SHIP_YAW) * smoothstep(normalized);
    this.root.userData.answerPulses = normalized > 0 ? 1 : 0;
    this.root.userData.courseTurns = normalized > 0 ? 1 : 0;
    const answer = Math.sin(Math.PI * clamp01(normalized / 0.34));
    this.portBeaconLight.intensity = HORIZON_LIGHT_INTENSITY
      + answer * 2.8;
    this.starboardBeaconLight.intensity = HORIZON_LIGHT_INTENSITY;
    this.updateBeaconPose();
    this.updateOpenWaterDistance();
    this.terminalRescue = normalized >= 1;
    this.root.userData.holdOnClear = this.terminalRescue;
    this.root.userData.state = this.terminalRescue
      ? 'held-rescue'
      : 'rescue-cue';
  }

  private startAnimation(
    kind: OtherPeopleAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation(true);
    return new Promise<void>((resolve) => {
      this.activeAnimation = {
        kind,
        elapsed: 0,
        duration,
        resolve,
      };
      this.applyAnimation(kind, 0);
    });
  }

  private applyAnimation(
    kind: OtherPeopleAnimationKind,
    progress: number,
  ): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-flare':
        this.applyFlareChoice(normalized);
        break;
      case 'choice-flashlight':
        this.applyFlashlightChoice(normalized);
        break;
      case 'choice-pass':
        this.applyPassChoice();
        break;
      case 'result-rescue':
        this.applyRescueResult(normalized);
        break;
      case 'result-missed':
      case 'result-pass':
        this.applyExitResult(normalized);
        break;
    }
  }

  private finishAnimation(kind: OtherPeopleAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-flare':
        this.dependencies.supplyDisplay.releaseEventActorOnNextSync();
        this.root.userData.state = 'flare-sent';
        break;
      case 'choice-flashlight':
        this.root.userData.state = 'flashlight-sent';
        break;
      case 'choice-pass':
        this.root.userData.state = 'choice-pass';
        break;
      case 'result-rescue':
        this.terminalRescue = true;
        this.setPlayerSignalsDark();
        this.flare.visible = false;
        this.root.userData.holdOnClear = true;
        this.root.userData.state = 'held-rescue';
        break;
      case 'result-missed':
        this.ship.visible = false;
        this.portBeacon.visible = false;
        this.starboardBeacon.visible = false;
        this.root.userData.state = 'held-missed';
        break;
      case 'result-pass':
        this.ship.visible = false;
        this.portBeacon.visible = false;
        this.starboardBeacon.visible = false;
        this.root.userData.state = 'held-pass';
        break;
    }
  }

  private applyReveal(progress: number): void {
    const cameraReturn = 1 - smoothstep((progress - 0.72) / 0.28);
    if (progress > 0) {
      this.portBeacon.visible = true;
      this.portBeaconLight.intensity = HORIZON_LIGHT_INTENSITY
        * smoothstep(progress / 0.1);
      if (!this.portRevealed) {
        this.portRevealed = true;
        (this.root.userData.revealOrder as string[])
          .push('light-port');
      }
    }
    if (progress >= 0.05) {
      this.starboardBeacon.visible = true;
      this.starboardBeaconLight.intensity = HORIZON_LIGHT_INTENSITY
        * smoothstep((progress - 0.05) / 0.1);
      if (!this.starboardRevealed) {
        this.starboardRevealed = true;
        (this.root.userData.revealOrder as string[])
          .push('light-starboard');
      }
    }
    if (progress >= 0.24 && !this.shipRevealed) {
      this.shipRevealed = true;
      (this.root.userData.revealOrder as string[]).push('ship');
    }
    this.updateBeaconPose();
    this.applyCameraPose(
      0.17 * smoothstep(progress) * cameraReturn,
      -0.012 * cameraReturn,
    );
    this.updateOpenWaterDistance();
  }

  private applyFlareChoice(progress: number): void {
    const aim = smoothstep(progress / 0.28);
    this.applySupplyAim(aim, true);
    const travel = smoothstep((progress - 0.08) / 0.76);
    this.flare.visible = progress >= 0.08;
    this.flare.position.lerpVectors(FLARE_START, FLARE_END, travel);
    this.flare.rotation.z = -0.18 + travel * 0.34;
    this.flare.scale.setScalar(0.82 + Math.sin(travel * Math.PI) * 0.28);
    if (progress >= 0.08) this.root.userData.flareLaunches = 1;
    const wash = smoothstep((progress - 0.14) / 0.24);
    this.flareLifeboatWash.intensity = wash * 3.6;
    this.flareShipWash.intensity = wash * 5.2;
    this.root.userData.redWashTargets = wash > 0
      ? RED_WASH_TARGETS
      : NO_RED_WASH_TARGETS;
    this.flashlightBeam.intensity = 0;
    this.beamVisual.visible = false;
    this.updateLightTargetPose();
  }

  private applyFlashlightChoice(progress: number): void {
    const aim = smoothstep(progress / 0.24);
    this.applySupplyAim(aim, false);
    this.flare.visible = false;
    this.flareLifeboatWash.intensity = 0;
    this.flareShipWash.intensity = 0;
    this.root.userData.redWashTargets = NO_RED_WASH_TARGETS;
    const phase = Math.min(5.999999, progress * 6);
    const segment = Math.floor(phase);
    const local = phase - segment;
    const on = progress < 1 && segment % 2 === 0;
    const pulse = on ? 0.25 + Math.sin(local * Math.PI) * 0.75 : 0;
    this.flashlightBeam.intensity = pulse * 7.2;
    this.beamVisual.visible = on;
    const visual = this.beamVisual.children[0];
    if (visual instanceof Mesh) {
      const material = visual.material;
      if (material instanceof MeshStandardMaterial) {
        material.opacity = on ? 0.08 + pulse * 0.09 : 0;
      }
    }
    this.root.userData.signalPulses = progress <= 0
      ? 0
      : Math.min(3, Math.ceil(progress * 3));
    this.updateLightTargetPose();
  }

  private applyPassChoice(): void {
    this.setPlayerSignalsDark();
    this.root.userData.signalPulses = 0;
    this.root.userData.flareLaunches = 0;
  }

  private applyRescueResult(progress: number): void {
    const answerProgress = clamp01(progress / 0.24);
    const answer = Math.sin(answerProgress * Math.PI);
    this.portBeaconLight.intensity = HORIZON_LIGHT_INTENSITY;
    this.starboardBeaconLight.intensity = HORIZON_LIGHT_INTENSITY
      + answer * 3.2;
    if (progress > 0) this.root.userData.answerPulses = 1;
    const turn = smoothstep((progress - 0.18) / 0.42);
    const approach = keyedTravel((progress - 0.28) / 0.72);
    this.ship.position.lerpVectors(
      this.shipStartPosition,
      SHIP_APPROACH,
      approach,
    );
    this.ship.rotation.y = this.shipStartYaw
      + (RESCUE_YAW - this.shipStartYaw) * turn;
    this.root.userData.courseTurns = turn > 0 ? 1 : 0;
    const signalFade = 1 - smoothstep(progress / 0.46);
    this.flareLifeboatWash.intensity =
      this.rescueLifeboatWashStart * signalFade;
    this.flareShipWash.intensity =
      this.rescueShipWashStart * signalFade;
    this.flashlightBeam.intensity = 0;
    this.beamVisual.visible = false;
    this.updateBeaconPose();
    this.updateLightTargetPose();
    this.applyCameraPose(
      0.17 + smoothstep(progress) * 0.01,
      -0.012,
    );
    this.updateOpenWaterDistance();
  }

  private applyExitResult(progress: number): void {
    const travel = clamp01(progress);
    this.ship.position.lerpVectors(
      this.shipStartPosition,
      SHIP_EXIT,
      travel,
    );
    this.ship.rotation.y = this.shipStartYaw;
    this.root.userData.courseTurns = 0;
    const light = HORIZON_LIGHT_INTENSITY
      * (1 - smoothstep((progress - 0.38) / 0.62));
    this.setBeaconIntensity(light);
    this.setPlayerSignalsDark();
    this.updateBeaconPose();
    this.applyCameraPose(0.17 - 0.41 * travel, -0.012 * (1 - travel));
    this.updateOpenWaterDistance();
  }

  private advanceCruise(delta: number): void {
    const travel = Math.max(0, delta) * CRUISE_SPEED;
    this.ship.position.x += travel;
    this.ship.position.z += travel * 0.05;
    this.updateBeaconPose();
    this.updateLightTargetPose();
    this.updateOpenWaterDistance();
  }

  private prepareSupply(choice: EventChoicePresentation): void {
    this.releaseSupply();
    this.selectedInstanceId = choice.instanceId;
    this.supplyPinned = choice.instanceId !== null
      && this.dependencies.supplyDisplay.pinEventActor(choice.instanceId);
    this.resetSupplyPose();
  }

  private applySupplyAim(progress: number, flare: boolean): void {
    if (!this.supplyPinned || this.selectedInstanceId === null) return;
    this.supplyPose.x = (flare ? 0.72 : 0.42) * progress;
    this.supplyPose.y = (flare ? 0.46 : 0.34) * progress;
    this.supplyPose.z = (flare ? -1.15 : -0.72) * progress;
    this.supplyPose.yaw = (flare ? -0.34 : -0.18) * progress;
    this.supplyPose.pitch = (flare ? -0.72 : -0.32) * progress;
    this.supplyPose.roll = (flare ? 0.12 : -0.06) * progress;
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

  private ensureShipPresented(): void {
    if (this.ship.visible) return;
    this.ship.visible = true;
    this.ship.position.copy(SHIP_BASE);
    this.ship.rotation.y = SHIP_YAW;
    this.portBeacon.visible = true;
    this.starboardBeacon.visible = true;
    this.setBeaconIntensity(HORIZON_LIGHT_INTENSITY);
    this.updateBeaconPose();
    this.updateOpenWaterDistance();
  }

  private setPlayerSignalsDark(): void {
    this.flareLifeboatWash.intensity = 0;
    this.flareShipWash.intensity = 0;
    this.flashlightBeam.intensity = 0;
    this.beamVisual.visible = false;
    this.root.userData.redWashTargets = NO_RED_WASH_TARGETS;
  }

  private setBeaconIntensity(intensity: number): void {
    this.portBeaconLight.intensity = intensity;
    this.starboardBeaconLight.intensity = intensity;
  }

  private updateBeaconPose(): void {
    const yaw = this.ship.rotation.y;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    const portX = -5.2;
    const starboardX = 5.4;
    this.portBeacon.position.set(
      this.ship.position.x + portX * cosine,
      this.ship.position.y + 3.2,
      this.ship.position.z - portX * sine,
    );
    this.starboardBeacon.position.set(
      this.ship.position.x + starboardX * cosine,
      this.ship.position.y + 3.05,
      this.ship.position.z - starboardX * sine,
    );
    this.updateLightTargetPose();
  }

  private updateLightTargetPose(): void {
    this.lifeboatLightTarget.position.set(0, 0.4, -0.4);
    this.shipLightTarget.position.set(
      this.ship.position.x,
      this.ship.position.y + 1.4,
      this.ship.position.z,
    );
  }

  private updateOpenWaterDistance(): void {
    this.root.userData.openWaterDistance = Math.max(
      0,
      -this.ship.position.z,
    );
  }

  private applyCameraPose(yaw: number, pitch: number): void {
    this.cameraLook.apply(yaw, pitch);
  }

  private captureCamera(): void {
    this.cameraLook.capture();
  }

  private restoreCamera(): void {
    this.cameraLook.restore();
  }

  private resetActors(): void {
    this.ship.visible = false;
    this.ship.position.copy(SHIP_BASE);
    this.ship.rotation.set(0, SHIP_YAW, 0);
    this.portBeacon.visible = false;
    this.starboardBeacon.visible = false;
    this.setBeaconIntensity(0);
    this.flare.visible = false;
    this.flare.position.copy(FLARE_START);
    this.flare.rotation.set(0, 0, -0.18);
    this.flare.scale.setScalar(1);
    this.setPlayerSignalsDark();
    this.rescueLifeboatWashStart = 0;
    this.rescueShipWashStart = 0;
    this.portRevealed = false;
    this.starboardRevealed = false;
    this.shipRevealed = false;
    this.updateBeaconPose();
    this.updateOpenWaterDistance();
  }

  private buildShip(): void {
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createEventModel(
        'containerShip',
      )?.root ?? null;
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = 'event-model:containerShip';
      selected.position.y = 2.2;
      selected.rotation.y = Math.PI / 2;
      this.ship.add(selected);
      this.ship.userData.modelKind = 'imported';
      return;
    }
    if (selected !== null) disposeRejectedModel(selected);
    this.buildFallbackShip();
    this.ship.userData.modelKind = 'procedural';
  }

  private buildFallbackShip(): void {
    const hull = createMaterial(0x202c31, 0.9, {
      metalness: 0.15,
    });
    const hullEdge = createMaterial(0x35454a, 0.84, {
      metalness: 0.18,
    });
    const bridge = createMaterial(0xaaa38d, 0.9);
    const rust = createMaterial(0x75442e, 0.94, {
      metalness: 0.08,
    });
    const containerColors = [
      createMaterial(0x5c3730, 0.92),
      createMaterial(0x3e5b60, 0.9),
      createMaterial(0x716342, 0.94),
    ];
    addMesh(
      this.ship,
      'other-people-ship-fallback-hull',
      new BoxGeometry(27, 2.5, 5.6),
      hull,
      [0, 0, 0],
      [0, 0, -0.018],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-bow',
      new ConeGeometry(2.8, 6, 4),
      hull,
      [-16.4, 0.05, 0],
      [0, 0, Math.PI / 2],
      [1, 1.1, 1],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-waterline',
      new BoxGeometry(28.6, 0.34, 5.82),
      rust,
      [0.4, -1.02, 0],
      [0, 0, -0.012],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-deck',
      new BoxGeometry(22, 0.36, 5),
      hullEdge,
      [1.5, 1.34, 0],
      [0, -0.012, 0],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-bridge',
      new BoxGeometry(4.2, 4.8, 4.5),
      bridge,
      [10.2, 3.45, 0.06],
      [0, 0.018, -0.012],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-wheelhouse',
      new BoxGeometry(3.2, 1.25, 4.85),
      hullEdge,
      [9.9, 6.25, 0.06],
      [0, 0.018, 0],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-funnel',
      new CylinderGeometry(0.72, 0.9, 3.3, 7),
      rust,
      [7.8, 7.15, -0.5],
      [0, 0, -0.08],
    );
    addMesh(
      this.ship,
      'other-people-ship-fallback-mast',
      new CylinderGeometry(0.09, 0.14, 7.2, 6),
      hullEdge,
      [-4.5, 5.0, 0.2],
      [0, 0, 0.035],
    );
    for (let row = 0; row < 2; row += 1) {
      for (let index = 0; index < 6; index += 1) {
        const color = containerColors[(index + row) % containerColors.length]!;
        addMesh(
          this.ship,
          `other-people-ship-fallback-container-${row + 1}-${index + 1}`,
          new BoxGeometry(2.55, 1.55, 2.18),
          color,
          [-8.2 + index * 2.8, 2.25 + row * 1.65, (index % 2) * 2.3 - 1.15],
          [0, (index - 2.5) * 0.006, 0],
        );
      }
    }
    addMesh(
      this.ship,
      'other-people-ship-fallback-rail',
      new TorusGeometry(2.4, 0.07, 5, 16, Math.PI),
      hullEdge,
      [-13.4, 2.0, 0],
      [Math.PI / 2, 0, Math.PI / 2],
      [1, 1.15, 1],
    );
  }

  private buildBeacon(
    beacon: Group,
    light: PointLight,
    name: string,
  ): void {
    beacon.name = name;
    const glow = createMaterial(0xe4c88e, 0.48, {
      emissive: 0xb17b35,
    });
    const lens = new Mesh(
      new SphereGeometry(0.14, 7, 5),
      glow,
    );
    lens.name = `${name}-lens`;
    lens.scale.set(1.25, 0.82, 0.7);
    light.name = `${name}-light`;
    light.position.z = 0.06;
    beacon.add(lens, light);
  }

  private buildFlare(): void {
    this.flare.name = 'other-people-flare';
    const flareGlow = createMaterial(0xff5a3c, 0.42, {
      emissive: 0xff2418,
    });
    const ash = createMaterial(0x5c3730, 0.92);
    addMesh(
      this.flare,
      'other-people-flare-core',
      new SphereGeometry(0.17, 8, 5),
      flareGlow,
    );
    addMesh(
      this.flare,
      'other-people-flare-tail',
      new ConeGeometry(0.09, 0.62, 6),
      ash,
      [0, -0.37, 0],
      [0, 0, 0.08],
    );
    this.flareGlow.name = 'other-people-flare-glow';
    this.flareGlow.castShadow = false;
    this.flare.add(this.flareGlow);
  }

  private buildFlashlightBeam(): void {
    this.beamVisual.name = 'other-people-flashlight-beam';
    const material = createMaterial(0xe7dfc5, 0.72, {
      emissive: 0x665d46,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    addMesh(
      this.beamVisual,
      'other-people-flashlight-beam-visual',
      new CylinderGeometry(0.045, 2.25, 39, 8, 1, true),
      material,
      [1.2, 2.2, -20],
      [Math.PI / 2, 0.02, 0.03],
    );
  }

  private configureLightTargets(): void {
    this.lifeboatLightTarget.name = 'other-people-lifeboat-light-target';
    this.shipLightTarget.name = 'other-people-ship-light-target';

    this.flareLifeboatWash.name =
      'other-people-flare-lifeboat-wash';
    this.flareLifeboatWash.position.set(-0.4, 14, -18);
    this.flareLifeboatWash.target = this.lifeboatLightTarget;
    this.flareLifeboatWash.castShadow = true;
    this.configureShadow(this.flareLifeboatWash);

    this.flareShipWash.name = 'other-people-flare-ship-wash';
    this.flareShipWash.position.set(-4.5, 15, -27);
    this.flareShipWash.target = this.shipLightTarget;
    this.flareShipWash.castShadow = true;
    this.configureShadow(this.flareShipWash);

    this.flashlightBeam.name =
      'other-people-flashlight-beam-light';
    this.flashlightBeam.position.set(1.4, 2.1, -1.4);
    this.flashlightBeam.target = this.shipLightTarget;
    this.flashlightBeam.castShadow = false;
    this.configureShadow(this.flashlightBeam);
  }

  private configureShadow(light: SpotLight): void {
    light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = light.distance;
    light.shadow.camera.updateProjectionMatrix();
  }

  private cancelActiveAnimation(settle: boolean): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation === null) return;
    if (settle) this.finishAnimation(animation.kind);
    animation.resolve();
  }
}
