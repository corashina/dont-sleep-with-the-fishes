import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import {
  createEventItemUseSample,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

// Importance: 95/100. Protects the fixed player position, simultaneous aim/zoom, and camera recovery.
describe('binocular item camera', () => {
  // Importance: 95/100. Prevents the visible binocular body crossing the camera near plane.
  it('keeps the raised model outside the near plane and hides it when zoom starts', () => {
    const sample = createEventItemUseSample();
    const halfDepth = ITEM_MODEL_SPECS.spyglass.targetLongestDimension / 2;
    const nearPlane = 0.1;
    let visibleFrames = 0;
    for (let frame = 340; frame <= 1000; frame += 1) {
      sampleEventItemUse('binocular-look', 'spyglass', frame / 1000, sample);
      if (sample.itemVisible) {
        visibleFrames += 1;
        expect(sample.viewZ + halfDepth * sample.scaleZ).toBeLessThan(-nearPlane);
      }
      if (sample.fovScale < 1) expect(sample.itemVisible).toBe(false);
    }
    expect(visibleFrames).toBeGreaterThan(100);
  });

  function setup() {
    const boat = new Group();
    boat.position.set(3, 0.4, -2);
    boat.rotation.set(0.08, 0.5, -0.06);
    const camera = new PerspectiveCamera(60);
    camera.position.set(0, 0.88, 0.96);
    boat.add(camera);
    const target = new Group();
    target.position.set(9, 1, -12);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    adapter.begin({
      instanceId: 'binoculars' as ItemInstanceId,
      root: new Group(), applyPose: vi.fn(), release: vi.fn(), releaseOnNextSync: vi.fn(),
    }, 'spyglass', target);
    return { camera, target, adapter, sample: createEventItemUseSample() };
  }

  it('keeps the player at the back throughout binocular use', () => {
    const { camera, adapter, sample } = setup();
    try {
      const start = camera.position.clone();
      for (let frame = 0; frame <= 100; frame += 1) {
        sampleEventItemUse('binocular-look', 'spyglass', frame / 100, sample);
        adapter.apply(sample);
        expect(camera.position.equals(start)).toBe(true);
      }
    } finally { adapter.dispose(); }
  });

  it('turns and zooms with the same progress from the back', () => {
    const { camera, target, adapter, sample } = setup();
    try {
      const baseRotation = camera.quaternion.clone();
      const start = camera.position.clone();
      camera.lookAt(target.position);
      const targetRotation = camera.quaternion.clone();
      const fullAngle = baseRotation.angleTo(targetRotation);
      for (const progress of [0.5, 0.52, 0.57, 0.61, 0.64, 0.9]) {
        sampleEventItemUse('binocular-look', 'spyglass', progress, sample);
        adapter.apply(sample);
        const zoomProgress = (60 - camera.fov) / (60 * 0.62);
        expect(sample.cameraTargetBlend).toBeCloseTo(zoomProgress, 8);
        expect(baseRotation.angleTo(camera.quaternion) / fullAngle).toBeCloseTo(zoomProgress, 6);
        expect(camera.position.equals(start)).toBe(true);
      }
    } finally { adapter.dispose(); }
  });

  it('keeps the player in place during recovery and restores the camera after cancellation', () => {
    const { camera, adapter, sample } = setup();
    const start = camera.position.clone();
    const rotation = camera.quaternion.clone();
    try {
      sampleEventItemUse('binocular-look', 'spyglass', 1, sample);
      adapter.apply(sample);
      expect(camera.position.equals(start)).toBe(true);
      sampleEventItemOutcome('binocular-look', 'spyglass', 'recover', 0, sample);
      adapter.apply(sample);
      expect(camera.position.equals(start)).toBe(true);
      sampleEventItemOutcome('binocular-look', 'spyglass', 'recover', 0.5, sample);
      adapter.apply(sample);
      expect(camera.position.equals(start)).toBe(true);
      sampleEventItemOutcome('binocular-look', 'spyglass', 'recover', 1, sample);
      adapter.apply(sample);
      expect(camera.position.equals(start)).toBe(true);
      expect(camera.fov).toBe(60);
      sampleEventItemUse('binocular-look', 'spyglass', 0.7, sample);
      adapter.apply(sample);
      adapter.clear();
      expect(camera.position.equals(start)).toBe(true);
      expect(camera.quaternion.equals(rotation)).toBe(true);
      expect(camera.fov).toBe(60);
    } finally { adapter.dispose(); }
  });
});
