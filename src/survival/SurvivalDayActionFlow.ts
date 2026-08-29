import type { SurvivalAudio } from '../audio/SurvivalAudio';
import { ITEM_DEFINITIONS, type ItemInstanceId } from '../game/ItemState';
import type { SurvivalUI } from '../ui/SurvivalUI';
import type { RewardResultView } from '../ui/SurvivalCoverViewModel';
import type { BoatWorld } from './BoatWorld';
import type { SurvivalEventFlow } from './SurvivalEventFlow';
import type { SurvivalSession } from './SurvivalSession';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  SurvivalState,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';

export type DayActionSessionPort = Pick<
  SurvivalSession,
  'snapshot' | 'perform' | 'availableReason'
>;

export type DayActionWorldPort = Pick<
  BoatWorld,
  'play' | 'playCarlitosAction' | 'playDive' | 'clearDivePresentation'
>;

export type DayActionUiPort = Pick<
  SurvivalUI,
  | 'showFeedback'
  | 'showRewardResult'
  | 'restoreCommandFocus'
  | 'setSleepCoverProfile'
  | 'setSleepCovered'
  | 'holdDiveCovered'
  | 'holdSleep'
  | 'beginEventPresentation'
>;

export type DayActionAudioPort = Pick<
  SurvivalAudio,
  | 'deny'
  | 'action'
  | 'sleep'
  | 'beginDive'
  | 'finishDive'
  | 'cancelDive'
  | 'nightfall'
  | 'petCarlitos'
>;

export type DayActionEventPort = Pick<
  SurvivalEventFlow,
  | 'sync'
  | 'beginDeferredSync'
  | 'cancelDeferredSync'
  | 'beginNightTransition'
  | 'beginDawn'
  | 'revealPending'
  | 'finishQuietNight'
  | 'clearAfterFailure'
>;

export interface SurvivalDayActionFlowDependencies {
  readonly session: DayActionSessionPort;
  readonly world: DayActionWorldPort;
  readonly ui: DayActionUiPort;
  readonly audio: DayActionAudioPort;
  readonly events: DayActionEventPort;
  readonly renderSnapshot: () => SurvivalSnapshot;
  readonly renderAndSettleCoveredScene: (generation: number) => Promise<boolean>;
  readonly presentTerminal: (snapshot: SurvivalSnapshot) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly waitForVisibilityResume: (generation: number) => Promise<boolean>;
  readonly captureLifecycleGeneration: () => number;
  readonly advanceLifecycleGeneration: () => number;
  readonly isLifecycleGenerationCurrent: (generation: number) => boolean;
  readonly onInvariantError: (error: Error) => void;
  readonly onFatalError: (error: unknown) => void;
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function formatDiveResult(outcome: ActionOutcome): RewardResultView {
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
  if ((outcome.deltas.rescueLead ?? 0) > 0) lines.push('RESCUE TRACE FOUND');
  if (reward === null && lines.length === 0) lines.push('NOTHING FOUND');
  const appliedHealthDelta = outcome.deltas.health;
  if (appliedHealthDelta !== undefined && appliedHealthDelta < 0) {
    lines.push('YOU SUFFERED SOME INJURIES');
  }
  return { title: 'DIVE RESULT', reward, lines };
}

export class SurvivalDayActionFlow {
  private operationGeneration = 0;
  private ownsBusyState = false;
  private disposed = false;

  constructor(private readonly dependencies: SurvivalDayActionFlowDependencies) {}

  async run(action: DayActionId, option?: DayActionOption): Promise<void> {
    const commandGeneration = this.dependencies.captureLifecycleGeneration();
    if (action === 'fish' || !this.isLifecycleCurrent(commandGeneration)) return;

    const prepared = this.prepareAction(action, option, commandGeneration);
    if (prepared === null) return;
    const { beforeAction, selectedOption, outcome } = prepared;
    if (!outcome.accepted) {
      this.presentRejection(outcome, commandGeneration);
      return;
    }
    await this.runAcceptedAction(
      action,
      selectedOption,
      outcome,
      beforeAction,
      commandGeneration,
    );
  }

  repairOption(snapshot: SurvivalSnapshot): DayActionOption | undefined {
    if (snapshot.repairMaterial > 0) {
      return { kind: 'hullRepair', material: 'repairMaterial' };
    }
    const hasDuctTape = Object.values(snapshot.inventory).some(
      (item) => item?.type === 'ductTape' && item.condition === 'usable',
    );
    if (hasDuctTape) return { kind: 'hullRepair', material: 'ductTape' };
    return undefined;
  }

