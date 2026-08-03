import { Group } from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { ignoreCleanupError, runCleanupSteps } from './SceneResources';
import { ShipAlarmLights } from './ShipAlarmLights';
import { ShipDamageDetails } from './ShipDamageDetails';
import { SHIP_DANGER_LAYOUT } from './ShipDangerLayout';
import { ShipFireEffects } from './ShipFireEffects';
import { ShipFloodEffects } from './ShipFloodEffects';

export type ShipDangerConstructionStage = 'damage' | 'alarms' | 'fire' | 'flood';

export type ShipDangerOwnedResource =
  | ShipDamageDetails
  | ShipAlarmLights
  | ShipFireEffects
  | ShipFloodEffects;

export interface ShipDangerConstructionOptions {
  readonly checkpoint?: (stage: ShipDangerConstructionStage) => void;
  readonly onResource?: (resource: ShipDangerOwnedResource) => void;
}

export interface ShipDangerEffectsSnapshot {
  readonly alarms: number;
  readonly fires: number;
  readonly leaks: number;
  readonly brokenPlankClusters: number;
}

export class ShipDangerEffects {
  readonly root = new Group();

  private readonly damage!: ShipDamageDetails;
  private readonly alarms!: ShipAlarmLights;
  private readonly fire!: ShipFireEffects;
  private readonly flood!: ShipFloodEffects;
  private disposed = false;

  constructor(options: ShipDangerConstructionOptions = {}) {
    this.root.name = 'ship-danger-effects';
    const cleanup: Array<() => void> = [];
    try {
      this.damage = new ShipDamageDetails(SHIP_DANGER_LAYOUT.brokenPlanks);
      cleanup.push(() => this.damage.dispose());
      options.onResource?.(this.damage);
      options.checkpoint?.('damage');

      this.alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
      cleanup.push(() => this.alarms.dispose());
      options.onResource?.(this.alarms);
      options.checkpoint?.('alarms');

      this.fire = new ShipFireEffects(
        SHIP_DANGER_LAYOUT.fires,
        SHIP_DANGER_LAYOUT.smokeOutlets,
        SHIP_DANGER_LAYOUT.sparks,
      );
      cleanup.push(() => this.fire.dispose());
      options.onResource?.(this.fire);
      options.checkpoint?.('fire');

      this.flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
      cleanup.push(() => this.flood.dispose());
      options.onResource?.(this.flood);
      options.checkpoint?.('flood');

      this.root.add(
        this.damage.root,
        this.alarms.root,
        this.fire.root,
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
    this.fire.update(delta, state);
    this.flood.update(delta, state);
  }

  snapshotForTest(): ShipDangerEffectsSnapshot {
    return {
      alarms: this.alarms.snapshotForTest().lampCount,
      fires: this.fire.snapshotForTest().fireCount,
      leaks: this.flood.snapshotForTest().leakCount,
      brokenPlankClusters: this.damage.snapshotForTest().clusters,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.flood.dispose(),
      () => this.fire.dispose(),
      () => this.alarms.dispose(),
      () => this.damage.dispose(),
      () => this.root.clear(),
    ]);
  }
}
