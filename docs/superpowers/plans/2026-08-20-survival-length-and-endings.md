# Survival Length and Endings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make competent successful runs last about 30 days, keep weak runs viable near day 40, and present five cause-aware endings.

**Architecture:** Keep `SurvivalSession` authoritative for survival state. Replace rescue progress with a hidden lead applied to a delayed daily curve, keep event authorship in `events.ts`, and add one shared ending record for both phases. Use a headless production-rule simulator to tune the approved 70 percent rescue target.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7.1, Bun.

**Spec:** `docs/superpowers/specs/2026-08-20-survival-length-and-endings-design.md`

## Global Constraints

- Preserve all unrelated user changes in the current dirty workspace.
- Do not discard, reset, stash, or overwrite user work.
- Before execution, inspect target-file changes and choose a workspace that contains them.
- Read `VISUAL_STYLE_GUIDE.md` before Task 6 UI work.
- Do not add events, items, assets, sounds, packages, or difficulty modes.
- Do not expose rescue progress, rescue odds, effective day, or pressure.
- Do not rescue the player before real day 24.
- Clamp rescue lead from zero through eight.
- Keep the approved rescue curve unchanged.
- Keep maximum Energy at three.
- Make fishing cost two Energy.
- Do not add passive Hull loss.
- Cap one ordinary outcome at 60 Health loss and 60 Hull loss.
- Keep Taken in the Dark as the explicit non-damage exception.
- Keep pressure thresholds on days 8, 15, 25, and 40.
- Remove day-50 damage multiplication.
- Remove obsolete rescue progress, immediate event rescue, and ending-reason paths.
- Do not add compatibility fields, fallbacks, or migrations.
- Do not add reduced-motion behavior.
- Do not allocate objects during per-frame update or render paths.
- Use deterministic random sources in rule tests.
- Run each listed test before its task commit.

---

## File Structure

**Create**

- `src/game/ending.ts`: Own ending records, titles, epilogues, and summary text.
- `src/survival/balanceSimulation.ts`: Run headless competent-policy survival simulations.
- `scripts/simulate-survival-balance.ts`: Print the full 1,330-loadout balance report.
- `tests/EndingRecord.test.ts`: Protect ending records and copy.
- `tests/SurvivalBalance.test.ts`: Protect rescue curve and lead rules.
- `tests/BalanceSimulation.test.ts`: Protect loadout enumeration and deterministic simulation.
- `docs/superpowers/plans/2026-08-20-survival-length-and-endings.md`: This plan.

**Modify**

- `package.json`: Add the balance simulation command.
- `README.md`: Document the final survival length, signals, pressure, and endings.
- `src/Game.ts`: Restart Dorothy failures from the ship and pass shared ending records.
- `src/phases/ScavengePhase.ts`: Create one Dorothy ending record after failure.
- `src/ui/GameUI.ts`: Render the shared Dorothy ending record.
- `src/ui/SurvivalUI.ts`: Render shared survival ending records.
- `src/styles/main.css`: Style sparse ending body and summary rows.
- `src/audio/SurvivalAudio.ts`: Select ending audio from the shared ending ID.
- `src/survival/survivalBalance.ts`: Own the rescue curve, lead clamp, fishing cost, and quiet-night curve.
- `src/survival/RunPressure.ts`: Own dangerous-event weight scaling and remove damage multiplication.
- `src/survival/survivalTypes.ts`: Replace rescue and ending legacy types.
- `src/survival/events.ts`: Author rescue lead, safe counter weights, caps, and validation.
- `src/survival/eventResolver.ts`: Remove immediate rescue copying.
- `src/survival/SurvivalSession.ts`: Apply rescue lead, delayed rescue, damage causes, and ending records.
- `src/survival/SurvivalPhase.ts`: Pass ending records and hide rescue lead from result text.
- `src/survival/OtherPeoplePresentation.ts`: Remove immediate rescue results while keeping the dawn rescue cue.
- `tests/GameLifecycle.test.ts`: Protect Dorothy restart behavior.
- `tests/GameUI.test.ts`: Protect the Dorothy ending panel.
- `tests/BoatWorld.test.ts`: Update survival snapshot fixtures for ending records.
- `tests/FlashlightBoatWorld.test.ts`: Update survival snapshot fixtures for ending records.
- `tests/OtherPeoplePerformance.test.ts`: Protect signal-only Other People presentation.
- `tests/RunPressure.test.ts`: Protect pressure pacing and event weights.
- `tests/eventResolver.test.ts`: Remove immediate rescue effect cases.
- `tests/survivalEvents.test.ts`: Protect signal effects, counter odds, and caps.
- `tests/SurvivalSession.test.ts`: Protect the economy, rescue flow, and ending causes.
- `tests/SurvivalPhase.test.ts`: Protect terminal flow and ending records.
- `tests/SurvivalUI.test.ts`: Protect ending copy, stats, focus, and restart.

---

### Task 1: Add the Delayed Rescue Curve

**Files:**

- Create: `tests/SurvivalBalance.test.ts`
- Modify: `src/survival/survivalBalance.ts`

**Interfaces:**

- Produces: `RescueLead`.
- Produces: `clampRescueLead(value: number): RescueLead`.
- Produces: `rescueChanceForDay(realDay: number, rescueLead: number): number`.
- Produces: `validateRescueChanceSteps(steps): void`.

- [ ] **Step 1: Write failing rescue-curve tests**

Create `tests/SurvivalBalance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RESCUE_CHANCE_STEPS,
  clampRescueLead,
  rescueChanceForDay,
  validateRescueChanceSteps,
} from '../src/survival/survivalBalance';

describe('survival rescue balance', () => {
  it.each([
    [23, 0, 0], [24, 0, 0.01], [27, 0, 0.01],
    [28, 0, 0.03], [30, 0, 0.03], [31, 0, 0.06],
    [34, 0, 0.10], [37, 0, 0.16], [40, 0, 0.24],
    [43, 0, 0.38], [80, 0, 0.38],
    [23, 8, 0], [24, 8, 0.06], [32, 8, 0.24],
  ])('uses day %i and lead %i for chance %f', (day, lead, chance) => {
    expect(rescueChanceForDay(day, lead)).toBe(chance);
  });

  it('clamps rescue lead from zero through eight', () => {
    expect([-2, 0, 4, 8, 12].map(clampRescueLead)).toEqual([0, 0, 4, 8, 8]);
  });

  it('rejects invalid rescue curves', () => {
    expect(() => validateRescueChanceSteps([
      { firstDay: 25, chance: 0.01 },
    ])).toThrow(/day 24/i);
    expect(() => validateRescueChanceSteps([
      { firstDay: 24, chance: 0.10 },
      { firstDay: 23, chance: 0.20 },
    ])).toThrow(/ascending/i);
    expect(() => validateRescueChanceSteps([
      { firstDay: 24, chance: 0.20 },
      { firstDay: 28, chance: 0.10 },
    ])).toThrow(/decrease/i);
  });

  it('keeps the approved curve frozen', () => {
    expect(RESCUE_CHANCE_STEPS).toEqual([
      { firstDay: 24, chance: 0.01 },
      { firstDay: 28, chance: 0.03 },
      { firstDay: 31, chance: 0.06 },
      { firstDay: 34, chance: 0.10 },
      { firstDay: 37, chance: 0.16 },
      { firstDay: 40, chance: 0.24 },
      { firstDay: 43, chance: 0.38 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts`

Expected: FAIL because the rescue-curve exports do not exist.

- [ ] **Step 3: Implement the curve and validation**

Replace the old linear rescue values in `survivalBalance.ts` with:

```ts
rescue: { firstDay: 24, maximumLead: 8 },

export type RescueLead = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RescueChanceStep {
  readonly firstDay: number;
  readonly chance: number;
}

export const RESCUE_CHANCE_STEPS: readonly RescueChanceStep[] = Object.freeze([
  Object.freeze({ firstDay: 24, chance: 0.01 }),
  Object.freeze({ firstDay: 28, chance: 0.03 }),
  Object.freeze({ firstDay: 31, chance: 0.06 }),
  Object.freeze({ firstDay: 34, chance: 0.10 }),
  Object.freeze({ firstDay: 37, chance: 0.16 }),
  Object.freeze({ firstDay: 40, chance: 0.24 }),
  Object.freeze({ firstDay: 43, chance: 0.38 }),
]);

export function validateRescueChanceSteps(
  steps: readonly RescueChanceStep[],
): void {
  if (steps.length === 0 || steps[0]?.firstDay !== 24) {
    throw new Error('Rescue chance must start on day 24.');
  }
  let previousDay = 0;
  let previousChance = 0;
  for (const step of steps) {
    if (!Number.isInteger(step.firstDay) || step.firstDay <= previousDay) {
      throw new Error('Rescue chance days must be ascending integers.');
    }
    if (!Number.isFinite(step.chance) || step.chance <= 0 || step.chance >= 1) {
      throw new Error('Rescue chance must be between zero and one.');
    }
    if (step.chance < previousChance) {
      throw new Error('Rescue chance cannot decrease.');
    }
    previousDay = step.firstDay;
    previousChance = step.chance;
  }
}

export function clampRescueLead(value: number): RescueLead {
  return Math.min(
    SURVIVAL_BALANCE.rescue.maximumLead,
    Math.max(0, Math.trunc(value)),
  ) as RescueLead;
}

export function rescueChanceForDay(realDay: number, rescueLead: number): number {
  if (realDay < 24) return 0;
  const effectiveDay = realDay + clampRescueLead(rescueLead);
  let chance = 0;
  for (const step of RESCUE_CHANCE_STEPS) {
    if (effectiveDay < step.firstDay) break;
    chance = step.chance;
  }
  return chance;
}

validateRescueChanceSteps(RESCUE_CHANCE_STEPS);
```

