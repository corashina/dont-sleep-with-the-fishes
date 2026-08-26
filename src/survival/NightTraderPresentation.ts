import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import {
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
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
import { eventSideFromSeed, type EventSide } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

type NightTraderAnimationKind =
  | 'reveal'
  | 'choice-payment'
  | 'choice-refuse'
  | 'result-reward'
  | 'result-refuse';

const REVEAL_DURATION = 1.6;
const PAYMENT_DURATION = 1.05;
const REFUSE_CHOICE_DURATION = 0.46;
const RESULT_DURATION = 1.05;
const DEPARTURE_DURATION = 1.3;
const BOAT_BASE = new Vector3(4.15, 0.08, -7.1);
const BOAT_AWAY = new Vector3(10.8, -0.2, -17.2);
const ROWBOAT_FLOOR_Y = -0.24;
const TRADER_POSITION = new Vector3(0.35, ROWBOAT_FLOOR_Y, -0.1);
const CASE_TARGET = new Vector3(3.62, 1.02, -6.38);
const PAYMENT_START = new Vector3(-0.35, 0.72, -1.05);
const REWARD_END = new Vector3(-0.35, 0.72, -1.05);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

const TRADER_REWARDS: Readonly<Partial<Record<string, ItemId>>> = Object.freeze({
  food: 'ductTape',
  bait: 'energyBar',
  map: 'compass',
  umbrella: 'medicalKit',
  swimRing: 'radio',
});

function keyedTravel(progress: number): number {
  if (progress < 0.15) return -0.04 * smoothstep(progress / 0.15);
  if (progress < 0.82) {
    return -0.04 + 1.09 * smoothstep((progress - 0.15) / 0.67);
  }
  return 1.05 + (1 - 1.05) * smoothstep((progress - 0.82) / 0.18);
}

function createMaterial(
  color: number,
  roughness: number,
  options: {
    readonly metalness?: number;
    readonly emissive?: number;
    readonly transparent?: boolean;
    readonly opacity?: number;
  } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    flatShading: true,
  });
}

