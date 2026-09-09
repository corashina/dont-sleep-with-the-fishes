import type { SurvivalAudio } from '../audio/SurvivalAudio';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstanceId } from '../game/ItemState';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type { EventContextChoice } from '../ui/SurvivalUiViewModel';
import type { BoatWorld } from './BoatWorld';
import { presentationUiText } from '../i18n/presentationUiMessages';
import { uiText } from '../i18n/uiMessages';
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
  SurvivalItemState,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';

export type ItemAnimationLabSessionPort = Pick<
  SurvivalSession, 'snapshot' | 'setItemConditionForLab' | 'setResourceQuantityForLab'
>;

const ITEM_CONDITION_CHOICE_ID = 'item-condition';

export type ItemAnimationLabWorldPort = Pick<
  BoatWorld,
  | 'stageEvent'
  | 'revealEvent'
  | 'playEventItemUse'
  | 'returnEventItemUse'
  | 'clearEvent'
  | 'cancelRepairToolboxAnimation'
  | 'playRepairToolboxAnimation'
  | 'playCarlitosAction'
  | 'setEventEligibleItems'
  | 'setEventSelectedItem'
  | 'setItemAnimationLabCameraLook'
  | 'enterFishingView'
  | 'centeredFishingCast'
  | 'playFishingNetHaul'
  | 'exitFishingView'
  | 'clearFishingPresentation'
  | 'playDive'
  | 'clearDivePresentation'
>;

export type ItemAnimationLabUiPort = Pick<
  SurvivalUI,
  | 'beginEventPresentation'
  | 'clearEventPresentation'
  | 'showItemAnimationLab'
  | 'showItemAnimationLabChoices'
  | 'hideItemAnimationLabChoices'
  | 'openRepairOptions'
  | 'setEventSelection'
  | 'setEventUsing'
  | 'setSleepCoverProfile'
  | 'setSleepCovered'
  | 'holdDiveCovered'
>;

export type ItemAnimationLabAudioPort = Pick<
  SurvivalAudio,
  | 'clearEvent'
  | 'clearRadioSignal'
  | 'eventItem'
  | 'eventItemCue'
  | 'repairToolbox'
  | 'meowCarlitos'
  | 'fishingCast'
  | 'beginDive'
  | 'finishDive'
  | 'cancelDive'
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
  readonly renderSnapshot: () => SurvivalSnapshot;
  readonly playFishing: () => Promise<void> | void;
  readonly setAutomaticWeather: (eventId: SurvivalEventId | null) => void;
  readonly captureLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
}

