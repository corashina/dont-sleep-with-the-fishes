import { type ShipRouteMetric } from '../world/ShipLayout';
import {
  SCAVENGE_SPRINT_SPEED,
  scavengeSpeedMultiplier,
} from './scavengeMovement';

export const SCAVENGE_PICKUP_ACTION_SECONDS = 0.18;
export const SCAVENGE_DEPOSIT_ACTION_SECONDS = 0.28;
export const SCAVENGE_EVACUATE_ACTION_SECONDS = 0.1;

const SCAVENGE_CAPACITY = 3;
const EXPERT_BEAM_WIDTH = 256;
const EXPERT_NEAREST_ITEM_LIMIT = 6;
const BASELINE_ITEM_RANGE = 8;
const BASELINE_MAX_BRANCH_DETOUR = 4;
const DEFAULT_DEADLINE_SECONDS = 60;
const EXPERT_CACHE_LIMIT = 128;

const expertPlanCache = new WeakMap<
  ShipRouteMetric,
  Map<string, ScavengeRoutePlan | null>
>();

type Position = readonly [number, number];

export interface ScavengeRouteAssignment {
  readonly instanceId: string;
  readonly weight: 1 | 2 | 3;
  readonly position: Position;
  readonly branch: boolean;
}

export type ScavengeRouteAction =
  | { readonly type: 'move'; readonly distance: number; readonly carriedWeight: number }
  | { readonly type: 'pickup'; readonly instanceId: string; readonly weight: 1 | 2 | 3 }
  | { readonly type: 'deposit'; readonly instanceIds: readonly string[] }
  | { readonly type: 'evacuate' };

export interface ScavengeRoutePlan {
  readonly seconds: number;
  readonly savedCount: number;
  readonly actions: readonly ScavengeRouteAction[];
}

export interface ScavengeRouteInput {
  readonly assignments: readonly ScavengeRouteAssignment[];
  readonly start: Position;
  readonly deposit: Position;
  readonly evacuation: Position;
  readonly metric: ShipRouteMetric;
  readonly deadlineSeconds?: number;
}

interface ExpertState {
  readonly remainingMask: bigint;
  readonly current: Position;
  readonly positionKey: string;
  readonly carriedIds: readonly string[];
  readonly carriedWeight: number;
  readonly seconds: number;
  readonly actions: readonly ScavengeRouteAction[];
  readonly tieKey: string;
}

interface ReachableAssignment {
  readonly index: number;
  readonly distance: number;
  readonly assignment: ScavengeRouteAssignment;
}

function deadlineFor(input: ScavengeRouteInput): number {
  if (input.deadlineSeconds === undefined) return DEFAULT_DEADLINE_SECONDS;
  if (!Number.isFinite(input.deadlineSeconds)) return 0;
  return Math.max(0, input.deadlineSeconds);
}

function routeDistance(
  metric: ShipRouteMetric,
  from: Position,
  to: Position,
): number | null {
  const distance = metric.distance(from, to);
  if (distance === null || !Number.isFinite(distance) || distance < 0) return null;
  return distance;
}

function moveSeconds(distance: number, carriedWeight: number): number {
  return distance / (
    SCAVENGE_SPRINT_SPEED * scavengeSpeedMultiplier(carriedWeight)
  );
}

