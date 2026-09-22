import { type Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { runCleanupSteps } from '../world/SceneResources';
import type {
  EventPresentationAdapter,
  EventPresentationContext,
  EventPresentationReaction,
  EventPresentationRoot,
} from './EventPresentationAdapter';
import { AUTHORED_EVENT_PRESENTATION_FACTORIES } from './focusedPresentationFactories';
import type { ActionOutcome } from './survivalTypes';
import type { EventModelLibrary } from './EventModelLibrary';
import type { EventModelId } from './eventModelManifest';
import { FeaturedEventPresentations } from './FeaturedEventPresentations';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
  FocusedEventPresentationFactories,
} from './FocusedEventPresentation';
import { SupernaturalEventAnimator } from './SupernaturalEventAnimator';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import { WeatherEventAnimator } from './WeatherEventAnimator';
import { DangerousWatersPresentation, type DangerousWatersBoatReaction } from './DangerousWatersPresentation';
import type { DriftingWater } from './DriftingWaveMotion';
import type { SurvivalEventId } from './eventCatalog';
import {
  isEventPresentationRoute,
  type DedicatedEventId,
  type EventPresentationRoute,
  type EventIdForRoute,
  type FocusedEventId,
} from './eventPresentationRoutes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
} from './eventPresentationTypes';
import { SharkSwarmPresentation } from './events/SharkSwarmPresentation';
import { SomethingUnderUsPresentation } from './events/SomethingUnderUsPresentation';
import { CarlitosEventPresentation } from './events/CarlitosEventPresentation';
import { DeathStarePresentation } from './events/DeathStarePresentation';
import { LeakPresentation } from './events/LeakPresentation';
import { OceanOfBloodPresentation } from './events/OceanOfBloodPresentation';
import { SchoolOfFishPresentation } from './events/SchoolOfFishPresentation';
import { SnatcherPresentation } from './events/SnatcherPresentation';
import { TornadoPresentation } from './events/TornadoPresentation';
import { StarryNightPresentation } from './events/StarryNightPresentation';
import {
  MoonEventPresentation,
  type MoonEventPresentationEnvironment,
} from './MoonEventPresentation';

export interface FeaturedEventPresentationTargets {
  readonly driftingCargoStern: Object3D;
  readonly flowersDeck: Object3D;
  readonly checkBackChest: Object3D;
  readonly checkBackFishBench: Object3D;
}

export interface EventPresentationAdapterDependencies {
  readonly worldParent: Object3D;
  readonly boatParent: Object3D;
  readonly dedicatedEnvironment: DedicatedEventEnvironment;
  readonly focusedDependencies: FocusedEventPresentationDependencies;
  readonly focusedFactories: FocusedEventPresentationFactories;
  readonly featuredModels: SurvivalEventModels;
  readonly featuredTargets: FeaturedEventPresentationTargets;
  readonly driftingWater: DriftingWater;
  readonly moon: MoonEventPresentationEnvironment;
  readonly applyDangerousWatersReaction: (
    reaction: Readonly<DangerousWatersBoatReaction>,
  ) => void;
}

export type EventPresentationAdapterFactory = (
  eventId: SurvivalEventId,
  dependencies: EventPresentationAdapterDependencies,
) => EventPresentationAdapter;

interface AdapterOperations {
  stage(context: EventPresentationContext): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  playItemUse(
    choiceId: string,
    instanceId: ItemInstanceId,
    onAction?: (cueIndex: number) => void,
  ): Promise<boolean>;
  itemAimTarget(): Object3D | null;
  hasPassed?(): boolean;
  netCatch?: EventPresentationAdapter['netCatch'];
  interactionTargets(): readonly FocusedEventInteractionTarget[];
  interactionRoot(id: string): Object3D | null;
  resultRoot(id: string): Object3D | null;
  prepareReaction?: (reaction: EventPresentationReaction) => void;
  react(reaction: EventPresentationReaction): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
}

