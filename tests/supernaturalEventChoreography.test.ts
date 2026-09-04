import { describe, expect, it } from 'vitest';
import {
  createGhostFloatPaths,
  createGhostFloatPose,
  sampleGhostFloatPathInto,
} from '../src/survival/supernaturalEventChoreography';

describe('ghost movement choreography', () => {
  it('creates stable, event-specific paths from the variant seed', () => {
    const first = createGhostFloatPaths(17);

    expect(createGhostFloatPaths(17)).toEqual(first);
    expect(createGhostFloatPaths(18)).not.toEqual(first);
  });

  it('keeps each ghost in a separate movement corridor', () => {
    const paths = createGhostFloatPaths(17);

    for (let first = 0; first < paths.length; first += 1) {
      for (let second = first + 1; second < paths.length; second += 1) {
        const firstCenter = paths[first]!.center;
        const secondCenter = paths[second]!.center;
        const separation = Math.hypot(
          firstCenter[0] - secondCenter[0],
          firstCenter[2] - secondCenter[2],
        );
        expect(separation).toBeGreaterThan(5.5);
      }
    }
  });

  it('gives each ghost a distinct smooth wander', () => {
    const paths = createGhostFloatPaths(29);
    const pose = createGhostFloatPose();
    const samples = paths.map((path) => {
      sampleGhostFloatPathInto(pose, path, 7.25);
      return [...pose.position, ...pose.tangent];
    });

    expect(new Set(samples.map((sample) => sample.join(','))).size).toBe(paths.length);
    for (const sample of samples) {
      expect(sample.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(sample[3]!, sample[5]!)).toBeGreaterThan(0.1);
    }
  });

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
