import { describe, expect, it, vi } from 'vitest';
import { type Material, Mesh, PointLight, Vector3 } from 'three';
import {
  createShipDangerState,
  sampleShipDangerStateInto,
} from '../src/game/shipDanger';
import { ShipAlarmLights } from '../src/world/ShipAlarmLights';
import { ShipSmokeEffects } from '../src/world/ShipSmokeEffects';
import { ShipFloodEffects } from '../src/world/ShipFloodEffects';
import {
  ShipDangerEffects,
  type ShipDangerOwnedResource,
} from '../src/world/ShipDangerEffects';
import { SHIP_DANGER_LAYOUT } from '../src/world/ShipDangerLayout';
import { FREIGHTER_DIMENSIONS } from '../src/world/ShipLayout';

describe('ship danger effects', () => {
  function dangerAt(elapsed: number, duration = 60) {
    const state = createShipDangerState();
    sampleShipDangerStateInto(state, elapsed, duration, elapsed);
    return state;
  }

  it('constructs every remaining system below one ship root', () => {
    const effects = new ShipDangerEffects();
    expect(effects.root.name).toBe('ship-danger-effects');
    expect(effects.snapshotForTest()).toMatchObject({
      alarms: 3,
      smokeOutlets: 4,
      leaks: 6,
    });
    effects.dispose();
  });

  it.each(['alarms', 'smoke', 'flood'] as const)(
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
        ['alarms', 'smoke', 'flood'].indexOf(stage) + 1,
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
    expect(disposals).toHaveLength(3);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(effects.root.children).toHaveLength(0);
  });

  it('pulses three caged ceiling lamps from one danger sample', () => {
    const alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
    alarms.update(dangerAt(0));
    expect(alarms.snapshotForTest()).toMatchObject({ lampCount: 3, pulse: 1 });
    const lights: PointLight[] = [];
    alarms.root.traverse((node) => { if (node instanceof PointLight) lights.push(node); });
    expect(lights).toHaveLength(3);
    expect(lights.every(({ castShadow }) => castShadow === false)).toBe(true);
    alarms.dispose();
  });

  it('disposes shared alarm geometry and materials once', () => {
    const alarms = new ShipAlarmLights(SHIP_DANGER_LAYOUT.alarms);
    const lens = alarms.root.getObjectByName('ship-danger-alarm-lens:crew-cabin') as Mesh;
    const geometryDispose = vi.spyOn(lens.geometry, 'dispose');
    const materialDispose = vi.spyOn(lens.material as Material, 'dispose');
    alarms.dispose();
    alarms.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('shows only primed fixed smoke immediately', () => {
    const smoke = new ShipSmokeEffects(SHIP_DANGER_LAYOUT.smokeOutlets);
    expect(smoke.snapshotForTest()).toMatchObject({
      sourceCount: 4,
      smokeCapacity: 64,
      activeSmoke: 64,
    });
    const names: string[] = [];
    smoke.root.traverse(({ name }) => names.push(name));
    expect(names.some((name) => /fire|ember|spark/.test(name))).toBe(false);
    smoke.dispose();
  });

  it('shows every leak, stream, puddle, and fixed spray particle at start', () => {
    const effects = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    expect(effects.snapshotForTest()).toMatchObject({
      leakCount: 6,
      streamCount: 3,
      puddleCount: 5,
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
    });
    expect(effects.snapshotForTest()).toMatchObject({
      leakCount: 2,
      streamCount: 1,
      puddleCount: 2,
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

  it('raises smoke and water strength without changing pool capacity', () => {
    const smoke = new ShipSmokeEffects(SHIP_DANGER_LAYOUT.smokeOutlets);
    const flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    smoke.update(1 / 60, dangerAt(60));
    flood.update(1 / 60, dangerAt(60));
    expect(smoke.snapshotForTest()).toMatchObject({ smokeCapacity: 64, activeSmoke: 64 });
    expect(flood.snapshotForTest()).toMatchObject({ sprayCapacity: 48, activeSpray: 48 });
    expect(flood.snapshotForTest().flowScale).toBeCloseTo(1.3);
    smoke.dispose();
    flood.dispose();
  });

  it('disposes smoke and flood resources once and ignores later updates', () => {
    const smoke = new ShipSmokeEffects(SHIP_DANGER_LAYOUT.smokeOutlets);
    const flood = new ShipFloodEffects(SHIP_DANGER_LAYOUT);
    const floodMesh = flood.root.getObjectByName('ship-danger-leak:crew-starboard') as Mesh;
    const smokeGeometryDispose = vi.spyOn(smoke.smoke.geometry, 'dispose');
    const smokeMaterialDispose = vi.spyOn(smoke.smoke.material, 'dispose');
    const floodGeometryDispose = vi.spyOn(floodMesh.geometry, 'dispose');
    const floodMaterialDispose = vi.spyOn(floodMesh.material as Material, 'dispose');
    const floodPointsDispose = vi.spyOn(flood.spray.geometry, 'dispose');
    smoke.dispose();
    flood.dispose();
    smoke.dispose();
    flood.dispose();
    expect(() => {
      smoke.update(1 / 60, dangerAt(60));
      flood.update(1 / 60, dangerAt(60));
    }).not.toThrow();
    [
      smokeGeometryDispose, smokeMaterialDispose,
      floodGeometryDispose, floodMaterialDispose, floodPointsDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