function createAdapter(
  eventId: SurvivalEventId,
  roots: readonly EventPresentationRoot[],
  operations: AdapterOperations,
  cleanupSteps: readonly (() => void)[],
): EventPresentationAdapter {
  let disposed = false;
  const adapterRoots = Object.freeze([...roots]);
  return {
    eventId,
    roots: adapterRoots,
    stage(context): void {
      if (!disposed && context.eventId === eventId) operations.stage(context);
    },
    reveal(): Promise<void> {
      return disposed ? Promise.resolve() : operations.reveal();
    },
    playChoice(choice): Promise<void> {
      return disposed ? Promise.resolve() : operations.playChoice(choice);
    },
    playItemUse(choiceId, instanceId, onAction): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      return onAction === undefined
        ? operations.playItemUse(choiceId, instanceId)
        : operations.playItemUse(choiceId, instanceId, onAction);
    },
    netCatch() {
      return disposed ? null : operations.netCatch?.() ?? null;
    },
    itemAimTarget(): Object3D | null {
      return disposed ? null : operations.itemAimTarget();
    },
    hasPassed(): boolean {
      return !disposed && (operations.hasPassed?.() ?? false);
    },
    interactionTargets(): readonly FocusedEventInteractionTarget[] {
      return disposed ? EMPTY_INTERACTION_TARGETS : operations.interactionTargets();
    },
    interactionRoot(id): Object3D | null {
      return disposed ? null : operations.interactionRoot(id);
    },
    resultRoot(id): Object3D | null {
      return disposed ? null : operations.resultRoot(id);
    },
    prepareReaction(reaction): void {
      if (!disposed) operations.prepareReaction?.(reaction);
    },
    react(reaction): Promise<void> {
      return disposed ? Promise.resolve() : operations.react(reaction);
    },
    update(time, delta): void {
      if (!disposed) operations.update(time, delta);
    },
    settleForVisibilityChange(): void {
      if (!disposed) operations.settleForVisibilityChange();
    },
    clear(): void {
      if (!disposed) operations.clear();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      runCleanupSteps(cleanupSteps);
    },
  };
}

function assertRoute<Route extends EventPresentationRoute>(
  eventId: SurvivalEventId,
  route: Route,
): asserts eventId is SurvivalEventId & EventIdForRoute<Route> {
  if (!isEventPresentationRoute(eventId, route)) {
    throw new Error(`Event presentation route mismatch: ${eventId}/${route}`);
  }
}

function preserveConstructionError(
  error: unknown,
  cleanupSteps: readonly (() => void)[],
): never {
  try {
    runCleanupSteps(cleanupSteps);
  } catch {
    // Keep the construction error after all completed resources run.
  }
  throw error;
}

function createBorrowedDedicatedEnvironment(
  environment: DedicatedEventEnvironment,
): DedicatedEventEnvironment {
  const eventModels = {
    create: (id: EventModelId) => environment.eventModels.create(id),
    animations: (id: never) => environment.eventModels.animations(id),
    dispose: () => undefined,
  } as EventModelLibrary;
  return { ...environment, eventModels };
}

function createDedicatedPresentation(
  eventId: DedicatedEventId,
  environment: DedicatedEventEnvironment,
): DedicatedEventPresentation {
  switch (eventId) {
    case 'starry-night': return new StarryNightPresentation(environment);
    case 'ocean-of-blood': return new OceanOfBloodPresentation(environment);
    case 'leak': return new LeakPresentation(environment);
    case 'school-of-fish': return new SchoolOfFishPresentation(environment);
    case 'snatcher': return new SnatcherPresentation(environment);
    case 'death-stare': return new DeathStarePresentation(environment);
    case 'swarm-of-sharks': return new SharkSwarmPresentation(environment);
    case 'something-under-us': return new SomethingUnderUsPresentation(environment);
    case 'tornado': return new TornadoPresentation(environment);
    case 'shadow-figure':
    case 'guarded-sleep': return new CarlitosEventPresentation(eventId, environment);
  }
}

const noChoice = (): Promise<void> => Promise.resolve();
const noItemUse = (): Promise<boolean> => Promise.resolve(false);
const noRoot = (): null => null;
const EMPTY_INTERACTION_TARGETS: readonly FocusedEventInteractionTarget[] = Object.freeze([]);
const noInteractionTargets = (): readonly FocusedEventInteractionTarget[] => (
  EMPTY_INTERACTION_TARGETS
);

