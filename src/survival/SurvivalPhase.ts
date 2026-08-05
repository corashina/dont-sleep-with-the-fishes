import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import { AudioSystem } from '../audio/AudioSystem';
import { SurvivalAudio } from '../audio/SurvivalAudio';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
import { createVisualQualityPreference } from '../rendering/visualQuality';
import {
  createWaterQualityPreference,
  type WaterQuality,
} from '../rendering/waterQuality';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import {
  SurvivalUI,
  type DriftingLootResultView,
  type DiveResultView,
  type EventOutcomeView,
  type EventContextChoice,
  type EventResultView,
  type FishingResultView,
} from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import type { ShipAssets } from '../world/ShipAssets';
import {
  presentationWeatherForEvent,
  resolvePresentationWeather,
  type PresentationWeatherId,
} from '../weather/presentationWeather';
import {
  BoatWorld,
  createEmptyEventModelLibraryForTest,
} from './BoatWorld';
import {
  FOCUSED_EVENT_IDS,
  type EventChoicePresentation,
} from './FocusedEventPresentation';
import { SurvivalCameraLook } from './SurvivalCameraLook';
import { survivalEventById } from './events';
import {
  deriveEventOutcomePresentation,
  deriveEventVariantSeed,
} from './eventPresentationOutcome';
import {
  DEDICATED_EVENT_IDS,
  type DedicatedEventId,
  type EventOutcomePresentation,
} from './eventPresentationTypes';
import { fishingCatchFood } from './fishingCatalog';
import {
  ITEM_ANIMATION_LAB_USES,
  isItemAnimationLabId,
} from './ItemAnimationLab';
import {
  deriveEventPhysicalResponse,
  type EventPhysicalResponsePresentation,
} from './EventPhysicalResponse';
import type {
  FishingCastPoint,
  FishingSession,
  FishingTerminalResult,
} from './FishingSession';
import { SurvivalSession } from './SurvivalSession';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  DriftingLootVariant,
  EventResponse,
  EventResponseId,
  RewardSummary,
  SurvivalSnapshot,
  SurvivalState,
} from './survivalTypes';
import { EMPTY_SURVIVAL_EVENT_MODELS } from './SurvivalEventModelLibrary';

export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<Omit<BoatWorld, 'stageEvent'>> & {
    stageEvent?: (...args: any[]) => void;
  };
  ui: Partial<SurvivalUI>;
  audio?: AudioSystem;
  onRestart?: () => void;
  onInvariantError?: (error: Error) => void;
  sceneRenderer?: SceneRenderer;
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];
const FOCUSED_EVENT_ID_SET = new Set<string>(FOCUSED_EVENT_IDS);
const CAPTAIN_WHISKERS_LAB_INSTANCE_ID = 'captainWhiskers-1' as ItemInstanceId;

type FishingPresentationState =
  | 'idle'
  | 'ready'
  | 'entering'
  | 'aiming'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'settling'
  | 'result'
  | 'returning';

type EventPresentationState =
  | 'idle'
  | 'sleeping'
  | 'transitioning'
  | 'revealing'
  | 'choosing'
  | 'using'
  | 'resolving'
  | 'retrieving'
  | 'result'
  | 'receding';

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function isDriftingLootVariant(value: unknown): value is DriftingLootVariant {
  return value === 'barrel' || value === 'crate';
}

function isDedicatedEventId(eventId: string): eventId is DedicatedEventId {
  return (DEDICATED_EVENT_IDS as readonly string[]).includes(eventId);
}

const EVENT_RESULT_RESOURCES = [
  ['pressure', 'PRESSURE'],
  ['health', 'HEALTH'],
  ['hunger', 'HUNGER'],
  ['energy', 'ENERGY'],
  ['hull', 'HULL'],
  ['food', 'FOOD'],
  ['bait', 'BAIT'],
  ['repairMaterial', 'REPAIR MATERIAL'],
  ['rescueProgress', 'RESCUE PROGRESS'],
] as const;

function eventResultItemLabel(instanceId: ItemInstanceId): string {
  const itemId = ITEM_IDS.find((id) => instanceId.startsWith(`${id}-`));
  return itemId === undefined
    ? instanceId.toLocaleUpperCase('en-US')
    : ITEM_DEFINITIONS[itemId].label.toLocaleUpperCase('en-US');
}

export function formatEventResult(
  result: EventOutcomePresentation,
): Extract<EventResultView, { readonly message: string }> {
  const lines: string[] = [];
  for (const [resource, label] of EVENT_RESULT_RESOURCES) {
    const delta = result.resourceDeltas[resource];
    if (delta === undefined || delta === 0) continue;
    lines.push(`${label} ${delta > 0 ? '+' : ''}${delta}`);
  }
  for (const instanceId of result.brokenInstanceIds) {
    lines.push(`${eventResultItemLabel(instanceId)} BROKEN`);
  }
  for (const instanceId of result.lostInstanceIds) {
    lines.push(`${eventResultItemLabel(instanceId)} LOST`);
  }
  for (const instanceId of result.consumedInstanceIds) {
    lines.push(`${eventResultItemLabel(instanceId)} CONSUMED`);
  }
  return {
    message: result.outcome.message,
    lines,
  };
}

function reportInvariantError(error: Error): void {
  console.error(error);
}

