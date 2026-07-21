import {
  selectFishingCatch,
  type FishingCatchDefinition,
} from './fishingCatalog';
import { SURVIVAL_BALANCE } from './survivalBalance';
import type { RandomSource } from './survivalTypes';

export interface FishingCastPoint {
  readonly x: number;
  readonly z: number;
}

export type FishingAttemptState =
  | 'aiming' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'resolved' | 'missed';

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

export interface FishingCommandResult {
  readonly accepted: boolean;
  readonly code: string;
}

export interface FishingSessionOptions {
  readonly id: string;
  readonly day: number;
  readonly capturedBait: boolean;
  readonly random: RandomSource;
}

function accepted(code: string): FishingCommandResult {
  return Object.freeze({ accepted: true, code });
}

function rejected(code: string): FishingCommandResult {
  return Object.freeze({ accepted: false, code });
}

export class FishingSession {
  private readonly id: string;
  private readonly capturedBait: boolean;
  private readonly biteDelaySeconds: number;
  private readonly hiddenCatch: FishingCatchDefinition;
  private state: FishingAttemptState = 'aiming';
  private castPoint: FishingCastPoint | null = null;
  private waitingSeconds = 0;
  private biteSeconds = 0;
  private result: FishingTerminalResult | null = null;

  constructor(options: FishingSessionOptions) {
    this.id = options.id;
    this.capturedBait = options.capturedBait;
    const biteDelayRoll = options.random.next();
    const catchRoll = options.random.next();
    this.biteDelaySeconds = SURVIVAL_BALANCE.fishing.minimumBiteDelaySeconds
      + biteDelayRoll * SURVIVAL_BALANCE.fishing.biteDelayRangeSeconds;
    this.hiddenCatch = selectFishingCatch(options.day, options.capturedBait, catchRoll);
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
    this.state = 'waiting';
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
  }

  reel(): FishingCommandResult & { readonly result?: FishingTerminalResult } {
    if (this.state !== 'bite') return rejected('not-biting');
    this.result = Object.freeze({ kind: 'catch', catch: this.hiddenCatch });
    this.state = 'reeling';
    return Object.freeze({ accepted: true, code: 'reel-started', result: this.result });
  }

  completeReel(): FishingCommandResult {
    if (this.state !== 'reeling') return rejected('not-reeling');
    this.state = 'resolved';
    return accepted('reel-completed');
  }

  private advanceBite(deltaSeconds: number): void {
    this.biteSeconds += deltaSeconds;
    if (this.biteSeconds < SURVIVAL_BALANCE.fishing.reactionSeconds) return;
    this.result = Object.freeze({ kind: 'miss' });
    this.state = 'missed';
  }
}