  repairItemReason(snapshot: SurvivalSnapshot): string | null {
    const target = Object.values(snapshot.inventory).find(
      (item) => item?.condition === 'broken' && ITEM_DEFINITIONS[item.type].breakable,
    );
    if (target === undefined) return 'No broken repairable item remains.';
    return this.dependencies.session.availableReason?.('repairItem', {
      kind: 'itemRepair',
      target: target.instanceId,
    }) ?? null;
  }

  unavailableReason(snapshot: SurvivalSnapshot, action: DayActionId): string | null {
    if (action === 'repairItem') return this.repairItemReason(snapshot);
    return this.dependencies.session.availableReason?.(
      action,
      action === 'repair' ? this.repairOption(snapshot) : undefined,
    ) ?? null;
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    try {
      this.dependencies.audio.cancelDive?.();
    } catch (error) {
      this.dependencies.onFatalError(error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operationGeneration += 1;
    this.ownsBusyState = false;
  }

  private async runDayAction(outcome: ActionOutcome): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const operation = this.beginOperation();
    try {
      if (!this.isCurrent(generation, operation)) return;
      this.setBusy(true);
      await (this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      const snapshot = this.dependencies.renderSnapshot();
      this.setBusy(false);
      if (isTerminal(snapshot.state)) this.dependencies.presentTerminal(snapshot);
      else this.dependencies.ui.restoreCommandFocus?.();
    } catch (error) {
      this.handleFailure(error, generation, operation);
    }
  }

  private async runChestAction(
    outcome: ActionOutcome,
    beforeAction: SurvivalSnapshot,
  ): Promise<void> {
    const generation = this.dependencies.advanceLifecycleGeneration();
    const operation = this.beginOperation();
    try {
      if (!this.isCurrent(generation, operation)) return;
      this.dependencies.events.beginDeferredSync(beforeAction, generation);
      this.setBusy(true);
      await (this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      await (this.dependencies.ui.showRewardResult?.({
        title: 'CHEST REWARD',
        reward: outcome.rewardSummary ?? null,
        lines: [],
      }) ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      this.dependencies.events.cancelDeferredSync(generation);
      const snapshot = this.dependencies.renderSnapshot();
      this.setBusy(false);
      if (isTerminal(snapshot.state)) this.dependencies.presentTerminal(snapshot);
      else this.dependencies.ui.restoreCommandFocus?.();
    } catch (error) {
      this.handleFailure(error, generation, operation, () => {
        this.dependencies.events.cancelDeferredSync(generation);
      });
    }
  }

  private async runCarlitosAction(
    action: 'petCarlitos' | 'feedCarlitos',
  ): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const operation = this.beginOperation();
    try {
      if (!this.isCurrent(generation, operation)) return;
      this.setBusy(true);
      const presentation = action === 'petCarlitos'
        ? this.dependencies.world.playCarlitosAction?.(
            action,
            () => this.dependencies.audio.petCarlitos?.(),
          )
        : this.dependencies.world.playCarlitosAction?.(action);
      await (presentation ?? Promise.resolve());
      if (!this.isCurrent(generation, operation)) return;
      this.dependencies.renderSnapshot();
      this.setBusy(false);
      this.dependencies.ui.restoreCommandFocus?.();
    } catch (error) {
      this.handleFailure(error, generation, operation);
    }
  }

  private async runDiveAction(outcome: ActionOutcome): Promise<void> {
    const generation = this.dependencies.advanceLifecycleGeneration();
    const operation = this.beginOperation();
    try {
      if (!this.isCurrent(generation, operation)) return;
      const instanceId = this.diveInstanceId();
      this.setBusy(true);
      if (!await this.playDiveEntry(instanceId, generation, operation)) return;
      if (!await this.coverDive(generation, operation)) return;
      const snapshot = await this.settleCoveredDive(generation, operation);
      if (snapshot === null) return;
      if (!await this.uncoverDive(generation, operation)) return;
      await this.presentDiveResult(outcome, snapshot, generation, operation);
    } catch (error) {
      this.handleFailure(error, generation, operation, () => {
        try {
          this.dependencies.world.clearDivePresentation?.();
        } catch {
          // Keep the action error as the primary failure.
        }
        try {
          this.dependencies.audio.cancelDive?.();
        } catch {
          // Keep the action error as the primary failure.
        }
      });
    }
  }

  private async runEndDay(outcome: ActionOutcome): Promise<void> {
    const generation = this.dependencies.captureLifecycleGeneration();
    const operation = this.beginOperation();
    let transitionStarted = false;
    try {
      if (!this.isCurrent(generation, operation)) return;
      const opensEvent = outcome.code !== 'quiet-night';
      transitionStarted = this.dependencies.events.beginNightTransition(
        this.dependencies.session.snapshot(),
        opensEvent,
      );
      if (!transitionStarted) return;
      await this.playNightTransition(outcome);
      if (!this.isCurrent(generation, operation)) return;
      this.dependencies.audio.nightfall?.();
      const snapshot = this.dependencies.renderSnapshot();
      if (outcome.code === 'quiet-night') {
        await this.runQuietNight(generation, operation);
        return;
      }

      await this.dependencies.events.revealPending(snapshot, true);
    } catch (error) {
      this.handleFailure(error, generation, operation, transitionStarted
        ? () => {
            try {
              this.dependencies.events.clearAfterFailure();
            } catch {
              // Keep the action error as the primary failure.
            }
            try {
              this.dependencies.events.finishQuietNight();
            } catch {
              // Keep the action error as the primary failure.
            }
          }
        : undefined);
    }
  }

  private prepareAction(
    action: Exclude<DayActionId, 'fish'>,
    option: DayActionOption | undefined,
    generation: number,
  ): {
    readonly beforeAction: SurvivalSnapshot;
    readonly selectedOption: DayActionOption | undefined;
    readonly outcome: ActionOutcome;
  } | null {
    try {
      const beforeAction = this.dependencies.session.snapshot();
      const selectedOption = action === 'repair'
        ? this.repairOption(this.dependencies.session.snapshot())
        : option;
      const outcome = this.dependencies.session.perform?.(action, selectedOption);
      return outcome === undefined ? null : { beforeAction, selectedOption, outcome };
    } catch (error) {
      if (this.isLifecycleCurrent(generation)) {
        this.dependencies.onInvariantError(asError(error));
      }
      return null;
    }
  }

  private presentRejection(outcome: ActionOutcome, generation: number): void {
    try {
      this.dependencies.audio.deny?.();
      this.dependencies.ui.showFeedback?.(outcome);
    } catch (error) {
      if (this.isLifecycleCurrent(generation)) this.dependencies.onFatalError(error);
    }
  }

  private async runAcceptedAction(
    action: Exclude<DayActionId, 'fish'>,
    option: DayActionOption | undefined,
    outcome: ActionOutcome,
    beforeAction: SurvivalSnapshot,
    generation: number,
  ): Promise<void> {
    if (action === 'endDay') {
      if (!this.playActionAudio(() => this.dependencies.audio.sleep?.(), generation)) return;
      await this.runEndDay(outcome);
      return;
    }
    if (action === 'dive') {
      await this.runDiveAction(outcome);
      return;
    }
    if (!this.playActionAudio(
      () => this.dependencies.audio.action?.(action, option),
      generation,
    )) return;
    if (action === 'petCarlitos' || action === 'feedCarlitos') {
      if (!this.syncCarlitosEvent(generation)) return;
      await this.runCarlitosAction(action);
      return;
    }
    if (action === 'openChest') await this.runChestAction(outcome, beforeAction);
    else await this.runDayAction(outcome);
  }

  private playActionAudio(play: () => void, generation: number): boolean {
    try {
      play();
      return true;
    } catch (error) {
      if (this.isLifecycleCurrent(generation)) this.dependencies.onFatalError(error);
      return false;
    }
  }

  private syncCarlitosEvent(generation: number): boolean {
    try {
      this.dependencies.events.sync(this.dependencies.session.snapshot());
      return true;
    } catch (error) {
      if (this.isLifecycleCurrent(generation)) this.dependencies.onFatalError(error);
      return false;
    }
  }

  private diveInstanceId(): ItemInstanceId {
    const scuba = Object.values(this.dependencies.session.snapshot().inventory).find(
      (item) => item?.type === 'scubaSet' && item.condition === 'usable',
    );
    return scuba?.instanceId ?? 'scubaSet-1';
  }

  private async playDiveEntry(
    instanceId: ItemInstanceId,
    generation: number,
    operation: number,
  ): Promise<boolean> {
    await (this.dependencies.world.playDive?.(instanceId, {
      onWaterImpact: () => {
        if (this.isCurrent(generation, operation)) this.dependencies.audio.beginDive?.();
      },
    }) ?? Promise.resolve());
    return this.resumeCurrent(generation, operation);
  }

  private async coverDive(generation: number, operation: number): Promise<boolean> {
    await (this.dependencies.ui.setSleepCoverProfile?.('dive') ?? Promise.resolve());
    if (!await this.resumeCurrent(generation, operation)) return false;
    await (this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve());
    return this.resumeCurrent(generation, operation);
  }

  private async settleCoveredDive(
    generation: number,
    operation: number,
  ): Promise<SurvivalSnapshot | null> {
    this.dependencies.world.clearDivePresentation?.();
    this.dependencies.audio.finishDive?.();
    const snapshot = this.dependencies.renderSnapshot();
    const [settled] = await Promise.all([
      this.dependencies.renderAndSettleCoveredScene(generation),
      this.dependencies.ui.holdDiveCovered?.() ?? Promise.resolve(),
    ]);
    if (!settled || !await this.resumeCurrent(generation, operation)) return null;
    return snapshot;
  }

  private async uncoverDive(generation: number, operation: number): Promise<boolean> {
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!await this.resumeCurrent(generation, operation)) return false;
    await (this.dependencies.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    return this.resumeCurrent(generation, operation);
  }

  private async presentDiveResult(
    outcome: ActionOutcome,
    snapshot: SurvivalSnapshot,
    generation: number,
    operation: number,
  ): Promise<void> {
    await (this.dependencies.ui.showRewardResult?.(formatDiveResult(outcome)) ?? Promise.resolve());
    if (!await this.resumeCurrent(generation, operation)) return;
    this.setBusy(false);
    if (isTerminal(snapshot.state)) this.dependencies.presentTerminal(snapshot);
    else this.dependencies.ui.restoreCommandFocus?.();
  }

  private playNightTransition(outcome: ActionOutcome): Promise<unknown[]> {
    return Promise.all([
      this.dependencies.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.dependencies.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
  }

  private async runQuietNight(generation: number, operation: number): Promise<void> {
    await (this.dependencies.ui.holdSleep?.() ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    const snapshot = await this.dependencies.events.beginDawn();
    if (!this.isCurrent(generation, operation)) return;
    if (await this.revealQuietNightDayEvent(snapshot)) return;
    await this.finishQuietNight(snapshot, generation, operation);
  }

  private async revealQuietNightDayEvent(snapshot: SurvivalSnapshot): Promise<boolean> {
    if (snapshot.state !== 'dayEvent' || snapshot.pendingEventId === null) return false;
    this.dependencies.ui.beginEventPresentation?.();
    await this.dependencies.events.revealPending(snapshot, true);
    return true;
  }

  private async finishQuietNight(
    snapshot: SurvivalSnapshot,
    generation: number,
    operation: number,
  ): Promise<void> {
    const settled = await this.dependencies.renderAndSettleCoveredScene(generation);
    if (!settled || !this.isCurrent(generation, operation)) return;
    await (this.dependencies.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isCurrent(generation, operation)) return;
    this.dependencies.events.finishQuietNight();
    this.dependencies.presentTerminal(snapshot);
    this.dependencies.ui.restoreCommandFocus?.();
  }

  private async resumeCurrent(generation: number, operation: number): Promise<boolean> {
    const resumed = await this.dependencies.waitForVisibilityResume(generation);
    return resumed && this.isCurrent(generation, operation);
  }

  private handleFailure(
    error: unknown,
    generation: number,
    operation: number,
    cleanup?: () => void,
  ): void {
    if (!this.isCurrent(generation, operation)) return;
    try {
      this.dependencies.onFatalError(error);
    } finally {
      if (cleanup !== undefined) {
        try {
          cleanup();
        } catch {
          // Keep the operation error as the primary failure.
        }
      }
      this.releaseBusyAfterFailure(generation, operation);
    }
  }

  private releaseBusyAfterFailure(generation: number, operation: number): void {
    if (!this.ownsBusyState || !this.isCurrent(generation, operation)) return;
    try {
      this.setBusy(false);
    } catch {
      // Keep the operation error as the primary failure.
    }
  }

  private setBusy(busy: boolean): void {
    this.ownsBusyState = busy;
    this.dependencies.setBusy(busy);
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
