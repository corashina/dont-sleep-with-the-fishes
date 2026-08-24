import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type { BoatWorld } from './BoatWorld';
import {
  CARLITOS_LAB_CHOICE_ID,
  CARLITOS_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_USES,
  REPAIR_TOOLBOX_LAB_CHOICE_ID,
  REPAIR_TOOLBOX_LAB_INSTANCE_ID,
} from './ItemAnimationLab';
import type { SurvivalSession } from './SurvivalSession';
import type { SurvivalEventId } from './eventCatalog';
import type {
  EventResponseId,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';

export type ItemAnimationLabSessionPort = Pick<SurvivalSession, 'snapshot'>;

export type ItemAnimationLabWorldPort = Pick<
  BoatWorld,
  | 'stageEvent'
  | 'playEventItemUse'
  | 'returnEventItemUse'
  | 'clearEvent'
  | 'cancelRepairToolboxAnimation'
  | 'playRepairToolboxAnimation'
  | 'setEventEligibleItems'
  | 'setEventSelectedItem'
>;

export type ItemAnimationLabUiPort = Pick<
  SurvivalUI,
  | 'beginEventPresentation'
  | 'clearEventPresentation'
  | 'showItemAnimationLab'
  | 'setEventSelection'
  | 'setEventUsing'
>;

export type ItemAnimationLabAudioPort = Pick<
  SurvivalAudio,
  'clearEvent' | 'eventItem' | 'eventItemCue' | 'repairToolbox'
>;

export interface ItemAnimationLabBundlePort {
  beginLoad(eventId: SurvivalEventId): Promise<unknown> | undefined;
  activate(eventId: SurvivalEventId): Promise<unknown> | undefined;
  cancelPendingActivation(): void;
  releaseActive(): void;
}

export interface ItemAnimationLabFlowDependencies {
  readonly session: ItemAnimationLabSessionPort;
  readonly world: ItemAnimationLabWorldPort;
  readonly ui: ItemAnimationLabUiPort;
  readonly audio: ItemAnimationLabAudioPort;
  readonly bundles: ItemAnimationLabBundlePort;
  readonly setBusy: (busy: boolean) => void;
  readonly setAutomaticWeather: (eventId: SurvivalEventId | null) => void;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
}

export class ItemAnimationLabFlow {
  private eligibility = new Map<ItemInstanceId, EventResponseId>();
  private operationGeneration = 0;
  private entered = false;
  private using = false;
  private disposed = false;

  constructor(private readonly dependencies: ItemAnimationLabFlowDependencies) {}

  enter(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.eligibility = this.buildEligibility(snapshot);
    this.entered = true;
    this.using = false;
    this.dependencies.ui.beginEventPresentation?.();
    this.dependencies.ui.showItemAnimationLab?.();
    this.dependencies.world.setEventSelectedItem?.(null);
    this.restoreSelection();
    this.dependencies.setBusy(false);
  }

  async play(
    instanceId: ItemInstanceId,
    choiceId?: EventResponseId,
  ): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const expectedChoice = this.eligibility.get(instanceId);
    if (
      !this.entered
      || this.using
      || expectedChoice === undefined
      || (choiceId !== undefined && choiceId !== expectedChoice)
      || !this.isLifecycleCurrent(generation)
    ) return;

    const operation = this.beginOperation();
    if (instanceId === REPAIR_TOOLBOX_LAB_INSTANCE_ID) {
      await this.playRepairToolbox(generation, operation);
      return;
    }

    const item = this.dependencies.session.snapshot().inventory[instanceId];
    if (item === undefined || item.condition !== 'usable') return;
    const use = ITEM_ANIMATION_LAB_USES[item.type];
    if (use === undefined || use.choiceId !== expectedChoice) return;
    await this.playItem(
      instanceId,
      item.type,
      use.eventId as SurvivalEventId,
      use.choiceId,
      generation,
      operation,
    );
  }

  eligibleItems(snapshot: SurvivalSnapshot): ReadonlySet<ItemInstanceId> {
    return new Set(this.buildEligibility(snapshot).keys());
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    // BoatWorld settles the active animation promise before guarded cleanup continues.
  }

  dispose(): void {
    if (this.disposed) return;
    this.operationGeneration += 1;
    this.disposed = true;
    const cleanExternalState = this.entered;
    this.entered = false;
    this.using = false;
    this.eligibility = new Map();
    if (!cleanExternalState) return;
    this.runCleanup([
      () => this.dependencies.world.cancelRepairToolboxAnimation?.(),
      () => this.dependencies.audio.clearEvent?.(),
      () => this.dependencies.world.setEventSelectedItem?.(null),
      () => this.dependencies.world.setEventEligibleItems?.(null),
      () => this.dependencies.world.clearEvent?.(),
      () => this.dependencies.bundles.cancelPendingActivation(),
      () => this.dependencies.bundles.releaseActive(),
      () => this.dependencies.ui.clearEventPresentation?.(),
      () => this.dependencies.setAutomaticWeather(null),
      () => this.dependencies.setBusy(false),
    ], false);
  }

  private async playItem(
    instanceId: ItemInstanceId,
    itemType: ItemId,
    eventId: SurvivalEventId,
    choiceId: string,
    generation: number,
    operation: number,
  ): Promise<void> {
    try {
      this.beginUse(instanceId);
      this.dependencies.setAutomaticWeather(eventId);
      const loading = this.dependencies.bundles.beginLoad(eventId);
      if (loading !== undefined) void loading.catch(() => undefined);
      const activation = this.dependencies.bundles.activate(eventId);
      if (activation !== undefined) await activation;
    } catch (error) {
      this.handleFailure('fatal', error, generation, operation, true);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;

    try {
      this.dependencies.world.stageEvent?.(eventId);
    } catch (error) {
      this.handleFailure('fatal', error, generation, operation, true);
      return;
    }

    try {
      await this.playEventItemUseWithSound(
        eventId,
        choiceId,
        instanceId,
        itemType,
        generation,
        operation,
      );
      if (!this.isCurrent(generation, operation)) return;
      await (this.dependencies.world.returnEventItemUse?.() ?? Promise.resolve());
    } catch (error) {
      this.handleFailure('invariant', error, generation, operation, true);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
    this.cleanupItemUse(false);
  }

  private async playRepairToolbox(
    generation: number,
    operation: number,
  ): Promise<void> {
    try {
      this.beginUse(REPAIR_TOOLBOX_LAB_INSTANCE_ID);
    } catch (error) {
      this.handleFailure('fatal', error, generation, operation, false);
      return;
    }

    try {
      await (this.dependencies.world.playRepairToolboxAnimation?.(
        () => {
          if (this.isCurrent(generation, operation)) {
            this.dependencies.audio.repairToolbox?.();
          }
        },
      ) ?? Promise.resolve());
    } catch (error) {
      this.handleFailure('invariant', error, generation, operation, false);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
    this.cleanupRepairUse(false);
  }

  private beginUse(instanceId: ItemInstanceId): void {
    this.using = true;
    this.dependencies.setBusy(true);
    this.dependencies.ui.setEventUsing?.(instanceId);
    this.dependencies.world.setEventEligibleItems?.(new Set());
    this.dependencies.world.setEventSelectedItem?.(instanceId);
  }

  private playEventItemUseWithSound(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    itemType: ItemId,
    generation: number,
    operation: number,
  ): Promise<void> {
    if (
      itemType === 'shotgun'
      || itemType === 'flashlight'
      || itemType === 'flareGun'
      || itemType === 'anchor'
      || itemType === 'ductTape'
    ) {
      if (itemType === 'anchor') this.dependencies.audio.eventItem?.(itemType);
      return this.dependencies.world.playEventItemUse?.(
        eventId,
        choiceId,
        instanceId,
        (cueIndex) => {
          if (this.isCurrent(generation, operation)) {
            this.dependencies.audio.eventItemCue?.(itemType, cueIndex);
          }
        },
      ) ?? Promise.resolve();
    }
    if (itemType === 'umbrella') this.dependencies.audio.eventItem?.(itemType);
    return this.dependencies.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private buildEligibility(
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined || item.condition !== 'usable') continue;
      const use = ITEM_ANIMATION_LAB_USES[item.type];
      if (use !== undefined) {
        eligibility.set(item.instanceId, use.choiceId as EventResponseId);
      }
    }
    if (snapshot.carlitos?.alive) {
      eligibility.set(CARLITOS_LAB_INSTANCE_ID, CARLITOS_LAB_CHOICE_ID);
    }
    eligibility.set(REPAIR_TOOLBOX_LAB_INSTANCE_ID, REPAIR_TOOLBOX_LAB_CHOICE_ID);
    return eligibility;
  }

  private restoreSelection(): void {
    this.dependencies.world.setEventEligibleItems?.(new Set(this.eligibility.keys()));
    this.dependencies.ui.setEventSelection?.(this.eligibility);
  }

  private handleFailure(
    kind: 'fatal' | 'invariant',
    error: unknown,
    generation: number,
    operation: number,
    itemUse: boolean,
  ): void {
    if (!this.isCurrent(generation, operation)) return;
    try {
      if (kind === 'fatal') this.dependencies.onFatalError(error);
      else {
        this.dependencies.onInvariantError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } finally {
      if (itemUse) this.cleanupItemUse(true);
      else this.cleanupRepairUse(true);
    }
  }

  private cleanupItemUse(suppressErrors: boolean): void {
    this.runCleanup([
      () => this.dependencies.world.clearEvent?.(),
      () => this.dependencies.bundles.releaseActive(),
      () => this.dependencies.setAutomaticWeather(null),
      () => this.dependencies.world.setEventSelectedItem?.(null),
      () => this.restoreSelection(),
      () => { this.using = false; },
      () => this.dependencies.setBusy(false),
    ], suppressErrors);
  }

  private cleanupRepairUse(suppressErrors: boolean): void {
    this.runCleanup([
      () => this.dependencies.world.setEventSelectedItem?.(null),
      () => this.restoreSelection(),
      () => { this.using = false; },
      () => this.dependencies.setBusy(false),
    ], suppressErrors);
  }

  private runCleanup(steps: readonly (() => void)[], suppressErrors: boolean): void {
    let firstError: unknown;
    let failed = false;
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        if (!failed) {
          firstError = error;
          failed = true;
        }
      }
    }
    if (!suppressErrors && failed) {
      this.dependencies.onFatalError(firstError);
    }
  }

  private beginOperation(): number {
    this.operationGeneration += 1;
    return this.operationGeneration;
  }

  private isLifecycleCurrent(generation: number): boolean {
    return !this.disposed
      && this.dependencies.isLifecycleGenerationCurrent(generation);
  }

  private isCurrent(generation: number, operation: number): boolean {
    return this.operationGeneration === operation
      && this.isLifecycleCurrent(generation);
  }
}
