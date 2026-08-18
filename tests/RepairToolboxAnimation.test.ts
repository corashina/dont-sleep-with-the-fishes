import { describe, expect, it, vi } from 'vitest';
import { Euler, Group, Quaternion, Vector3 } from 'three';
import {
  REPAIR_HAMMER_DURATION_SECONDS,
  REPAIR_HAMMER_PEAK_SECONDS,
  RepairToolboxAnimation,
} from '../src/survival/RepairToolboxAnimation';

describe('RepairToolboxAnimation', () => {
  it('hits the port, center, and starboard repair points on audio peaks', async () => {
    const boat = new Group();
    const toolbox = new Group();
    const hammer = new Group();
    hammer.position.set(-0.12, 0.39, 0.01);
    hammer.quaternion.setFromEuler(new Euler(0, -0.25, 0));
    toolbox.position.set(-1.05, 0.225, 0.78);
    toolbox.rotation.y = -Math.PI / 2;
    toolbox.scale.setScalar(0.72);
    toolbox.add(hammer);
    boat.add(toolbox);
    const restPosition = hammer.position.clone();
    const restQuaternion = hammer.quaternion.clone();
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);
    expect(hammer.visible).toBe(false);
    const completed = animation.play();
    expect(hammer.visible).toBe(true);

    let elapsed = 0;
    for (const [peakIndex, side, z, impactDirection, handleToHead, headY] of [
      [0, -1, 0.08, new Vector3(-1, 0, 0), new Vector3(0, 1, 0), 0.16],
      [6, 0, -0.34, new Vector3(0, -1, 0), new Vector3(1, 0, 0), null],
      [11, 1, 0.08, new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.16],
    ] as const) {
      const peak = REPAIR_HAMMER_PEAK_SECONDS[peakIndex]!;
      animation.update(peak - elapsed);
      elapsed = peak;
      expect(Math.sign(hammer.position.x)).toBe(side);
      expect(hammer.position.z).toBeCloseTo(z);
      const faceDirection = new Vector3(0, 0, -1).applyQuaternion(hammer.quaternion);
      expect(faceDirection.dot(impactDirection)).toBeCloseTo(1);
      const handleDirection = new Vector3(1, 0, 0).applyQuaternion(hammer.quaternion);
      expect(handleDirection.dot(handleToHead)).toBeCloseTo(1);
      if (headY !== null) {
        const headCenter = new Vector3(0.31, 0, 0)
          .applyQuaternion(hammer.quaternion)
          .add(hammer.position);
        expect(headCenter.y).toBeCloseTo(headY);
      }
    }

    animation.update(REPAIR_HAMMER_DURATION_SECONDS - elapsed);
    await completed;

    expect(hammer.parent).toBe(toolbox);
    expect(hammer.visible).toBe(false);
    expect(hammer.position.toArray()).toEqual(restPosition.toArray());
    expect(hammer.quaternion.angleTo(restQuaternion)).toBeCloseTo(0);
  });

  it('starts the repair sound before the first waveform peak', () => {
    const boat = new Group();
    const toolbox = new Group();
    const hammer = new Group();
    toolbox.add(hammer);
    boat.add(toolbox);
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);
    const startAudio = vi.fn();
    void animation.play(startAudio);

    animation.update(0.54);
    expect(startAudio).not.toHaveBeenCalled();
    animation.update(0.02);
    expect(startAudio).toHaveBeenCalledOnce();
    animation.cancel();
  });

  it('resets its parent and rest pose when cancelled', async () => {
    const boat = new Group();
    const toolbox = new Group();
    const hammer = new Group();
    toolbox.add(hammer);
    boat.add(toolbox);
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);
    const completed = animation.play();

    animation.update(1.5);
    animation.cancel();

    await completed;
    expect(hammer.parent).toBe(toolbox);
    expect(hammer.visible).toBe(false);
    expect(animation.active).toBe(false);
  });
});