export class NightTraderPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly vessel = new Group();
  private readonly vesselContent = new Group();
  private readonly rowboat = new Group();
  private readonly trader = new Group();
  private readonly lantern = new Group();
  private readonly lanternReflection = new Group();
  private readonly mist = new Group();
  private readonly paymentActors = new Group();
  private readonly rewardActors = new Group();
  private readonly handoverTarget = new Group();
  private readonly staticGeometries = new Set<BufferGeometry>();
  private readonly staticMaterials = new Set<Material>();
  private readonly exchangeGeometries = new Set<BufferGeometry>();
  private readonly exchangeMaterials = new Set<Material>();
  private readonly boatBase = BOAT_BASE.clone();
  private readonly boatAway = BOAT_AWAY.clone();
  private readonly caseTarget = CASE_TARGET.clone();
  private readonly paymentStart = PAYMENT_START.clone();
  private readonly rewardEnd = REWARD_END.clone();
  private readonly boatMotionBase = BOAT_BASE.clone();
  private readonly waveQuaternion = new Quaternion();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
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
  private readonly lanternLight: PointLight;
  private readonly reflectionMaterial: MeshStandardMaterial;
  private readonly mistMaterial: MeshStandardMaterial;
  private readonly animation = new TimedPresentationAnimation<NightTraderAnimationKind>(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    (kind) => this.finishAnimation(kind),
  );
  private paymentActor: Group | null = null;
  private rewardActor: Group | null = null;
  private paymentInstanceId: ItemInstanceId | null = null;
  private activeChoiceId: string | null = null;
  private usingSupplyPayment = false;
  private paymentVisible = false;
  private rewardVisible = false;
  private staged = false;
  private side: EventSide = 1;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.root.name = 'focused-event:night-trader';
    this.root.visible = false;
    this.root.userData.motionSource = 'shared-wave-field';
    this.root.userData.paymentReachedCase = false;
    this.root.userData.paymentAtCase = false;
    this.root.userData.exchangeOverlap = false;

    this.vessel.name = 'night-trader-vessel';
    this.vessel.userData.motionSource = 'shared-wave-field';
    this.rowboat.name = 'night-trader-rowboat';
    this.vesselContent.add(this.rowboat);
    this.vessel.add(this.vesselContent);
    this.buildRowboat();

    this.trader.name = 'night-trader-trader';
    this.trader.userData.motionSource = 'vessel-carried-static';
    this.trader.userData.animationMode = 'none';
    this.buildTrader();
    this.vesselContent.add(this.trader);

    this.lantern.name = 'night-trader-lantern';
    this.lanternLight = this.buildLantern();
    this.vesselContent.add(this.lantern);
    this.lanternReflection.name = 'night-trader-lantern-reflection';
    this.reflectionMaterial = createMaterial(0xd48746, 0.64, {
      emissive: 0x6b381a,
      transparent: true,
      opacity: 0,
    });
    const reflection = new Mesh(
      new SphereGeometry(0.72, 8, 5),
      this.reflectionMaterial,
    );
    reflection.name = 'night-trader-lantern-reflection-glow';
    reflection.scale.set(2.6, 0.035, 0.48);
    this.lanternReflection.position.set(-1.3, -0.43, 0.5);
    this.lanternReflection.add(reflection);
    this.vesselContent.add(this.lanternReflection);

    this.mist.name = 'night-trader-mist';
    this.mistMaterial = createMaterial(0x8ca3a5, 0.92, {
      transparent: true,
      opacity: 0,
    });
    this.buildMist();

    this.paymentActors.name = 'night-trader-payment-actors';
    this.rewardActors.name = 'night-trader-reward-actors';
    this.handoverTarget.name = 'night-trader-handover-target';
    this.root.add(
      this.vessel,
      this.mist,
      this.paymentActors,
      this.rewardActors,
      this.handoverTarget,
    );
    collectMeshResources(
      this.root,
      this.staticGeometries,
      this.staticMaterials,
    );
    this.resetStaticActors();
  }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.side = eventSideFromSeed(variantSeed);
    this.applySideLayout();
    this.animation.cancel();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.clearExchangeActors();
    this.resetStaticActors();
    this.staged = true;
    this.root.visible = true;
    this.vessel.visible = true;
    this.rowboat.visible = true;
    this.trader.visible = true;
    this.lantern.visible = true;
    this.lanternReflection.visible = true;
    this.lanternLight.intensity = 5.2;
    this.reflectionMaterial.opacity = 0.34;
    this.boatMotionBase.copy(this.boatBase);
    this.vessel.position.copy(this.boatBase);
    this.root.userData.state = 'staged';
    this.root.userData.eventSide = this.side === -1 ? 'left' : 'right';
    this.root.userData.paymentReachedCase = false;
    this.root.userData.paymentAtCase = false;
    this.root.userData.exchangeOverlap = false;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  itemAimTarget(): Group {
    return this.handoverTarget;
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.activeChoiceId = choice.choiceId;
    if (choice.choiceId === 'sleep') {
      this.root.userData.state = 'refusing';
      return this.startAnimation('choice-refuse', REFUSE_CHOICE_DURATION);
    }
    if (TRADER_REWARDS[choice.choiceId] === undefined) {
      throw new Error(`Unsupported Night Trader choice: ${choice.choiceId}`);
    }
    this.preparePayment(choice);
    this.root.userData.state = 'taking-payment';
    return this.startAnimation('choice-payment', PAYMENT_DURATION);
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'night-trader') {
      throw new Error(`Night Trader received result for ${result.eventId}.`);
    }
    void outcome;
    this.activeChoiceId = result.choiceId;
    switch (result.resultId) {
      case 'trader-reward': {
        const itemId = TRADER_REWARDS[result.choiceId];
        if (itemId === undefined) {
          throw new Error(`Night Trader has no reward for ${result.choiceId}.`);
        }
        this.hidePayment();
        this.prepareReward(itemId, false);
        this.root.userData.state = 'returning-reward';
        return this.startAnimation('result-reward', RESULT_DURATION);
      }
      case 'trader-food-fallback':
        this.hidePayment();
        this.prepareReward('cannedFood', true);
        this.root.userData.state = 'returning-food';
        return this.startAnimation('result-reward', RESULT_DURATION);
      case 'trader-refuse':
        this.hidePayment();
        this.root.userData.state = 'departing';
        return this.startAnimation('result-refuse', DEPARTURE_DURATION);
      default:
        throw new Error(`Unsupported Night Trader result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.clearExchangeActors();
    this.resetStaticActors();
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    this.animation.update(time, delta);
    this.applySharedWave(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.clearExchangeActors();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    this.lanternLight.shadow.dispose();
    disposeResourceSets(this.staticGeometries, this.staticMaterials);
    this.root.clear();
  }

  private startAnimation(
    kind: NightTraderAnimationKind,
    duration: number,
  ): Promise<void> {
    this.animation.settle();
    const animation = this.animation.start(kind, duration);
    this.applyAnimation(kind, 0);
    return animation;
  }

  private applyAnimation(
    kind: NightTraderAnimationKind,
    progress: number,
  ): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal();
        break;
      case 'choice-payment':
        this.applyPaymentChoice(normalized);
        break;
      case 'choice-refuse':
        this.applyRefuseChoice(normalized);
        break;
      case 'result-reward':
        this.applyRewardResult(normalized);
        break;
      case 'result-refuse':
        this.applyRefuseResult(normalized);
        break;
    }
  }

  private finishAnimation(kind: NightTraderAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-payment':
        this.root.userData.state = 'payment-held';
        break;
      case 'choice-refuse':
        this.root.userData.state = 'refused';
        break;
      case 'result-reward':
        this.root.userData.state = this.rewardActor?.userData.itemType === 'cannedFood'
          ? 'held-food'
          : 'held-reward';
        break;
      case 'result-refuse':
        this.root.userData.state = 'held-refused';
        break;
    }
  }

  private applyReveal(): void {
    this.boatMotionBase.copy(this.boatBase);
  }

  private applyPaymentChoice(progress: number): void {
    const travel = smoothstep(progress / 0.72);
    if (
      this.usingSupplyPayment
      && this.paymentInstanceId !== null
    ) {
      this.supplyPose.x = 3.35 * this.side * travel;
      this.supplyPose.y = 0.52 * travel;
      this.supplyPose.z = -5.2 * travel;
      this.supplyPose.yaw = -0.36 * travel;
      this.supplyPose.pitch = 0.18 * travel;
      this.supplyPose.roll = -0.12 * travel;
      const scale = progress >= 0.72
        ? Math.max(0.001, 1 - smoothstep((progress - 0.72) / 0.12))
        : 1;
      this.supplyPose.scaleX = scale;
      this.supplyPose.scaleY = scale;
      this.supplyPose.scaleZ = scale;
      this.dependencies.supplyDisplay.applyEventItemPose(
        this.paymentInstanceId,
        this.supplyPose,
      );
    } else if (this.paymentActor !== null) {
      this.paymentActor.position.lerpVectors(
        this.paymentStart,
        this.caseTarget,
        travel,
      );
      this.paymentActor.position.y += Math.sin(travel * Math.PI) * 0.35;
      this.paymentActor.rotation.y = travel * 0.72 * this.side;
      if (progress >= 0.72) {
        const vanish = smoothstep((progress - 0.72) / 0.12);
        this.paymentActor.scale.setScalar(Math.max(0.001, 1 - vanish));
      }
    }
    if (progress >= 0.72) {
      this.paymentVisible = false;
      if (this.paymentActor !== null) this.paymentActor.visible = false;
      this.root.userData.paymentReachedCase = true;
      this.root.userData.paymentAtCase = true;
    }
    this.updateExchangeState();
  }

  private applyRefuseChoice(progress: number): void {
    this.root.userData.refusalProgress = smoothstep(progress);
  }

  private applyRewardResult(progress: number): void {
    const actor = this.rewardActor;
    if (actor === null) return;
    this.hidePayment();
    actor.visible = true;
    this.rewardVisible = true;
    const travel = keyedTravel(progress);
    actor.position.lerpVectors(this.caseTarget, this.rewardEnd, travel);
    actor.position.y += Math.sin(clamp01(travel) * Math.PI) * 0.42;
    actor.rotation.y = -travel * 0.85 * this.side;
    actor.rotation.z = Math.sin(progress * Math.PI) * 0.12 * this.side;
    this.updateExchangeState();
  }

  private applyRefuseResult(progress: number): void {
    const travel = smoothstep(progress);
    this.boatMotionBase.lerpVectors(this.boatBase, this.boatAway, travel);
    this.mist.visible = progress > 0.32;
    this.mistMaterial.opacity = Math.sin(
      smoothstep((progress - 0.32) / 0.68) * Math.PI,
    ) * 0.34;
    this.lanternLight.intensity = 5.2 * (1 - smoothstep(
      (progress - 0.52) / 0.48,
    ));
    if (progress >= 1) {
      this.vessel.visible = false;
      this.lantern.visible = false;
      this.lanternReflection.visible = false;
      this.mist.visible = false;
    }
  }

  private applySharedWave(time: number): void {
    sampleWaveFieldInto(
      this.waveSample,
      this.dependencies.waves,
      time,
      this.boatMotionBase.x,
      this.boatMotionBase.z,
      1,
    );
    this.vessel.position.copy(this.boatMotionBase);
    this.vessel.position.x += this.waveSample.displacementX * 0.16;
    this.vessel.position.y += this.waveSample.height * 0.52;
    this.vessel.position.z += this.waveSample.displacementZ * 0.16;
    this.waveQuaternion.setFromAxisAngle(
      X_AXIS,
      this.waveSample.normal.z * 0.16,
    );
    this.vessel.quaternion.copy(this.waveQuaternion);
    this.waveQuaternion.setFromAxisAngle(
      Z_AXIS,
      -this.waveSample.normal.x * 0.16,
    );
    this.vessel.quaternion.multiply(this.waveQuaternion);
    this.vessel.userData.waveHeight = this.waveSample.height;
    this.vessel.userData.waveSampleTime = time;
  }

  private preparePayment(choice: EventChoicePresentation): void {
    this.dependencies.supplyDisplay.releaseEventActor();
    this.dependencies.supplyDisplay.clearEventPose();
    this.clearExchangeActors();
    this.paymentInstanceId = choice.instanceId;
    this.usingSupplyPayment = choice.instanceId !== null
      && this.dependencies.supplyDisplay.pinEventActor(choice.instanceId);
    if (!this.usingSupplyPayment) {
      this.paymentActor = choice.choiceId === 'food'
        ? this.createTradeToken('food', 'payment')
        : choice.choiceId === 'bait'
          ? this.createTradeToken('bait', 'payment')
          : this.createItemActor(
            choice.choiceId as ItemId,
            'payment',
          );
      this.paymentActor.position.copy(this.paymentStart);
    }
    this.paymentVisible = true;
    this.rewardVisible = false;
    this.root.userData.paymentReachedCase = false;
    this.root.userData.paymentAtCase = false;
    this.updateExchangeState();
  }

  private prepareReward(itemId: ItemId, authoredFood: boolean): void {
    this.rewardActors.clear();
    if (authoredFood) {
      this.rewardActor = this.createTradeToken('food', 'reward');
      this.rewardActor.userData.itemType = 'cannedFood';
    } else {
      this.rewardActor = this.createItemActor(itemId, 'reward');
    }
    this.rewardActor.position.copy(this.caseTarget);
    this.rewardActor.visible = false;
    this.rewardVisible = false;
    this.updateExchangeState();
  }

  private createItemActor(itemId: ItemId, role: 'payment' | 'reward'): Group {
    const actor = new Group();
    actor.name = `night-trader-${role}-${itemId}`;
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.create({
        instanceId: `night-trader-${role}-${itemId}` as ItemInstanceId,
        type: itemId,
      });
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = `night-trader-${role}-${itemId}-model`;
      actor.add(selected);
      actor.userData.model = 'supply-clone';
    } else {
      if (selected !== null) disposeRejectedModel(selected);
      const fallback = new Mesh(
        new BoxGeometry(0.34, 0.16, 0.22),
        createMaterial(0x6f5942, 0.94),
      );
      fallback.name = `night-trader-${role}-${itemId}-fallback`;
      fallback.rotation.set(0.08, -0.16, -0.04);
      actor.add(fallback);
      actor.userData.model = 'procedural';
    }
    actor.userData.itemType = itemId;
    actor.scale.setScalar(0.85);
    const parent = role === 'payment'
      ? this.paymentActors
      : this.rewardActors;
    parent.add(actor);
    collectMeshResources(
      actor,
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    return actor;
  }

  private createTradeToken(
    kind: 'food' | 'bait',
    role: 'payment' | 'reward',
  ): Group {
    const actor = new Group();
    actor.name = `night-trader-${role}-${kind}-token`;
    actor.userData.tokenKind = kind;
    actor.userData.itemType = kind === 'food' ? 'cannedFood' : 'baitTin';
    const rim = createMaterial(0x596361, 0.7, { metalness: 0.24 });
    const face = createMaterial(
      kind === 'food' ? 0x8d6742 : 0x71483c,
      0.94,
    );
    const body = new Mesh(
      new CylinderGeometry(0.16, 0.16, 0.045, 9),
      face,
    );
    body.name = `${actor.name}-body`;
    body.rotation.x = Math.PI / 2;
    const tokenRim = new Mesh(
      new TorusGeometry(0.158, 0.018, 5, 10),
      rim,
    );
    tokenRim.name = `${actor.name}-rim`;
    tokenRim.rotation.x = Math.PI / 2;
    actor.add(body, tokenRim);
    if (kind === 'food') {
      const seam = new Mesh(
        new BoxGeometry(0.2, 0.025, 0.025),
        rim,
      );
      seam.name = `${actor.name}-tin-seam`;
      seam.position.z = 0.03;
      seam.rotation.z = -0.18;
      actor.add(seam);
    } else {
      const worm = new Mesh(
        new TorusGeometry(0.075, 0.018, 5, 8, Math.PI * 1.35),
        rim,
      );
      worm.name = `${actor.name}-bait-mark`;
      worm.position.z = 0.035;
      worm.rotation.z = 0.38;
      actor.add(worm);
    }
    const parent = role === 'payment'
      ? this.paymentActors
      : this.rewardActors;
    parent.add(actor);
    collectMeshResources(
      actor,
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    return actor;
  }

  private hidePayment(): void {
    this.paymentVisible = false;
    if (this.paymentActor !== null) {
      this.paymentActor.visible = false;
      this.paymentActor.scale.setScalar(0.001);
    }
    if (this.usingSupplyPayment && this.paymentInstanceId !== null) {
      this.supplyPose.scaleX = 0.001;
      this.supplyPose.scaleY = 0.001;
      this.supplyPose.scaleZ = 0.001;
      this.dependencies.supplyDisplay.applyEventItemPose(
        this.paymentInstanceId,
        this.supplyPose,
      );
      this.dependencies.supplyDisplay.releaseEventActorOnNextSync();
    }
    this.updateExchangeState();
  }

  private updateExchangeState(): void {
    const overlap = this.paymentVisible && this.rewardVisible;
    this.root.userData.paymentVisible = this.paymentVisible;
    this.root.userData.rewardVisible = this.rewardVisible;
    this.root.userData.exchangeOverlap = overlap;
  }

  private clearExchangeActors(): void {
    this.paymentActors.clear();
    this.rewardActors.clear();
    disposeResourceSets(
      this.exchangeGeometries,
      this.exchangeMaterials,
    );
    this.paymentActor = null;
    this.rewardActor = null;
    this.paymentInstanceId = null;
    this.activeChoiceId = null;
    this.usingSupplyPayment = false;
    this.paymentVisible = false;
    this.rewardVisible = false;
    this.updateExchangeState();
  }

  private resetStaticActors(): void {
    this.vessel.visible = true;
    this.rowboat.visible = false;
    this.vessel.position.copy(this.boatBase);
    this.vessel.quaternion.identity();
    this.boatMotionBase.copy(this.boatBase);
    this.vesselContent.visible = true;
    this.trader.visible = false;
    this.lantern.visible = false;
    this.lanternReflection.visible = false;
    this.lanternLight.intensity = 0;
    this.reflectionMaterial.opacity = 0;
    this.mist.visible = false;
    this.mistMaterial.opacity = 0;
  }

  private applySideLayout(): void {
    this.boatBase.copy(BOAT_BASE);
    this.boatBase.x *= this.side;
    this.boatAway.copy(BOAT_AWAY);
    this.boatAway.x *= this.side;
    this.caseTarget.copy(CASE_TARGET);
    this.caseTarget.x *= this.side;
    this.handoverTarget.position.copy(this.caseTarget);
    this.paymentStart.copy(PAYMENT_START);
    this.paymentStart.x *= this.side;
    this.rewardEnd.copy(REWARD_END);
    this.rewardEnd.x *= this.side;
    this.trader.position.copy(TRADER_POSITION);
    this.trader.position.x *= this.side;
    this.trader.rotation.y = Math.atan2(
      -(this.boatBase.x + this.trader.position.x),
      -(this.boatBase.z + this.trader.position.z),
    );
    this.mist.position.x = Math.abs(this.mist.position.x) * this.side;
  }

  private buildRowboat(): void {
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createEventModel(
        'traderRowboat',
      )?.root ?? null;
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = 'event-model:traderRowboat';
      selected.rotation.y = Math.PI * 0.52;
      this.rowboat.add(selected);
      this.vessel.userData.modelKind = 'imported';
      return;
    }
    if (selected !== null) disposeRejectedModel(selected);
    const wood = createMaterial(0x4f382a, 0.96);
    const darkWood = createMaterial(0x2d2723, 1);
    const hull = new Mesh(
      new BoxGeometry(3.7, 0.44, 1.46),
      darkWood,
    );
    hull.name = 'night-trader-rowboat-fallback-hull';
    hull.position.y = -0.22;
    hull.scale.set(1, 1, 0.82);
    const prow = new Mesh(
      new ConeGeometry(0.72, 1.5, 4),
      wood,
    );
    prow.name = 'night-trader-rowboat-fallback-prow';
    prow.position.x = -2.25;
    prow.rotation.z = Math.PI / 2;
    this.rowboat.add(hull, prow);
    for (const x of [-1.05, -0.3, 0.45, 1.2]) {
      const rib = new Mesh(
        new BoxGeometry(0.08, 0.36, 1.56),
        wood,
      );
      rib.name = `night-trader-rowboat-fallback-rib-${x}`;
      rib.position.set(x, 0.08, 0);
      this.rowboat.add(rib);
    }
    this.vessel.userData.modelKind = 'procedural';
  }

  private buildTrader(): void {
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createEventModel(
        'traderOctopus',
      )?.root ?? null;
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = 'event-model:traderOctopus';
      this.trader.add(selected);
      this.trader.userData.modelKind = 'imported';
    } else {
      if (selected !== null) disposeRejectedModel(selected);
      this.trader.userData.modelKind = 'missing';
    }
    this.trader.position.copy(TRADER_POSITION);
  }

  private buildLantern(): PointLight {
    let selected: Group | null = null;
    try {
      selected = this.dependencies.propModels.createPracticalLight('lantern');
    } catch {
      selected = null;
    }
    if (selected !== null && hasRenderableBounds(selected)) {
      selected.name = 'night-trader-lantern-model';
      selected.scale.setScalar(0.72);
      this.lantern.add(selected);
      this.lantern.userData.modelKind = 'imported';
    } else {
      if (selected !== null) disposeRejectedModel(selected);
      const metal = createMaterial(0x4f5755, 0.72, { metalness: 0.32 });
      const glow = createMaterial(0xd08b49, 0.56, {
        emissive: 0x8d5424,
      });
      const body = new Mesh(
        new CylinderGeometry(0.16, 0.2, 0.42, 7),
        glow,
      );
      body.name = 'night-trader-lantern-fallback-glass';
      const cap = new Mesh(
        new CylinderGeometry(0.12, 0.16, 0.12, 7),
        metal,
      );
      cap.name = 'night-trader-lantern-fallback-cap';
      cap.position.y = 0.27;
      this.lantern.add(body, cap);
      this.lantern.userData.modelKind = 'procedural';
    }
    this.lantern.position.set(-1.3, ROWBOAT_FLOOR_Y, 0.5);
    const light = new PointLight(0xffae58, 0, 14, 1.6);
    light.name = 'night-trader-lantern-light';
    light.position.y = 0.08;
    light.castShadow = true;
    light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.08;
    light.shadow.camera.far = 14;
    light.shadow.camera.updateProjectionMatrix();
    this.lantern.add(light);
    return light;
  }

  private buildMist(): void {
    const positions = [
      [-1.7, 0.1, 0],
      [-0.45, -0.05, 0.25],
      [0.8, 0.08, -0.15],
      [1.85, -0.02, 0.12],
    ] as const;
    for (let index = 0; index < positions.length; index += 1) {
      const [x, y, z] = positions[index]!;
      const cloud = new Mesh(
        new SphereGeometry(0.75 + index * 0.11, 7, 5),
        this.mistMaterial,
      );
      cloud.name = `night-trader-mist-bank-${index + 1}`;
      cloud.position.set(x, y, z);
      cloud.scale.set(1.8, 0.28, 0.62);
      this.mist.add(cloud);
    }
    this.mist.position.set(6.3, 0.2, -10.8);
  }
}
