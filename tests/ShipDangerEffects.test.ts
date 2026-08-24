// Importance: 8/10 (scaled from 4/5). Protects alarm and puddle ownership, pooling, timing, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import { type Material, Mesh, PointLight, ShapeGeometry, Vector3 } from 'three';
import {
  createShipDangerState,
  sampleShipDangerStateInto,
} from '../src/game/shipDanger';
import { ShipAlarmLights } from '../src/world/ShipAlarmLights';
import { ShipPuddleEffects } from '../src/world/ShipPuddleEffects';
import {
  ShipDangerEffects,
  type ShipDangerOwnedResource,
} from '../src/world/ShipDangerEffects';
import { SHIP_DANGER_LAYOUT } from '../src/world/ShipDangerLayout';
import { FREIGHTER_DIMENSIONS } from '../src/world/ShipLayoutTypes';

describe('ship danger effects', () => {
  function dangerAt(elapsed: number, duration = 60) {
    const state = createShipDangerState();
    sampleShipDangerStateInto(state, elapsed, duration, elapsed);
    return state;
  }

  it('constructs only alarms and puddles below one ship root', () => {
    const effects = new ShipDangerEffects();
    expect(effects.root.name).toBe('ship-danger-effects');
    expect(effects.snapshotForTest()).toEqual({ alarms: 3, puddles: 16 });
    expect(effects.root.getObjectByName('ship-danger-smoke')).toBeUndefined();
    expect(effects.root.getObjectByName('ship-danger-leak:crew-starboard')).toBeUndefined();
    expect(effects.root.getObjectByName('ship-danger-stream:crew-runoff')).toBeUndefined();
    expect(effects.root.getObjectByName('ship-danger-spray')).toBeUndefined();
    effects.dispose();
  });

  it.each(['alarms', 'puddles'] as const)(
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
      expect(disposals).toHaveLength(['alarms', 'puddles'].indexOf(stage) + 1);
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
    expect(disposals).toHaveLength(2);
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

  it('shows every puddle immediately at floor height', () => {
    const puddles = new ShipPuddleEffects(SHIP_DANGER_LAYOUT.puddles);
    expect(puddles.snapshotForTest()).toEqual({ puddleCount: 16 });
    const vertex = new Vector3();
    puddles.root.updateWorldMatrix(true, true);
    puddles.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        expect(vertex.y).toBeLessThanOrEqual(FREIGHTER_DIMENSIONS.deckY + 0.025);
      }
    });
    puddles.dispose();
  });

  it('derives its puddle count from supplied anchors', () => {
    const puddles = new ShipPuddleEffects(SHIP_DANGER_LAYOUT.puddles.slice(0, 2));
    expect(puddles.snapshotForTest()).toEqual({ puddleCount: 2 });
    puddles.dispose();
  });

  it('rounds the corners of the irregular puddle outline', () => {
    const puddles = new ShipPuddleEffects(SHIP_DANGER_LAYOUT.puddles.slice(0, 1));
    const puddle = puddles.root.children[0] as Mesh;
    expect(puddle.geometry).toBeInstanceOf(ShapeGeometry);
    expect(puddle.geometry.getAttribute('position').count).toBeGreaterThan(12);
    puddles.dispose();
  });

  it('disposes shared puddle resources once', () => {
    const puddles = new ShipPuddleEffects(SHIP_DANGER_LAYOUT.puddles);
    const geometries = new Set<Mesh['geometry']>();
    const materials = new Set<Material>();
    puddles.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    });
    const geometryDisposals = [...geometries].map((geometry) => (
      vi.spyOn(geometry, 'dispose')
    ));
    const materialDisposals = [...materials].map((material) => (
      vi.spyOn(material, 'dispose')
    ));
    puddles.dispose();
    puddles.dispose();
    expect(geometries.size).toBe(1);
    expect(materials.size).toBe(1);
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
