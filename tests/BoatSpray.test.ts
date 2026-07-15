import { describe, expect, it, vi } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { BOAT_SPRAY_CAPACITY, BoatSpray } from '../src/survival/BoatSpray';

describe('BoatSpray', () => {
  it('allocates one fixed-capacity position buffer and reuses it', () => {
    const spray = new BoatSpray();
    const position = spray.points.geometry.getAttribute('position') as BufferAttribute;
    expect(position.count).toBe(BOAT_SPRAY_CAPACITY);

    for (let index = 0; index < 20; index += 1) {
      spray.emit(new Vector3(index, 1, -2), 1);
    }
    expect(spray.activeCount()).toBeLessThanOrEqual(BOAT_SPRAY_CAPACITY);
    expect(spray.points.geometry.getAttribute('position')).toBe(position);
    spray.dispose();
  });

  it('moves emitted particles and lets them expire naturally', () => {
    const spray = new BoatSpray();
    const positions = (
      spray.points.geometry.getAttribute('position') as BufferAttribute
    ).array as Float32Array;
    spray.emit(new Vector3(1, 2, 3), 0.8);
    expect(spray.activeCount()).toBeGreaterThan(0);
    const emittedPosition = Array.from(positions.slice(0, 3));

    spray.update(0.1);
    expect(Array.from(positions.slice(0, 3))).not.toEqual(emittedPosition);

    for (let index = 0; index < 10; index += 1) spray.update(0.1);
    expect(spray.activeCount()).toBe(0);
    expect(positions[1]).toBe(-1000);
    spray.dispose();
  });

  it('disposes geometry and material once through its owner', () => {
    const spray = new BoatSpray();
    const geometryDispose = vi.spyOn(spray.points.geometry, 'dispose');
    const materialDispose = vi.spyOn(spray.points.material, 'dispose');
    spray.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
