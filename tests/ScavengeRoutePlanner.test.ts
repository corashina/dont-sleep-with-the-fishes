import { describe, expect, it } from 'vitest';
import {
  SCAVENGE_DEPOSIT_ACTION_SECONDS,
  SCAVENGE_EVACUATE_ACTION_SECONDS,
  SCAVENGE_PICKUP_ACTION_SECONDS,
  planBaselineScavengeRoute,
  planExpertScavengeRoute,
  type ScavengeRouteAction,
  type ScavengeRouteAssignment,
} from '../src/game/ScavengeRoutePlanner';
import {
  SCAVENGE_SPRINT_SPEED,
  scavengeSpeedMultiplier,
} from '../src/game/scavengeMovement';

const metric = {
  distance: (left: readonly [number, number], right: readonly [number, number]) =>
    Math.abs(left[0] - right[0]),
};

const assignment = (
  instanceId: string,
  weight: 1 | 2 | 3,
  position: readonly [number, number],
  branch = false,
): ScavengeRouteAssignment => ({ instanceId, weight, position, branch });

function maxCarriedWeight(actions: readonly ScavengeRouteAction[]): number {
  let carried = 0;
  let maximum = 0;
  actions.forEach((action) => {
    if (action.type === 'pickup') carried += action.weight;
    if (action.type === 'deposit') carried = 0;
    maximum = Math.max(maximum, carried);
  });
  return maximum;
}

describe('expert scavenge route planner', () => {
  it('builds a capacity-safe route that deposits and evacuates', () => {
    const plan = planExpertScavengeRoute({
      assignments: [
        assignment('light-1', 1, [2, 0]),
        assignment('heavy-1', 2, [3, 0]),
        assignment('anchor-1', 3, [1, 0]),
      ],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    expect(plan).not.toBeNull();
    expect(plan!.savedCount).toBe(3);
    expect(plan!.actions.at(-1)?.type).toBe('evacuate');
    expect(maxCarriedWeight(plan!.actions)).toBeLessThanOrEqual(3);
  });

  it('uses the loaded speed multiplier for each move segment', () => {
    const plan = planExpertScavengeRoute({
      assignments: [assignment('heavy', 2, [1, 0])],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    const moveActions = plan!.actions.filter(
      (action): action is Extract<ScavengeRouteAction, { type: 'move' }> =>
        action.type === 'move',
    );
    expect(moveActions).toEqual([
      { type: 'move', distance: 1, carriedWeight: 0 },
      { type: 'move', distance: 1, carriedWeight: 2 },
    ]);

    const expectedSeconds =
      1 / SCAVENGE_SPRINT_SPEED
      + SCAVENGE_PICKUP_ACTION_SECONDS
      + 1 / (SCAVENGE_SPRINT_SPEED * scavengeSpeedMultiplier(2))
      + SCAVENGE_DEPOSIT_ACTION_SECONDS
      + SCAVENGE_EVACUATE_ACTION_SECONDS;
    expect(plan!.seconds).toBeCloseTo(expectedSeconds, 10);
  });

  it('returns null when an assigned spot is unreachable', () => {
    const blockedMetric = {
      distance: (left: readonly [number, number], right: readonly [number, number]) =>
        left[0] === 9 || right[0] === 9 ? null : Math.abs(left[0] - right[0]),
    };

    expect(planExpertScavengeRoute({
      assignments: [assignment('blocked', 1, [9, 0])],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric: blockedMetric,
    })).toBeNull();
  });

  it('breaks equal-distance ties by instance ID', () => {
    const plan = planExpertScavengeRoute({
      assignments: [
        assignment('zulu', 1, [1, 0]),
        assignment('alpha', 1, [-1, 0]),
      ],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    expect(plan!.actions
      .filter((action) => action.type === 'pickup')
      .map((action) => action.instanceId)).toEqual(['alpha', 'zulu']);
  });

  it('resets carried weight after each deposit', () => {
    const plan = planExpertScavengeRoute({
      assignments: [
        assignment('near', 3, [1, 0]),
        assignment('far', 3, [2, 0]),
      ],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    const carriedWeights = plan!.actions
      .filter((action) => action.type === 'move')
      .map((action) => action.carriedWeight);
    expect(carriedWeights).toEqual([0, 3, 0, 3]);
    expect(plan!.actions.filter((action) => action.type === 'deposit')).toHaveLength(2);
  });

  it('rejects routes that exceed the 60-second deadline', () => {
    expect(planExpertScavengeRoute({
      assignments: [assignment('too-far', 1, [200, 0])],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    })).toBeNull();
  });
});

describe('baseline scavenge route planner', () => {
  it('stops before a route step would cross the deadline', () => {
    const plan = planBaselineScavengeRoute({
      assignments: [
        assignment('near', 1, [1, 0]),
        assignment('deadline-blocked', 1, [7, 0]),
      ],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
      deadlineSeconds: 1,
    });

    expect(plan.seconds).toBeLessThanOrEqual(1);
    expect(plan.savedCount).toBe(1);
    expect(plan.actions.at(-1)?.type).toBe('evacuate');
    expect(plan.actions.some(
      (action) => action.type === 'pickup' && action.instanceId === 'deadline-blocked',
    )).toBe(false);
  });

  it('accepts a branch with a four-metre round-trip detour', () => {
    const plan = planBaselineScavengeRoute({
      assignments: [assignment('branch', 1, [2, 0], true)],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    expect(plan.savedCount).toBe(1);
    expect(plan.actions.some(
      (action) => action.type === 'pickup' && action.instanceId === 'branch',
    )).toBe(true);
  });

  it('skips a branch when its round-trip detour exceeds four metres', () => {
    const plan = planBaselineScavengeRoute({
      assignments: [
        assignment('main', 1, [1, 0]),
        assignment('branch', 1, [4, 0], true),
      ],
      start: [0, 0],
      deposit: [0, 0],
      evacuation: [0, 0],
      metric,
    });

    expect(plan.actions
      .filter((action) => action.type === 'pickup')
      .map((action) => action.instanceId)).toEqual(['main']);
  });
});
