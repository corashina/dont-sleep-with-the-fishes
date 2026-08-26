import { Group, type Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { runCleanupSteps } from '../world/SceneResources';
import type {
  EventPresentationAdapter,
  EventPresentationContext,
  EventPresentationReaction,
  EventPresentationRoot,
} from './EventPresentationAdapter';
import { EventPresentationCoordinator } from './EventPresentationCoordinator';
import { EventPresentationLayer } from './EventPresentationLayer';
import type { EventModelLibrary } from './EventModelLibrary';
import type { EventModelId } from './eventModelManifest';
import { FeaturedEventPresentations } from './FeaturedEventPresentations';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentationDependencies,
  FocusedEventPresentationFactories,
} from './FocusedEventPresentation';
import { SupernaturalEventAnimator } from './SupernaturalEventAnimator';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import { WeatherEventAnimator } from './WeatherEventAnimator';
import type { DangerousWatersBoatReaction } from './DangerousWatersPresentation';
import type { DriftingWater } from './DriftingWaveMotion';
import type { SurvivalEventId } from './eventCatalog';
import {
  isEventPresentationRoute,
  type DedicatedEventId,
  type EventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
} from './eventPresentationTypes';
import { SharkSwarmPresentation } from './events/SharkSwarmPresentation';
import { CarlitosEventPresentation } from './events/CarlitosEventPresentation';
import { DeathStarePresentation } from './events/DeathStarePresentation';
import { LeakPresentation } from './events/LeakPresentation';
import { SchoolOfFishPresentation } from './events/SchoolOfFishPresentation';
import { SnatcherPresentation } from './events/SnatcherPresentation';
import { TornadoPresentation } from './events/TornadoPresentation';
import { WreckagePresentation } from './events/WreckagePresentation';
import {
  MoonEventPresentation,
  type MoonEventPresentationEnvironment,
} from './MoonEventPresentation';
import {
  StarryNightPresentation,
  type StarryNightPresentationEnvironment,
} from './StarryNightPresentation';

export interface FeaturedEventPresentationTargets {
  readonly driftingCargoStern: Object3D;
  readonly flowersDeck: Object3D;
  readonly checkBackStern: Object3D;
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
  readonly starry: StarryNightPresentationEnvironment;
  readonly registerRescueCueCallback: (
    callback: (progress: number | null) => void,
  ) => void;
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
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  itemAimTarget(): Object3D | null;
  interactionTargets(): readonly FocusedEventInteractionTarget[];
  interactionRoot(id: string): Object3D | null;
  resultRoot(id: string): Object3D | null;
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
    playItemUse(choiceId, instanceId): Promise<boolean> {
      return disposed
        ? Promise.resolve(false)
        : operations.playItemUse(choiceId, instanceId);
    },
    itemAimTarget(): Object3D | null {
      return disposed ? null : operations.itemAimTarget();
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
): asserts eventId is SurvivalEventId & (
  Route extends 'dedicated' ? DedicatedEventId
    : Route extends 'featured' ? FeaturedEventId
      : SurvivalEventId
) {
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

function createDedicatedCoordinator(
  eventId: DedicatedEventId,
  environment: DedicatedEventEnvironment,
): EventPresentationCoordinator {
  const dedicatedEnvironment = createBorrowedDedicatedEnvironment(environment);
  const presentations: DedicatedEventPresentation[] = [];
  try {
    switch (eventId) {
      case 'leak':
        presentations.push(new LeakPresentation(dedicatedEnvironment));
        break;
      case 'school-of-fish':
        presentations.push(new SchoolOfFishPresentation(dedicatedEnvironment));
        break;
      case 'snatcher':
        presentations.push(new SnatcherPresentation(dedicatedEnvironment));
        break;
      case 'death-stare':
        presentations.push(new DeathStarePresentation(dedicatedEnvironment));
        break;
      case 'swarm-of-sharks':
        presentations.push(new SharkSwarmPresentation(dedicatedEnvironment));
        break;
      case 'tornado':
        presentations.push(new TornadoPresentation(dedicatedEnvironment));
        break;
      case 'wreckage':
        presentations.push(new WreckagePresentation(dedicatedEnvironment));
        break;
      case 'shadow-figure':
      case 'guarded-sleep':
        presentations.push(new CarlitosEventPresentation(eventId, dedicatedEnvironment));
        break;
      default: {
        const unhandledEventId: never = eventId;
        throw new Error(`Missing dedicated event presentation: ${unhandledEventId}`);
      }
    }
    return new EventPresentationCoordinator(presentations);
  } catch (error) {
    return preserveConstructionError(
      error,
      presentations.map((presentation) => () => presentation.dispose()),
    );
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
  const layer = new EventPresentationLayer(
    dependencies.focusedDependencies,
    dependencies.focusedFactories,
    eventId,
  );
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
    { parent: dependencies.worldParent, root: layer.root },
  ], {
    stage: (context) => layer.stage(eventId, context.variantSeed),
    reveal: () => layer.reveal(eventId),
    playChoice: (choice) => choice.instanceId === null
      ? layer.playChoice(eventId, choice.choiceId)
      : Promise.resolve(),
    playItemUse: (choiceId, instanceId) => (
      layer.playDangerousWatersItemUse(choiceId, instanceId)
    ),
    itemAimTarget: () => layer.itemAimTarget(eventId),
    interactionTargets: noInteractionTargets,
    interactionRoot: noRoot,
    resultRoot: noRoot,
    react: ({ outcome }) => layer.react(eventId, outcome),
    update: (time, delta) => {
      layer.update(time, delta);
      if (layer.copyDangerousWatersBoatReaction(reaction)) {
        dependencies.applyDangerousWatersReaction(reaction);
      }
    },
    settleForVisibilityChange: () => layer.settleForVisibilityChange(),
    clear: () => layer.clear(),
  }, [() => layer.dispose()]);
};

export const createDedicatedAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'dedicated');
  const coordinator = createDedicatedCoordinator(eventId, dependencies.dedicatedEnvironment);
  return createAdapter(eventId, [
    { parent: dependencies.worldParent, root: coordinator.worldRoot },
    { parent: dependencies.boatParent, root: coordinator.boatRoot },
  ], {
    stage: (context) => {
      if (!isEventPresentationRoute(context.eventId, 'dedicated')) return;
      coordinator.stage({
        eventId: context.eventId,
        targetInstanceId: context.targetInstanceId,
        variantSeed: context.variantSeed,
      });
    },
    reveal: () => coordinator.reveal(),
    playChoice: (choice) => coordinator.playChoice(choice.choiceId),
    playItemUse: (choiceId, instanceId) => coordinator.playItemUse(choiceId, instanceId),
    itemAimTarget: () => coordinator.itemAimTarget(),
    interactionTargets: noInteractionTargets,
    interactionRoot: noRoot,
    resultRoot: noRoot,
    react: ({ result }) => {
      if (result === null) {
        throw new Error('Dedicated event reaction requires exact result data.');
      }
      return coordinator.react(result);
    },
    update: (time, delta) => coordinator.update(time, delta),
    settleForVisibilityChange: () => coordinator.settleForVisibilityChange(),
    clear: () => coordinator.clear(),
  }, [() => coordinator.dispose()]);
};