export const createDangerousWatersAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'dangerousWaters');
  const presentation = new DangerousWatersPresentation();
  let active = false;
  const stage = (): void => { presentation.clear(); active = true; presentation.stage(); };
  const ensureStaged = (): void => { if (!active) stage(); };
  const clear = (): void => { active = false; presentation.clear(); };
  const reaction: DangerousWatersBoatReaction = {
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
  return createAdapter(eventId, [
    { parent: dependencies.worldParent, root: presentation.root },
  ], {
    stage,
    reveal: () => { ensureStaged(); return presentation.reveal(); },
    playChoice: (choice) => {
      if (choice.instanceId !== null) return noChoice();
      ensureStaged();
      return presentation.playChoice(choice.choiceId);
    },
    playItemUse: (choiceId, instanceId) => { ensureStaged(); return presentation.playItemUse(choiceId, instanceId); },
    itemAimTarget: () => active ? presentation.itemAimTarget : null,
    interactionTargets: noInteractionTargets,
    interactionRoot: noRoot,
    resultRoot: noRoot,
    react: ({ outcome }) => { ensureStaged(); return presentation.react(outcome); },
    update: (time, delta) => {
      presentation.update(time, delta);
      if (presentation.copyBoatReaction(reaction)) dependencies.applyDangerousWatersReaction(reaction);
    },
    settleForVisibilityChange: () => presentation.settleForVisibilityChange(),
    clear,
  }, [clear, () => presentation.dispose(), () => presentation.root.removeFromParent()]);
};

export const createDedicatedAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'dedicated');
  const presentation = createDedicatedPresentation(
    eventId,
    createBorrowedDedicatedEnvironment(dependencies.dedicatedEnvironment),
  );
  let active = false;
  const clear = (): void => {
    if (!active) return;
    active = false;
    presentation.clear();
  };
  const cleanupSteps = [clear, () => presentation.dispose(),
    () => presentation.worldRoot.removeFromParent(),
    () => presentation.boatRoot.removeFromParent()];
  try {
    return createAdapter(eventId, [
      { parent: dependencies.worldParent, root: presentation.worldRoot },
      { parent: dependencies.boatParent, root: presentation.boatRoot },
    ], {
      stage: (context) => {
        clear();
        active = true;
        presentation.stage({ eventId, targetInstanceId: context.targetInstanceId, variantSeed: context.variantSeed });
      },
      reveal: () => active ? presentation.reveal() : noChoice(),
      playChoice: (choice) => active ? presentation.playChoice?.(choice.choiceId) ?? noChoice() : noChoice(),
      playItemUse: (choiceId, instanceId, onAction) => !active ? noItemUse()
        : onAction === undefined ? presentation.playItemUse(choiceId, instanceId)
          : presentation.playItemUse(choiceId, instanceId, onAction),
      itemAimTarget: () => active ? presentation.itemAimTarget : null,
      netCatch: () => active ? presentation.netCatch?.() ?? null : null,
      interactionTargets: () => active ? presentation.interactionTargets?.() ?? EMPTY_INTERACTION_TARGETS : EMPTY_INTERACTION_TARGETS,
      interactionRoot: (id) => active ? presentation.interactionRoot?.(id) ?? null : null,
      resultRoot: noRoot,
      react: ({ result }) => {
        if (result === null) throw new Error('Dedicated event reaction requires exact result data.');
        return active ? presentation.react(result) : noChoice();
      },
      update: (time, delta) => { if (active) presentation.update(time, delta); },
      settleForVisibilityChange: () => { if (active) presentation.settleForVisibilityChange(); },
      clear,
    }, cleanupSteps);
  } catch (error) {
    return preserveConstructionError(error, cleanupSteps);
  }
};

