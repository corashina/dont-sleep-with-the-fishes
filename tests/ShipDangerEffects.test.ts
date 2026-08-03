import { describe, expect, it, vi } from 'vitest';
import { type Material, Mesh, PointLight, Vector3 } from 'three';
import { getShipDangerState } from '../src/game/shipDanger';
import { ShipAlarmLights } from '../src/world/ShipAlarmLights';
import { ShipDamageDetails } from '../src/world/ShipDamageDetails';
import { ShipFireEffects } from '../src/world/ShipFireEffects';
import { ShipFloodEffects } from '../src/world/ShipFloodEffects';
import {
  ShipDangerEffects,
  type ShipDangerOwnedResource,
} from '../src/world/ShipDangerEffects';
import { SHIP_DANGER_LAYOUT } from '../src/world/ShipDangerLayout';
import { FREIGHTER_DIMENSIONS } from '../src/world/ShipLayout';

describe('ship danger effects', () => {
  it('constructs every focused system below one ship root', () => {
    const effects = new ShipDangerEffects();
    expect(effects.root.name).toBe('ship-danger-effects');
    expect(effects.snapshotForTest()).toMatchObject({
      alarms: 3,
      fires: 3,
      leaks: 6,
      brokenPlankClusters: 3,
    });
    effects.dispose();
  });

  it.each(['damage', 'alarms', 'fire', 'flood'] as const)(
    'cleans completed danger resources after %s construction failure',
    (stage) => {
      const disposals: ReturnType<typeof vi.spyOn>[] = [];
      expect(() => new ShipDangerEffects({
        onResource: (resource: ShipDangerOwnedResource) => {
          disposals.push(vi.spyOn(resource, 'dispose'));
        },
        checkpoint: (current) => {
          if (current === stage) throw new Error(`fail after ${stage}`);
        },
      })).toThrow(`fail after ${stage}`);
      expect(disposals).toHaveLength(
        ['damage', 'alarms', 'fire', 'flood'].indexOf(stage) + 1,
      );
      disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    },
  );

  it('disposes every owned danger resource once', () => {
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    const effects = new ShipDangerEffects({
      onResource: (resource) => disposals.push(vi.spyOn(resource, 'dispose')),
    });

    effects.dispose();
    effects.dispose();

    expect(disposals).toHaveLength(4);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(effects.root.children).toHaveLength(0);
  });

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

  it('derives flood snapshot counts from its supplied layout', () => {
    const effects = new ShipFloodEffects({
      ...SHIP_DANGER_LAYOUT,
      leaks: SHIP_DANGER_LAYOUT.leaks.slice(0, 2),
      streams: SHIP_DANGER_LAYOUT.streams.slice(0, 1),
      puddles: SHIP_DANGER_LAYOUT.puddles.slice(0, 2),
      wetStreaks: SHIP_DANGER_LAYOUT.wetStreaks.slice(0, 1),
    });
    expect(effects.snapshotForTest()).toMatchObject({
      leakCount: 2,
      streamCount: 1,
      puddleCount: 2,
      wetStreakCount: 1,
    });
    effects.dispose();
  });

  it('keeps every puddle and stream vertex at floor height', () => {
    const effects = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    const vertex = new Vector3();
    effects.root.updateWorldMatrix(true, true);
    effects.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (!object.name.startsWith('ship-danger-puddle:') && !object.name.startsWith('ship-danger-stream:')) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        expect(vertex.y).toBeLessThanOrEqual(FREIGHTER_DIMENSIONS.deckY + 0.025);
      }
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
