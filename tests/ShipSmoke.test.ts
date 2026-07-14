import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ShipSmoke } from '../src/world/ShipSmoke';

const outlets = [new Vector3(-1.35, 7.1, -13), new Vector3(1.35, 7.1, -13)] as const;

describe('ship smoke', () => {
  it('writes simulation updates into the rendered buffer attributes', () => {
    const smoke = new ShipSmoke(outlets, () => 0.5);
    for (let index = 0; index < 3; index += 1) smoke.update(0.1, 1, false);

    const position = smoke.points.geometry.getAttribute('position');
    const opacity = smoke.points.geometry.getAttribute('aOpacity');
    const size = smoke.points.geometry.getAttribute('aSize');
    expect(Array.from(position.array).some((value) => value !== 0)).toBe(true);
    expect(Array.from(opacity.array).some((value) => value > 0)).toBe(true);
    expect(Array.from(size.array).some((value) => value >= 0.65)).toBe(true);
    smoke.dispose();
  });

  it('starts a new puff at the sinking-adjusted opacity', () => {
    const smoke = new ShipSmoke(outlets, () => 0.5);
    smoke.update(0.1, 1, false);
    smoke.update(0.1, 1, false);

    expect(smoke.points.geometry.getAttribute('aOpacity').getX(0)).toBeCloseTo(0.78);
    smoke.dispose();
  });

  it('keeps dynamic smoke visible without cached frustum bounds', () => {
    const smoke = new ShipSmoke(outlets);
    expect(smoke.points.frustumCulled).toBe(false);
    smoke.dispose();
  });

  it('uses a fixed pool and increases active smoke with sinking progress', () => {
    const early = new ShipSmoke(outlets, () => 0.5);
    const late = new ShipSmoke(outlets, () => 0.5);
    for (let index = 0; index < 20; index += 1) {
      early.update(0.1, 0, false);
      late.update(0.1, 1, false);
    }
    expect(early.snapshotForTest().capacity).toBe(48);
    expect(late.snapshotForTest().capacity).toBe(48);
    expect(late.snapshotForTest().activeCount).toBeGreaterThan(early.snapshotForTest().activeCount);
    early.dispose();
    late.dispose();
  });

  it('reduces spawn and drift under reduced motion', () => {
    const regular = new ShipSmoke(outlets, () => 0.5);
    const reduced = new ShipSmoke(outlets, () => 0.5);
    for (let index = 0; index < 20; index += 1) {
      regular.update(0.1, 0.7, false);
      reduced.update(0.1, 0.7, true);
    }
    expect(reduced.snapshotForTest().activeCount).toBeLessThan(regular.snapshotForTest().activeCount);
    expect(reduced.snapshotForTest().maximumDrift).toBeLessThan(regular.snapshotForTest().maximumDrift);
    regular.dispose();
    reduced.dispose();
  });

  it('disposes geometry and material once', () => {
    const smoke = new ShipSmoke(outlets);
    const counts = { geometry: 0, material: 0 };
    smoke.points.geometry.addEventListener('dispose', () => counts.geometry += 1);
    smoke.points.material.addEventListener('dispose', () => counts.material += 1);
    smoke.dispose();
    smoke.dispose();
    expect(counts).toEqual({ geometry: 1, material: 1 });
  });
});
