// Importance: 10/10 (scaled from 5/5). Protects vertical player navigation.
import { describe,expect,it } from 'vitest';
import {
  resolveLadderTraversal,
  type LadderClimbZone,
} from '../src/player/LadderTraversal';

const crewZone: LadderClimbZone = {
  id: 'crew-ladder',
  climbX: 0,
  climbZ: 4,
  outwardX: 0,
  outwardZ: -1,
  bottomEyeY: 3.72,
  topEyeY: 6.42,
  topFloor: { minX: -3, maxX: 3, minZ: 4, maxZ: 8 },
  bottomEntry: { minX: -0.4, maxX: 0.4, minZ: 3.6, maxZ: 3.9 },
  topEntry: { minX: -0.4, maxX: 0.4, minZ: 3.6, maxZ: 3.9 },
  bottomDismount: [0, 3.5],
  topDismount: [0, 4.5],
};

describe('resolveLadderTraversal', () => {

  it('does not capture an idle player in a ladder entry area', () => {
    const input = {
      position: { x: 0, y: 3.72, z: 3.7 },
      activeLadderId: null,
      planarMovement: [0, 0] as const,
      verticalInput: 0,
      deltaSeconds: 0.1,
      floorEyeY: 3.72,
    };

    expect(resolveLadderTraversal(input, [crewZone])).toEqual({
      position: input.position,
      activeLadderId: null,
      floorEyeY: 3.72,
      consumed: false,
    });
  });

  it('does not capture a player moving away from a bottom ladder entry', () => {
    const result = resolveLadderTraversal({
      position: { x: 0, y: 3.72, z: 3.7 },
      activeLadderId: null,
      planarMovement: [0, -0.2],
      verticalInput: 0,
      deltaSeconds: 0.1,
      floorEyeY: 3.72,
    }, [crewZone]);

    expect(result.consumed).toBe(false);
    expect(result.activeLadderId).toBeNull();
  });

  it('aligns toward the climb line without snapping or climbing vertically', () => {
    const start = { x: 0.3, y: crewZone.bottomEyeY, z: 3.7 };
    const startDistance = Math.hypot(
      start.x - crewZone.climbX,
      start.z - crewZone.climbZ,
    );
    const result = resolveLadderTraversal({
      position: start,
      activeLadderId: 'crew-ladder',
      planarMovement: [0, 0.2],
      verticalInput: 1,
      deltaSeconds: 0.05,
      floorEyeY: crewZone.bottomEyeY,
    }, [crewZone]);
    const resultDistance = Math.hypot(
      result.position.x - crewZone.climbX,
      result.position.z - crewZone.climbZ,
    );

    expect(result.position.y).toBe(start.y);
    expect(resultDistance).toBeGreaterThan(0);
    expect(resultDistance).toBeLessThan(startDistance);
    expect(result.activeLadderId).toBe('crew-ladder');
    expect(result.consumed).toBe(true);
  });

  it('releases an absent active ladder without moving the player', () => {
    const input = {
      position: { x: 1, y: 5, z: 2 },
      activeLadderId: 'removed-ladder',
      planarMovement: [0, 0] as const,
      verticalInput: 1,
      deltaSeconds: 1,
      floorEyeY: 3.72,
    };

    expect(resolveLadderTraversal(input, [crewZone])).toEqual({
      position: input.position,
      activeLadderId: null,
      floorEyeY: 3.72,
      consumed: false,
    });
  });

  it('clamps a large upward traversal delta to the top dismount', () => {
    const result = resolveLadderTraversal({
      position: { x: 0, y: 4, z: 4 },
      activeLadderId: 'crew-ladder',
      planarMovement: [0, 0],
      verticalInput: 1,
      deltaSeconds: 10,
      floorEyeY: 3.72,
    }, [crewZone]);

    expect(result.position).toEqual({ x: 0, y: 6.42, z: 4.5 });
    expect(result.activeLadderId).toBeNull();
    expect(result.floorEyeY).toBe(6.42);
  });
});
