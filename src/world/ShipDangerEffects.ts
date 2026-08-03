import { Group } from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { ignoreCleanupError, runCleanupSteps } from './SceneResources';
import { ShipAlarmLights } from './ShipAlarmLights';
import { SHIP_DANGER_LAYOUT } from './ShipDangerLayout';
import { ShipPuddleEffects } from './ShipPuddleEffects';

export type ShipDangerConstructionStage = 'alarms' | 'puddles';

export type ShipDangerOwnedResource =
  | ShipAlarmLights
  | ShipPuddleEffects;

export interface ShipDangerConstructionOptions {
  readonly checkpoint?: (stage: ShipDangerConstructionStage) => void;
  readonly onResource?: (resource: ShipDangerOwnedResource) => void;
}

export interface ShipDangerEffectsSnapshot {
  readonly alarms: number;
  readonly puddles: number;
}

export class ShipDangerEffects {
  readonly root = new Group();

  private readonly alarms!: ShipAlarmLights;
  private readonly puddles!: ShipPuddleEffects;
  private disposed = false;

  constructor(options: ShipDangerConstructionOptions = {}) {
    this.root.name = 'ship-danger-effects';
    const cleanup: Array<() => void> = [];
    try {
      this.alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
      cleanup.push(() => this.alarms.dispose());
      options.onResource?.(this.alarms);
      options.checkpoint?.('alarms');

      this.puddles = new ShipPuddleEffects(SHIP_DANGER_LAYOUT.puddles);
      cleanup.push(() => this.puddles.dispose());
      options.onResource?.(this.puddles);
      options.checkpoint?.('puddles');

      this.root.add(
        this.alarms.root,
        this.puddles.root,
      );
    } catch (error) {
      for (let index = cleanup.length - 1; index >= 0; index -= 1) {
        ignoreCleanupError(cleanup[index]!);
      }
      throw error;
    }
  }

  update(_delta: number, state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    this.alarms.update(state);
  }

  snapshotForTest(): ShipDangerEffectsSnapshot {
    return {
      alarms: this.alarms.snapshotForTest().lampCount,
      puddles: this.puddles.snapshotForTest().puddleCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.puddles.dispose(),
      () => this.alarms.dispose(),
      () => this.root.clear(),
    ]);
  }
}