function appendMove(
  actions: readonly ScavengeRouteAction[],
  distance: number,
  carriedWeight: number,
): readonly ScavengeRouteAction[] {
  if (distance === 0) return actions;
  return [...actions, { type: 'move', distance, carriedWeight }];
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareStates(left: ExpertState, right: ExpertState): number {
  const seconds = left.seconds - right.seconds;
  return seconds === 0 ? compareText(left.tieKey, right.tieKey) : seconds;
}

function isRemaining(mask: bigint, index: number): boolean {
  return (mask & (1n << BigInt(index))) !== 0n;
}

function removeRemaining(mask: bigint, index: number): bigint {
  return mask & ~(1n << BigInt(index));
}

function expertItemTransitions(
  input: ScavengeRouteInput,
  state: ExpertState,
  deadline: number,
): readonly ExpertState[] {
  const reachable: ReachableAssignment[] = [];

  input.assignments.forEach((candidate, index) => {
    if (!isRemaining(state.remainingMask, index)) return;
    if (state.carriedWeight + candidate.weight > SCAVENGE_CAPACITY) return;
    const distance = routeDistance(input.metric, state.current, candidate.position);
    if (distance === null) return;
    reachable.push({ index, distance, assignment: candidate });
  });

  reachable.sort((left, right) =>
    left.distance - right.distance
    || compareText(left.assignment.instanceId, right.assignment.instanceId)
    || left.index - right.index
  );

  return reachable.slice(0, EXPERT_NEAREST_ITEM_LIMIT).flatMap((candidate) => {
    const seconds = state.seconds
      + moveSeconds(candidate.distance, state.carriedWeight)
      + SCAVENGE_PICKUP_ACTION_SECONDS;
    if (seconds > deadline) return [];

    const movedActions = appendMove(
      state.actions,
      candidate.distance,
      state.carriedWeight,
    );
    return [{
      remainingMask: removeRemaining(state.remainingMask, candidate.index),
      current: candidate.assignment.position,
      positionKey: `item:${candidate.index}`,
      carriedIds: [...state.carriedIds, candidate.assignment.instanceId],
      carriedWeight: state.carriedWeight + candidate.assignment.weight,
      seconds,
      actions: [
        ...movedActions,
        {
          type: 'pickup' as const,
          instanceId: candidate.assignment.instanceId,
          weight: candidate.assignment.weight,
        },
      ],
      tieKey: `${state.tieKey}|pickup:${candidate.assignment.instanceId}`,
    }];
  });
}

function expertDepositTransition(
  input: ScavengeRouteInput,
  state: ExpertState,
  deadline: number,
): ExpertState | null {
  if (state.carriedWeight === 0) return null;
  const distance = routeDistance(input.metric, state.current, input.deposit);
  if (distance === null) return null;
  const seconds = state.seconds
    + moveSeconds(distance, state.carriedWeight)
    + SCAVENGE_DEPOSIT_ACTION_SECONDS;
  if (seconds > deadline) return null;

  return {
    remainingMask: state.remainingMask,
    current: input.deposit,
    positionKey: 'deposit',
    carriedIds: [],
    carriedWeight: 0,
    seconds,
    actions: [
      ...appendMove(state.actions, distance, state.carriedWeight),
      { type: 'deposit', instanceIds: state.carriedIds },
    ],
    tieKey: `${state.tieKey}|deposit`,
  };
}

function finishExpertRoute(
  input: ScavengeRouteInput,
  state: ExpertState,
  deadline: number,
): ScavengeRoutePlan | null {
  if (state.remainingMask !== 0n || state.carriedWeight !== 0) return null;
  const distance = routeDistance(input.metric, state.current, input.evacuation);
  if (distance === null) return null;
  const seconds = state.seconds
    + moveSeconds(distance, 0)
    + SCAVENGE_EVACUATE_ACTION_SECONDS;
  if (seconds > deadline) return null;

  return {
    seconds,
    savedCount: input.assignments.length,
    actions: [
      ...appendMove(state.actions, distance, 0),
      { type: 'evacuate' },
    ],
  };
}

function stateKey(state: ExpertState): string {
  return `${state.remainingMask}|${state.positionKey}|${state.carriedWeight}`;
}

function keepCheapestStates(states: readonly ExpertState[]): readonly ExpertState[] {
  const cheapest = new Map<string, ExpertState>();
  states.forEach((state) => {
    const key = stateKey(state);
    const current = cheapest.get(key);
    if (current === undefined || compareStates(state, current) < 0) {
      cheapest.set(key, state);
    }
  });
  return [...cheapest.values()].sort(compareStates).slice(0, EXPERT_BEAM_WIDTH);
}

function expertCacheKey(input: ScavengeRouteInput, deadline: number): string {
  return JSON.stringify([
    deadline,
    input.start,
    input.deposit,
    input.evacuation,
    input.assignments.map((value) => [
      value.instanceId,
      value.weight,
      value.position,
      value.branch,
    ]),
  ]);
}

function immutablePlan(plan: ScavengeRoutePlan): ScavengeRoutePlan {
  const actions = plan.actions.map((action) => Object.freeze(
    action.type === 'deposit'
      ? { ...action, instanceIds: Object.freeze([...action.instanceIds]) }
      : { ...action },
  ));
  return Object.freeze({ ...plan, actions: Object.freeze(actions) });
}

export function planExpertScavengeRoute(
  input: ScavengeRouteInput,
): ScavengeRoutePlan | null {
  const deadline = deadlineFor(input);
  let cache = expertPlanCache.get(input.metric);
  if (!cache) {
    cache = new Map();
    expertPlanCache.set(input.metric, cache);
  }
  const cacheKey = expertCacheKey(input, deadline);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const fullMask = (1n << BigInt(input.assignments.length)) - 1n;
  let beam: readonly ExpertState[] = [{
    remainingMask: fullMask,
    current: input.start,
    positionKey: 'start',
    carriedIds: [],
    carriedWeight: 0,
    seconds: 0,
    actions: [],
    tieKey: '',
  }];
  let bestPlan: ScavengeRoutePlan | null = null;
  const maximumTransitions = input.assignments.length * 2 + 1;

  for (let transition = 0; transition <= maximumTransitions && beam.length > 0; transition += 1) {
    const expanded: ExpertState[] = [];
    beam.forEach((state) => {
      const plan = finishExpertRoute(input, state, deadline);
      if (plan !== null) {
        if (bestPlan === null || plan.seconds < bestPlan.seconds) bestPlan = plan;
        return;
      }

      expanded.push(...expertItemTransitions(input, state, deadline));
      const deposit = expertDepositTransition(input, state, deadline);
      if (deposit !== null) expanded.push(deposit);
    });
    beam = keepCheapestStates(expanded);
  }

  const cachedPlan = bestPlan ? immutablePlan(bestPlan) : null;
  if (cache.size >= EXPERT_CACHE_LIMIT) cache.clear();
  cache.set(cacheKey, cachedPlan);
  return cachedPlan;
}

function baselineBranchDetour(
  input: ScavengeRouteInput,
  current: Position,
  candidate: ScavengeRouteAssignment,
  distanceToCandidate: number,
): number | null {
  const candidateToDeposit = routeDistance(
    input.metric,
    candidate.position,
    input.deposit,
  );
  const directToDeposit = routeDistance(input.metric, current, input.deposit);
  if (candidateToDeposit === null || directToDeposit === null) return null;
  return distanceToCandidate + candidateToDeposit - directToDeposit;
}

function findBaselineCandidate(
  input: ScavengeRouteInput,
  remaining: ReadonlySet<number>,
  current: Position,
  carriedWeight: number,
): ReachableAssignment | null {
  const main: ReachableAssignment[] = [];
  const branch: ReachableAssignment[] = [];

  remaining.forEach((index) => {
    const candidate = input.assignments[index];
    if (candidate === undefined) return;
    if (carriedWeight + candidate.weight > SCAVENGE_CAPACITY) return;
    const distance = routeDistance(input.metric, current, candidate.position);
    if (distance === null) return;
    if (distance > BASELINE_ITEM_RANGE
      && (carriedWeight > 0 || candidate.branch)) return;
    const reachable = { index, distance, assignment: candidate };
    if (!candidate.branch) {
      main.push(reachable);
      return;
    }
    const detour = baselineBranchDetour(input, current, candidate, distance);
    if (detour !== null && detour <= BASELINE_MAX_BRANCH_DETOUR) {
      branch.push(reachable);
    }
  });

  const compareAssignments = (left: ReachableAssignment, right: ReachableAssignment) =>
    left.distance - right.distance
    || compareText(left.assignment.instanceId, right.assignment.instanceId)
    || left.index - right.index;
  main.sort(compareAssignments);
  branch.sort(compareAssignments);
  return main[0] ?? branch[0] ?? null;
}

export function planBaselineScavengeRoute(
  input: ScavengeRouteInput,
): ScavengeRoutePlan {
  const deadline = deadlineFor(input);
  const remaining = new Set(input.assignments.map((_, index) => index));
  let current = input.start;
  let carriedIds: readonly string[] = [];
  let carriedWeight = 0;
  let seconds = 0;
  let savedCount = 0;
  let actions: readonly ScavengeRouteAction[] = [];

  while (remaining.size > 0) {
    const candidate = findBaselineCandidate(
      input,
      remaining,
      current,
      carriedWeight,
    );
    if (candidate !== null) {
      const nextSeconds = seconds
        + moveSeconds(candidate.distance, carriedWeight)
        + SCAVENGE_PICKUP_ACTION_SECONDS;
      if (nextSeconds > deadline) break;
      actions = [
        ...appendMove(actions, candidate.distance, carriedWeight),
        {
          type: 'pickup',
          instanceId: candidate.assignment.instanceId,
          weight: candidate.assignment.weight,
        },
      ];
      seconds = nextSeconds;
      current = candidate.assignment.position;
      carriedIds = [...carriedIds, candidate.assignment.instanceId];
      carriedWeight += candidate.assignment.weight;
      remaining.delete(candidate.index);
      continue;
    }

    if (carriedWeight === 0) break;
    const distance = routeDistance(input.metric, current, input.deposit);
    if (distance === null) break;
    const nextSeconds = seconds
      + moveSeconds(distance, carriedWeight)
      + SCAVENGE_DEPOSIT_ACTION_SECONDS;
    if (nextSeconds > deadline) break;
    actions = [
      ...appendMove(actions, distance, carriedWeight),
      { type: 'deposit', instanceIds: carriedIds },
    ];
    seconds = nextSeconds;
    current = input.deposit;
    savedCount += carriedIds.length;
    carriedIds = [];
    carriedWeight = 0;
  }

  if (carriedWeight > 0) {
    const distance = routeDistance(input.metric, current, input.deposit);
    if (distance !== null) {
      const nextSeconds = seconds
        + moveSeconds(distance, carriedWeight)
        + SCAVENGE_DEPOSIT_ACTION_SECONDS;
      if (nextSeconds <= deadline) {
        actions = [
          ...appendMove(actions, distance, carriedWeight),
          { type: 'deposit', instanceIds: carriedIds },
        ];
        seconds = nextSeconds;
        current = input.deposit;
        savedCount += carriedIds.length;
        carriedIds = [];
        carriedWeight = 0;
      }
    }
  }

  const evacuationDistance = routeDistance(input.metric, current, input.evacuation);
  if (evacuationDistance !== null) {
    const nextSeconds = seconds
      + moveSeconds(evacuationDistance, carriedWeight)
      + SCAVENGE_EVACUATE_ACTION_SECONDS;
    if (nextSeconds <= deadline) {
      actions = [
        ...appendMove(actions, evacuationDistance, carriedWeight),
        { type: 'evacuate' },
      ];
      seconds = nextSeconds;
    }
  }

  return { seconds, savedCount, actions };
}
