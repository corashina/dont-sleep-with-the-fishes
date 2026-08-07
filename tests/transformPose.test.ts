import { describe, expect, it } from 'vitest';
import {
  copyTransformPose,
  createTransformPose,
  resetTransformPose,
} from '../src/survival/transformPose';

describe('transformPose', () => {
  it('creates and resets an identity transform in place', () => {
    const pose = createTransformPose();
    pose.x = 4;
    pose.roll = 2;
    pose.scaleY = 0.4;
    expect(resetTransformPose(pose)).toBe(pose);
    expect(pose).toEqual({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
  });

  it('copies into the caller-owned output', () => {
    const source = { ...createTransformPose(), x: 2, scaleZ: 3 };
    const output = createTransformPose();
    expect(copyTransformPose(source, output)).toBe(output);
    expect(output).toEqual(source);
  });
});
