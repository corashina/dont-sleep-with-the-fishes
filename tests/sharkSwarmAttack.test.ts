import { describe, expect, it } from 'vitest';
import { createSwarmSharkPose } from '../src/survival/events/sharkSwarmChoreography';
import { sampleSwarmBreach } from '../src/survival/events/sharkSwarmAttack';

const start = { x: 4, y: -0.3, z: -7 };
const launch = { x: 0, y: 0.02, z: -6 };
const player = { x: 0, y: 0.88, z: 0.78 };

describe('shark breach', () => {
  // Importance: 96/100. The mouth must rise, descend, and end at the player without a turn or position jump.
  it('follows a smooth arc from the bow and holds the final bite', () => {
    let previousZ = launch.z;
    let peakY = launch.y;
    let descending = false;
    let previousY = launch.y;
    for (let frame = 0; frame <= 200; frame += 1) {
      const pose = createSwarmSharkPose();
      sampleSwarmBreach(frame / 200, start, launch, player, pose);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      if (frame === 0) expect([pose.x, pose.y, pose.z]).toEqual([start.x, start.y, start.z]);
      if (frame === 40) expect([pose.x, pose.y, pose.z]).toEqual([launch.x, launch.y, launch.z]);
      if (frame >= 40) {
        expect(pose.x).toBe(0);
        expect(pose.z).toBeGreaterThanOrEqual(previousZ);
        expect(Math.abs(pose.y - previousY)).toBeLessThan(0.12);
        if (frame > 180) {
          expect(pose.y).toBeLessThan(previousY);
          expect(pose.pitch).toBeGreaterThan(0);
          descending = true;
        }
        previousZ = pose.z;
        previousY = pose.y;
        peakY = Math.max(peakY, pose.y);
      }
      if (frame === 200) {
        expect(pose.x).toBeCloseTo(player.x);
        expect(pose.y).toBeCloseTo(player.y);
        expect(pose.z).toBeCloseTo(player.z);
        expect(pose.biteWeight).toBe(1);
        expect(pose.biteProgress).toBe(0.16);
      }
    }
    expect(peakY).toBeGreaterThan(player.y + 0.8);
    expect(descending).toBe(true);
  });
});
