import { BufferAttribute, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';

describe('FishingBiteParticles', () => {
  it('lets scaled leak particles fall below their source before they expire', () => {
    const particles = new FishingBiteParticles(3);
    particles.emit(new Vector3(0, 0.2, 0), 0.24);

    for (let frame = 0; frame < 6; frame += 1) particles.update(0.1);

    const positions = particles.points.geometry.getAttribute('position') as BufferAttribute;
    expect(particles.activeCount()).toBeGreaterThan(0);
    expect(Array.from({ length: particles.activeCount() }, (_, index) => (
      positions.getY(index)
    )).some((y) => y < 0.2)).toBe(true);

    particles.dispose();
  });
});
