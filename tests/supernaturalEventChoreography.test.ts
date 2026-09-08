import { describe, expect, it } from 'vitest';
import {
  createGhostFloatPaths,
  createGhostFloatPose,
  sampleGhostFloatPathInto,
} from '../src/survival/supernaturalEventChoreography';

describe('ghost movement choreography', () => {

  it('keeps moving ghosts apart throughout their routes', () => {
    const paths = createGhostFloatPaths(41);
    const poses = paths.map(() => createGhostFloatPose());

    for (let time = 0; time <= 60; time += 0.5) {
      paths.forEach((path, index) => {
        sampleGhostFloatPathInto(poses[index]!, path, time);
      });
      for (let first = 0; first < poses.length; first += 1) {
        for (let second = first + 1; second < poses.length; second += 1) {
          const firstPosition = poses[first]!.position;
          const secondPosition = poses[second]!.position;
          expect(Math.hypot(
            firstPosition[0] - secondPosition[0],
            firstPosition[2] - secondPosition[2],
          )).toBeGreaterThan(3);
        }
      }
    }
  });
});
