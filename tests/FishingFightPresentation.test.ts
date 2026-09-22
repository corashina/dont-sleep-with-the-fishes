// Importance: 95/100. Hooking must preserve the visible target instead of moving it toward the screen center.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { expect, it, vi } from 'vitest';
import { FishingPresentation } from '../src/survival/FishingPresentation';
import type { FishingAttemptView } from '../src/survival/FishingSession';

it.each([-2.6, 0, 2.6])('keeps a hooked bite at its position for cast x=%s', (x) => {
  const root = new Group();
  const rodPivot = new Group();
  const rod = new Mesh(new BoxGeometry(0.05, 0.05, 2), new MeshStandardMaterial());
  root.add(rodPivot);
  rodPivot.add(rod);
  const presentation = new FishingPresentation({
    camera: new PerspectiveCamera(80, 16 / 9),
    cameraControl: { restoreBasePose: vi.fn(), interpolateToBasePose: vi.fn() },
    resetBasePresentation: vi.fn(),
    sampleWaveInto: (output) => { output.height = 0; },
    waveAmplitudeScale: () => 1,
    rodPivot, rod, boatRoot: root, worldRoot: root,
    catches: { prepare: vi.fn(async () => null), hide: vi.fn(), dispose: vi.fn() },
    biteParticles: { points: new Group(), emit: vi.fn(), update: vi.fn(), reset: vi.fn(), dispose: vi.fn() },
  });
  const view: FishingAttemptView = {
    id: 'continuity', state: 'bite', castPoint: { x, z: -6.4 }, result: null,
    fishOffset: 0.2, rodPull: 0, fightSeconds: 0,
  };
  try {
    presentation.showBite(view.castPoint!);
    presentation.updateFight(view);
    const bobber = presentation.root.getObjectByName('fishing-bobber')!;
    const hookedX = bobber.position.x;
    for (const fightSeconds of [0, 0.1, 0.4, 1]) {
      presentation.updateFight({ ...view, state: 'fighting', fishOffset: 0, fightSeconds });
      expect(bobber.position.x).toBeCloseTo(hookedX);
    }
    presentation.updateFight({ ...view, state: 'fighting', fishOffset: -0.1, fightSeconds: 1 });
    expect(bobber.position.x).toBeCloseTo(hookedX - 0.165);
  } finally {
    presentation.dispose();
    rod.geometry.dispose();
    rod.material.dispose();
  }
});
