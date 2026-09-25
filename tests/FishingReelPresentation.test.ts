// Importance: 95/100. Automatic reeling must start at the visible bite without a position jump.
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { FishingPresentation } from '../src/survival/FishingPresentation';

it.each([[-2.6, -10.5], [2.6, -4.8]])
('reels close before lifting for cast x=%s, z=%s', async (x, z) => {
  const root = new Group();
  const rodPivot = new Group();
  const rod = new Mesh(new BoxGeometry(0.05, 0.05, 2), new MeshStandardMaterial());
  const catchModel = new Mesh(new BoxGeometry(0.3, 0.1, 0.1), new MeshStandardMaterial());
  const camera = new PerspectiveCamera(80, 16 / 9);
  root.add(rodPivot);
  rodPivot.add(rod);
  const waveHeight = (time: number, worldX: number, worldZ: number): number =>
    0.17 + Math.sin(time * 2 + worldX + worldZ) * 0.03;
  const presentation = new FishingPresentation({
    camera,
    cameraControl: { restoreBasePose: vi.fn(), interpolateToBasePose: vi.fn() },
    resetBasePresentation: vi.fn(),
    sampleWaveInto: (output, time, worldX, worldZ) => {
      output.height = waveHeight(time, worldX, worldZ);
    },
    waveAmplitudeScale: () => 1,
    rodPivot, rod, boatRoot: root, worldRoot: root,
    catches: { prepare: vi.fn(async () => catchModel), hide: vi.fn(), dispose: vi.fn() },
    biteParticles: { points: new Group(), emit: vi.fn(), update: vi.fn(), reset: vi.fn(), dispose: vi.fn() },
  });
  try {
    presentation.showBite({ x, z });
    const bobber = presentation.root.getObjectByName('fishing-bobber')!;
    presentation.moveBite({ x, z }, 0.4);
    expect(Math.abs(bobber.position.x - x)).toBeCloseTo(0.4);
    const bitePosition = bobber.position.clone();
    const reeling = presentation.playReel('cod');
    await Promise.resolve();
    const display = presentation.root.getObjectByName('fishing-catch-display')!;
    expect(display.position.distanceTo(bitePosition)).toBeLessThan(1e-8);
    // Importance: 95/100. Clicking reel must not reveal the reward while it is still in the water.
    expect(bobber.visible).toBe(true);
    expect(display.visible).toBe(false);
    const destination = root.getObjectByName('fishing-catch-rest')!.getWorldPosition(new Vector3());
    const previousPosition = bitePosition.clone();
    let retrievedWidth = 0;
    const rodRotationY = rodPivot.rotation.y;
    const rodRotationZ = rodPivot.rotation.z;
    // Importance: 95/100. Retrieve at the surface before lifting; all stage transitions must stay continuous.
    for (let frame = 1; frame <= 198; frame++) {
      presentation.update(frame / 60, 1 / 60);
      // Importance: 95/100. Reeling must never sweep the rod sideways.
      expect(rodPivot.rotation.y).toBe(rodRotationY);
      expect(rodPivot.rotation.z).toBe(rodRotationZ);
      const position = display.getWorldPosition(new Vector3());
      expect(position.y).toBeLessThanOrEqual(destination.y + 0.65);
      expect(position.distanceTo(previousPosition)).toBeLessThan(frame >= 192 ? 0.005 : 0.25);
      if (frame <= 96) {
        expect(Math.abs(position.y - bitePosition.y)).toBeLessThan(0.08);
        expect(bobber.visible).toBe(true);
        expect(display.visible).toBe(false);
        expect(bobber.getWorldPosition(new Vector3()).distanceTo(position)).toBeLessThan(1e-8);
      }
      // Importance: 95/100. The catch must follow the water at its moving position, not at the cast point.
      if (frame >= 30 && frame <= 90) {
        expect(position.y).toBeCloseTo(waveHeight(frame / 60, position.x, position.z), 8);
      }
      if (frame === 90) {
        expect(position.z).toBeGreaterThan(-3.7);
        expect(position.z).toBeLessThan(-3);
      }
      // Importance: 95/100. Once reeled close, the reward must rise and approach through the center.
      if (frame >= 90) {
        camera.updateMatrixWorld(true);
        expect(Math.abs(position.clone().project(camera).x)).toBeLessThan(0.01);
      }
      if (frame === 138) {
        expect(bobber.visible).toBe(false);
        expect(display.visible).toBe(true);
        expect(position.y).toBeGreaterThan(1);
        expect(position.z).toBeLessThan(-3);
      }
      // Importance: 95/100. Lifting must not make the approaching catch visibly shrink.
      if (frame === 90 || frame === 138) {
        camera.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(catchModel);
        const left = new Vector3(bounds.min.x, position.y, position.z).project(camera);
        const right = new Vector3(bounds.max.x, position.y, position.z).project(camera);
        const width = right.x - left.x;
        if (frame === 90) retrievedWidth = width;
        else expect(width).toBeGreaterThanOrEqual(retrievedWidth * 0.9);
      }
      previousPosition.copy(position);
    }
    await reeling;
    expect(display.parent!.name).toBe('fishing-catch-rest');
    expect(display.visible).toBe(true);
    expect(display.getWorldPosition(new Vector3()).distanceTo(destination)).toBeLessThan(1e-8);
    expect(display.getWorldPosition(new Vector3()).distanceTo(camera.position)).toBeLessThan(0.25);
    expect(rodPivot.rotation.x).toBe(0);
  } finally {
    presentation.dispose();
    rod.geometry.dispose();
    rod.material.dispose();
    catchModel.geometry.dispose();
    catchModel.material.dispose();
  }
});
