import {
  InstancedMesh,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DivePresentation } from '../src/survival/DivePresentation';

function createFixture() {
  const camera = new PerspectiveCamera();
  camera.position.set(1.2, 2.4, -0.8);
  camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.32);
  const initialPosition = camera.position.clone();
  const initialQuaternion = camera.quaternion.clone();
  const presentation = new DivePresentation({
    camera,
    starboardPosition: new Vector3(2, 2.4, -0.8),
    starboardQuaternion: new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.62,
    ),
  });
  return { camera, initialPosition, initialQuaternion, presentation };
}

describe('DivePresentation', () => {
  it('moves to starboard, settles goggles, enters water, and fires impact once', async () => {
    const { camera, presentation } = createFixture();
    const impact = vi.fn();
    const pending = presentation.start(impact);
    presentation.update(1.1, 1.1, 0.2);
    expect(camera.position.x).toBeGreaterThan(1.8);
    expect(presentation.root.getObjectByName('dive-goggles')?.visible).toBe(true);
    presentation.update(3.6, 2.5, 0.2);
    presentation.update(4.0, 0.4, 0.2);
    expect(impact).toHaveBeenCalledOnce();
    expect(presentation.root.getObjectByName('dive-water-veil')?.visible).toBe(true);
    presentation.update(5.8, 1.8, 0.2);
    await pending;
  });

  it('reuses one fixed bubble pool without adding children during updates', () => {
    const { presentation } = createFixture();
    const bubbles = presentation.root.getObjectByName('dive-bubbles')!;
    const count = bubbles.children.length;
    expect(bubbles).toBeInstanceOf(InstancedMesh);
    expect((bubbles as InstancedMesh).count).toBe(56);
    void presentation.start(() => undefined);
    for (let frame = 0; frame < 120; frame += 1) {
      presentation.update(frame / 60, 1 / 60, 0.2);
    }
    expect(bubbles.children).toHaveLength(count);
  });

  it('restores the original pose after a restart from natural completion', async () => {
    const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
    const first = presentation.start(() => undefined);
    presentation.update(5.8, 5.8, 0.2);
    await first;

    const second = presentation.start(() => undefined);
    presentation.clear();
    await second;

    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
  });

  it.each(['clear', 'dispose', 'start'] as const)(
    'does not continue an update after impact calls %s',
    async (action) => {
      const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
      let replacement: Promise<void> | undefined;
      let replacementSettled = false;
      const first = presentation.start(() => {
        if (action === 'start') {
          replacement = presentation.start(() => undefined);
          void replacement.then(() => {
            replacementSettled = true;
          });
          return;
        }
        presentation[action]();
      });
      presentation.update(5.8, 5.8, 0.2);
      await first;
      if (action === 'start') {
        expect(replacementSettled).toBe(false);
        presentation.clear();
        await replacement;
      }

      expect(camera.position.toArray()).toEqual(initialPosition.toArray());
      expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    },
  );

  it.each(['clear', 'settleForVisibilityChange', 'dispose'] as const)(
    '%s restores the exact camera pose and settles the active handle',
    async (method) => {
      const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
      const pending = presentation.start(() => undefined);
      presentation.update(2.8, 2.8, 0.2);
      presentation[method]();
      await pending;
      expect(camera.position.toArray()).toEqual(initialPosition.toArray());
      expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    },
  );
});