Keep the other approved balance values unchanged during this task.

- [ ] **Step 4: Run the focused test**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/survival/survivalBalance.ts tests/SurvivalBalance.test.ts
git commit -m "feat: add delayed rescue curve"
```

---

### Task 2: Replace Rescue Progress With Rescue Lead

**Files:**

- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/events.ts`
- Modify: `src/survival/eventResolver.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/OtherPeoplePresentation.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/eventResolver.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/OtherPeoplePerformance.test.ts`
- Modify: `tests/RunPressure.test.ts`

**Interfaces:**

- Consumes: `clampRescueLead` and `rescueChanceForDay` from Task 1.
- Produces: `ResourceDelta.rescueLead` and `SurvivalSnapshot.rescueLead`.
- Produces: `SurvivalSnapshot.rescueTraceFinds` from zero through two.
- Removes: `rescueProgress`, `EventEffects.rescue`, and immediate event rescue.
- Preserves: the dawn rescue presentation cue.

- [ ] **Step 1: Replace old rescue tests with failing lead tests**

Add these cases to `tests/SurvivalSession.test.ts`:

```ts
function stateAfterRescueDawn(day: number, rescueLead: number, roll: number) {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, roll, 0.99]),
    initial: { day, rescueLead },
    initialEventId: 'night-calm-fallback',
  });
  session.resolveEvent(choiceResponse('sleep'));
  session.beginDawn();
  return session.snapshot().state;
}

it('does not rescue before real day 24', () => {
  expect(stateAfterRescueDawn(22, 8, 0)).not.toBe('rescued');
});

it('does not consume a rescue draw before real day 24', () => {
  const next = vi.fn(() => 0.99);
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: { next },
    initial: { day: 22, rescueLead: 8 },
    initialEventId: 'night-calm-fallback',
  });
  session.resolveEvent(choiceResponse('sleep'));
  const beforeDawn = next.mock.calls.length;
  session.beginDawn();
  expect(next).toHaveBeenCalledTimes(beforeDawn + 1);
});

it('uses one percent on real day 24 without lead', () => {
  expect(stateAfterRescueDawn(23, 0, 0.009999)).toBe('rescued');
  expect(stateAfterRescueDawn(23, 0, 0.010001)).toBe('day');
});

it('uses six percent on real day 24 with eight lead', () => {
  expect(stateAfterRescueDawn(23, 8, 0.059999)).toBe('rescued');
  expect(stateAfterRescueDawn(23, 8, 0.060001)).toBe('day');
});

it('adds two hidden lead when Bottled Paper is sent', () => {
  const session = new SurvivalSession(saved('bottledPaper'), {
    seed: 2,
    initial: { day: 3, energy: 3 },
  });
  expect(session.perform('sendMessage')).toMatchObject({
    deltas: { energy: -1, rescueLead: 2 },
  });
  expect(session.snapshot()).toMatchObject({ rescueLead: 2 });
});

it('caps rescue-trace dive gains after two finds', () => {
  const session = new SurvivalSession(saved('scubaSet'), {
    seed: 3,
    random: sequenceRandom([0, 0.99, 0.99]),
    initial: { energy: 3, rescueLead: 2 },
    initialRescueTraceFinds: 2,
  });
  expect(session.perform('dive').deltas).not.toHaveProperty('rescueLead');
  expect(session.snapshot()).toMatchObject({ rescueLead: 2, rescueTraceFinds: 2 });
});

it('turns Other People into a persistent signal instead of rescue', () => {
  const flashlight = new SurvivalSession(saved('flashlight'), {
    seed: 4,
    initial: { day: 20, rescueLead: 2 },
    initialEventId: 'other-people',
  });
  expect(flashlight.resolveEvent(itemResponse('flashlight'))).toMatchObject({
    deltas: { rescueLead: 4 },
    eventResult: { resultId: 'people-signaled' },
  });
  expect(flashlight.snapshot()).toMatchObject({ state: 'nightEvent', rescueLead: 6 });

  const flare = new SurvivalSession(saved('flareGun'), {
    seed: 5,
    initial: { day: 20, rescueLead: 2 },
    initialEventId: 'other-people',
  });
  expect(flare.resolveEvent(itemResponse('flareGun'))).toMatchObject({
    deltas: { rescueLead: 6 },
  });
  expect(flare.snapshot().inventory['flareGun-1']?.condition).toBe('consumed');
});
```

Delete the old day-5, linear-increase, 60-percent-cap, progress-cap, and immediate-rescue tests.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts`

Expected: FAIL because production types and rules still use rescue progress.

- [ ] **Step 3: Replace rescue types end to end**

Use these names in `survivalTypes.ts`:

```ts
export interface ResourceDelta {
  pressure?: number;
  health?: number;
  hunger?: number;
  energy?: number;
  hull?: number;
  food?: number;
  bait?: number;
  repairMaterial?: number;
  rescueLead?: number;
}

export type EventResource =
  | 'pressure' | 'health' | 'hull' | 'energy'
  | 'food' | 'bait' | 'repairMaterial' | 'rescueLead';

export interface EventEffects {
  readonly resources?: readonly ResourceEffect[];
  readonly items?: readonly EventInventoryMutation[];
  readonly chest?: ChestEventEffect;
  readonly nextDawnEnergy?: DawnEnergy;
  readonly followUpNight?: true;
  readonly endingReason?: 'kidnapped';
}

export interface SurvivalSnapshot {
  rescueLead: number;
  readonly rescueTraceFinds: number;
}
```

Keep all other fields in both interfaces unchanged.

Rename each test fixture field from `rescueProgress` to `rescueLead`.

Rename `minimumRescueProgress` to `minimumRescueLead` in event definitions and eligibility.

Remove `EventEffects.rescue` and its validator and resolver branches.

During resource-effect validation, accept `rescueLead` only with `add`.
Require its minimum and maximum authored values to stay from one through eight.

- [ ] **Step 4: Add lead state and delayed dawn rescue**

Add these session fields and constructor values:

```ts
export interface SurvivalSessionOptions {
  readonly initialRescueTraceFinds?: number;
}

private rescueLead: RescueLead;
private rescueTraceFinds: 0 | 1 | 2;

this.rescueLead = clampRescueLead(options.initial?.rescueLead ?? 0);
this.rescueTraceFinds = Math.min(
  2,
  Math.max(0, Math.trunc(options.initialRescueTraceFinds ?? 0)),
) as 0 | 1 | 2;
```

Return both values in the snapshot.

Replace the old dawn chance block with:

```ts
const rescueChance = rescueChanceForDay(this.day, this.rescueLead);
if (rescueChance > 0 && this.random.next() < rescueChance) {
  this.state = 'rescued';
  this.clearPendingEvent();
  return this.commit(
    'rescued',
    'A rescue vessel finds the lifeboat at dawn.',
    {},
    'rescue',
  );
}

this.openDayEventAfterDawn();
return dawn;
```

Do not consume a rescue random draw when `rescueChance` is zero.

Clamp rescue lead in `applyDeltas`:

```ts
this.rescueLead = clampRescueLead(
  this.rescueLead + (adjustedDeltas.rescueLead ?? 0),
);
```

Include rescue lead in `resourceValues` so outcomes report applied gains.

- [ ] **Step 5: Convert Bottled Paper and diving**

Change Bottled Paper to:

```ts
private sendMessage(): ActionOutcome {
  this.inventory.consume('bottledPaper', 1);
  this.rescueMessageSent = true;
  return this.commit('message-sent', 'You cast the message into the current.', {
    energy: -SURVIVAL_BALANCE.actions.bottledPaperEnergy,
    rescueLead: 2,
  }, 'sighting');
}
```

Delete `bottledPaperRescueProgress` from `SURVIVAL_BALANCE.actions`.

Change the fourth successful dive reward to:

```ts
else if (this.rescueTraceFinds < 2) {
  this.rescueTraceFinds = (this.rescueTraceFinds + 1) as 1 | 2;
  deltas.rescueLead = 1;
}
```

A later rescue-trace roll keeps the successful dive message but adds no lead.

- [ ] **Step 6: Convert Other People and preserve its dawn cue**

Use these exact choices in `events.ts`:

```ts
choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(
  1,
  'The distant crew sees your flare.',
  effects([add('rescueLead', 6)], [consume('flareGun')]),
  'people-signaled',
)),
choice('flashlight', 'Use Flashlight', 'flashlight', outcome(
  1,
  'The distant crew answers your light.',
  effects([add('rescueLead', 4)]),
  'people-signaled',
)),
```

Set `minimumRescueLead: 2` and keep `maximumAppearances: 2`.

Delete `people-rescue` and `people-missed` outcomes and tests.

In `OtherPeoplePresentation`, route `people-signaled` for both item choices.

Delete direct event-result rescue and miss branches.

Keep `setRescueCue`, `applyRescueResult`, and terminal tableau holding for dawn rescue.

- [ ] **Step 7: Keep rescue lead hidden**

Remove rescue progress from the visible change labels in `SurvivalPhase.ts`.

Do not add a rescue-lead label.

Keep lead available only in rule snapshots, tests, and simulation.

Verify old paths are gone:

Run: `git grep -n "rescueProgress\|minimumRescueProgress\|bottledPaperRescueProgress\|people-rescue\|people-missed\|effects\.rescue" -- src tests`

Expected: no output.

- [ ] **Step 8: Run focused rescue and presentation tests**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalPhase.test.ts tests/OtherPeoplePerformance.test.ts`

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```powershell
git add src/survival/survivalTypes.ts src/survival/events.ts src/survival/eventResolver.ts src/survival/SurvivalSession.ts src/survival/SurvivalPhase.ts src/survival/OtherPeoplePresentation.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalPhase.test.ts tests/OtherPeoplePerformance.test.ts tests/RunPressure.test.ts
git commit -m "feat: replace rescue progress with hidden lead"
```

