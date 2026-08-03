import { Group } from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { ignoreCleanupError, runCleanupSteps } from './SceneResources';
import { ShipAlarmLights } from './ShipAlarmLights';
import { SHIP_DANGER_LAYOUT } from './ShipDangerLayout';
import { ShipSmokeEffects } from './ShipSmokeEffects';
import { ShipFloodEffects } from './ShipFloodEffects';

export type ShipDangerConstructionStage = 'alarms' | 'smoke' | 'flood';

export type ShipDangerOwnedResource =
  | ShipAlarmLights
  | ShipSmokeEffects
  | ShipFloodEffects;

export interface ShipDangerConstructionOptions {
  readonly checkpoint?: (stage: ShipDangerConstructionStage) => void;
  readonly onResource?: (resource: ShipDangerOwnedResource) => void;
}

export interface ShipDangerEffectsSnapshot {
  readonly alarms: number;
  readonly smokeOutlets: number;
  readonly leaks: number;
}

export class ShipDangerEffects {
  readonly root = new Group();

  private readonly alarms!: ShipAlarmLights;
  private readonly smoke!: ShipSmokeEffects;
  private readonly flood!: ShipFloodEffects;
  private disposed = false;

  constructor(options: ShipDangerConstructionOptions = {}) {
    this.root.name = 'ship-danger-effects';
    const cleanup: Array<() => void> = [];
    try {
      this.alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
      cleanup.push(() => this.alarms.dispose());
      options.onResource?.(this.alarms);
      options.checkpoint?.('alarms');

      this.smoke = new ShipSmokeEffects(SHIP_DANGER_LAYOUT.smokeOutlets);
      cleanup.push(() => this.smoke.dispose());
      options.onResource?.(this.smoke);
      options.checkpoint?.('smoke');

      this.flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
      cleanup.push(() => this.flood.dispose());
      options.onResource?.(this.flood);
      options.checkpoint?.('flood');

      this.root.add(
        this.alarms.root,
        this.smoke.root,
        this.flood.root,
      );
    } catch (error) {
      for (let index = cleanup.length - 1; index >= 0; index -= 1) {
        ignoreCleanupError(cleanup[index]!);
      }
      throw error;
    }
  }

  update(delta: number, state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    this.alarms.update(state);
    this.smoke.update(delta, state);
    this.flood.update(delta, state);
  }

  snapshotForTest(): ShipDangerEffectsSnapshot {
    return {
      alarms: this.alarms.snapshotForTest().lampCount,
      smokeOutlets: this.smoke.snapshotForTest().sourceCount,
      leaks: this.flood.snapshotForTest().leakCount,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.flood.dispose(),
      () => this.smoke.dispose(),
      () => this.alarms.dispose(),
      () => this.root.clear(),
    ]);
  }
}
