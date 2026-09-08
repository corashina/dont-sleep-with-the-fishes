import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';

describe('WeatherEventAnimator', () => {
  it('keeps the monster on the water with fog around the boat', () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    const eventModels = {
      create: vi.fn(() => ({ root: model, dispose: vi.fn() })),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    const supplies = {
      resetEventPoseForFrame: vi.fn(),
      applyEventAmbientPose: vi.fn(),
      clearEventPose: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const sampleWorldWaveInto = vi.fn((output: { height: number }, time: number) => {
      output.height = time * 0.1;
    });
    const animator = new WeatherEventAnimator(
      new Group(),
      supplies,
      eventModels,
      undefined,
      'monster-in-the-fog',
      {
        sampleWorldWaveInto,
        readWorldWaveAmplitudeScale: () => 0.75,
      },
    );
    const silhouette = animator.worldRoot.getObjectByName('fog-monster')!;
    const fog = animator.worldRoot.getObjectByName('weather-fog-monster-mist')!;

    animator.stage('monster-in-the-fog');
    expect(silhouette.position.y).toBeCloseTo(0.03);
    expect(fog.visible).toBe(true);
    fog.updateMatrixWorld(true);
    const ray = new Raycaster();
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
      ray.set(new Vector3(0, 0.7, 0), new Vector3(Math.sin(angle), 0, -Math.cos(angle)));
      const hits = ray.intersectObject(fog);
      expect(hits[0]!.distance).toBeLessThan(4.8);
      expect(hits.some((hit) => hit.distance > 10)).toBe(true);
    }

    animator.update(2, 0);
    expect(silhouette.position.y).toBeCloseTo(0.23);
    animator.update(4, 0);
    expect(silhouette.position.y).toBeCloseTo(0.43);
    expect(sampleWorldWaveInto).toHaveBeenLastCalledWith(
      expect.any(Object),
      4,
      silhouette.position.x,
      silhouette.position.z,
      0.75,
    );

    animator.clear();
    expect(fog.visible).toBe(false);
    animator.stage('shower-night');
    expect(fog.visible).toBe(false);
    animator.dispose();
  });
});