export const createFocusedAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'focused');
  const layer = new EventPresentationLayer(
    dependencies.focusedDependencies,
    dependencies.focusedFactories,
    eventId,
  );
  if (eventId === 'other-people') {
    dependencies.registerRescueCueCallback((progress) => layer.setRescueCue(progress));
  }
  return createAdapter(eventId, [
    { parent: dependencies.worldParent, root: layer.root },
  ], {
    stage: (context) => layer.stage(eventId, context.variantSeed),
    reveal: () => layer.reveal(eventId),
    playChoice: (choice) => layer.playChoice(eventId, choice),
    playItemUse: noItemUse,
    itemAimTarget: () => layer.itemAimTarget(eventId),
    interactionTargets: () => layer.interactionTargets(eventId),
    interactionRoot: (id) => layer.interactionRoot(id),
    resultRoot: noRoot,
    react: ({ outcome }) => layer.react(eventId, outcome),
    update: (time, delta) => layer.update(time, delta),
    settleForVisibilityChange: () => layer.settleForVisibilityChange(),
    clear: () => layer.clear(),
  }, [() => layer.dispose()]);
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
    targets.checkBackStern,
    dependencies.focusedDependencies.emitCue,
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

export const createWeatherAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'weather');
  let layer: EventPresentationLayer | null = null;
  let weather: WeatherEventAnimator | null = null;
  try {
    layer = new EventPresentationLayer(
      dependencies.focusedDependencies,
      dependencies.focusedFactories,
      eventId,
    );
    weather = new WeatherEventAnimator(
      dependencies.focusedDependencies.cameraRig,
      dependencies.focusedDependencies.supplyDisplay,
      dependencies.dedicatedEnvironment.eventModels,
      dependencies.focusedDependencies.camera,
      eventId,
    );
    const ownedLayer = layer;
    const ownedWeather = weather;
    return createAdapter(eventId, [
      { parent: dependencies.worldParent, root: ownedLayer.root },
      { parent: dependencies.worldParent, root: ownedWeather.worldRoot },
      { parent: dependencies.boatParent, root: ownedWeather.boatRoot },
    ], {
      stage: (context) => {
        ownedLayer.stage(eventId, context.variantSeed);
        ownedWeather.stage(eventId, context.variantSeed);
      },
      reveal: () => Promise.all([
        ownedLayer.reveal(eventId),
        ownedWeather.reveal(eventId),
      ]).then(() => undefined),
      playChoice: noChoice,
      playItemUse: (choiceId, instanceId) => (
        ownedWeather.supportsItemUse(eventId, choiceId)
          ? ownedWeather.playItemUse(eventId, choiceId, instanceId)
          : Promise.resolve(false)
      ),
      itemAimTarget: () => (
        ownedWeather.itemAimTarget(eventId) ?? ownedLayer.itemAimTarget(eventId)
      ),
      interactionTargets: noInteractionTargets,
      interactionRoot: (id) => ownedLayer.interactionRoot(id),
      resultRoot: noRoot,
      react: (reaction) => Promise.all([
        ownedWeather.react(
          eventId,
          reaction.outcome,
          reaction.physicalResponse,
          reaction.result?.selectedInstanceId ?? null,
        ),
        ownedLayer.react(eventId, reaction.outcome),
      ]).then(() => undefined),
      update: (time, delta) => {
        ownedLayer.update(time, delta);
        ownedWeather.update(time, delta);
      },
      settleForVisibilityChange: () => {
        ownedLayer.settleForVisibilityChange();
        ownedWeather.settleForVisibilityChange();
      },
      clear: () => runCleanupSteps([
        () => ownedLayer.clear(),
        () => ownedWeather.clear(),
      ]),
    }, [
      () => ownedLayer.dispose(),
      () => ownedWeather.dispose(),
    ]);
  } catch (error) {
    return preserveConstructionError(error, [
      () => layer?.dispose(),
      () => weather?.dispose(),
    ]);
  }
};