export function formatFishingResult(
  result: FishingTerminalResult,
  outcome: ActionOutcome,
): FishingResultView {
  if (result.kind === 'miss') {
    return {
      caption: 'EMPTY HOOK',
      title: 'IT GOT AWAY',
      detail: 'NO CATCH',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'junk') {
    return {
      caption: 'DRIFTING JUNK',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail: 'NO FOOD',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'utility') {
    const reward = result.catch.reward;
    const detail = reward.kind === 'bait'
      ? 'BAIT +1'
      : reward.kind === 'item' && reward.condition === 'broken'
        ? 'BROKEN — REPAIR WITH DUCT TAPE'
        : reward.kind === 'item' && reward.itemId === 'ductTape'
          ? 'DUCT TAPE RECOVERED'
          : 'ENERGY BAR RECOVERED';
    return {
      caption: 'UTILITY SALVAGE',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail,
      catchTarget: null,
    };
  }
  const bait = outcome.deltas.bait === -1 ? ' - 1 BAIT USED' : '';
  return {
    caption: `${result.catch.size.toLocaleUpperCase('en-US')} CATCH`,
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail: `+${fishingCatchFood(result.catch)} FOOD${bait}`,
    catchTarget: null,
  };
}

export function formatDangerousWatersOutcome(
  outcome: ActionOutcome,
): EventOutcomeView {
  const hullDamage = Math.max(0, -(outcome.deltas.hull ?? 0));
  if (hullDamage === 0) {
    return {
      title: 'CLEAR WATER',
      detail: 'The route opens ahead.',
      result: 'HULL HOLDS',
      state: 'safe',
    };
  }
  const severe = hullDamage >= 25;
  return {
    title: `HULL \u2212${hullDamage}`,
    detail: outcome.message,
    result: severe ? 'SEVERE ROCK STRIKE' : 'ROCK STRIKE',
    state: severe ? 'severe' : 'damage',
  };
}

export function formatDriftingLootResult(
  reward: RewardSummary,
  energyCost = 3,
): DriftingLootResultView {
  return {
    caption: 'SALVAGE RECOVERED',
    reward,
    energyCost,
    target: null,
  };
}

export function formatDiveResult(outcome: ActionOutcome): DiveResultView {
  const lines: string[] = [];
  let reward = outcome.rewardSummary ?? null;
  const itemRewards = [
    ['food', 'food'],
    ['bait', 'bait'],
    ['repairMaterial', 'repairMaterial'],
  ] as const;
  if (reward === null) {
    for (const [resource, id] of itemRewards) {
      const delta = outcome.deltas[resource];
      if (delta !== undefined && delta > 0) {
        reward = { kind: 'resource', id, quantity: delta };
        break;
      }
    }
  }
  const textRewards = [
    ['rescueProgress', 'RESCUE PROGRESS'],
  ] as const;
  for (const [resource, label] of textRewards) {
    const delta = outcome.deltas[resource];
    if (delta !== undefined && delta !== 0) {
      lines.push(`${label} ${delta > 0 ? '+' : ''}${delta}`);
    }
  }
  if (reward === null && lines.length === 0) lines.push('NOTHING FOUND');
  const appliedHealthDelta = outcome.deltas.health;
  if (appliedHealthDelta !== undefined && appliedHealthDelta < 0) {
    lines.push('YOU SUFFERED SOME INJURIES');
  }
  return { title: 'DIVE RESULT', reward, lines };
}

function testContext(
  sceneRenderer: SceneRenderer = {
    render: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
  },
  audio: AudioSystem = AudioSystem.silent(),
): PhaseContext {
  const mount = {
    clientWidth: 1,
    clientHeight: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
  } as unknown as HTMLElement;
  return {
    mount,
    renderer: { render: () => undefined } as unknown as PhaseContext['renderer'],
    sceneRenderer,
    visualQuality: createVisualQualityPreference(() => undefined, null),
    waterQuality: createWaterQualityPreference(() => undefined, null),
    camera: new PerspectiveCamera(),
    propModels: {} as PropModelLibrary,
    supernaturalEventModels: createEmptyEventModelLibraryForTest(),
    shipFurniture: {} as ShipFurnitureLibrary,
    maxTextureAnisotropy: 1,
    skyAssets: {} as SkyAssets,
    lifeboatAssets: {} as LifeboatAssets,
    shipAssets: {} as ShipAssets,
    eventModels: createEmptyEventModelLibraryForTest(),
    physicsRuntime: {} as PhysicsRuntime,
    physicsMode: 'enabled',
    audio,
    featuredEventModels: EMPTY_SURVIVAL_EVENT_MODELS,
  };
}

export class SurvivalPhase implements GamePhase {
  private context!: PhaseContext;
  private session!: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  private world!: SurvivalPhaseTestDependencies['world'];
  private ui!: Partial<SurvivalUI>;
  private onRestart!: () => void;
  private scavengeElapsedSeconds = 0;
  private elapsedSeconds = 0;
  private simulationTimeInitialized = false;
  private readonly visualState: SurvivalVisualState = {
    kind: 'survival',
    elapsedSeconds: 0,
    phase: 'day',
    weather: 'calm',
  };
  private busy = false;
  private paused = false;
  private visibilityPauseActive = false;
  private disposed = false;
  private started = false;
  private restartRequested = false;
  private presentedTerminalState: SurvivalState | null = null;
  private presentedInventorySnapshot: SurvivalSnapshot | null = null;
  private lastReadJournalDay = 0;
  private visibilityDocument: Document | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private activeFishing: FishingSession | null = null;
  private fishingPresentation: FishingPresentationState = 'idle';
  private fishingSettlementInProgress = false;
  private eventPresentation: EventPresentationState = 'idle';
  private deferredPresentationSync: {
    readonly generation: number;
    readonly before: SurvivalSnapshot;
  } | null = null;
  private activeDriftingLootVariant: DriftingLootVariant | null = null;
  private eventEligibility = new Map<ItemInstanceId, EventResponseId>();
  private automaticWeather: PresentationWeatherId | null = null;
  private forcedWeather: PresentationWeatherId | null = null;
  private effectivePresentationWeather: PresentationWeatherId = 'calm';
  private lifecycleGeneration = 0;
  private readonly visibilityResumeWaiters = new Set<() => void>();
  private cameraLook: SurvivalCameraLook | null = null;
  private audio!: SurvivalAudio;
  private onInvariantError: (error: Error) => void = reportInvariantError;
  private itemAnimationLab = false;

  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId?: string,
  );
  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId: string | undefined,
    testDependencies?: SurvivalPhaseTestDependencies,
  ) {
    const itemAnimationLab = isItemAnimationLabId(initialEventId);
    if (testDependencies === undefined) {
      const session = new SurvivalSession(savedItems, {
        seed,
        ...(
          initialEventId === undefined || itemAnimationLab
            ? {}
            : { initialEventId }
        ),
      });
      this.initialize(
        context,
        session,
        new BoatWorld(
          context.camera,
          context.propModels,
          context.skyAssets.moonTexture,
          session.snapshot().savedItems,
          context.lifeboatAssets,
          context.shipFurniture,
          context.waterQuality?.get() ?? 'low',
          context.featuredEventModels,
          context.eventModels,
        ),
        new SurvivalUI(context.mount),
        scavengeElapsedSeconds,
        onRestart,
        reportInvariantError,
        itemAnimationLab,
      );
      this.cameraLook = new SurvivalCameraLook(context.mount, context.camera);
      return;
    }
    this.initialize(
      context,
      testDependencies.session,
      testDependencies.world,
      testDependencies.ui,
      scavengeElapsedSeconds,
      testDependencies.onRestart ?? onRestart,
      testDependencies.onInvariantError,
      itemAnimationLab,
    );
  }

  static forTest(
    dependencies: SurvivalPhaseTestDependencies,
    initialEventId?: string,
  ): SurvivalPhase {
    const TestConstructor = SurvivalPhase as unknown as new (
      context: PhaseContext,
      savedItems: readonly ItemInstance[],
      seed: number,
      scavengeElapsedSeconds: number,
      onRestart: () => void,
      initialEventId: string | undefined,
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(dependencies.sceneRenderer, dependencies.audio),
      [],
      0,
      0,
      dependencies.onRestart ?? (() => undefined),
      initialEventId,
      dependencies,
    );
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.audio.start();
    this.audio.setWeather(this.effectivePresentationWeather, 0);
    const snapshot = this.renderSnapshot(false);
    if (this.itemAnimationLab) {
      this.enterItemAnimationLab(snapshot);
    } else if (snapshot.pendingEventId !== null && !isTerminal(snapshot.state)) {
      void this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
    }

    if (typeof document !== 'undefined') {
      this.visibilityDocument = document;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      if (document.hidden) {
        if (!this.paused) {
          this.visibilityPauseActive = true;
          this.setPaused(true);
        }
        this.world.setDocumentHidden?.(true);
      }
    }
  }

  update(time: number, deltaSeconds: number): void {
    if (this.disposed || this.documentIsHidden()) return;
    if (this.paused) return;
    this.elapsedSeconds = this.simulationTimeInitialized
      ? this.elapsedSeconds + deltaSeconds
      : time;
    this.simulationTimeInitialized = true;
    this.world.update?.(this.elapsedSeconds, deltaSeconds);
    this.cameraLook?.update(deltaSeconds);
    const snapshot = this.session.snapshot();
    this.audio.update(deltaSeconds);
    this.syncVisualState(snapshot);
    this.syncPresentation(snapshot);
    if (this.started) this.advanceFishing(deltaSeconds);
    this.presentTerminalOnce(snapshot);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
    this.syncPresentation(this.session.snapshot());
    this.syncFishingBiteTarget();
  }

  render(): void {
    if (this.disposed || this.world.scene === undefined) return;
    this.context.sceneRenderer.render(
      this.world.scene,
      this.context.camera,
      this.visualState,
    );
  }

  private async renderAndSettleCoveredScene(generation: number): Promise<boolean> {
    this.render();
    await (this.ui.settleCoveredScene?.() ?? Promise.resolve());
    return this.isContinuationActive(generation);
  }

  handleAction(action: DayActionId, option?: DayActionOption): void {
    if (!this.canAcceptCommand()) {
      this.audio.deny();
      return;
    }
    if (action === 'fish') {
      void this.beginFishing();
      return;
    }
    const selectedOption = action === 'repair' ? this.repairOption(this.session.snapshot()) : option;
    const outcome = this.session.perform?.(action, selectedOption);
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      return;
    }
    if (action === 'endDay') {
      this.audio.sleep();
      void this.runEndDay(outcome);
      return;
    }
    if (action === 'dive') {
      void this.runDiveAction(outcome);
      return;
    }
    this.audio.action(action, selectedOption);
    if (action === 'petWhiskers' || action === 'feedWhiskers') {
      this.syncPresentation(this.session.snapshot());
      void this.runCaptainWhiskersAction(action, outcome);
      return;
    }
    void this.runDayAction(outcome);
  }

  handleEventItem(choiceId: EventResponseId, instanceId: ItemInstanceId): void {
    if (
      this.eventPresentation !== 'choosing'
      || this.eventEligibility.get(instanceId) !== choiceId
    ) return;
    if (this.itemAnimationLab) {
      void this.playItemAnimationLab(instanceId, this.lifecycleGeneration);
      return;
    }
    void this.resolveEventWithItem(choiceId, instanceId, this.lifecycleGeneration);
  }

  handleEndure(): void {
    if (this.eventPresentation !== 'choosing') return;
    if (
      this.eventEligibility.size !== 0
      && this.session.snapshot().pendingEventId !== 'other-people'
    ) return;
    void this.resolveEndure(this.lifecycleGeneration);
  }

  handleJournalOpen(): void {
    if (this.disposed || this.busy || this.paused || this.documentIsHidden()) return;
    const snapshot = this.session.snapshot();
    this.lastReadJournalDay = this.latestJournalDay(snapshot);
    this.audio.journal();
    this.ui.setJournalUnread?.(false);
    this.ui.showJournal?.(snapshot.journalEntries);
  }

  handleJournalClose(): void {
    if (this.disposed) return;
    this.audio.journal();
    this.ui.hideJournal?.();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || (!paused && this.documentIsHidden())) return;
    this.paused = paused;
    this.audio.setPaused(paused);
    if (paused) this.cameraLook?.cancel();
    if (!paused) this.visibilityPauseActive = false;
    this.ui.setPaused?.(paused);
    if (!paused) this.releaseVisibilityResumeWaiters();
  }

  setWeatherOverride(id: PresentationWeatherId | null): void {
    this.forcedWeather = id;
    this.syncPresentationWeather();
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.world.setWaterQuality?.(value);
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.effectivePresentationWeather;
  }

  requestRestart(): void {
    if (this.disposed || this.restartRequested) return;
    this.clearEventPresentation();
    this.audio.cancelDive();
    this.restartRequested = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEventPresentation();
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.activeFishing = null;
    this.fishingPresentation = 'idle';
    this.fishingSettlementInProgress = false;
    this.ui.hideFishingResult?.();
    this.ui.setFishingViewExitVisible?.(false);
    this.ui.onFishingResultContinue = null;
    this.ui.onFishingViewExit = null;
    this.ui.onDriftingLootContinue = null;
    if (this.visibilityDocument !== null) {
      this.visibilityDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityDocument = null;
    }
    this.cameraLook?.dispose();
    this.cameraLook = null;
    this.audio.dispose();
    this.world.dispose?.();
    this.ui.dispose?.();
  }

  private initialize(
    context: PhaseContext,
    session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>,
    world: SurvivalPhaseTestDependencies['world'],
    ui: Partial<SurvivalUI>,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    onInvariantError: (error: Error) => void = reportInvariantError,
    itemAnimationLab = false,
  ): void {
    this.context = context;
    this.session = session;
    this.world = world;
    this.ui = ui;
    this.scavengeElapsedSeconds = scavengeElapsedSeconds;
    this.onRestart = onRestart;
    this.onInvariantError = onInvariantError;
    this.itemAnimationLab = itemAnimationLab;
    this.audio = new SurvivalAudio(context.audio.createScope());
    this.world.setLightningStrikeListener?.(() => this.audio.thunder());
    this.wireUI();
  }

  private enterItemAnimationLab(snapshot: SurvivalSnapshot): void {
    this.eventEligibility = this.itemAnimationLabEligibility(snapshot);
    this.eventPresentation = 'choosing';
    this.ui.beginEventPresentation?.();
    this.ui.showItemAnimationLab?.();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.ui.setEventSelection?.(this.eventEligibility);
    this.setBusy(false);
  }

  private itemAnimationLabEligibility(
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined || item.condition !== 'usable') continue;
      eligibility.set(
        item.instanceId,
        ITEM_ANIMATION_LAB_USES[item.type].choiceId,
      );
    }
    if (snapshot.captainWhiskers?.alive) {
      eligibility.set(
        CAPTAIN_WHISKERS_LAB_INSTANCE_ID,
        ITEM_ANIMATION_LAB_USES.captainWhiskers.choiceId,
      );
    }
    return eligibility;
  }

  private async playItemAnimationLab(
    instanceId: ItemInstanceId,
    generation: number,
  ): Promise<void> {
    const snapshot = this.session.snapshot();
    const inventoryItem = snapshot.inventory[instanceId];
    const captainWhiskers = instanceId === CAPTAIN_WHISKERS_LAB_INSTANCE_ID
      && snapshot.captainWhiskers?.alive === true;
    if (
      (inventoryItem === undefined && !captainWhiskers)
      || (inventoryItem !== undefined && inventoryItem.condition !== 'usable')
      || this.eventPresentation !== 'choosing'
      || !this.isContinuationActive(generation)
    ) return;

    const itemType = captainWhiskers ? 'captainWhiskers' : inventoryItem!.type;
    const use = ITEM_ANIMATION_LAB_USES[itemType];
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventSelectedItem?.(instanceId);
    this.setAutomaticWeather(presentationWeatherForEvent(use.eventId));
    this.world.stageEvent?.(use.eventId);

    try {
      await this.playEventItemUseWithSound(
        use.eventId,
        use.choiceId,
        instanceId,
        itemType,
      );
      await this.world.returnEventItemUse?.();
    } catch (error) {
      this.onInvariantError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      if (!this.isContinuationActive(generation)) return;
      this.world.clearEvent?.();
      this.setAutomaticWeather(null);
      this.world.setEventSelectedItem?.(null);
      this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
      this.ui.setEventSelection?.(this.eventEligibility);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
    }
  }

  private playEventItemUseWithSound(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    itemType: ItemId | undefined,
  ): Promise<void> {
    if (itemType === 'shotgun') {
      return this.world.playEventItemUse?.(
        eventId,
        choiceId,
        instanceId,
        () => this.audio.eventItem(itemType),
      ) ?? Promise.resolve();
    }
    if (itemType !== undefined) this.audio.eventItem(itemType);
    return this.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private wireUI(): void {
    this.ui.onAction = (action, option) => this.handleAction(action, option);
    this.ui.onEventItem = (choiceId, instanceId) => this.handleEventItem(choiceId, instanceId);
    this.ui.onEventChoice = (choiceId) =>
      void this.resolveContextualChoice(choiceId, this.lifecycleGeneration);
    this.ui.onEndure = () => this.handleEndure();
    this.ui.onRestart = () => this.requestRestart();
    this.ui.onAnchorHighlight = (anchorId) => {
      if (!this.disposed) this.world.setHighlightedItem?.(anchorId);
    };
    this.ui.onPauseChange = (paused) => this.setPaused(paused);
    this.ui.onJournalOpen = () => this.handleJournalOpen();
    this.ui.onJournalClose = () => this.handleJournalClose();
    this.ui.onJournalPage = () => this.audio.journal();
    this.ui.onFishingCast = (point) => this.handleFishingCast(point);
    this.ui.onFishingReel = () => this.handleFishingReel();
    this.ui.onFishingResultContinue = () => this.continueFishingResult();
    this.ui.onFishingViewExit = () => this.exitReadyFishingView();
    this.ui.onDriftingLootContinue = () => this.continueDriftingLootResult();
  }

  private repairOption(snapshot: SurvivalSnapshot): DayActionOption | undefined {
    if (snapshot.repairMaterial > 0) {
      return { kind: 'hullRepair', material: 'repairMaterial' };
    }
    const hasDuctTape = Object.values(snapshot.inventory).some(
      (item) => item?.type === 'ductTape' && item.condition === 'usable',
    );
    if (hasDuctTape) return { kind: 'hullRepair', material: 'ductTape' };
    return undefined;
  }

  private repairItemReason(snapshot: SurvivalSnapshot): string | null {
    const target = Object.values(snapshot.inventory).find(
      (item) => item?.condition === 'broken' && ITEM_DEFINITIONS[item.type].breakable,
    );
    if (target === undefined) return 'No broken repairable item remains.';
    return this.session.availableReason?.('repairItem', {
      kind: 'itemRepair',
      target: target.instanceId,
    }) ?? null;
  }

  private canAcceptCommand(): boolean {
    if (
      this.disposed
      || this.busy
      || this.paused
      || this.documentIsHidden()
    ) return false;
    return !isTerminal(this.session.snapshot().state);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.ui.setBusy?.(busy);
  }

  private async beginFishing(): Promise<void> {
    const begun = this.session.beginFishing?.();
    if (begun === undefined) return;
    if (!begun.accepted) {
      this.audio.deny();
      this.ui.showFeedback?.(begun.outcome);
      return;
    }

    const generation = ++this.lifecycleGeneration;
    const attempt = begun.attempt;
    this.activeFishing = attempt;
    this.fishingPresentation = 'entering';
    this.fishingSettlementInProgress = false;
    this.ui.setFishingViewExitVisible?.(false);
    this.setBusy(true);
    this.renderSnapshot(false, false);
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });

    if (!await this.transitionFishingView('enter', generation)) return;
    if (!this.isCurrentFishing(attempt, generation)) return;
    this.fishingPresentation = 'aiming';
    this.ui.setFishingState?.({
      mode: 'aiming',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
    this.ui.setFishingViewExitVisible?.(true);
  }

  private handleFishingCast(
    screenPoint: { readonly x: number; readonly y: number } | null,
  ): boolean {
    const attempt = this.activeFishing;
    if (
      attempt === null
      || this.fishingPresentation !== 'aiming'
      || this.paused
      || this.documentIsHidden()
      || !this.isContinuationActive(this.lifecycleGeneration)
    ) return false;

    const castPoint = screenPoint === null
      ? this.world.centeredFishingCast?.() ?? null
      : this.world.castFishingAtScreenPoint?.(
        screenPoint.x,
        screenPoint.y,
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null;
    if (castPoint === null || !attempt.cast(castPoint).accepted) return false;

    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return false;
    this.audio.fishingCast();
    const generation = this.lifecycleGeneration;
    this.ui.setFishingViewExitVisible?.(false);
    this.fishingPresentation = 'casting';
    void this.completeFishingCast(attempt, storedPoint, generation);
    return true;
  }

  private async completeFishingCast(
    attempt: FishingSession,
    point: FishingCastPoint,
    generation: number,
  ): Promise<void> {
    await (this.world.playFishingCast?.(point) ?? Promise.resolve());
    if (!this.isCurrentFishing(attempt, generation)) return;
    if (!attempt.completeCast().accepted) return;
    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return;
    this.fishingPresentation = 'waiting';
    this.world.showFishingWaiting?.(storedPoint);
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: 'WAIT FOR A BITE',
      biteTarget: null,
    });
  }

  private advanceFishing(deltaSeconds: number): void {
    const attempt = this.activeFishing;
    if (
      attempt === null
      || this.fishingSettlementInProgress
      || (this.fishingPresentation !== 'waiting' && this.fishingPresentation !== 'bite')
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds < 0
    ) return;

    const current = attempt.view();
    const previousState = current.state;
    attempt.advance(deltaSeconds);
    if (current.castPoint === null) return;
    if (current.state === 'bite') {
      if (this.fishingPresentation !== 'bite') {
        this.enterFishingBite(current.castPoint);
        return;
      }
      this.syncFishingBiteTarget();
      return;
    }
    if (current.state !== 'missed' || current.result === null) return;
    if (previousState === 'waiting' && this.fishingPresentation !== 'bite') {
      this.enterFishingBite(current.castPoint);
    }
    this.settleFishing(attempt, current.result, this.lifecycleGeneration);
  }

  private enterFishingBite(point: FishingCastPoint): void {
    this.fishingPresentation = 'bite';
    this.audio.fishingBite();
    this.world.showFishingBite?.(point);
    this.ui.setFishingState?.({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: this.world.projectFishingBite?.(
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    });
  }

  private syncFishingBiteTarget(): void {
    if (this.activeFishing === null || this.fishingPresentation !== 'bite') return;
    this.ui.updateFishingBiteTarget?.(this.world.projectFishingBite?.(
      this.viewportWidth,
      this.viewportHeight,
    ) ?? null);
  }

  private handleFishingReel(): boolean {
    const attempt = this.activeFishing;
    const generation = this.lifecycleGeneration;
    if (
      attempt === null
      || this.fishingPresentation !== 'bite'
      || this.fishingSettlementInProgress
      || this.paused
      || this.documentIsHidden()
      || !this.isContinuationActive(generation)
    ) return false;
    const current = attempt.snapshot();
    if (current.state === 'resolved' && current.result !== null) {
      return this.settleFishing(attempt, current.result, generation);
    }
    const reel = attempt.reel();
    if (!reel.accepted || reel.result === undefined) return false;
    if (!attempt.completeReel().accepted) return false;
    const result = attempt.snapshot().result;
    if (result === null || result !== reel.result) return false;
    this.audio.fishingReel();
    return this.settleFishing(attempt, result, generation);
  }

  private settleFishing(
    attempt: FishingSession,
    result: FishingTerminalResult,
    generation: number,
  ): boolean {
    if (!this.isCurrentFishing(attempt, generation) || this.fishingSettlementInProgress) return false;
    this.fishingSettlementInProgress = true;
    this.fishingPresentation = 'settling';
    const outcome = this.session.finishFishing?.(attempt.snapshot().id, result);
    if (outcome === undefined || !outcome.accepted) {
      this.audio.deny();
      if (outcome !== undefined) this.ui.showFeedback?.(outcome);
      this.fishingSettlementInProgress = false;
      this.fishingPresentation = 'bite';
      this.syncFishingBiteTarget();
      return false;
    }
    this.renderSnapshot(false, false);
    this.fishingPresentation = 'settling';
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: result.kind === 'catch' ? 'REELING IN' : 'THE LINE WENT SLACK',
      biteTarget: null,
    });
    void this.presentFishingResult(attempt, result, outcome, generation);
    return true;
  }

  private async presentFishingResult(
    attempt: FishingSession,
    result: FishingTerminalResult,
    outcome: ActionOutcome,
    generation: number,
  ): Promise<void> {
    this.audio.fishingResult(result);
    if (result.kind === 'catch') {
      await (this.world.playFishingReel?.(result.catch.id) ?? Promise.resolve());
    } else {
      await (this.world.playFishingMiss?.() ?? Promise.resolve());
    }
    if (!this.isCurrentFishing(attempt, generation)) return;

    this.fishingPresentation = 'result';
    this.ui.setFishingState?.({ mode: 'result', message: '', biteTarget: null });
    const view = formatFishingResult(result, outcome);
    this.ui.showFishingResult?.({
      ...view,
      catchTarget: result.kind === 'catch'
        ? this.world.projectFishingCatch?.(
          this.viewportWidth,
          this.viewportHeight,
        ) ?? null
        : null,
    });
  }

  private continueFishingResult(): void {
    const attempt = this.activeFishing;
    const generation = this.lifecycleGeneration;
    if (
      attempt === null
      || this.fishingPresentation !== 'result'
      || !this.isContinuationActive(generation)
    ) return;
    this.ui.hideFishingResult?.();
    this.world.clearFishingPresentation?.();
    this.fishingSettlementInProgress = false;
    this.fishingPresentation = 'ready';
    this.activeFishing = null;
    this.setBusy(false);
    this.ui.setFishingViewExitVisible?.(true);
    this.ui.setFishingState?.({ mode: 'ready', message: '', biteTarget: null });
  }

  private exitReadyFishingView(): void {
    if (!this.isContinuationActive()) return;
    if (this.fishingPresentation === 'aiming') {
      const attempt = this.activeFishing;
      if (attempt === null) return;
      const outcome = this.session.cancelFishing?.(attempt.snapshot().id);
      if (outcome === undefined || !outcome.accepted) {
        if (outcome !== undefined) this.ui.showFeedback?.(outcome);
        return;
      }
      this.activeFishing = null;
      this.fishingSettlementInProgress = false;
      this.renderSnapshot(false, false);
      this.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    } else if (
      this.fishingPresentation !== 'ready'
      || this.activeFishing !== null
    ) {
      return;
    }
    const generation = ++this.lifecycleGeneration;
    this.fishingPresentation = 'returning';
    this.ui.setFishingViewExitVisible?.(false);
    this.setBusy(true);
    void this.returnFromFishingView(generation);
  }

  private async returnFromFishingView(generation: number): Promise<void> {
    if (!await this.transitionFishingView('exit', generation)) return;
    if (!this.isContinuationActive(generation)) return;
    this.fishingPresentation = 'idle';
    this.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async transitionFishingView(
    direction: 'enter' | 'exit',
    generation: number,
  ): Promise<boolean> {
    await (direction === 'enter'
      ? this.world.enterFishingView?.() ?? Promise.resolve()
      : this.world.exitFishingView?.() ?? Promise.resolve());
    return this.isContinuationActive(generation);
  }

  private isCurrentFishing(attempt: FishingSession, generation: number): boolean {
    return this.activeFishing === attempt && this.isContinuationActive(generation);
  }

  private isContinuationActive(generation?: number): boolean {
    return !this.disposed
      && !this.restartRequested
      && (generation === undefined || generation === this.lifecycleGeneration);
  }

  private async runDayAction(outcome: ActionOutcome): Promise<void> {
    this.setBusy(true);
    await (this.world.play?.(outcome.cue) ?? Promise.resolve());
    if (this.disposed) return;
    const snapshot = this.renderSnapshot(false, false);
    this.ui.showFeedback?.(outcome);
    if (isTerminal(snapshot.state)) {
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async runCaptainWhiskersAction(
    action: 'petWhiskers' | 'feedWhiskers',
    outcome: ActionOutcome,
  ): Promise<void> {
    this.setBusy(true);
    await (this.world.playCaptainWhiskersAction?.(action) ?? Promise.resolve());
    if (this.disposed) return;
    this.renderSnapshot(false, false);
    this.ui.showFeedback?.(outcome);
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async runDiveAction(outcome: ActionOutcome): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    const scuba = Object.values(this.session.snapshot().inventory).find(
      (item) => item?.type === 'scubaSet' && item.condition === 'usable',
    );
    const instanceId = scuba?.instanceId ?? 'scubaSet-1';
    this.setBusy(true);

    await (this.world.playDive?.(instanceId, () => {
      if (this.isContinuationActive(generation)) this.audio.beginDive();
    }) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    await (this.ui.setSleepCoverProfile?.('dive') ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    this.world.clearDivePresentation?.();
    this.audio.finishDive();
    const snapshot = this.renderSnapshot(false, false);
    const [coveredSceneSettled] = await Promise.all([
      this.renderAndSettleCoveredScene(generation),
      this.ui.holdDiveCovered?.() ?? Promise.resolve(),
    ]);
    if (!coveredSceneSettled) return;
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    const resultHold = this.ui.showDiveResult?.(formatDiveResult(outcome)) ?? Promise.resolve();
    await resultHold;
    if (!await this.waitForVisibilityResume(generation)) return;
    this.setBusy(false);
    if (isTerminal(snapshot.state)) this.presentTerminalOnce(snapshot);
    else this.ui.restoreCommandFocus?.();
  }

  private async runEndDay(outcome: ActionOutcome): Promise<void> {
    const generation = this.lifecycleGeneration;
    const opensEvent = outcome.code !== 'quiet-night';
    this.eventPresentation = opensEvent ? 'transitioning' : 'sleeping';
    this.setBusy(true);
    if (opensEvent) this.ui.beginEventPresentation?.();
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    this.audio.nightfall();
    let snapshot = this.renderSnapshot(false, false);

    if (outcome.code === 'quiet-night') {
      await (this.ui.holdSleep?.() ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      snapshot = await this.runDawn(generation);
      if (!this.isContinuationActive(generation)) return;
      if (await this.revealDawnEvent(snapshot, generation)) return;
      if (!await this.renderAndSettleCoveredScene(generation)) return;
      await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      this.ui.restoreCommandFocus?.();
      return;
    }

    await this.runPendingEventReveal(snapshot, generation, true);
  }

  private async resolveEventWithItem(
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    generation: number,
  ): Promise<void> {
    const pending = this.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    const itemType = pending.inventory[instanceId]?.type;
    const eventState = pending.state;
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventSelectedItem?.(instanceId);
    await this.playEventItemUseWithSound(
      eventId,
      choiceId,
      instanceId,
      itemType,
    );
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition: pending.inventory[instanceId]?.condition ?? null,
    };
    await (
      this.world.playEventChoice?.(eventId, choice)
      ?? Promise.resolve()
    );
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'item', choiceId, instanceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.world.setEventSelectedItem?.(null);
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = FOCUSED_EVENT_ID_SET.has(eventId);
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    const condition = resolved.inventory[instanceId]?.condition ?? 'lost';
    const resolvedChoice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition,
    };
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const response = isDedicatedEventId(eventId)
      ? resolvedChoice
      : deriveEventPhysicalResponse(
          choiceId,
          pending.inventory,
          resolved.inventory,
          instanceId,
        );
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      instanceId,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      resolvedChoice,
      response,
      presentation,
      focusedResult,
    );
  }

  private async resolveContextualChoice(
    choiceId: EventResponseId,
    generation: number,
  ): Promise<void> {
    if (this.eventPresentation !== 'choosing' || !this.isContinuationActive(generation)) return;
    const pending = this.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    if (eventId === 'drifting-loot') {
      await this.resolveDriftingLootChoice(choiceId, generation);
      return;
    }
    this.ui.setEventSleepMask?.(eventId, choiceId === 'sleep');
    if (choiceId === 'sleep') this.audio.sleep();
    else this.audio.confirm();
    this.eventPresentation = 'using';
    this.setBusy(true);
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId: null,
      condition: null,
    };
    await Promise.all([
      this.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve(),
      this.world.playEventChoice?.(
        eventId,
        FOCUSED_EVENT_ID_SET.has(eventId) ? choice : choiceId,
      ) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.setEventSleepMask?.(eventId, false);
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = FOCUSED_EVENT_ID_SET.has(eventId);
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        pending.state,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      null,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      pending.state,
      generation,
      choice,
      deriveEventPhysicalResponse(
        choiceId,
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async resolveDriftingLootChoice(
    choiceId: EventResponseId,
    generation: number,
  ): Promise<void> {
    if (this.eventPresentation !== 'choosing' || !this.isContinuationActive(generation)) return;
    const pending = this.session.snapshot();
    if (pending.pendingEventId !== 'drifting-loot') return;
    if (!isDriftingLootVariant(pending.pendingDriftingLootVariant)) {
      this.rejectMissingDriftingLootVariant();
      return;
    }

    this.activeDriftingLootVariant = pending.pendingDriftingLootVariant;
    this.audio.confirm();
    this.eventPresentation = 'using';
    this.setBusy(true);
    await (this.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'resolving';
    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) return;
    if (!outcome.accepted) {
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }

    this.renderSnapshot(false, false);
    this.eventEligibility.clear();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();

    if (choiceId === 'retrieve' || choiceId === 'delegate-whiskers') {
      if (outcome.rewardSummary === undefined) {
        const feedback: ActionOutcome = {
          accepted: false,
          code: 'drifting-loot-reward-missing',
          message: 'The recovered salvage could not be identified.',
          deltas: {},
          cue: 'none',
        };
        this.ui.showFeedback?.(feedback);
        this.finishDriftingLootPresentation();
        return;
      }
      this.eventPresentation = 'retrieving';
      await (
        choiceId === 'delegate-whiskers'
          ? this.world.delegateDriftingLoot?.() ?? Promise.resolve()
          : this.world.retrieveDriftingLoot?.() ?? Promise.resolve()
      );
      if (!this.isContinuationActive(generation)) return;
      this.eventPresentation = 'result';
      const view = formatDriftingLootResult(
        outcome.rewardSummary,
        choiceId === 'delegate-whiskers' ? 0 : 3,
      );
      this.ui.showDriftingLootResult?.({
        ...view,
        target: this.world.projectDriftingLoot?.(
          this.viewportWidth,
          this.viewportHeight,
        ) ?? null,
      });
      return;
    }

    this.eventPresentation = 'receding';
    await (this.world.recedeDriftingLoot?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    this.finishDriftingLootPresentation();
  }

  private async resolveEndure(generation: number): Promise<void> {
    this.eventPresentation = 'resolving';
    this.setBusy(true);
    const pending = this.session.snapshot();
    const eventState = pending.state;
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    this.audio.confirm();
    const choice: EventChoicePresentation = {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    };
    if (eventId === 'other-people') {
      await (this.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
      return;
    }
    const focusedResult = FOCUSED_EVENT_ID_SET.has(eventId);
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choice.choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      null,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      choice,
      deriveEventPhysicalResponse(
        'endure',
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async runEventResolution(
    eventId: string,
    outcome: ActionOutcome,
    eventState: Extract<SurvivalState, 'dayEvent' | 'nightEvent'> | SurvivalState,
    generation: number,
    choice: EventChoicePresentation,
    physicalResponse: EventPhysicalResponsePresentation | EventChoicePresentation,
    presentation: EventOutcomePresentation,
    focusedResult: boolean,
  ): Promise<void> {
    this.setBusy(true);
    this.audio.beginEventReaction(eventId, outcome);
    if (
      isDedicatedEventId(eventId)
      && (
        (presentation.resourceDeltas.hull ?? 0) < 0
        || (presentation.resourceDeltas.health ?? 0) < 0
      )
    ) {
      this.audio.eventAction(eventId, 'damage');
    }
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.world.reactToEventOutcome?.(
        eventId,
        outcome,
        isDedicatedEventId(eventId)
          ? physicalResponse
          : focusedResult ? choice : physicalResponse,
        presentation,
      )
        ?? Promise.resolve(),
    ]);
    this.audio.finishEventReaction(eventId);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    const terminal = this.session.snapshot();
    if (focusedResult && !isTerminal(terminal.state)) {
      this.flushDeferredPresentationSync(terminal, generation);
    }
    const isDedicatedEvent = isDedicatedEventId(eventId);
    if (isTerminal(terminal.state)) {
      if (isDedicatedEvent) {
        await (this.ui.holdEventOutcome?.() ?? Promise.resolve());
        if (!this.isContinuationActive(generation)) return;
      }
      const snapshot = this.renderSnapshot(false, false);
      if (snapshot.state === 'rescued') this.retainTerminalEventTableau();
      else this.clearEventPresentation();
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }

    await (this.ui.holdEventOutcome?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.clearEventPresentation();
    if (
      eventState === 'nightEvent'
      && terminal.state === 'nightEvent'
      && terminal.pendingEventId !== null
    ) {
      await this.runPendingEventReveal(terminal, generation, true);
      return;
    }
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation)
      : this.renderSnapshot(false, false);
    if (!this.isContinuationActive(generation)) return;
    if (eventState === 'nightEvent' && await this.revealDawnEvent(snapshot, generation)) return;
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
  }

  private async runDawn(generation: number): Promise<SurvivalSnapshot> {
    const dawn = this.session.beginDawn?.();
    if (dawn?.accepted) {
      this.audio.dawn();
      await (this.world.play?.(dawn.cue) ?? Promise.resolve());
    }
    if (!this.isContinuationActive(generation)) return this.session.snapshot();
    return this.renderSnapshot(false, false);
  }

  private async revealDawnEvent(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): Promise<boolean> {
    if (snapshot.state !== 'dayEvent' || snapshot.pendingEventId === null) {
      return false;
    }
    this.ui.beginEventPresentation?.();
    await this.runPendingEventReveal(snapshot, generation, true);
    return this.isContinuationActive(generation);
  }

  private latestJournalDay(snapshot: SurvivalSnapshot): number {
    return snapshot.journalEntries.at(-1)?.day ?? 0;
  }

  private syncJournalUnread(snapshot: SurvivalSnapshot): void {
    this.ui.setJournalUnread?.(this.latestJournalDay(snapshot) > this.lastReadJournalDay);
  }

  private renderSnapshot(openPendingEvent: boolean, presentTerminal = true): SurvivalSnapshot {
    const snapshot = this.session.snapshot();
    this.syncVisualState(snapshot);
    this.world.setPhase?.(snapshot.state === 'nightEvent' ? 'night' : 'day');
    this.ui.render?.(snapshot, (action) => {
      if (action === 'repairItem') return this.repairItemReason(snapshot);
      return this.session.availableReason?.(
        action,
        action === 'repair' ? this.repairOption(snapshot) : undefined,
      ) ?? null;
    });
    this.syncJournalUnread(snapshot);
    this.syncPresentation(snapshot);
    if (presentTerminal) this.presentTerminalOnce(snapshot);
    if (openPendingEvent && !isTerminal(snapshot.state)) this.openPendingEvent(snapshot);
    return snapshot;
  }

  private syncVisualState(snapshot: Readonly<SurvivalSnapshot>): void {
    this.visualState.elapsedSeconds = this.elapsedSeconds;
    this.visualState.phase = snapshot.state === 'nightEvent' ? 'night' : 'day';
    this.visualState.weather = snapshot.weather;
  }

  private syncPresentation(snapshot: SurvivalSnapshot): void {
    const presentationSnapshot = this.deferredPresentationSync?.before ?? snapshot;
    if (presentationSnapshot !== this.presentedInventorySnapshot) {
      this.presentedInventorySnapshot = presentationSnapshot;
      this.world.syncInventory?.(presentationSnapshot);
    }
    this.ui.setAnchors?.(
      this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? [],
    );
  }

  private beginDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (!this.isContinuationActive(generation)) return;
    this.syncPresentation(snapshot);
    this.deferredPresentationSync = {
      generation,
      before: snapshot,
    };
  }

  private flushDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (this.deferredPresentationSync?.generation !== generation) return;
    this.deferredPresentationSync = null;
    this.syncPresentation(snapshot);
  }

  private cancelDeferredPresentationSync(generation?: number): void {
    if (
      this.deferredPresentationSync === null
      || (
        generation !== undefined
        && this.deferredPresentationSync.generation !== generation
      )
    ) return;
    this.deferredPresentationSync = null;
  }

  private focusedEventResultError(
    eventId: string,
    choiceId: string,
    outcome: ActionOutcome,
  ): Error | null {
    const result = outcome.eventResult;
    if (result?.eventId === eventId && result.choiceId === choiceId) return null;
    const received = result === undefined
      ? 'missing'
      : `${result.eventId}/${result.choiceId}`;
    return new Error(
      `Focused event ${eventId} requires result ${eventId}/${choiceId}; `
      + `received ${received}.`,
    );
  }

  private async recoverInvalidFocusedEventResult(
    error: Error,
    eventState: SurvivalState,
    generation: number,
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!this.isContinuationActive(generation)) return;
    this.clearEventPresentation();
    this.onInvariantError(error);
    const resolved = this.session.snapshot();
    if (isTerminal(resolved.state)) {
      const snapshot = this.renderSnapshot(false, false);
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }

    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation)
      : this.renderSnapshot(false, false);
    if (!this.isContinuationActive(generation)) return;
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
  }

  private openPendingEvent(snapshot: SurvivalSnapshot): void {
    if (
      snapshot.pendingEventId === null
      || isTerminal(snapshot.state)
      || this.eventPresentation !== 'idle'
    ) return;
    void this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
  }

  private async runPendingEventReveal(
    snapshot: SurvivalSnapshot,
    generation: number,
    alreadyCovered = false,
  ): Promise<void> {
    if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
    const event = survivalEventById(snapshot.pendingEventId);
    if (event === undefined) return;
    this.audio.beginEvent(event.id);
    if (event.id !== 'bad-sleep') this.audio.eventReveal(event.id);
    this.eventPresentation = 'transitioning';
    this.eventEligibility.clear();
    this.setBusy(true);
    if (!alreadyCovered) this.ui.beginEventPresentation?.();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set());
    if (!alreadyCovered) {
      await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }

    const current = this.session.snapshot();
    if (current.pendingEventId !== event.id || isTerminal(current.state)) return;
    let driftingLootVariant: DriftingLootVariant | null = null;
    if (event.id === 'drifting-loot') {
      if (!isDriftingLootVariant(current.pendingDriftingLootVariant)) {
        this.rejectMissingDriftingLootVariant();
        return;
      }
      driftingLootVariant = current.pendingDriftingLootVariant;
    }
    this.setAutomaticWeather(presentationWeatherForEvent(event.id));
    const variantSeed = deriveEventVariantSeed(current.seed, current.day, event.id);
    if (isDedicatedEventId(event.id)) {
      this.world.stageEvent?.({
        eventId: event.id,
        targetInstanceId: current.pendingEventTargetId,
        variantSeed,
      });
    } else {
      this.world.stageEvent?.(event.id, driftingLootVariant, variantSeed);
    }
    this.eventPresentation = 'revealing';
    if (isDedicatedEventId(event.id)) {
      await (this.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    if (event.id === 'bad-sleep') {
      this.audio.eventReveal(event.id);
      this.ui.setBadSleepCue?.(true);
    }
    try {
      await (this.world.revealEvent?.(event.id) ?? Promise.resolve());
    } finally {
      if (event.id === 'bad-sleep') this.ui.setBadSleepCue?.(false);
    }
    if (!this.isContinuationActive(generation)) return;
    if (!isDedicatedEventId(event.id)) {
      await (this.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;

    const revealed = this.session.snapshot();
    if (revealed.pendingEventId !== event.id || isTerminal(revealed.state)) return;
    this.eventEligibility = this.eventEligibilityFor(event, revealed);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.syncPresentation(revealed);
    this.ui.setEventSelection?.(
      this.eventEligibility,
      this.contextualChoicesFor(event, revealed),
    );
    this.eventPresentation = 'choosing';
    this.setBusy(false);
  }

  private eventEligibilityFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const choiceByItem = new Map(
      event.choices
        .filter((choice) => choice.itemId !== undefined
          && (choice.requiredChestState === undefined || choice.requiredChestState === snapshot.chest.state))
        .map((choice) => [choice.itemId!, choice.id] as const),
    );
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    Object.values(snapshot.inventory).forEach((item) => {
      if (item?.condition !== 'usable') return;
      const choiceId = choiceByItem.get(item.type);
      if (choiceId !== undefined) eligibility.set(item.instanceId, choiceId);
    });
    return eligibility;
  }

  private contextualChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice[] {
    return event.choices
      .filter((choice) => choice.itemId === undefined)
      .flatMap((choice): EventContextChoice[] => {
        const companionAvailability = choice.companionAction === undefined
          ? undefined
          : this.session.companionEventActionAvailability?.(choice.companionAction);
        if (choice.companionAction !== undefined && companionAvailability?.visible !== true) {
          return [];
        }
        const anchorId = this.contextualEventAnchorId(event.id, choice.id);
        const unmet = choice.requirements?.filter(
          ({ resource, minimum }) => snapshot[resource] < minimum,
        ) ?? [];
        const chestUnavailable = choice.requiredChestState !== undefined
          && choice.requiredChestState !== snapshot.chest.state;
        const unavailableReasons = [
          ...unmet.map(({ resource, minimum }) => (
            `Requires ${minimum} ${resource.replace(/([A-Z])/g, ' $1').toLocaleLowerCase('en-US')}; `
            + `you have ${snapshot[resource]}.`
          )),
          ...(chestUnavailable
            ? [`Requires a ${choice.requiredChestState} chest; you have ${snapshot.chest.state}.`]
            : []),
          ...(companionAvailability?.unavailableReason === null
            || companionAvailability?.unavailableReason === undefined
            ? []
            : [companionAvailability.unavailableReason]),
        ];
        return [{
          id: choice.id,
          label: choice.label,
          unavailableReason: unavailableReasons.length === 0 ? null : unavailableReasons.join(' '),
          ...(anchorId === null
            ? {}
            : { anchorId }),
          ...(event.id === 'drifting-loot' && choice.id === 'retrieve'
            ? {
                energyCost: choice.requirements?.find(
                  ({ resource }) => resource === 'energy',
                )?.minimum ?? 0,
              }
            : {}),
        }];
      });
  }

  private contextualEventAnchorId(
    eventId: string,
    choiceId: string,
  ): string | null {
    if (eventId === 'drifting-loot' && choiceId === 'retrieve') return 'drifting-loot';
    if (eventId === 'midnight-tour' && choiceId === 'visit') return 'midnight-tour:island';
    if (eventId === 'handyman' && choiceId === 'touch') return 'handyman:hand';
    if (eventId === 'handyman' && choiceId === 'chest') return 'persistent-chest';
    if (eventId === 'drifting-bottle' && choiceId === 'sleep') return 'event:drifting-bottle';
    if (eventId === 'check-the-back' && choiceId === 'check') return 'event:check-the-back';
    if (eventId === 'mystery-chest' && choiceId === 'take') return 'event:mystery-chest';
    if (eventId === 'flowers' && choiceId === 'sleep') return 'event:flowers';
    return null;
  }

  private restoreEventSelection(): void {
    const snapshot = this.session.snapshot();
    const event = snapshot.pendingEventId === null
      ? undefined
      : survivalEventById(snapshot.pendingEventId);
    this.ui.setEventSelection?.(
      this.eventEligibility,
      event === undefined ? [] : this.contextualChoicesFor(event, snapshot),
    );
  }

  private retainTerminalEventTableau(): void {
    this.cancelDeferredPresentationSync();
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();
  }

  private clearEventPresentation(): void {
    this.cancelDeferredPresentationSync();
    this.audio.clearEvent();
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.activeDriftingLootVariant = null;
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.ui.hideDriftingLootResult?.();
    this.setAutomaticWeather(null);
  }

  private finishDriftingLootPresentation(): void {
    if (
      this.activeDriftingLootVariant === null
      || (this.eventPresentation !== 'result' && this.eventPresentation !== 'receding'
        && this.eventPresentation !== 'resolving')
      || !this.isContinuationActive()
    ) return;
    this.eventPresentation = 'idle';
    this.ui.hideDriftingLootResult?.();
    this.eventEligibility.clear();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.setAutomaticWeather(null);
    this.activeDriftingLootVariant = null;
    this.renderSnapshot(false, false);
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private continueDriftingLootResult(): void {
    if (this.eventPresentation !== 'result' || !this.isContinuationActive()) return;
    this.finishDriftingLootPresentation();
  }

  private missingDriftingLootVariantOutcome(): ActionOutcome {
    return {
      accepted: false,
      code: 'drifting-loot-variant-missing',
      message: 'The drifting loot could not be staged.',
      deltas: {},
      cue: 'none',
    };
  }

  private rejectMissingDriftingLootVariant(): void {
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.activeDriftingLootVariant = null;
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.ui.hideDriftingLootResult?.();
    this.setAutomaticWeather(null);
    this.ui.showFeedback?.(this.missingDriftingLootVariantOutcome());
  }

  private setAutomaticWeather(id: PresentationWeatherId | null): void {
    this.automaticWeather = id;
    this.syncPresentationWeather();
  }

  private syncPresentationWeather(): void {
    const resolved = resolvePresentationWeather(this.automaticWeather, this.forcedWeather);
    if (resolved.id === this.effectivePresentationWeather) return;
    this.effectivePresentationWeather = resolved.id;
    this.world.setPresentationWeather?.(resolved.id);
    this.audio.setWeather(resolved.id);
  }

  private presentTerminalOnce(snapshot: SurvivalSnapshot): void {
    if (
      this.busy
      || !isTerminal(snapshot.state)
      || this.presentedTerminalState !== null
    ) return;
    this.presentedTerminalState = snapshot.state;
    this.audio.ending(snapshot.state);
    this.ui.showEnding?.(
      snapshot.state,
      snapshot.day,
      snapshot.seed,
      this.scavengeElapsedSeconds,
      snapshot.endingReason,
    );
  }

  private documentIsHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
  }

  private readonly handleVisibilityChange = (): void => {
    const hidden = this.visibilityDocument?.hidden === true;
    if (hidden) {
      this.audio.cancelDive();
      if (!this.paused) {
        this.visibilityPauseActive = true;
        this.setPaused(true);
      }
    } else if (this.visibilityPauseActive) {
      this.setPaused(false);
    }
    this.world.setDocumentHidden?.(hidden);
  };

  private waitForVisibilityResume(generation: number): Promise<boolean> {
    if (!this.isContinuationActive(generation)) return Promise.resolve(false);
    if (!this.visibilityPauseActive && !this.documentIsHidden()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const resume = () => {
        this.visibilityResumeWaiters.delete(resume);
        resolve(
          this.isContinuationActive(generation)
          && !this.visibilityPauseActive
          && !this.documentIsHidden()
        );
      };
      this.visibilityResumeWaiters.add(resume);
    });
  }

  private releaseVisibilityResumeWaiters(): void {
    if (this.visibilityResumeWaiters.size === 0) return;
    const waiters = [...this.visibilityResumeWaiters];
    this.visibilityResumeWaiters.clear();
    for (const resume of waiters) resume();
  }
}
