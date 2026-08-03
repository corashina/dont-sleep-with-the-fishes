import { describe, expect, it, vi } from 'vitest';
import { type Material, Mesh, PointLight } from 'three';
import { getShipDangerState } from '../src/game/shipDanger';
import { ShipAlarmLights } from '../src/world/ShipAlarmLights';
import { ShipDamageDetails } from '../src/world/ShipDamageDetails';
import { ShipFireEffects } from '../src/world/ShipFireEffects';
import { ShipFloodEffects } from '../src/world/ShipFloodEffects';
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

  it('shows layered fires and primed fixed smoke and ember pools immediately', () => {
    const effects = new ShipFireEffects(
      SHIP_DANGER_LAYOUT.fires,
      SHIP_DANGER_LAYOUT.smokeOutlets,
    );
    expect(effects.snapshotForTest()).toMatchObject({
      fireCount: 3,
      smokeCapacity: 64,
      emberCapacity: 36,
    });
    expect(effects.snapshotForTest().activeSmoke).toBeGreaterThan(0);
    expect(effects.snapshotForTest().activeEmbers).toBeGreaterThan(0);
    effects.dispose();
  });

  it('shows every leak, stream, puddle, streak, and fixed spray particle at start', () => {
    const effects = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    expect(effects.snapshotForTest()).toMatchObject({
      leakCount: 6,
      streamCount: 3,
      puddleCount: 5,
      wetStreakCount: 3,
      sprayCapacity: 48,
      activeSpray: 48,
    });
    effects.dispose();
  });

  it('raises fire, smoke, and water strength without changing pool capacity', () => {
    const fire = new ShipFireEffects(SHIP_DANGER_LAYOUT.fires, SHIP_DANGER_LAYOUT.smokeOutlets);
    const flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    fire.update(1 / 60, getShipDangerState(60, 60));
    flood.update(1 / 60, getShipDangerState(60, 60));
    expect(fire.snapshotForTest()).toMatchObject({ smokeCapacity: 64, emberCapacity: 36 });
    expect(flood.snapshotForTest()).toMatchObject({ sprayCapacity: 48, activeSpray: 48 });
    expect(flood.snapshotForTest().flowScale).toBeCloseTo(1.3);
    fire.dispose();
    flood.dispose();
  });

  it('disposes fire and flood resources once and ignores later updates', () => {
    const fire = new ShipFireEffects(SHIP_DANGER_LAYOUT.fires, SHIP_DANGER_LAYOUT.smokeOutlets);
    const flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    const fireMesh = fire.root.getObjectByName('ship-danger-flame:wheelhouse-roof:1') as Mesh;
    const floodMesh = flood.root.getObjectByName('ship-danger-leak:crew-starboard') as Mesh;
    const fireGeometryDispose = vi.spyOn(fireMesh.geometry, 'dispose');
    const fireMaterialDispose = vi.spyOn(fireMesh.material as Material, 'dispose');
    const firePointsDispose = vi.spyOn(fire.smoke.geometry, 'dispose');
    const floodGeometryDispose = vi.spyOn(floodMesh.geometry, 'dispose');
    const floodMaterialDispose = vi.spyOn(floodMesh.material as Material, 'dispose');
    const floodPointsDispose = vi.spyOn(flood.spray.geometry, 'dispose');

    fire.dispose();
    flood.dispose();
    fire.dispose();
    flood.dispose();
    expect(() => {
      fire.update(1 / 60, getShipDangerState(60, 60));
      flood.update(1 / 60, getShipDangerState(60, 60));
    }).not.toThrow();
    [
      fireGeometryDispose, fireMaterialDispose, firePointsDispose,
      floodGeometryDispose, floodMaterialDispose, floodPointsDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
