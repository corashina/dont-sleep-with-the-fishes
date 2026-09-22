import {
  selectFishingCatch,
  type FishingCatchDefinition,
  type FishingGear,
} from './fishingCatalog';
import type { ItemId } from '../game/ItemState';
import { SURVIVAL_BALANCE } from './survivalBalance';
import type { ActionOutcome, RandomSource } from './survivalTypes';

export type BeginFishingResult =
  | {
      readonly accepted: true;
      readonly outcome: ActionOutcome;
      readonly attempt: FishingSession;
    }
  | {
      readonly accepted: false;
      readonly outcome: ActionOutcome;
    };

export interface FishingCastPoint {
  readonly x: number;
  readonly z: number;
}

export type FishingAttemptState =
  | 'aiming' | 'casting' | 'waiting' | 'bite' | 'fighting' | 'resolved' | 'missed';

export type FishingTerminalResult =
  | { readonly kind: 'catch'; readonly catch: FishingCatchDefinition }
  | { readonly kind: 'miss' };

export interface FishingAttemptSnapshot {
  readonly id: string;
  readonly state: FishingAttemptState;
  readonly capturedBait: boolean;
  readonly castPoint: FishingCastPoint | null;
  readonly biteDelaySeconds: number;
  readonly waitingSeconds: number;
  readonly biteSeconds: number;
  readonly result: FishingTerminalResult | null;
}

export interface FishingAttemptView {
  readonly id: string;
  readonly state: FishingAttemptState;
  readonly castPoint: FishingCastPoint | null;
  readonly result: FishingTerminalResult | null;
  readonly fishOffset: number;
  readonly rodPull: number;
  readonly fightSeconds: number;
}

export interface FishingCommandResult {
  readonly accepted: boolean;
  readonly code: string;
}

export interface FishingSessionOptions {
  readonly gear?: FishingGear;
  readonly id: string;
  readonly day: number;
  readonly capturedBait: boolean;
  readonly activeItemIds?: ReadonlySet<ItemId>;
  readonly fishWeightMultiplier?: number;
  readonly random: RandomSource;
}

function accepted(code: string): FishingCommandResult {
  return Object.freeze({ accepted: true, code });
}

function rejected(code: string): FishingCommandResult {
  return Object.freeze({ accepted: false, code });
}

export class FishingSession {
  readonly gear: FishingGear;
  private readonly id: string;
  private readonly capturedBait: boolean;
  private readonly biteDelaySeconds: number;
  private readonly hiddenCatch: FishingCatchDefinition;
  private state: FishingAttemptState = 'aiming';
  private castPoint: FishingCastPoint | null = null;
  private waitingSeconds = 0;
  private biteSeconds = 0;
  private result: FishingTerminalResult | null = null;
  private fishOffset = 0;
  private rodPull = 0;
  private fightSeconds = 0;
  private readonly movementSeed: number;
  private readonly liveView: FishingAttemptView;

  constructor(options: FishingSessionOptions) {
    this.gear = options.gear ?? 'rod';
    this.id = options.id;
    this.capturedBait = this.gear === 'rod' && options.capturedBait;
    const biteDelayRoll = options.random.next();
    const catchRoll = options.random.next();
    this.movementSeed = biteDelayRoll * Math.PI * 2;
    this.biteDelaySeconds = SURVIVAL_BALANCE.fishing.minimumBiteDelaySeconds
      + biteDelayRoll * SURVIVAL_BALANCE.fishing.biteDelayRangeSeconds;
    this.hiddenCatch = selectFishingCatch(
      options.day,
      this.capturedBait,
      catchRoll,
      options.activeItemIds,
      options.fishWeightMultiplier,
      this.gear,
    );
    const session = this;
    this.liveView = Object.freeze({
      get id(): string { return session.id; },
      get state(): FishingAttemptState { return session.state; },
      get castPoint(): FishingCastPoint | null { return session.castPoint; },
      get result(): FishingTerminalResult | null { return session.result; },
      get fishOffset(): number { return session.fishOffset; },
      get rodPull(): number { return session.rodPull; },
      get fightSeconds(): number { return session.fightSeconds; },
    });
  }

