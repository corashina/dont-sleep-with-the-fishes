import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type { BoatWorld } from './BoatWorld';
import {
  CARLITOS_LAB_CHOICE_ID,
  CARLITOS_LAB_INSTANCE_ID,
  FISHING_ROD_LAB_CHOICE_ID,
  FISHING_ROD_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_ID,
  ITEM_ANIMATION_LAB_USES,
  type ItemAnimationLabUse,
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
  | 'revealEvent'
  | 'playEventItemUse'
  | 'returnEventItemUse'
  | 'clearEvent'
  | 'cancelRepairToolboxAnimation'
  | 'playRepairToolboxAnimation'
  | 'setEventEligibleItems'
  | 'setEventSelectedItem'
  | 'setItemAnimationLabCameraLook'
>;

export type ItemAnimationLabUiPort = Pick<
  SurvivalUI,
  | 'beginEventPresentation'
  | 'clearEventPresentation'
  | 'showItemAnimationLab'
  | 'showItemAnimationLabChoices'
  | 'hideItemAnimationLabChoices'
  | 'setEventSelection'
  | 'setEventUsing'
>;

export type ItemAnimationLabAudioPort = Pick<
  SurvivalAudio,
  | 'clearEvent'
  | 'clearRadioSignal'
  | 'eventItem'
  | 'eventItemCue'
  | 'repairToolbox'
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
  readonly playFishing: () => Promise<void> | void;
  readonly setAutomaticWeather: (eventId: SurvivalEventId | null) => void;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
}

function usesIndexedItemCue(itemType: ItemId): boolean {
  return itemType === 'shotgun'
    || itemType === 'flashlight'
    || itemType === 'flareGun'
    || itemType === 'anchor'
    || itemType === 'ductTape'
    || itemType === 'radio';
}

export class ItemAnimationLabFlow {
  private eligibility = new Map<ItemInstanceId, EventResponseId>();
  private operationGeneration = 0;
  private entered = false;
  private using = false;
  private pendingInstanceId: ItemInstanceId | null = null;
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
    this.dependencies.world.setItemAnimationLabCameraLook?.(0, 0);
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
    if (!this.canPlay(expectedChoice, choiceId, generation)) return;

    if (instanceId === FISHING_ROD_LAB_INSTANCE_ID) {
      await this.dependencies.playFishing();
      return;
    }

