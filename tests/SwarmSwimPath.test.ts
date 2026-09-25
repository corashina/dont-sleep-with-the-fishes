import { describe, expect, it } from 'vitest';
import { SwarmSwimPath, SWARM_SWIM_SPEED } from '../src/survival/events/SwarmSwimPath';
import { createSwarmVariants, createSwarmSharkPose, SWARM_DISTRACTION_TARGET } from '../src/survival/events/sharkSwarmChoreography';

// Importance: 97/100. Sharks must not stop, rush, cut through the hull, or snap when food lands.
describe('shark swimming paths', () => {
  it.each([0, 42, 123456789])('keeps speed and heading through diversion for seed %s', (seed) => {
    for (const variant of createSwarmVariants(seed)) {
      const path = new SwarmSwimPath();
      const pose = createSwarmSharkPose();
      path.reset(variant);
      path.sample(19, pose);
      let previousX = pose.x;
      let previousZ = pose.z;
      let previousYaw = pose.yaw;
      let arrival = 0;
      for (let frame = 1; frame <= 4200; frame += 1) {
        const time = 19 + frame / 100;
        if (frame === 100) arrival = 20 + path.divert(20);
        path.sample(time, pose);
        expect(Math.hypot(pose.x - previousX, pose.z - previousZ) * 100).toBeCloseTo(SWARM_SWIM_SPEED, 2);
        const turn = Math.atan2(Math.sin(pose.yaw - previousYaw), Math.cos(pose.yaw - previousYaw));
        expect(Math.abs(turn)).toBeLessThan(0.02);
        expect(Math.hypot(pose.x, pose.z)).toBeGreaterThan(6);
        if (arrival > 0 && time > arrival) {
          const radius = Math.hypot(pose.x - SWARM_DISTRACTION_TARGET.x, pose.z - SWARM_DISTRACTION_TARGET.z);
          expect(radius).toBeCloseTo(variant.group % 2 === 0 ? 2.8 : 3.6, 6);
        }
        previousX = pose.x;
        previousZ = pose.z;
        previousYaw = pose.yaw;
      }
    }
  });
});