function usesIndexedItemCue(itemType: ItemId): boolean {
  return itemType === 'shotgun'
    || itemType === 'fishingNet'
    || itemType === 'knife'
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
  private waterUse: 'net-fishing' | 'scuba-dive' | null = null;

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

  async playCarlitos(action: 'petCarlitos' | 'feedCarlitos'): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    if (!this.canPlay(this.eligibility.get(CARLITOS_LAB_INSTANCE_ID), undefined, generation)) return;
    const operation = this.beginOperation();
    this.pendingInstanceId = null;
    try {
      this.dependencies.ui.hideItemAnimationLabChoices?.();
      this.beginUse(CARLITOS_LAB_INSTANCE_ID);
      await (this.dependencies.world.playCarlitosAction?.(
        action,
        () => {
          if (this.isCurrent(generation, operation)) this.dependencies.audio.meowCarlitos?.();
        },
      ) ?? Promise.resolve());
    } catch (error) {
      this.handleFailure('invariant', error, generation, operation, false);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
    this.cleanupStandaloneUse(false);
  }

  choose(choiceId: EventResponseId): void {
    const instanceId = this.pendingInstanceId;
    if (instanceId === null || !this.entered || this.using) return;
    const generation = this.dependencies.captureLifecycleGeneration();
    if (!this.isLifecycleCurrent(generation)) return;
    const item = this.dependencies.session.snapshot().inventory[instanceId];
    if (item === undefined) return;
    if (this.handleSettingChoice(item, choiceId)) return;
    const use = ITEM_ANIMATION_LAB_USES[item.type]?.find((candidate) => candidate.id === choiceId);
    if (item.condition !== 'usable' || use === undefined) return;
    this.pendingInstanceId = null;
    this.dependencies.ui.hideItemAnimationLabChoices?.();
    const operation = this.beginOperation();
    void this.playSelectedItem(instanceId, item.type, use, generation, operation);
  }

  eligibleItems(snapshot: SurvivalSnapshot): ReadonlySet<ItemInstanceId> {
    return new Set(this.buildEligibility(snapshot).keys());
  }

  repairItem(target: ItemInstanceId): void {
    if (!this.entered || this.using || this.pendingInstanceId === null) return;
    if (!this.isLifecycleCurrent(this.dependencies.captureLifecycleGeneration())) return;
    const snapshot = this.dependencies.session.snapshot();
    const tape = snapshot.inventory[this.pendingInstanceId];
    if (tape?.type !== 'ductTape' || tape.condition !== 'usable') return;
    if (snapshot.inventory[target]?.condition !== 'broken') return;
    if (!this.dependencies.session.setItemConditionForLab(target, 'usable')) return;
    this.pendingInstanceId = null;
    this.eligibility = this.buildEligibility(this.dependencies.renderSnapshot());
    this.restoreSelection();
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
      () => this.clearWaterUse(),
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
        choiceId,
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
    if (use.id === 'net-fishing' || use.id === 'scuba-dive') {
      return this.playWaterUse(instanceId, use.id, generation, operation);
    }
    return this.playItem(
      instanceId,
      itemType,
      use.eventId,
      use.choiceId,
      generation,
      operation,
    );
  }

  private async playWaterUse(
    instanceId: ItemInstanceId,
    use: 'net-fishing' | 'scuba-dive',
    generation: number,
    operation: number,
  ): Promise<void> {
    this.waterUse = use;
    try {
      this.beginUse(instanceId);
      if (use === 'net-fishing') await this.playNetFishing(generation, operation);
      else await this.playScubaDive(instanceId, generation, operation);
    } catch (error) {
      if (!this.isCurrent(generation, operation)) return;
      this.clearWaterUse();
      this.handleFailure('invariant', error, generation, operation, false);
      return;
    }
    if (!this.isCurrent(generation, operation)) return;
    this.waterUse = null;
    this.cleanupStandaloneUse(false);
  }

  private async playNetFishing(generation: number, operation: number): Promise<void> {
    await this.dependencies.world.enterFishingView('net');
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.audio.fishingCast();
    await this.dependencies.world.playFishingNetHaul('cod', this.dependencies.world.centeredFishingCast());
    if (!this.isCurrent(generation, operation)) return;
    await this.dependencies.world.exitFishingView();
  }

  private async playScubaDive(instanceId: ItemInstanceId, generation: number, operation: number): Promise<void> {
    await this.dependencies.world.playDive(instanceId, {
      onWaterImpact: () => {
        if (this.isCurrent(generation, operation)) this.dependencies.audio.beginDive();
      },
    });
    if (!this.isCurrent(generation, operation)) return;
    await this.dependencies.ui.setSleepCoverProfile('dive');
    if (!this.isCurrent(generation, operation)) return;
    await this.dependencies.ui.setSleepCovered(true);
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.world.clearDivePresentation();
    this.dependencies.audio.finishDive();
    await this.dependencies.ui.holdDiveCovered();
    if (!this.isCurrent(generation, operation)) return;
    await this.dependencies.ui.setSleepCovered(false);
    if (!this.isCurrent(generation, operation)) return;
    await this.dependencies.ui.setSleepCoverProfile('solid');
  }

  private clearWaterUse(): void {
    const use = this.waterUse;
    this.waterUse = null;
    if (use === 'net-fishing') {
      this.runCleanup([
        () => this.dependencies.world.clearFishingPresentation(),
        () => { void this.dependencies.world.exitFishingView().catch(() => undefined); },
      ], true);
    } else if (use === 'scuba-dive') {
      this.runCleanup([
        () => this.dependencies.world.clearDivePresentation(),
        () => this.dependencies.audio.cancelDive(),
        () => { void this.dependencies.ui.setSleepCovered(false).catch(() => undefined); },
        () => { void this.dependencies.ui.setSleepCoverProfile('solid').catch(() => undefined); },
      ], true);
    }
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
    this.cleanupStandaloneUse(false);
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
    if (item === undefined || this.itemChoice(item) !== expectedChoice) return;
    const uses = ITEM_ANIMATION_LAB_USES[item.type] ?? [];
    if (ITEM_DEFINITIONS[item.type].breakable || uses.length > 1) {
      this.showUseChoices(item);
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

  private showUseChoices(item: SurvivalItemState): void {
    const broken = item.condition === 'broken';
    const choices: EventContextChoice[] = (ITEM_ANIMATION_LAB_USES[item.type] ?? []).map(
      (use) => ({
        id: use.id,
        get label() { return use.label; },
        get unavailableReason() { return broken ? presentationUiText('itemBroken') : null; },
      }),
    );
    if (item.type === 'ductTape') {
      choices.unshift({
        id: 'repairItem',
        get label() { return uiText('repairItem'); },
        unavailableReason: null,
      });
    }
    if (ITEM_DEFINITIONS[item.type].breakable) {
      choices.push(
        { id: 'break', get label() { return presentationUiText('break'); }, get unavailableReason() { return broken ? presentationUiText('alreadyBroken') : null; } },
        { id: 'fix', get label() { return presentationUiText('fix'); }, get unavailableReason() { return broken ? null : presentationUiText('notBroken'); } },
      );
    }
    const resource = item.type === 'cannedFood' ? 'food' : item.type === 'baitTin' ? 'bait' : null;
    if (resource !== null) {
      const quantity = this.dependencies.session.snapshot()[resource];
      choices.push(
        {
          id: 'quantity-less',
          get label() { return `${presentationUiText('quantity')} − (${quantity} → ${Math.max(1, quantity - 1)})`; },
          get unavailableReason() { return quantity <= 1 ? presentationUiText('minimumQuantity') : null; },
        },
        {
          id: 'quantity-more',
          get label() { return `${presentationUiText('quantity')} + (${quantity} → ${quantity + 1})`; },
          unavailableReason: null,
        },
      );
    }
    this.pendingInstanceId = item.instanceId;
    this.dependencies.ui.showItemAnimationLabChoices?.(choices);
  }

  private handleSettingChoice(item: SurvivalItemState, choiceId: EventResponseId): boolean {
    switch (choiceId) {
      case 'repairItem':
        if (item.type === 'ductTape' && item.condition === 'usable') {
          this.dependencies.ui.hideItemAnimationLabChoices?.();
          this.dependencies.ui.openRepairOptions?.();
        }
        return true;
      case 'break':
      case 'fix':
        this.changeItemCondition(item.instanceId, choiceId);
        return true;
      case 'quantity-less':
      case 'quantity-more':
        this.changeResourceQuantity(item, choiceId === 'quantity-more' ? 1 : -1);
        return true;
      default:
        return false;
    }
  }

  private changeResourceQuantity(item: SurvivalItemState, delta: number): void {
    const resource = item.type === 'cannedFood' ? 'food' : item.type === 'baitTin' ? 'bait' : null;
    if (resource === null) return;
    const quantity = this.dependencies.session.snapshot()[resource] + delta;
    if (!this.dependencies.session.setResourceQuantityForLab(resource, quantity)) return;
    const snapshot = this.dependencies.renderSnapshot();
    this.eligibility = this.buildEligibility(snapshot);
    this.restoreSelection();
    this.showUseChoices(snapshot.inventory[item.instanceId]!);
  }

  private changeItemCondition(instanceId: ItemInstanceId, choiceId: 'break' | 'fix'): void {
    const changed = this.dependencies.session.setItemConditionForLab(
      instanceId, choiceId === 'break' ? 'broken' : 'usable',
    );
    if (!changed) return;
    const snapshot = this.dependencies.renderSnapshot();
    this.eligibility = this.buildEligibility(snapshot);
    this.restoreSelection();
    this.showUseChoices(snapshot.inventory[instanceId]!);
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
    choiceId: string,
    labOnlyUse: boolean,
  ): Promise<unknown> | undefined {
    if (labOnlyUse) return undefined;
    this.dependencies.world.stageEvent?.(eventId);
    const reveal = eventId === 'handyman'
      || (eventId === 'snatcher' && choiceId === 'attack');
    if (!reveal) return undefined;
    return this.dependencies.world.revealEvent?.(eventId) ?? Promise.resolve();
  }

  private buildEligibility(
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined) continue;
      const choice = this.itemChoice(item);
      if (choice !== undefined) eligibility.set(item.instanceId, choice);
    }
    if (snapshot.carlitos !== null) {
      eligibility.set(CARLITOS_LAB_INSTANCE_ID, CARLITOS_LAB_CHOICE_ID);
    }
    eligibility.set(FISHING_ROD_LAB_INSTANCE_ID, FISHING_ROD_LAB_CHOICE_ID);
    eligibility.set(REPAIR_TOOLBOX_LAB_INSTANCE_ID, REPAIR_TOOLBOX_LAB_CHOICE_ID);
    return eligibility;
  }

  private itemChoice(item: SurvivalItemState): EventResponseId | undefined {
    if (item.condition !== 'usable' && item.condition !== 'broken') return undefined;
    const use = ITEM_ANIMATION_LAB_USES[item.type]?.[0];
    if (ITEM_DEFINITIONS[item.type].breakable) return use?.id ?? ITEM_CONDITION_CHOICE_ID;
    return item.condition === 'usable' ? use?.id : undefined;
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
      else this.cleanupStandaloneUse(true);
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

  private cleanupStandaloneUse(suppressErrors: boolean): void {
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
