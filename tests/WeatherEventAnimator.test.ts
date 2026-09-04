import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';

describe('WeatherEventAnimator', () => {
  it('keeps the fog man submerged and moves him with the ocean wave', () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    const eventModels = {
      create: vi.fn(() => model),
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
      'man-in-the-fog',
      {
        sampleWorldWaveInto,
        readWorldWaveAmplitudeScale: () => 0.75,
      },
    );
    const silhouette = animator.worldRoot.getObjectByName('fog-man-silhouette')!;
    const fogLeft = animator.worldRoot.getObjectByName('weather-fog-man-mist')!;
    const fogRight = animator.worldRoot.getObjectByName('weather-fog-man-mist-right')!;

    animator.stage('man-in-the-fog');
    expect(silhouette.position.y).toBeCloseTo(-0.42);
    expect(fogLeft.visible).toBe(true);
    expect(fogLeft.scale.x).toBe(2.6);
    expect(fogRight.visible).toBe(true);
    expect(fogRight.scale.x).toBe(-2.6);

    animator.update(2, 0);
    expect(silhouette.position.y).toBeCloseTo(-0.22);
    animator.update(4, 0);
    expect(silhouette.position.y).toBeCloseTo(-0.02);
    expect(sampleWorldWaveInto).toHaveBeenLastCalledWith(
      expect.any(Object),
      4,
      -2.6,
      -8,
      0.75,
    );

    animator.dispose();
  });
});
