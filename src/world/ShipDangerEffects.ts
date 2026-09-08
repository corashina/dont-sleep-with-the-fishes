import { Group } from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { ignoreCleanupError, runCleanupSteps } from './SceneResources';
import { ShipAlarmLights } from './ShipAlarmLights';
import { SHIP_DANGER_LAYOUT } from './ShipDangerLayout';

export type ShipDangerConstructionStage = 'alarms';

export type ShipDangerOwnedResource = ShipAlarmLights;

export interface ShipDangerConstructionOptions {
  readonly checkpoint?: (stage: ShipDangerConstructionStage) => void;
  readonly onResource?: (resource: ShipDangerOwnedResource) => void;
}

export interface ShipDangerEffectsSnapshot {
  readonly alarms: number;
}

export class ShipDangerEffects {
  readonly root = new Group();

  private readonly alarms!: ShipAlarmLights;
  private disposed = false;

  constructor(options: ShipDangerConstructionOptions = {}) {
    this.root.name = 'ship-danger-effects';
    const cleanup: Array<() => void> = [];
    try {
      this.alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
      cleanup.push(() => this.alarms.dispose());
      options.onResource?.(this.alarms);
      options.checkpoint?.('alarms');

      this.root.add(this.alarms.root);
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
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.alarms.dispose(),
      () => this.root.clear(),
    ]);
  }
}