  view(): FishingAttemptView {
    return this.liveView;
  }

  snapshot(): FishingAttemptSnapshot {
    const castPoint = this.castPoint === null ? null : Object.freeze({ ...this.castPoint });
    return Object.freeze({
      id: this.id,
      state: this.state,
      capturedBait: this.capturedBait,
      castPoint,
      biteDelaySeconds: this.biteDelaySeconds,
      waitingSeconds: this.waitingSeconds,
      biteSeconds: this.biteSeconds,
      result: this.result,
    });
  }

  cast(point: FishingCastPoint): FishingCommandResult {
    if (this.state !== 'aiming') return rejected('not-aiming');
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return rejected('invalid-cast-point');
    this.castPoint = Object.freeze({ x: point.x, z: point.z });
    this.state = 'casting';
    return accepted('cast-started');
  }

  completeCast(): FishingCommandResult {
    if (this.state !== 'casting') return rejected('not-casting');
    if (this.gear === 'net') {
      this.result = Object.freeze({ kind: 'catch', catch: this.hiddenCatch });
      this.state = 'resolved';
    } else this.state = 'waiting';
    return accepted('cast-completed');
  }

  advance(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Fishing advance time must be finite and non-negative.');
    }
    if (this.state === 'waiting') {
      const remainingWait = this.biteDelaySeconds - this.waitingSeconds;
      const waited = Math.min(deltaSeconds, remainingWait);
      this.waitingSeconds += waited;
      if (this.waitingSeconds < this.biteDelaySeconds) return;
      this.state = 'bite';
      this.advanceBite(deltaSeconds - waited);
      return;
    }
    if (this.state === 'bite') this.advanceBite(deltaSeconds);
    else if (this.state === 'fighting') this.advanceFight(deltaSeconds);
  }

  reel(): FishingCommandResult {
    if (this.state !== 'bite') return rejected('not-biting');
    this.state = 'fighting';
    this.fishOffset = 0;
    return accepted('fight-started');
  }

  counterPull(movementX: number): void {
    if (this.state !== 'fighting' || !Number.isFinite(movementX)) return;
    // Limit a single event so a browser mouse spike cannot instantly lose a catch.
    const pull = Math.max(-45, Math.min(45, movementX)) * SURVIVAL_BALANCE.fishing.mousePullPerPixel;
    this.fishOffset += pull;
    this.rodPull = Math.max(-1, Math.min(1, this.rodPull + pull * 3));
    if (Math.abs(this.fishOffset) >= 1) this.loseFish();
  }

  private advanceFight(deltaSeconds: number): void {
    // Fixed small slices preserve escape checks through a slow frame.
    let remaining = Math.min(deltaSeconds, SURVIVAL_BALANCE.fishing.fightSeconds - this.fightSeconds);
    while (remaining > 1e-9 && this.state === 'fighting') {
      const step = Math.min(1 / 120, remaining);
      const direction = Math.sin(this.fightSeconds * (1.7 + this.movementSeed * 0.015) + 0.25)
        * (this.movementSeed < Math.PI ? 1 : -1);
      this.fishOffset += Math.tanh(direction * 5) * 0.95 * step;
      this.rodPull *= Math.exp(-step * 3);
      this.fightSeconds += step;
      remaining -= step;
      if (Math.abs(this.fishOffset) >= 1) this.loseFish();
    }
    if (this.state === 'fighting' && this.fightSeconds >= SURVIVAL_BALANCE.fishing.fightSeconds - 1e-9) {
      this.fightSeconds = SURVIVAL_BALANCE.fishing.fightSeconds;
      this.result = Object.freeze({ kind: 'catch', catch: this.hiddenCatch });
      this.state = 'resolved';
    }
  }

  private loseFish(): void {
    this.result = Object.freeze({ kind: 'miss' });
    this.state = 'missed';
  }

  private advanceBite(deltaSeconds: number): void {
    this.biteSeconds += deltaSeconds;
    this.fishOffset = Math.sin(this.biteSeconds * 2.1 + this.movementSeed) * 0.28;
    if (this.biteSeconds < SURVIVAL_BALANCE.fishing.reactionSeconds) return;
    this.loseFish();
  }
}
