import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInactiveVortexWaveState, createWaveSample, DEFAULT_WAVES, sampleWaveFieldInto } from '../src/ocean/WaveField';
import { WhirlpoolPresentation } from '../src/survival/events/WhirlpoolPresentation';
import type { DedicatedEventEnvironment, EventOutcomePresentation } from '../src/survival/eventPresentationTypes';

function setup() {
  const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0.88, 0.96);
  camera.updateMatrixWorld();
  const boatEffectsRoot = new Group();
  const cameraEffectsRoot = new Group();
  const vortexWave = createInactiveVortexWaveState();
  const presentation = new WhirlpoolPresentation({
    camera, boatEffectsRoot, cameraEffectsRoot, vortexWave,
    readWorldWaveAmplitudeScale: () => 1,
    supplies: { borrowEventActor: vi.fn(() => null) },
  } as unknown as DedicatedEventEnvironment);
  return { presentation, camera, boatEffectsRoot, cameraEffectsRoot, vortexWave };
}

// Importance: 95/100. The threat must exist before uncovering without enclosing or displacing the boat.
describe('whirlpool presentation', () => {
  it('stages a full vortex to the right, outside the boat wave samples', () => {
    const { presentation, camera, vortexWave } = setup();
    try {
      presentation.stage({ eventId: 'whirlpool', targetInstanceId: null, variantSeed: 0 });
      expect(presentation.worldRoot.getObjectByName('whirlpool-vortex')!.visible).toBe(true);
      expect(vortexWave.strength).toBe(1);
      const clearance = Math.hypot(vortexWave.centerX, vortexWave.centerZ) - vortexWave.radius;
      expect(clearance).toBeGreaterThan(3);
      expect(clearance).toBeLessThan(6);
      const screen = new Vector3(vortexWave.centerX, 0, vortexWave.centerZ).project(camera);
      expect(screen.x).toBeGreaterThan(0.6);
      expect(screen.x).toBeLessThan(0.85);
      expect(Math.abs(screen.y)).toBeLessThan(1);
      const normal = createWaveSample();
      const event = createWaveSample();
      for (const [x, z] of [[0, 0], [-2, -3], [2, -3], [-2, 3], [2, 3]]) {
        sampleWaveFieldInto(normal, DEFAULT_WAVES, 2, x!, z!, 1);
        sampleWaveFieldInto(event, DEFAULT_WAVES, 2, x!, z!, 1, vortexWave);
        expect(event).toEqual(normal);
      }
    } finally { presentation.dispose(); }
  });

  it('keeps the boat and camera pose through reveal, item use, reaction and cleanup', async () => {
    const { presentation, camera, boatEffectsRoot, cameraEffectsRoot, vortexWave } = setup();
    const roots = [boatEffectsRoot, cameraEffectsRoot, camera];
    const poses = roots.map(root => ({ position: root.position.clone(), quaternion: root.quaternion.clone() }));
    const check = () => roots.forEach((root, index) => {
      expect(root.position).toEqual(poses[index]!.position);
      expect(root.quaternion.toArray()).toEqual(poses[index]!.quaternion.toArray());
    });
    const advance = () => {
      for (let frame = 0; frame < 60; frame += 1) {
        presentation.update(frame * 0.1, 0.1);
        expect(vortexWave.strength).toBe(1);
        check();
      }
    };
    try {
      presentation.stage({ eventId: 'whirlpool', targetInstanceId: null, variantSeed: 0 });
      check();
      const reveal = presentation.reveal();
      advance();
      await reveal;
      const item = presentation.playItemUse('anchor', 'anchor-1');
      advance();
      await expect(item).resolves.toBe(true);
      const reaction = presentation.react({
        resourceDeltas: { hull: -20 }, lostInstanceIds: [], selectedInstanceId: null,
      } as unknown as EventOutcomePresentation);
      advance();
      await reaction;
      presentation.clear();
      check();
      expect(vortexWave.strength).toBe(0);
      expect(presentation.worldRoot.visible).toBe(false);
    } finally { presentation.dispose(); }
    check();
  });
});