    const operation = this.beginOperation();
    if (instanceId === REPAIR_TOOLBOX_LAB_INSTANCE_ID) {
      await this.playRepairToolbox(generation, operation);
      return;
    }
    await this.playInventoryItem(instanceId, expectedChoice, generation, operation);
  }

  choose(choiceId: EventResponseId): void {
    const instanceId = this.pendingInstanceId;
    if (instanceId === null || !this.entered || this.using || this.disposed) return;
    const item = this.dependencies.session.snapshot().inventory[instanceId];
    const use = item === undefined
      ? undefined
      : ITEM_ANIMATION_LAB_USES[item.type]?.find((candidate) => candidate.id === choiceId);
    if (item === undefined || item.condition !== 'usable' || use === undefined) return;
    this.pendingInstanceId = null;
    this.dependencies.ui.hideItemAnimationLabChoices?.();
    const generation = this.dependencies.captureLifecycleGeneration();
    const operation = this.beginOperation();
    void this.playSelectedItem(instanceId, item.type, use, generation, operation);
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
    this.pendingInstanceId = null;
    this.eligibility = new Map();
    if (!cleanExternalState) return;
    this.runCleanup([
      () => this.dependencies.world.cancelRepairToolboxAnimation?.(),
      () => this.dependencies.audio.clearRadioSignal?.(),
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
    eventId: string,
    choiceId: string,
    generation: number,
    operation: number,
  ): Promise<void> {
    const labOnlyUse = eventId === ITEM_ANIMATION_LAB_ID;
    const stagedEventId = eventId as SurvivalEventId;
    const activation = this.activateItemEvent(
      instanceId,
      stagedEventId,
      labOnlyUse,
      generation,
      operation,
    );
    const activated = typeof activation === 'boolean' ? activation : await activation;
    if (!activated) return;
    try {
      const reveal = this.stageItemEvent(
        stagedEventId,
        eventId === 'handyman',
        labOnlyUse,
      );
      if (reveal !== undefined) await reveal;
    } catch (error) {
      this.handleFailure('fatal', error, generation, operation, true);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
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

  private playSelectedItem(
    instanceId: ItemInstanceId,
    itemType: ItemId,
    use: ItemAnimationLabUse,
    generation: number,
    operation: number,
  ): Promise<void> {
    return this.playItem(
      instanceId,
      itemType,
      use.eventId,
      use.choiceId,
      generation,
      operation,
    );
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
    this.dependencies.audio.clearRadioSignal?.();
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
    if (usesIndexedItemCue(itemType)) {
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
        itemType === 'radio',
      ) ?? Promise.resolve();
    }
    if (itemType === 'umbrella') this.dependencies.audio.eventItem?.(itemType);
    return this.dependencies.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private canPlay(
    expectedChoice: EventResponseId | undefined,
    choiceId: EventResponseId | undefined,
    generation: number,
  ): expectedChoice is EventResponseId {
    return this.entered
      && !this.using
      && expectedChoice !== undefined
      && (choiceId === undefined || choiceId === expectedChoice)
      && this.isLifecycleCurrent(generation);
  }

  private async playInventoryItem(
    instanceId: ItemInstanceId,
    expectedChoice: EventResponseId,
    generation: number,
    operation: number,
  ): Promise<void> {
    const item = this.dependencies.session.snapshot().inventory[instanceId];
    if (item === undefined || item.condition !== 'usable') return;
    const uses = ITEM_ANIMATION_LAB_USES[item.type];
    if (uses === undefined || uses.length === 0 || uses[0]!.id !== expectedChoice) return;
    if (uses.length > 1) {
      this.showUseChoices(instanceId, uses);
      return;
    }
    this.pendingInstanceId = null;
    this.dependencies.ui.hideItemAnimationLabChoices?.();
    const use = uses[0]!;
    await this.playItem(
      instanceId,
      item.type,
      use.eventId,
      use.choiceId,
      generation,
      operation,
    );
  }

  private showUseChoices(
    instanceId: ItemInstanceId,
    uses: readonly ItemAnimationLabUse[],
  ): void {
    this.pendingInstanceId = instanceId;
    this.dependencies.ui.showItemAnimationLabChoices?.(
      uses.map(({ id, label }) => ({ id, label, unavailableReason: null })),
    );
  }

  private activateItemEvent(
    instanceId: ItemInstanceId,
    eventId: SurvivalEventId,
    labOnlyUse: boolean,
    generation: number,
    operation: number,
  ): boolean | Promise<boolean> {
    try {
      this.beginUse(instanceId);
      if (labOnlyUse) return this.isCurrent(generation, operation);
      const activation = this.activateBundle(eventId);
      if (activation === undefined) return this.isCurrent(generation, operation);
      return activation.then(
        () => this.isCurrent(generation, operation),
        (error: unknown) => {
          this.handleFailure('fatal', error, generation, operation, true);
          return false;
        },
      );
    } catch (error) {
      this.handleFailure('fatal', error, generation, operation, true);
      return false;
    }
  }

  private activateBundle(eventId: SurvivalEventId): Promise<unknown> | undefined {
    this.dependencies.setAutomaticWeather(eventId);
    const loading = this.dependencies.bundles.beginLoad(eventId);
    if (loading !== undefined) void loading.catch(() => undefined);
    return this.dependencies.bundles.activate(eventId);
  }

  private stageItemEvent(
    eventId: SurvivalEventId,
    reveal: boolean,
    labOnlyUse: boolean,
  ): Promise<unknown> | undefined {
    if (labOnlyUse) return undefined;
    this.dependencies.world.stageEvent?.(eventId);
    if (!reveal) return undefined;
    return this.dependencies.world.revealEvent?.(eventId) ?? Promise.resolve();
  }

  private buildEligibility(
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined || item.condition !== 'usable') continue;
      const use = ITEM_ANIMATION_LAB_USES[item.type]?.[0];
      if (use !== undefined) {
        eligibility.set(item.instanceId, use.id);
      }
    }
    if (snapshot.carlitos?.alive) {
      eligibility.set(CARLITOS_LAB_INSTANCE_ID, CARLITOS_LAB_CHOICE_ID);
    }
    eligibility.set(FISHING_ROD_LAB_INSTANCE_ID, FISHING_ROD_LAB_CHOICE_ID);
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
      () => this.dependencies.audio.clearRadioSignal?.(),
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