---

### Task 3: Rebalance Energy and Pressure Pacing

**Files:**

- Modify: `src/survival/survivalBalance.ts`
- Modify: `src/survival/RunPressure.ts`
- Modify: `src/survival/events.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `tests/SurvivalBalance.test.ts`
- Modify: `tests/RunPressure.test.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**

- Produces: `quietNightChance(pressure: number): number`.
- Produces: `dangerousEventWeightMultiplier(pressure: number): number`.
- Produces: `weightedEventDrawWeight(event, pressure): number`.
- Removes: `NIGHT_DAMAGE_DOUBLE_DAY` and `nightDamageMultiplier`.

- [ ] **Step 1: Write failing economy and pressure tests**

Add these cases:

```ts
it('charges two Energy for fishing', () => {
  const session = new SurvivalSession(saved(), { seed: 10 });
  expect(session.beginFishing()).toMatchObject({
    accepted: true,
    outcome: { deltas: { energy: -2 } },
  });
  expect(session.snapshot().energy).toBe(1);
  expect(session.beginFishing()).toMatchObject({
    accepted: false,
    outcome: { code: 'not-enough-energy' },
  });
});
```

Add to `tests/RunPressure.test.ts`:

```ts
it('reduces quiet nights as actual pressure rises', () => {
  expect([0, 1, 2, 3, 4].map(quietNightChance))
    .toEqual([0.30, 0.25, 0.20, 0.15, 0.10]);
});

it('raises only dangerous event weights', () => {
  expect([0, 1, 2, 3, 4].map(dangerousEventWeightMultiplier))
    .toEqual([1, 1.25, 1.5, 1.75, 2]);
  expect(weightedEventDrawWeight(event({ danger: 'safe', weight: 3 }), 4)).toBe(3);
  expect(weightedEventDrawWeight(event({ danger: 'uncertain', weight: 3 }), 4)).toBe(3);
  expect(weightedEventDrawWeight(event({ danger: 'dangerous', weight: 3 }), 4)).toBe(6);
});
```

Add a draw test to `tests/survivalEvents.test.ts`:

```ts
import type { SurvivalEventDefinition } from '../src/survival/survivalTypes';

const weightedTestEvent = (
  id: string,
  danger: SurvivalEventDefinition['danger'],
): SurvivalEventDefinition => ({
  id,
  phase: 'night',
  title: id,
  revealText: id,
  prompt: 'Choose.',
  danger,
  earliestDay: 1,
  weight: 1,
  cooldownDays: 0,
  choices: [{
    id: 'sleep',
    label: 'Sleep',
    outcomes: [{ weight: 1, message: 'Done.', effects: {} }],
  }],
  cue: 'none',
});

it('uses pressure-adjusted dangerous weights', () => {
  const safe = weightedTestEvent('safe-test', 'safe');
  const dangerous = weightedTestEvent('danger-test', 'dangerous');
  expect(drawWeightedEvent([safe, dangerous], sequenceRandom([0.4]), 'night', 0).id)
    .toBe('safe-test');
  expect(drawWeightedEvent([safe, dangerous], sequenceRandom([0.4]), 'night', 4).id)
    .toBe('danger-test');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts tests/RunPressure.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL on fishing cost, quiet chances, and weighted event selection.

- [ ] **Step 3: Change fishing and quiet-night balance**

Set the action cost:

```ts
actions: {
  fishEnergy: 2,
  repairEnergy: 1,
  diveEnergy: 3,
  foodHunger: -35,
  repairHull: 25,
  tapeHull: 15,
  treatmentHealth: 30,
  bottledPaperEnergy: 1,
  maximumEnergy: 3,
},
```

Replace the fixed quiet chance with:

```ts
const QUIET_NIGHT_CHANCES = Object.freeze([0.30, 0.25, 0.20, 0.15, 0.10]);

export function quietNightChance(pressure: number): number {
  const index = Math.min(4, Math.max(0, Math.trunc(pressure)));
  return QUIET_NIGHT_CHANCES[index]!;
}
```

Use `quietNightChance(this.pressure)` in `SurvivalSession.endDay`.

- [ ] **Step 4: Scale dangerous-event draw weights**

Replace the damage exports in `RunPressure.ts` with:

```ts
export function dangerousEventWeightMultiplier(pressure: number): number {
  return 1 + 0.25 * Math.min(4, Math.max(0, Math.trunc(pressure)));
}

export function weightedEventDrawWeight(
  event: Pick<SurvivalEventDefinition, 'danger' | 'weight'>,
  pressure: number,
): number {
  return event.danger === 'dangerous'
    ? event.weight * dangerousEventWeightMultiplier(pressure)
    : event.weight;
}
```

Change `drawWeightedEvent` to accept pressure:

```ts
export function drawWeightedEvent(
  pool: readonly SurvivalEventDefinition[],
  random: RandomSource,
  fallbackPhase: 'day' | 'night' = 'day',
  pressure = 0,
): SurvivalEventDefinition {
  if (pool.length === 0) return FALLBACKS[fallbackPhase];
  const totalWeight = pool.reduce(
    (sum, eventEntry) => sum + weightedEventDrawWeight(eventEntry, pressure),
    0,
  );
  const roll = random.next() * totalWeight;
  let boundary = 0;
  for (const eventEntry of pool) {
    boundary += weightedEventDrawWeight(eventEntry, pressure);
    if (roll < boundary) return eventEntry;
  }
  return pool[pool.length - 1]!;
}
```

Pass `this.pressure` from `SurvivalSession.drawEvent`.

- [ ] **Step 5: Remove night damage multiplication**

Delete `NIGHT_DAMAGE_DOUBLE_DAY`, `nightDamageMultiplier`, their imports, and their tests.

Apply event resource subtraction directly:

```ts
const delta = effect.operation === 'set'
  ? effect.value - current
  : effect.operation === 'add'
    ? effect.value
    : -effect.value;
```

Verify deletion:

Run: `git grep -n "NIGHT_DAMAGE_DOUBLE_DAY\|nightDamageMultiplier" -- src tests`

Expected: no output.

- [ ] **Step 6: Run focused pacing tests**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts tests/RunPressure.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/FishingSession.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/survival/survivalBalance.ts src/survival/RunPressure.ts src/survival/events.ts src/survival/SurvivalSession.ts tests/SurvivalBalance.test.ts tests/RunPressure.test.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: rebalance survival energy and pressure"
```

---

### Task 4: Cap Damage and Standardize Event Counters

**Files:**

- Modify: `src/survival/events.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/SurvivalSession.test.ts`

**Interfaces:**

- Produces: catalog validation for 60-point resource caps.
- Produces: catalog validation for one random lost item.
- Produces: a required no-item response for every event.
- Preserves: all current event IDs, gates, and presentations.

- [ ] **Step 1: Write failing catalog safety tests**

Add to `tests/survivalEvents.test.ts`:

```ts
import type {
  IntegerValue,
  WeightedEventOutcome,
} from '../src/survival/survivalTypes';

function maximumValue(value: IntegerValue): number {
  return typeof value === 'number' ? value : value.max;
}

function maximumLoss(
  outcome: WeightedEventOutcome,
  resource: 'health' | 'hull',
): number {
  return (outcome.effects.resources ?? [])
    .filter((effect) => effect.resource === resource && effect.operation === 'subtract')
    .reduce((sum, effect) => sum + maximumValue(effect.value), 0);
}

it('caps ordinary outcome damage at sixty per meter', () => {
  for (const event of SURVIVAL_EVENTS) {
    for (const choice of event.choices) {
      for (const result of choice.outcomes) {
        expect(maximumLoss(result, 'health'), `${event.id}.${choice.id} Health`).toBeLessThanOrEqual(60);
        expect(maximumLoss(result, 'hull'), `${event.id}.${choice.id} Hull`).toBeLessThanOrEqual(60);
      }
    }
  }
});

it('keeps one no-item response on every event', () => {
  for (const event of SURVIVAL_EVENTS) {
    expect(event.choices.some(({ itemId }) => itemId === undefined), event.id).toBe(true);
  }
});

it('limits random item loss to one', () => {
  for (const event of SURVIVAL_EVENTS) {
    for (const choice of event.choices) {
      for (const result of choice.outcomes) {
        for (const mutation of result.effects.items ?? []) {
          if (mutation.kind === 'loseRandom') expect(mutation.quantity).toBe(1);
        }
      }
    }
  }
});
```

