import { AnimationClip, Group, NumberKeyframeTrack } from 'three';
import { expect, it, vi } from 'vitest';
import { UnderwaterMenuAnimator } from '../src/menu/UnderwaterMenuAnimator';
import { createMenuMotionSample, sampleMenuMotionInto } from '../src/menu/menuChoreography';

it('updates actor transforms without replacing actor objects', () => {
  const sharks = [new Group(), new Group()] as const;
  const fishSchools = [new Group(), new Group()] as const;
  const clip = new AnimationClip('Armature|Swim', 1.25, [
    new NumberKeyframeTrack('.rotation[y]', [0, 1.25], [0, 0.1]),
  ]);
  const setPlantTime = vi.fn();
  const setBubbleTime = vi.fn();
  const setMatterTime = vi.fn();
  const setCausticStrength = vi.fn();
  const animator = new UnderwaterMenuAnimator({
    sharks: sharks.map((root) => ({ root, clip })) as never,
    fishSchools,
    setPlantTime,
    setBubbleTime,
    setMatterTime,
    setCausticStrength,
  });

  animator.update(1, 0.016);
  const expected = sampleMenuMotionInto(createMenuMotionSample(), 1);
  expect(sharks[0].position.length()).toBeGreaterThan(0);
  expect(fishSchools[0].position.length()).toBeGreaterThan(0);
  expect(sharks[0].position.toArray()).toEqual(expected.sharks[0].position);
  expect(fishSchools[0].position.toArray()).toEqual(expected.fishSchools[0].position);
  expect(sharks[0].rotation.y).toBeCloseTo(Math.atan2(
    expected.sharks[0].tangent[0],
    expected.sharks[0].tangent[2],
  ));
  expect(setPlantTime).toHaveBeenCalledWith(1);
  expect(setBubbleTime).toHaveBeenCalledWith(1);
  expect(setMatterTime).toHaveBeenCalledWith(1);
  expect(setCausticStrength).toHaveBeenCalledWith(expected.causticStrength);
  animator.dispose();
  animator.dispose();
});
