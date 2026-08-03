import { describe, expect, it, vi } from 'vitest';
import { type Material, Mesh, PointLight } from 'three';
import { getShipDangerState } from '../src/game/shipDanger';
import { ShipAlarmLights } from '../src/world/ShipAlarmLights';
import { ShipDamageDetails } from '../src/world/ShipDamageDetails';
import { SHIP_DANGER_LAYOUT } from '../src/world/ShipDangerLayout';

describe('ship danger effects', () => {
  it('builds authored broken-plank clusters without colliders', () => {
    const details = new ShipDamageDetails(SHIP_DANGER_LAYOUT.brokenPlanks);
    expect(details.root.name).toBe('ship-danger-damage');
    expect(details.snapshotForTest()).toMatchObject({ clusters: 3, colliders: 0 });
    const names: string[] = [];
    details.root.traverse(({ name }) => names.push(name));
    expect(names.some((name) => name.includes('split-plank'))).toBe(true);
    expect(names.some((name) => name.includes('fastener'))).toBe(true);
    details.dispose();
  });

  it('pulses three caged room lamps from one danger sample', () => {
    const alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
    alarms.update(getShipDangerState(0, 60));
    expect(alarms.snapshotForTest()).toMatchObject({ lampCount: 3, pulse: 1 });
    const lights: PointLight[] = [];
    alarms.root.traverse((node) => { if (node instanceof PointLight) lights.push(node); });
    expect(lights).toHaveLength(3);
    expect(lights.every(({ castShadow }) => castShadow === false)).toBe(true);
    alarms.dispose();
  });

  it('disposes shared geometry and materials once', () => {
    const alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
    const lens = alarms.root.getObjectByName('ship-danger-alarm-lens:crew-cabin') as Mesh;
    const geometryDispose = vi.spyOn(lens.geometry, 'dispose');
    const materialDispose = vi.spyOn(lens.material as Material, 'dispose');
    alarms.dispose();
    alarms.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