export const createSupernaturalAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'supernatural');
  let layer: EventPresentationLayer | null = null;
  let supernatural: SupernaturalEventAnimator | null = null;
  try {
    layer = new EventPresentationLayer(
      dependencies.focusedDependencies,
      dependencies.focusedFactories,
      eventId,
    );
    supernatural = new SupernaturalEventAnimator(
      dependencies.focusedDependencies.cameraRig,
      dependencies.focusedDependencies.supplyDisplay,
      dependencies.dedicatedEnvironment.eventModels,
      dependencies.focusedDependencies.camera,
      eventId,
    );
    const ownedLayer = layer;
    const ownedSupernatural = supernatural;
    return createAdapter(eventId, [
      { parent: dependencies.worldParent, root: ownedLayer.root },
      { parent: dependencies.worldParent, root: ownedSupernatural.worldRoot },
    ], {
      stage: (context) => {
        ownedLayer.stage(eventId, context.variantSeed);
        ownedSupernatural.stage(eventId);
      },
      reveal: () => Promise.all([
        ownedLayer.reveal(eventId),
        ownedSupernatural.reveal(eventId),
      ]).then(() => undefined),
      playChoice: noChoice,
      playItemUse: (choiceId, instanceId) => (
        ownedSupernatural.supportsItemUse(eventId, choiceId)
          ? ownedSupernatural.playItemUse(eventId, choiceId, instanceId)
          : Promise.resolve(false)
      ),
      itemAimTarget: () => (
        ownedSupernatural.itemAimTarget(eventId) ?? ownedLayer.itemAimTarget(eventId)
      ),
      interactionTargets: noInteractionTargets,
      interactionRoot: (id) => ownedLayer.interactionRoot(id),
      resultRoot: noRoot,
      react: (reaction) => Promise.all([
        ownedLayer.react(eventId, reaction.outcome),
        ownedSupernatural.react(
          eventId,
          reaction.outcome,
          reaction.physicalResponse,
          reaction.result?.selectedInstanceId ?? null,
        ),
      ]).then(() => undefined),
      update: (time, delta) => {
        ownedLayer.update(time, delta);
        ownedSupernatural.update(time, delta);
      },
      settleForVisibilityChange: () => {
        ownedLayer.settleForVisibilityChange();
        ownedSupernatural.settleForVisibilityChange();
      },
      clear: () => runCleanupSteps([
        () => ownedLayer.clear(),
        () => ownedSupernatural.clear(),
      ]),
    }, [
      () => ownedLayer.dispose(),
      () => ownedSupernatural.dispose(),
    ]);
  } catch (error) {
    return preserveConstructionError(error, [
      () => layer?.dispose(),
      () => supernatural?.dispose(),
    ]);
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

export const createStarryAdapter: EventPresentationAdapterFactory = (
  eventId,
  dependencies,
) => {
  assertRoute(eventId, 'starry');
  const starry = new StarryNightPresentation(dependencies.starry);
  return createAdapter(eventId, [], {
    stage: (context) => starry.stage(context),
    reveal: () => starry.reveal(),
    playChoice: noChoice,
    playItemUse: noItemUse,
    itemAimTarget: noRoot,
    interactionTargets: noInteractionTargets,
    interactionRoot: noRoot,
    resultRoot: noRoot,
    react: () => starry.react(),
    update: (time, delta) => starry.update(time, delta),
    settleForVisibilityChange: () => starry.settleForVisibilityChange(),
    clear: () => starry.clear(),
  }, [() => starry.dispose()]);
};