Add the approved protective-weight table:

```ts
const APPROVED_COUNTER_CHANCES = [
  ['dangerous-waters', 'map', 0.80],
  ['dangerous-waters', 'compass', 0.50],
  ['leak', 'ductTape', 1.00],
  ['leak', 'map', 0.60],
  ['death-stare', 'flashlight', 0.80],
  ['death-stare', 'umbrella', 0.60],
  ['swarm-of-anglerfish', 'fishingNet', 0.80],
  ['tornado', 'anchor', 0.90],
  ['tornado', 'swimRing', 0.60],
  ['windy-night', 'fishingNet', 0.80],
  ['windy-night', 'umbrella', 0.50],
  ['thunderstorm', 'anchor', 0.80],
  ['thunderstorm', 'umbrella', 0.60],
  ['restless-waves', 'anchor', 1.00],
  ['restless-waves', 'swimRing', 0.50],
  ['man-in-the-fog', 'compass', 1.00],
  ['man-in-the-fog', 'flashlight', 0.60],
  ['eerie-melody', 'ductTape', 1.00],
  ['eerie-melody', 'umbrella', 0.60],
  ['chest-attack', 'fishingNet', 1.00],
] as const;

it.each(APPROVED_COUNTER_CHANCES)(
  '%s.%s keeps its protective chance',
  (eventId, choiceId, expected) => {
    const choice = event(eventId).choices.find(({ id }) => id === choiceId)!;
    const total = choice.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    expect(choice.outcomes[0]!.weight / total).toBeCloseTo(expected);
  },
);
```

For every listed choice, keep the protective outcome first.

- [ ] **Step 2: Run catalog tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL on current damage, counter weights, and Tornado random loss.

- [ ] **Step 3: Add general catalog validation**

Add helpers in `events.ts`:

```ts
function maximumIntegerValue(value: IntegerValue): number {
  return typeof value === 'number' ? value : value.max;
}

function maximumOutcomeLoss(
  outcomeEntry: WeightedEventOutcome,
  resourceName: 'health' | 'hull',
): number {
  return (outcomeEntry.effects.resources ?? [])
    .filter(({ resource, operation }) => (
      resource === resourceName && operation === 'subtract'
    ))
    .reduce((sum, effect) => sum + maximumIntegerValue(effect.value), 0);
}
```

Inside outcome validation, reject both caps:

```ts
for (const resourceName of ['health', 'hull'] as const) {
  if (maximumOutcomeLoss(outcomeEntry, resourceName) > 60) {
    throw new Error(`${path} removes more than 60 ${resourceName}`);
  }
}
```

Inside mutation validation, reject `loseRandom` quantities above one.

After choice validation, require one choice without `itemId` on each event.

- [ ] **Step 4: Apply the exact damage caps**

Make these authored changes:

- Death Stare Umbrella Hull maximum: 66 to 60.
- Death Stare Fishing Net Hull maximum: 66 to 60.
- Death Stare Fishing Net Health: 70 to 60.
- Death Stare Sleep Hull maximum: 66 to 60.
- Tornado catastrophic Hull range: 60–80 to 50–60.
- Eerie Melody Spyglass Hull range: 50–90 to 50–60.
- Eerie Melody Sleep Hull range: 50–90 to 50–60.
- Handyman Touch Health: 70 to 60.
- Tornado catastrophic random loss: two items to one item.

Keep all other damage unchanged during this step.

- [ ] **Step 5: Apply the exact counter odds**

Use these first-outcome and failure weights:

```ts
// Leak Map
outcome(60, 'The map slows the leak.'),
outcome(40, 'The map tears while slowing the leak.', effects(undefined, [breakItem('map')])),

// Death Stare Flashlight
outcome(80, 'The creature sinks below the beam.'),
outcome(20, 'The flashlight is lost.', atNextDawn(1, effects(undefined, [lose('flashlight')]))),

// Death Stare Umbrella
outcome(60, 'The umbrella breaks the creature\'s gaze.'),
outcome(40, 'The creature attacks.', effects([
  subtract('hull', { min: 44, max: 60 }), subtract('health', 60),
], [breakItem('umbrella')])),

// Anglerfish Fishing Net
outcome(80, 'The net holds the swarm back.'),
outcome(20, 'The net tears while holding the swarm back.', effects(undefined, [breakItem('fishingNet')])),

// Tornado Swim Ring
outcome(60, 'The ring pulls the boat outside the strongest current.'),
outcome(40, 'The boat is damaged.', effects([
  subtract('hull', { min: 20, max: 40 }),
], [breakItem('swimRing')])),

// Windy Night Fishing Net
outcome(80, 'The net secures the loose supplies.'),
outcome(20, 'The net tears while securing the supplies.', effects(undefined, [breakItem('fishingNet')])),

// Windy Night Umbrella
outcome(50, 'The umbrella shields the loose supplies.'),
outcome(50, 'The umbrella is lost.', effects(undefined, [lose('umbrella')])),

// Thunderstorm Umbrella
outcome(60, 'The umbrella sheds the worst rain.'),
outcome(40, 'The boat is damaged.', effects([
  subtract('hull', { min: 20, max: 30 }),
], [breakItem('umbrella')])),

// Restless Waves Swim Ring
outcome(50, 'The swim ring steadies the boat.'),
outcome(50, 'The waves damage the boat.', effects([
  subtract('hull', { min: 10, max: 20 }),
], [breakItem('swimRing')])),

// Man in the Fog Flashlight
outcome(60, 'The beam drives the figure back into the fog.'),
outcome(40, 'The figure attacks.', atNextDawn(1, effects([
  add('pressure', 2), subtract('health', 20),
]))),

// Eerie Melody Umbrella
outcome(60, 'The umbrella muffles the melody until it fades.'),
outcome(40, 'The boat is damaged.', atNextDawn(1, effects([
  subtract('hull', { min: 40, max: 60 }),
], [breakItem('umbrella')]))),
```

Keep the already approved Map, Duct Tape, Anchor, Compass, and chest-net weights.

- [ ] **Step 6: Run catalog and session validation**

Run: `node node_modules/vitest/vitest.mjs run tests/survivalEvents.test.ts tests/SurvivalSession.test.ts tests/eventResolver.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/survival/events.ts tests/survivalEvents.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: cap survival event damage"
```

---

### Task 5: Add Shared Cause-Aware Ending Records

**Files:**

- Create: `src/game/ending.ts`
- Create: `tests/EndingRecord.test.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/events.ts`
- Modify: `src/survival/eventResolver.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/audio/SurvivalAudio.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/survivalEvents.test.ts`
- Modify: `tests/eventResolver.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/FlashlightBoatWorld.test.ts`

**Interfaces:**

- Produces: `EndingRecord` as a five-variant discriminated union.
- Produces: `endingTitle(record)`, `endingEpilogue(record)`, and `endingSummary(record)`.
- Produces: `SurvivalSnapshot.ending: EndingRecord | null`.
- Removes: `SurvivalEndingReason` and `endingReason`.

- [ ] **Step 1: Write failing ending-domain tests**

Create `tests/EndingRecord.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  endingCauseLine,
  endingEpilogue,
  endingSummary,
  endingTitle,
  type EndingRecord,
} from '../src/game/ending';

const records: readonly EndingRecord[] = [
  { id: 'dorothy', day: 0, savedPickupCount: 7 },
  { id: 'rescue', day: 30, savedPickupCount: 18, signalAssisted: false },
  { id: 'rescue', day: 29, savedPickupCount: 18, signalAssisted: true },
  { id: 'death', day: 22, savedPickupCount: 18, cause: { kind: 'starvation' } },
  { id: 'sinking', day: 27, savedPickupCount: 18, cause: { eventId: 'thunderstorm' } },
  { id: 'taken', day: 26, savedPickupCount: 18 },
];

describe('ending records', () => {
  it('uses the five approved titles', () => {
    expect(records.map(endingTitle)).toEqual([
      'SUNK WITH DOROTHY',
      'RESCUE FOUND YOU',
      'RESCUE FOUND YOU',
      'THE SEA OUTLASTED YOU',
      'THE BOAT IS GONE',
      'TAKEN IN THE DARK',
    ]);
  });

  it('selects natural and signal rescue epilogues', () => {
    expect(endingEpilogue(records[1]!)).toBe('At dawn, an engine answered the empty horizon.');
    expect(endingEpilogue(records[2]!)).toBe('A distant crew followed the signs you left across the sea.');
  });

  it('formats day and pickup count without hidden data', () => {
    expect(endingSummary(records[2]!)).toBe('DAY 29 · 18 PICKUPS SAVED');
    expect(endingSummary(records[0]!)).toBe('BEFORE DAY 1 · 7 PICKUPS SAVED');
  });

  it('names the sinking event without importing the event catalog', () => {
    expect(endingCauseLine(records[4]!)).toBe('LAST EVENT: THUNDERSTORM');
  });
});
```