function createFocusedPresentation(
  eventId: FocusedEventId,
  dependencies: EventPresentationAdapterDependencies,
): FocusedEventPresentation {
  const factory = dependencies.focusedFactories[eventId] ?? AUTHORED_EVENT_PRESENTATION_FACTORIES[eventId];
  const presentation = factory?.(dependencies.focusedDependencies);
  if (presentation == null) throw new Error('Missing required focused event presentation: ' + eventId);
  return presentation;
}

export const createFocusedAdapter: EventPresentationAdapterFactory = (eventId, dependencies) => {
  assertRoute(eventId, 'focused');
  const presentation = createFocusedPresentation(eventId, dependencies);
  let active = false;
  const clear = (): void => {
    if (!active) return;
    active = false;
    presentation.clear();
    if (presentation.root.userData.holdOnClear !== true) presentation.root.visible = false;
  };
  const cleanupSteps = [clear, () => presentation.dispose(), () => presentation.root.removeFromParent()];
  try {
    presentation.root.visible = false;
    const targets = presentation.interactionTargets?.() ?? EMPTY_INTERACTION_TARGETS;
    const stage = (seed?: number): void => {
      clear();
      active = true;
      presentation.root.visible = true;
      if (seed === undefined) presentation.stage();
      else presentation.stage(seed);
    };
    const ensureStaged = (): void => { if (!active) stage(); };
    const matchingResult = (outcome: ActionOutcome) => {
      ensureStaged();
      const result = outcome.eventResult;
      if (result === undefined || result.eventId !== eventId) {
        throw new Error('Focused event ' + eventId + ' requires a matching event result.');
      }
      return result;
    };
    return createAdapter(eventId, [{ parent: dependencies.worldParent, root: presentation.root }], {
      stage: (context) => stage(context.variantSeed),
      reveal: () => { ensureStaged(); return presentation.reveal(); },
      playChoice: (choice) => { ensureStaged(); return presentation.playChoice(choice); },
      playItemUse: noItemUse,
      itemAimTarget: () => active ? presentation.itemAimTarget?.() ?? presentation.root : null,
      hasPassed: () => active && (presentation.hasPassed?.() ?? false),
      interactionTargets: () => targets,
      interactionRoot: (id) => active ? targets.find((target) => target.id === id)?.root ?? null : null,
      resultRoot: noRoot,
      prepareReaction: ({ outcome }) => { const result = matchingResult(outcome); presentation.prepareResult?.(result, outcome); },
      react: ({ outcome }) => presentation.react(matchingResult(outcome), outcome),
      update: (time, delta) => { if (active && delta >= 0) presentation.update(time, delta); },
      settleForVisibilityChange: () => { if (active) presentation.settleForVisibilityChange(); },
      clear,
    }, cleanupSteps);
  } catch (error) {
    return preserveConstructionError(error, cleanupSteps);
  }
};

export const createFeaturedAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'featured');
  const targets = dependencies.featuredTargets;
  const featured = new FeaturedEventPresentations(
    dependencies.featuredModels,
    dependencies.focusedDependencies.camera,
    targets.driftingCargoStern,
    targets.flowersDeck,
    targets.checkBackChest,
    targets.checkBackFishBench,
    dependencies.focusedDependencies.emitCue,
    dependencies.focusedDependencies.supplyDisplay,
    eventId,
    dependencies.driftingWater,
  );
  return createAdapter(eventId, [
    { parent: dependencies.worldParent, root: featured.root },
  ], {
    stage: (context) => featured.stage(eventId, context.variantSeed),
    reveal: () => featured.reveal(eventId),
    playChoice: noChoice,
    playItemUse: noItemUse,
    itemAimTarget: () => featured.itemAimTarget(eventId),
    netCatch: () => featured.netCatch(),
    interactionTargets: noInteractionTargets,
    interactionRoot: (id) => featured.interactionRoot(id),
    resultRoot: (id) => featured.resultRoot(id),
    react: ({ outcome }) => outcome.eventPresentationKey === undefined
      ? Promise.resolve()
      : featured.react(eventId, outcome.eventPresentationKey),
    update: (time, delta) => featured.update(time, delta),
    settleForVisibilityChange: () => featured.settleForVisibilityChange(),
    clear: () => featured.clear(),
  }, [() => featured.dispose()]);
};

