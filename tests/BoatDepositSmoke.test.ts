import { describe, expect, it, vi } from 'vitest';
import { BoatDepositSmoke } from '../src/world/BoatDepositSmoke';

describe('BoatDepositSmoke', () => {
  it('reuses one particle buffer for a short rising and fading puff', () => {
    const smoke = new BoatDepositSmoke();
    const position = smoke.points.geometry.getAttribute('position');

    expect(smoke.snapshotForTest()).toEqual({
      active: false,
      age: 0,
      opacity: 0,
      maximumRise: 0,
    });

    smoke.trigger();
    const triggered = smoke.snapshotForTest();
    expect(triggered.active).toBe(true);
    expect(triggered.age).toBe(0);
    expect(triggered.opacity).toBeGreaterThan(0);

    smoke.update(0.25, false);
    const moving = smoke.snapshotForTest();
    expect(moving.age).toBeCloseTo(0.1);
    expect(moving.maximumRise).toBeGreaterThan(0);
    expect(moving.opacity).toBeLessThan(triggered.opacity);
    expect(smoke.points.geometry.getAttribute('position')).toBe(position);
  });

  it('fades without moving particles when reduced motion is active', () => {
    const smoke = new BoatDepositSmoke();
    smoke.trigger();

    smoke.update(0.4, true);

    expect(smoke.snapshotForTest()).toMatchObject({
      active: true,
      age: 0.1,
      maximumRise: 0,
    });
  });

  it('restarts the same puff and hides it after its fixed lifetime', () => {
    const smoke = new BoatDepositSmoke();
    smoke.trigger();
    smoke.update(0.1, false);
    smoke.update(0.1, false);
    expect(smoke.snapshotForTest().age).toBeCloseTo(0.2);

    smoke.trigger();
    expect(smoke.snapshotForTest()).toMatchObject({ active: true, age: 0 });
    for (let step = 0; step < 10; step += 1) smoke.update(0.1, false);

    expect(smoke.snapshotForTest()).toEqual({
      active: false,
      age: 0.8,
      opacity: 0,
      maximumRise: 0,
    });
    expect(smoke.points.visible).toBe(false);
  });

  it('disposes its geometry and material exactly once', () => {
    const smoke = new BoatDepositSmoke();
    const geometryDispose = vi.spyOn(smoke.points.geometry, 'dispose');
    const materialDispose = vi.spyOn(smoke.points.material, 'dispose');

    smoke.dispose();
    smoke.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