- [ ] **Step 2: Run the domain test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/EndingRecord.test.ts`

Expected: FAIL because `src/game/ending.ts` does not exist.

- [ ] **Step 3: Implement the shared ending union and copy**

Create `src/game/ending.ts`:

```ts
export type DeathCause =
  | { readonly kind: 'starvation' }
  | { readonly kind: 'diving' }
  | { readonly kind: 'event'; readonly eventId: string }
  | { readonly kind: 'other' };

export type EndingRecord =
  | { readonly id: 'dorothy'; readonly day: 0; readonly savedPickupCount: number }
  | { readonly id: 'rescue'; readonly day: number; readonly savedPickupCount: number; readonly signalAssisted: boolean }
  | { readonly id: 'death'; readonly day: number; readonly savedPickupCount: number; readonly cause: DeathCause }
  | { readonly id: 'sinking'; readonly day: number; readonly savedPickupCount: number; readonly cause: { readonly eventId: string | null } }
  | { readonly id: 'taken'; readonly day: number; readonly savedPickupCount: number };

const TITLES = Object.freeze({
  dorothy: 'SUNK WITH DOROTHY',
  rescue: 'RESCUE FOUND YOU',
  death: 'THE SEA OUTLASTED YOU',
  sinking: 'THE BOAT IS GONE',
  taken: 'TAKEN IN THE DARK',
} as const);

export function endingTitle(record: EndingRecord): string {
  return TITLES[record.id];
}

export function endingEpilogue(record: EndingRecord): string {
  if (record.id === 'dorothy') return 'Dorothy took you down before the lifeboat cleared her side.';
  if (record.id === 'rescue') return record.signalAssisted
    ? 'A distant crew followed the signs you left across the sea.'
    : 'At dawn, an engine answered the empty horizon.';
  if (record.id === 'taken') return 'The light found something that had been waiting for you.';
  if (record.id === 'sinking') return 'The last damage opened the boat to the sea.';
  if (record.cause.kind === 'starvation') return 'Hunger left you too weak to meet another dawn.';
  if (record.cause.kind === 'diving') return 'The water returned you to the boat, but not for long.';
  if (record.cause.kind === 'event') return 'The last encounter left wounds the next dawn could not mend.';
  return 'Your strength failed before help crossed the horizon.';
}

export function endingSummary(record: EndingRecord): string {
  const day = record.id === 'dorothy' ? 'BEFORE DAY 1' : `DAY ${record.day}`;
  return `${day} · ${record.savedPickupCount} PICKUPS SAVED`;
}

function titleCaseId(id: string): string {
  return id.split('-').map((part) => (
    part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)
  )).join(' ');
}

export function endingCauseLine(record: EndingRecord): string | null {
  if (record.id !== 'sinking' || record.cause.eventId === null) return null;
  return `LAST EVENT: ${titleCaseId(record.cause.eventId).toLocaleUpperCase('en-US')}`;
}
```

- [ ] **Step 4: Write failing session cause tests**

Add these tests to `tests/SurvivalSession.test.ts`:

```ts
it('records signal-assisted rescue once', () => {
  const session = new SurvivalSession(saved('bottledPaper'), {
    seed: 20,
    random: sequenceRandom([0, 0]),
    initial: { day: 23, rescueLead: 8 },
    initialEventId: 'night-calm-fallback',
  });
  session.resolveEvent(choiceResponse('sleep'));
  session.beginDawn();
  expect(session.snapshot().ending).toEqual({
    id: 'rescue', day: 24, savedPickupCount: 1, signalAssisted: true,
  });
  const ending = session.snapshot().ending;
  expect(session.beginDawn().accepted).toBe(false);
  expect(session.snapshot().ending).toBe(ending);
});

it('records starvation and diving causes', () => {
  const starving = new SurvivalSession(saved(), {
    seed: 21,
    initial: { day: 10, hunger: 100, health: 15 },
    initialEventId: 'night-calm-fallback',
  });
  starving.resolveEvent(choiceResponse('sleep'));
  starving.beginDawn();
  expect(starving.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'starvation' },
  });

  const diving = new SurvivalSession(saved('scubaSet'), {
    seed: 22,
    random: sequenceRandom([0.99, 0, 0]),
    initial: { health: 10, energy: 3 },
  });
  diving.perform('dive');
  expect(diving.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'diving' },
  });
});