export const createWeatherAdapter: EventPresentationAdapterFactory = (eventId, dependencies) => {
  assertRoute(eventId, 'weather');
  const animator = new WeatherEventAnimator(
    dependencies.focusedDependencies.cameraRig,
    dependencies.focusedDependencies.supplyDisplay,
    dependencies.dedicatedEnvironment.eventModels,
    dependencies.focusedDependencies.camera,
    eventId,
    dependencies.dedicatedEnvironment,
  );
  try {
    return createAdapter(eventId, [
      { parent: dependencies.worldParent, root: animator.worldRoot },
      { parent: dependencies.boatParent, root: animator.boatRoot },
    ], {
      stage: (context) => animator.stage(eventId, context.variantSeed),
      reveal: () => animator.reveal(eventId),
      playChoice: noChoice,
      playItemUse: (choiceId, instanceId) => animator.supportsItemUse(eventId, choiceId)
        ? animator.playItemUse(eventId, choiceId, instanceId) : noItemUse(),
      itemAimTarget: () => animator.itemAimTarget(eventId),
      interactionTargets: noInteractionTargets,
      interactionRoot: noRoot,
      resultRoot: noRoot,
      react: (reaction) => animator.react(eventId, reaction.outcome, reaction.physicalResponse,
        reaction.result?.selectedInstanceId ?? null),
      update: (time, delta) => animator.update(time, delta),
      settleForVisibilityChange: () => animator.settleForVisibilityChange(),
      clear: () => animator.clear(),
    }, [() => animator.dispose()]);
  } catch (error) {
    return preserveConstructionError(error, [() => animator.dispose()]);
  }
};

export const createSupernaturalAdapter: EventPresentationAdapterFactory = (eventId, dependencies) => {
  assertRoute(eventId, 'supernatural');
  const animator = new SupernaturalEventAnimator(
    dependencies.focusedDependencies.cameraRig,
    dependencies.focusedDependencies.supplyDisplay,
    dependencies.dedicatedEnvironment.eventModels,
    dependencies.focusedDependencies.camera,
    eventId,
  );
  try {
    return createAdapter(eventId, [
      { parent: dependencies.worldParent, root: animator.worldRoot },
    ], {
      stage: (context) => animator.stage(eventId, context.variantSeed),
      reveal: () => animator.reveal(eventId),
      playChoice: noChoice,
      playItemUse: (choiceId, instanceId) => animator.supportsItemUse(eventId, choiceId)
        ? animator.playItemUse(eventId, choiceId, instanceId) : noItemUse(),
      itemAimTarget: () => animator.itemAimTarget(eventId),
      interactionTargets: noInteractionTargets,
      interactionRoot: noRoot,
      resultRoot: noRoot,
      react: (reaction) => animator.react(eventId, reaction.outcome, reaction.physicalResponse,
        reaction.result?.selectedInstanceId ?? null),
      update: (time, delta) => animator.update(time, delta),
      settleForVisibilityChange: () => animator.settleForVisibilityChange(),
      clear: () => animator.clear(),
    }, [() => animator.dispose()]);
  } catch (error) {
    return preserveConstructionError(error, [() => animator.dispose()]);
  }
};

export const createMoonAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'moon');
  const moon = new MoonEventPresentation(dependencies.moon);
  return createAdapter(eventId, [
    { parent: dependencies.worldParent, root: moon.itemAimTarget },
  ], {
    stage: (context) => moon.stage(context),
    reveal: () => moon.reveal(),
    playChoice: noChoice,
    playItemUse: noItemUse,
    itemAimTarget: () => moon.itemAimTarget,
    interactionTargets: noInteractionTargets,
    interactionRoot: noRoot,
    resultRoot: noRoot,
    react: ({ outcome, result }) => {
      if (result === null) {
        throw new Error('Moon event reaction requires exact result data.');
      }
      return moon.react(result, outcome);
    },
    update: (time, delta) => moon.update(time, delta),
    settleForVisibilityChange: () => moon.settleForVisibilityChange(),
    clear: () => moon.clear(),
  }, [() => moon.dispose()]);
};