it('records the final event for death and sinking', () => {
  const death = new SurvivalSession(saved(), {
    seed: 23,
    random: sequenceRandom([0.5, 0.5]),
    initial: { health: 60 },
    initialEventId: 'death-stare',
  });
  death.resolveEvent(choiceResponse('sleep'));
  expect(death.snapshot().ending).toMatchObject({
    id: 'death', cause: { kind: 'event', eventId: 'death-stare' },
  });

  const sinking = new SurvivalSession(saved(), {
    seed: 23,
    random: sequenceRandom([0, 0]),
    initial: { hull: 20 },
    initialEventId: 'restless-waves',
  });
  sinking.resolveEvent(choiceResponse('sleep'));
  expect(sinking.snapshot().ending).toMatchObject({
    id: 'sinking', cause: { eventId: 'restless-waves' },
  });
});
```

- [ ] **Step 5: Replace ending reason with a stored ending record**

In `survivalTypes.ts`, remove `SurvivalEndingReason` and `endingReason`.

Add `readonly ending: EndingRecord | null` to `SurvivalSnapshot`.

Replace the event effect with:

```ts
export interface EventEffects {
  // Keep the approved fields from Task 2.
  readonly ending?: 'taken';
}
```

Change Shadow Figure effects from `endingReason: 'kidnapped'` to `ending: 'taken'`.

Remove its Spyglass choice. Keep only Flashlight, Flare Gun, and Sleep.

Keep `earliestDay: 20`, `minimumPressure: 3`, and `requiresLivingCompanion: true`.

Add this catalog test:

```ts
it('keeps the approved Shadow Figure contract', () => {
  const shadow = survivalEventById('shadow-figure')!;
  expect(shadow).toMatchObject({
    earliestDay: 20,
    minimumPressure: 3,
    requiresLivingCompanion: true,
  });
  expect(shadow.choices.map(({ id }) => id))
    .toEqual(['flashlight', 'flareGun', 'sleep']);

  const flashlight = shadow.choices[0]!;
  const flashlightTotal = flashlight.outcomes
    .reduce((sum, outcome) => sum + outcome.weight, 0);
  expect(flashlight.outcomes
    .filter(({ effects }) => effects.ending === 'taken')
    .reduce((sum, outcome) => sum + outcome.weight, 0) / flashlightTotal)
    .toBe(0.5);
  expect(shadow.choices[1]!.outcomes[0]!.effects).toMatchObject({
    ending: 'taken',
    items: [{ kind: 'consume', itemId: 'flareGun', quantity: 1 }],
  });
  expect(shadow.choices[2]!.outcomes[0]!.effects).not.toHaveProperty('ending');
});
```

Validate that the only authored ending effect is `taken`.

Remove ending-reason copying from `eventResolver.ts`.

Update all snapshot fixtures. Remove `endingReason` from BoatWorld, FlashlightBoatWorld,
SurvivalPhase, SurvivalSession, and RunPressure tests.

- [ ] **Step 6: Track damage cause and create one terminal record**

Add these fields to `SurvivalSession`:

```ts
private readonly savedPickupCount: number;
private ending: EndingRecord | null = null;
private lastHealthCause: DeathCause = { kind: 'other' };
private lastHullEventId: string | null = null;
```

Set `savedPickupCount = savedItems.length` before removing Carlitos from inventory items.

Pass `event.id` into `applyEventResource`. Record event damage before subtraction:

```ts
if (effect.operation === 'subtract' && effect.resource === 'health') {
  this.lastHealthCause = { kind: 'event', eventId };
}
if (effect.operation === 'subtract' && effect.resource === 'hull') {
  this.lastHullEventId = eventId;
}
```

Before dive injury, set `{ kind: 'diving' }`.

Before starvation damage, set `{ kind: 'starvation' }`.

Use this terminal creation shape:

```ts
private resolveTerminal(): void {
  if (this.ending !== null) return;
  if (this.health <= 0) {
    this.state = 'dead';
    this.ending = Object.freeze({
      id: 'death', day: this.day, savedPickupCount: this.savedPickupCount,
      cause: Object.freeze({ ...this.lastHealthCause }),
    });
  } else if (this.hull <= 0) {
    this.state = 'sunk';
    this.ending = Object.freeze({
      id: 'sinking', day: this.day, savedPickupCount: this.savedPickupCount,
      cause: Object.freeze({ eventId: this.lastHullEventId }),
    });
  }
  if (this.ending !== null) this.clearPendingEvent();
}
```

Create the rescue record before setting the terminal state:

```ts
this.ending = Object.freeze({
  id: 'rescue',
  day: this.day,
  savedPickupCount: this.savedPickupCount,
  signalAssisted: this.rescueLead > 0,
});
this.state = 'rescued';
```

Create the Taken record before setting the existing `dead` terminal state:

```ts
this.ending = Object.freeze({
  id: 'taken',
  day: this.day,
  savedPickupCount: this.savedPickupCount,
});
this.state = 'dead';
```

Return the same frozen ending object in later snapshots.

Update `SurvivalPhase` to require the record for terminal snapshots.

Change `SurvivalUI.showEnding` to accept the survival record. Render only its shared
title in this task. Task 6 adds the epilogue and summary.

- [ ] **Step 7: Select survival ending audio by ending ID**

Change `SurvivalAudio.ending` to accept:

```ts
ending(id: Extract<EndingRecord['id'], 'rescue' | 'death' | 'sinking' | 'taken'>): void {
  if (this.disposed) return;
  const cue = id === 'rescue'
    ? 'rescueEnding'
    : id === 'sinking'
      ? 'sinkingEnding'
      : 'deathEnding';
  this.scope.play(cue);
}
```

Taken uses the existing death-ending sound.

- [ ] **Step 8: Remove the legacy path and run tests**

Run: `git grep -n "SurvivalEndingReason\|endingReason\|kidnapped" -- src tests`

Expected: no output.

Run: `node node_modules/vitest/vitest.mjs run tests/EndingRecord.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/FlashlightBoatWorld.test.ts tests/AudioSystem.test.ts`

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```powershell
git add src/game/ending.ts src/survival/survivalTypes.ts src/survival/events.ts src/survival/eventResolver.ts src/survival/SurvivalSession.ts src/survival/SurvivalPhase.ts src/ui/SurvivalUI.ts src/audio/SurvivalAudio.ts tests/EndingRecord.test.ts tests/SurvivalSession.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/FlashlightBoatWorld.test.ts
git commit -m "feat: add cause-aware ending records"
```

---

### Task 6: Render Unified Ending Panels and Restart Dorothy

**Files:**

- Modify: `src/Game.ts`
- Modify: `src/phases/ScavengePhase.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/GameLifecycle.test.ts`
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**

- Consumes: `EndingRecord` and ending copy functions from Task 5.
- Produces: `SurvivalUI.showEnding(record: EndingRecord): void`.
- Produces: `GameUI.renderEnding(stage, blackout, record): void`.
- Changes: the Dorothy ending action restarts scavenging instead of opening the menu.

- [ ] **Step 1: Read the visual guide and write failing UI tests**

Run: `Get-Content -Raw VISUAL_STYLE_GUIDE.md`

Add to `tests/SurvivalUI.test.ts`:

```ts
it('shows a cause-aware ending with day and pickup count', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.showEnding({
    id: 'rescue', day: 30, savedPickupCount: 18, signalAssisted: true,
  });
  expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('RESCUE FOUND YOU');
  expect(mount.querySelector('[data-ending-body]')?.textContent)
    .toBe('A distant crew followed the signs you left across the sea.');
  expect(mount.querySelector('[data-ending-stats]')?.textContent)
    .toBe('DAY 30 · 18 PICKUPS SAVED');
  expect(mount.querySelector('[data-ending-cause]')?.textContent).toBe('');
  expect(mount.textContent).not.toMatch(/seed|rescue lead|effective day/i);
});
```

Add to `tests/GameUI.test.ts`:

```ts
it('shows the Dorothy epilogue and restart action', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  ui.renderEnding('menuReady', 1, {
    id: 'dorothy', day: 0, savedPickupCount: 7,
  });
  expect(mount.querySelector('[data-ending-body]')?.textContent)
    .toBe('Dorothy took you down before the lifeboat cleared her side.');
  expect(mount.querySelector('[data-ending-stats]')?.textContent)
    .toBe('BEFORE DAY 1 · 7 PICKUPS SAVED');
  expect(mount.querySelector('[data-ending-action]')?.textContent)
    .toContain('START FROM THE SHIP');
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: FAIL because the ending body, summary, and record APIs do not exist.

- [ ] **Step 3: Add the shared sparse ending markup**

Use this content inside the GameUI ending panel:

```html
<h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
<p class="ending-copy ui-role-narrative" data-ending-body></p>
<p class="ending-cause ui-role-context" data-ending-cause></p>
<p class="ending-stats ui-role-numeral" data-ending-stats></p>
<button type="button" class="primary-action salvage-action ui-role-context" data-ending-action>
  START FROM THE SHIP
</button>
```

Use this content inside the SurvivalUI ending panel:

```html
<h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
<p class="ending-copy ui-role-narrative" data-ending-body></p>
<p class="ending-cause ui-role-context" data-ending-cause></p>
<p class="ending-stats ui-role-numeral" data-ending-stats></p>
<button type="button" class="primary-action salvage-action ui-role-context" data-restart>
  START FROM THE SHIP
</button>
```

Store all four ending text elements once in each constructor.

Render with:

```ts
this.endingTitle.textContent = endingTitle(record);
this.endingBody.textContent = endingEpilogue(record);
this.endingCause.textContent = endingCauseLine(record) ?? '';
this.endingCause.hidden = this.endingCause.textContent.length === 0;
this.endingStats.textContent = endingSummary(record);
this.endingLayer.dataset.ending = record.id;
```

Do not create elements during render calls.

- [ ] **Step 4: Pass stored survival records to the UI**

Replace `SurvivalUI.showEnding` with:

```ts
showEnding(record: Exclude<EndingRecord, { id: 'dorothy' }>): void {
  if (this.disposed) return;
  this.closeCarlitosCard(false);
  this.clearEventPresentation();
  this.setPaused(false);
  this.renderEndingRecord(record);
  this.restartIssued = false;
  this.restartButton.disabled = false;
  this.showLayer(this.endingLayer);
  this.endingTitle.focus();
}
```

In `SurvivalPhase.presentTerminalOnce`, require `snapshot.ending` and pass it once:

```ts
if (snapshot.ending === null || snapshot.ending.id === 'dorothy') {
  throw new Error('Terminal survival snapshot is missing its ending record.');
}
this.presentedTerminalState = snapshot.state;
this.audio.ending(snapshot.ending.id);
this.ui.showEnding?.(snapshot.ending);
```

- [ ] **Step 5: Create one Dorothy record outside the frame loop**

Add a field to `ScavengePhase`:

```ts
private dorothyEnding: Extract<EndingRecord, { id: 'dorothy' }> | null = null;
```

When the session first reports failure, create:

```ts
if (next.status === 'failure' && this.dorothyEnding === null) {
  this.dorothyEnding = Object.freeze({
    id: 'dorothy', day: 0, savedPickupCount: next.savedCount,
  });
}
```

Pass the stored reference to `GameUI.renderEnding`.

Do not create a new record on later frames.

Change the GameUI method to require the record whenever the ending is visible:

```ts
renderEnding(
  stage: ScavengeEndingStage,
  blackout: number,
  record: Extract<EndingRecord, { id: 'dorothy' }> | null,
): void {
  const visible = stage === 'endingHold' || stage === 'menuReady';
  if (visible && record === null) {
    throw new Error('Dorothy ending record is missing.');
  }
  if (record !== null) this.renderEndingRecord(record);
}
```

Preserve the current stage visibility and blackout updates after record validation.

- [ ] **Step 6: Restart scavenging from the Dorothy action**

Rename the third `createScavenge` callback from `onReturnToMenu` to `onRestart`.

Rename `GameUI.onReturnToMenu` to `onRestart`.

Rename `handleReturnToMenu` to `handleRestart` and `returnToMenuHandled` to `restartHandled`.

Wire `ScavengePhase` to the renamed callback.

In `Game.createScavengePhase`, pass:

```ts
() => this.restartFrom(generation)
```

Delete `returnToMenuFromScavenge` and its menu-transition tests.

Add a lifecycle test that calls the captured callback and expects a second scavenging phase with a fresh seed.

- [ ] **Step 7: Style and inspect the ending panels**

Add sparse rules using existing panel materials:

```css
.ending-copy {
  max-width: 34rem;
  color: #b9b5a7;
  line-height: 1.55;
  text-align: center;
}

.ending-cause,
.ending-stats {
  letter-spacing: 0.08em;
  text-align: center;
}

.ending-cause[hidden] { display: none; }
```

Keep the world visible behind the survival overlay.

Review at 1280 by 720 and 1920 by 1080.

Confirm the title, two short lines, and restart action fit without scrolling.

- [ ] **Step 8: Run ending flow tests**

Run: `node node_modules/vitest/vitest.mjs run tests/EndingRecord.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts`

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```powershell
git add src/Game.ts src/phases/ScavengePhase.ts src/ui/GameUI.ts src/ui/SurvivalUI.ts src/styles/main.css src/survival/SurvivalPhase.ts tests/GameLifecycle.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: unify game ending panels"
```

---

### Task 7: Add the Competent-Player Balance Simulator

**Files:**

- Create: `src/survival/balanceSimulation.ts`
- Create: `scripts/simulate-survival-balance.ts`
- Create: `tests/BalanceSimulation.test.ts`
- Modify: `package.json`
- Modify after measured tuning: `src/survival/events.ts`
- Modify after measured tuning: `tests/survivalEvents.test.ts`

**Interfaces:**

- Produces: `enumerateMissingPickupSets(): readonly MissingPickupSet[]`.
- Produces: `runBalanceSimulation(config): BalanceReport`.
- Produces: `bun run balance:survival`.
- Consumes: only production session, event, fishing, and item rules.

- [ ] **Step 1: Write failing enumeration and determinism tests**

Create `tests/BalanceSimulation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  enumerateMissingPickupSets,
  runBalanceSimulation,
} from '../src/survival/balanceSimulation';

describe('survival balance simulation', () => {
  it('enumerates all three-pickup omissions', () => {
    const sets = enumerateMissingPickupSets();
    expect(sets).toHaveLength(1330);
    expect(new Set(sets.map(({ key }) => key)).size).toBe(1330);
    expect(sets.every(({ missing, saved }) => missing.length === 3 && saved.length === 18))
      .toBe(true);
  });

  it('is deterministic for the same policy and seeds', () => {
    const config = { loadoutLimit: 8, seedsPerLoadout: 2, fishingReactionSuccess: 0.90 };
    expect(runBalanceSimulation(config)).toEqual(runBalanceSimulation(config));
  });

  it('reports every terminal outcome', () => {
    const report = runBalanceSimulation({
      loadoutLimit: 8, seedsPerLoadout: 2, fishingReactionSuccess: 0.90,
    });
    expect(report.totalRuns).toBe(16);
    expect(report.rescued + report.dead + report.sunk + report.taken + report.blocked)
      .toBe(report.totalRuns);
    expect(Object.keys(report.byMissingPickupSet)).toHaveLength(8);
    expect(Object.values(report.byRescueLead)
      .reduce((sum, bucket) => sum + bucket.totalRuns, 0)).toBe(16);
  });
});
```

- [ ] **Step 2: Run the simulation test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run tests/BalanceSimulation.test.ts`

Expected: FAIL because the simulation module does not exist.

- [ ] **Step 3: Implement physical pickup enumeration and report types**

Use production scavenge instances:

```ts
export interface MissingPickupSet {
  readonly key: string;
  readonly missing: readonly ItemInstance[];
  readonly saved: readonly ItemInstance[];
}

export interface BalanceSimulationConfig {
  readonly seedsPerLoadout: number;
  readonly fishingReactionSuccess: number;
  readonly loadoutLimit?: number;
}

export interface BalanceOutcomeBucket {
  readonly totalRuns: number;
  readonly rescued: number;
  readonly dead: number;
  readonly sunk: number;
  readonly taken: number;
  readonly blocked: number;
}

export interface BalanceReport extends BalanceOutcomeBucket {
  readonly rescueRate: number;
  readonly averageRescueDay: number | null;
  readonly averageNoSignalRescueDay: number | null;
  readonly blockedLoadouts: readonly string[];
  readonly unrescuedLoadouts: readonly string[];
  readonly endingsByDay: Readonly<Record<string, number>>;
  readonly byMissingPickupSet: Readonly<Record<string, BalanceOutcomeBucket>>;
  readonly byRescueLead: Readonly<Record<string, BalanceOutcomeBucket>>;
}

export function enumerateMissingPickupSets(): readonly MissingPickupSet[] {
  const pickups = createScavengeItemInstances();
  const sets: MissingPickupSet[] = [];
  for (let first = 0; first < pickups.length - 2; first += 1) {
    for (let second = first + 1; second < pickups.length - 1; second += 1) {
      for (let third = second + 1; third < pickups.length; third += 1) {
        const omitted = new Set([first, second, third]);
        const missing = pickups.filter((_, index) => omitted.has(index));
        const saved = pickups.filter((_, index) => !omitted.has(index));
        sets.push(Object.freeze({
          key: missing.map(({ instanceId }) => instanceId).join('|'),
          missing: Object.freeze(missing),
          saved: Object.freeze(saved),
        }));
      }
    }
  }
  return Object.freeze(sets);
}
```

Reject non-positive seed counts and fishing success outside zero through one.

- [ ] **Step 4: Encode the competent event policy explicitly**

Use this complete preference map:

```ts
const EVENT_CHOICE_PRIORITY = Object.freeze({
  'dangerous-waters': ['map', 'compass', 'sleep'],
  leak: ['ductTape', 'bucket', 'map', 'sleep'],
  'school-of-fish': ['fishingNet', 'bucket', 'spyglass', 'sleep'],
  snatcher: ['shotgun', 'spyglass', 'swimRing', 'fishingNet', 'sleep'],
  'death-stare': ['shotgun', 'flashlight', 'umbrella', 'cannedFood', 'sleep'],
  'swarm-of-anglerfish': ['fishingNet', 'shotgun', 'baitTin', 'sleep'],
  tornado: ['anchor', 'swimRing', 'sleep'],
  'shower-night': ['umbrella', 'bucket', 'map', 'sleep'],
  'windy-night': ['fishingNet', 'umbrella', 'map', 'sleep'],
  'bad-sleep': ['flashlight', 'bucket', 'swimRing', 'umbrella', 'sleep'],
  thunderstorm: ['anchor', 'umbrella', 'bucket', 'sleep'],
  'restless-waves': ['anchor', 'swimRing', 'sleep'],
  'man-in-the-fog': ['compass', 'flashlight', 'sleep'],
  ghosts: ['flashlight', 'sleep', 'flareGun'],
  'eerie-melody': ['ductTape', 'umbrella', 'bucket', 'sleep', 'spyglass'],
  'face-on-the-moon': ['umbrella', 'spyglass', 'sleep'],
  'shadow-figure': ['sleep'],
  'guarded-sleep': ['watch', 'sleep'],
  'drifting-barrel': ['retrieve', 'delegate-carlitos', 'sleep'],
  'drifting-chest': ['retrieve', 'delegate-carlitos', 'sleep'],
  'drifting-bottle': ['retrieve', 'delegate-carlitos', 'sleep'],
  'check-the-back': ['check', 'sleep'],
  flowers: ['fishingNet', 'bucket', 'sleep'],
  'chest-attack': ['fishingNet', 'sleep'],
  'midnight-tour': ['sleep'],
  'night-trader': ['sleep'],
  handyman: ['sleep'],
  'other-people': ['flareGun', 'flashlight', 'sleep'],
} as const satisfies Readonly<Record<SurvivalEventId, readonly string[]>>);
```

For fallback IDs, choose `sleep`.

For each preferred item choice, select the first usable matching instance.

For each contextual choice, call `resolveEvent({ kind: 'choice', choiceId })`.

Rejected choices do not consume a random draw. Continue to the next preference.

Throw when no listed choice resolves an active event.

- [ ] **Step 5: Implement the day policy and fishing driver**

Apply this order on every playable day:

```ts
function runCompetentDay(
  session: SurvivalSession,
  policyRandom: RandomSource,
  fishingReactionSuccess: number,
): void {
  resolvePendingDayEvent(session);
  if (session.snapshot().state !== 'day') return;

  careForCarlitos(session);
  while (session.snapshot().hunger >= 52 && session.snapshot().food > 0) {
    session.perform('eat');
  }
  if (session.snapshot().health <= 60) session.perform('treat');
  repairHullBelowSixty(session);
  if (session.availableReason('sendMessage') === null) session.perform('sendMessage');

  const snapshot = session.snapshot();
  const canSeekTrace = snapshot.rescueTraceFinds < 2
    && snapshot.food >= 3
    && snapshot.health >= 70
    && session.availableReason('dive') === null;
  if (canSeekTrace) session.perform('dive');
  else fishOnceWhenPossible(session, policyRandom, fishingReactionSuccess);

  session.perform('endDay');
  resolvePendingNightEvent(session);
  if (session.snapshot().state === 'nightEvent'
    && session.snapshot().pendingEventId === null) session.beginDawn();
}
```

`careForCarlitos` pets once, feeds at Hunger three or lower, and treats at Sickness two or higher.

`repairHullBelowSixty` prefers repair material, then Duct Tape.

`fishOnceWhenPossible` drives the production attempt:

```ts
const begun = session.beginFishing();
if (!begun.accepted) return;
begun.attempt.cast({ x: 4, z: -2 });
begun.attempt.completeCast();
const catches = policyRandom.next() < fishingReactionSuccess;
begun.attempt.advance(
  begun.attempt.snapshot().biteDelaySeconds + (catches ? 0 : 1.5),
);
const terminal = catches
  ? begun.attempt.reel().result!
  : begun.attempt.snapshot().result!;
if (catches) begun.attempt.completeReel();
session.finishFishing(begun.attempt.snapshot().id, terminal);
```

Stop each run at a terminal ending or day 120. A day-120 non-terminal run marks its loadout blocked.

Implement report aggregation with production randomness:

```ts
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type OutcomeKey = 'rescued' | 'dead' | 'sunk' | 'taken' | 'blocked';
type MutableBucket = { -readonly [Key in keyof BalanceOutcomeBucket]: number };

function emptyBucket(): MutableBucket {
  return { totalRuns: 0, rescued: 0, dead: 0, sunk: 0, taken: 0, blocked: 0 };
}

function recordOutcome(bucket: MutableBucket, outcome: OutcomeKey): void {
  bucket.totalRuns += 1;
  bucket[outcome] += 1;
}

function freezeBucket(bucket: MutableBucket): BalanceOutcomeBucket {
  return Object.freeze({ ...bucket });
}

export function runBalanceSimulation(
  config: BalanceSimulationConfig,
): BalanceReport {
  if (!Number.isInteger(config.seedsPerLoadout) || config.seedsPerLoadout <= 0) {
    throw new Error('seedsPerLoadout must be a positive integer.');
  }
  if (config.fishingReactionSuccess < 0 || config.fishingReactionSuccess > 1) {
    throw new Error('fishingReactionSuccess must be between zero and one.');
  }
  if (config.loadoutLimit !== undefined
    && (!Number.isInteger(config.loadoutLimit) || config.loadoutLimit <= 0)) {
    throw new Error('loadoutLimit must be a positive integer.');
  }

  const allLoadouts = enumerateMissingPickupSets();
  const loadouts = config.loadoutLimit === undefined
    ? allLoadouts
    : allLoadouts.slice(0, config.loadoutLimit);
  const rescueDays: number[] = [];
  const noSignalRescueDays: number[] = [];
  const blockedLoadouts = new Set<string>();
  const totals = emptyBucket();
  const endingsByDay: Record<string, number> = {};
  const byMissingPickupSet: Record<string, BalanceOutcomeBucket> = {};
  const byRescueLead = new Map<number, MutableBucket>();

  loadouts.forEach((loadout, loadoutIndex) => {
    const loadoutBucket = emptyBucket();
    for (let runIndex = 0; runIndex < config.seedsPerLoadout; runIndex += 1) {
      const seed = (
        Math.imul(loadoutIndex + 1, 0x045d9f3b)
        ^ Math.imul(runIndex + 1, 0x27d4eb2d)
      ) >>> 0;
      const session = new SurvivalSession(loadout.saved, { seed });
      const policyRandom = mulberry32(seed ^ 0x9e3779b9);

      while (session.snapshot().ending === null && session.snapshot().day <= 120) {
        runCompetentDay(session, policyRandom, config.fishingReactionSuccess);
      }

      const ending = session.snapshot().ending;
      const rescueLead = session.snapshot().rescueLead;
      const leadBucket = byRescueLead.get(rescueLead) ?? emptyBucket();
      byRescueLead.set(rescueLead, leadBucket);
      const outcome: OutcomeKey = ending === null
        ? 'blocked'
        : ending.id === 'rescue'
          ? 'rescued'
          : ending.id === 'death'
            ? 'dead'
            : ending.id === 'sinking'
              ? 'sunk'
              : 'taken';
      recordOutcome(totals, outcome);
      recordOutcome(loadoutBucket, outcome);
      recordOutcome(leadBucket, outcome);

      if (ending === null) {
        blockedLoadouts.add(loadout.key);
      } else {
        const dayKey = `${ending.id}:${ending.day}`;
        endingsByDay[dayKey] = (endingsByDay[dayKey] ?? 0) + 1;
      }
      if (ending?.id === 'rescue') {
        rescueDays.push(ending.day);
        if (!ending.signalAssisted) noSignalRescueDays.push(ending.day);
      }
    }
    byMissingPickupSet[loadout.key] = freezeBucket(loadoutBucket);
  });

  const totalRuns = loadouts.length * config.seedsPerLoadout;
  return Object.freeze({
    ...freezeBucket(totals),
    rescueRate: totalRuns === 0 ? 0 : totals.rescued / totalRuns,
    averageRescueDay: average(rescueDays),
    averageNoSignalRescueDay: average(noSignalRescueDays),
    blockedLoadouts: Object.freeze([...blockedLoadouts].sort()),
    unrescuedLoadouts: Object.freeze(Object.entries(byMissingPickupSet)
      .filter(([, bucket]) => bucket.rescued === 0)
      .map(([key]) => key)
      .sort()),
    endingsByDay: Object.freeze({ ...endingsByDay }),
    byMissingPickupSet: Object.freeze({ ...byMissingPickupSet }),
    byRescueLead: Object.freeze(Object.fromEntries(
      [...byRescueLead.entries()].map(([lead, bucket]) => [lead, freezeBucket(bucket)]),
    )),
  });
}
```

Import `mulberry32` from `src/survival/random.ts`.

- [ ] **Step 6: Add the CLI and package command**

Create `scripts/simulate-survival-balance.ts`:

```ts
import { runBalanceSimulation } from '../src/survival/balanceSimulation';

const report = runBalanceSimulation({
  seedsPerLoadout: 100,
  fishingReactionSuccess: 0.90,
});

console.log(JSON.stringify(report, null, 2));

if (report.blockedLoadouts.length > 0) process.exitCode = 1;
if (report.unrescuedLoadouts.length > 0) process.exitCode = 1;
if (report.taken !== 0) process.exitCode = 1;
if (report.rescueRate < 0.68 || report.rescueRate > 0.72) process.exitCode = 1;
if (report.averageRescueDay === null
  || report.averageRescueDay < 29
  || report.averageRescueDay > 32) process.exitCode = 1;
if (report.averageNoSignalRescueDay === null
  || report.averageNoSignalRescueDay < 36
  || report.averageNoSignalRescueDay > 40) process.exitCode = 1;
```

Add to `package.json`:

```json
"balance:survival": "bun scripts/simulate-survival-balance.ts"
```

- [ ] **Step 7: Run the smoke simulation**

Run: `node node_modules/vitest/vitest.mjs run tests/BalanceSimulation.test.ts`

Expected: all tests pass.

- [ ] **Step 8: Run the full balance evaluation and tune allowed event values**

Run: `bun run balance:survival`

Required results:

- `blockedLoadouts.length` equals zero.
- `unrescuedLoadouts.length` equals zero.
- Rescue rate is 0.68 through 0.72.
- Average successful rescue day is 29 through 32.
- Average no-signal rescue day is 36 through 40.
- Taken count is zero under the competent policy.

If rescue rate is low, reduce dangerous-event failure damage or dangerous base weights.

If rescue rate is high, raise dangerous base weights or break chances within approved ranges.

Do not change the rescue curve, day-24 gate, eight-lead cap, Energy costs, pressure curve, or 60-point cap.

Update exact catalog expectations in `tests/survivalEvents.test.ts` after each authored tuning change.

Rerun the focused event and session tests after every tuning pass.

- [ ] **Step 9: Commit**

```powershell
git add package.json src/survival/balanceSimulation.ts scripts/simulate-survival-balance.ts tests/BalanceSimulation.test.ts src/survival/events.ts tests/survivalEvents.test.ts
git commit -m "test: add survival balance simulation"
```

---

### Task 8: Update Documentation and Verify the Complete Game

**Files:**

- Modify: `README.md`
- Verify: every file modified by Tasks 1 through 7.

**Interfaces:**

- Consumes: final measured balance values from Task 7.
- Produces: current player-facing rule documentation and final verification evidence.

- [ ] **Step 1: Update gameplay documentation**

Replace the old rescue paragraph with these facts:

- Natural rescue cannot occur before day 24.
- Rescue remains random after day 24.
- Bottled Paper, rescue-trace dives, and Other People shorten the hidden wait.
- Other People never ends the run immediately.
- Exact rescue progress and odds remain hidden.
- A well-supplied successful run targets about day 30.
- A no-signal successful run can reach day 40.

Update the action list:

- Fishing costs two Energy.
- Bottled Paper adds hidden rescue lead.
- The Flare Gun is consumed during Other People.

Update pressure documentation:

- Quiet-night chances fall as pressure rises.
- Dangerous event weights rise by 25 percent per pressure level.
- Event damage no longer doubles on day 50.

Document all five ending titles and their trigger categories.

Remove every claim that Flare Gun or Flashlight gives immediate rescue.

- [ ] **Step 2: Run focused rule tests**

Run: `node node_modules/vitest/vitest.mjs run tests/SurvivalBalance.test.ts tests/RunPressure.test.ts tests/survivalEvents.test.ts tests/eventResolver.test.ts tests/SurvivalSession.test.ts tests/BalanceSimulation.test.ts`

Expected: all selected tests pass.

- [ ] **Step 3: Run focused ending and flow tests**

Run: `node node_modules/vitest/vitest.mjs run tests/EndingRecord.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/GameLifecycle.test.ts tests/OtherPeoplePerformance.test.ts`

Expected: all selected tests pass.

- [ ] **Step 4: Run the full balance command**

Run: `bun run balance:survival`

Expected: exit code 0 with zero blocked loadouts and all approved metric ranges.

- [ ] **Step 5: Run static verification**

Run: `node node_modules/typescript/bin/tsc --noEmit`

Expected: exit code 0.

Run: `node node_modules/vite/bin/vite.js build`

Expected: production build completes with exit code 0.

- [ ] **Step 6: Run the complete test suite**

Run: `node node_modules/vitest/vitest.mjs run`

Expected: every test file passes.

- [ ] **Step 7: Check obsolete paths and scope**

Run: `git grep -n "rescueProgress\|minimumRescueProgress\|bottledPaperRescueProgress\|effects\.rescue\|people-rescue\|people-missed\|SurvivalEndingReason\|endingReason\|kidnapped\|nightDamageMultiplier\|NIGHT_DAMAGE_DOUBLE_DAY" -- src tests README.md`

Expected: no output.

Run: `git status --short`

Expected: only approved implementation and existing unrelated user files appear.

- [ ] **Step 8: Commit documentation**

```powershell
git add README.md
git commit -m "docs: update survival length and endings"
```

- [ ] **Step 9: Record final evidence**

Run: `git log --oneline --decorate -9`

Record these values in the completion report:

- Focused test results.
- Full test count.
- Typecheck result.
- Production build result.
- Balance rescue rate.
- Average successful rescue day.
- Average no-signal rescue day.
- Blocked-loadout count.
- Ending-panel checks at 1280 by 720 and 1920 by 1080.
- Final commit IDs.
