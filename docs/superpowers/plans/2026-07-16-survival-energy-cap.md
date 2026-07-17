# Survival Energy Cap of Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make three the maximum energy available in the lifeboat survival phase, matching the original game.

**Architecture:** `SURVIVAL_BALANCE` is already the source of truth for session start, dawn recovery, and energy recovery clamping. Change its three maximum-related values from four to three; `SurvivalSession` will apply the new cap without control-flow changes. Lock the behavior down through the existing balance and session tests, and align the README's player-facing text.

**Tech Stack:** TypeScript, Vitest, Bun, Vite.

## Global Constraints

- Keep survival rules deterministic and testable without a renderer.
- Keep `SURVIVAL_BALANCE` as the single owner of survival numerical values.
- Preserve action costs, hunger thresholds, starvation energy, events, and non-survival phases.
- Do not add assets, dependencies, saves, touch controls, crewmates, multiplayer, or progression.

---

### Task 1: Set and document the three-energy survival maximum

**Files:**
- Modify: `tests/survivalInventory.test.ts:119-123`
- Modify: `tests/SurvivalSession.test.ts:66-76, 181-186`
- Modify: `tests/SurvivalUI.test.ts:100-112, 590-606, 800-809, 1160-1184`
- Modify: `src/survival/survivalBalance.ts:1-9`
- Modify: `src/ui/SurvivalUI.ts:1-95`
- Modify: `README.md:67-77`
- Modify: `docs/superpowers/plans/2026-07-16-survival-energy-cap.md`

**Interfaces:**
- Consumes: `SURVIVAL_BALANCE.start.energy`, `SURVIVAL_BALANCE.dawn.normalEnergy`, and `SURVIVAL_BALANCE.actions.maximumEnergy`.
- Produces: a day-one session, normal dawn refill, Rest, and Energy Bar recovery capped at `3` through the existing `SurvivalSession` logic, with matching accessible UI meter and recovery previews.

- [ ] **Step 1: Write the failing regression expectations**

In `tests/survivalInventory.test.ts`, replace the existing approved starting-balance assertion with:

```ts
expect(SURVIVAL_BALANCE.start).toEqual({ health: 100, hunger: 20, energy: 3, hull: 75 });
expect(SURVIVAL_BALANCE.dawn.normalEnergy).toBe(3);
expect(SURVIVAL_BALANCE.actions.maximumEnergy).toBe(3);
expect(SURVIVAL_BALANCE.dawn.hungerIncrease).toBe(18);
expect(SURVIVAL_BALANCE.rescue.firstDay).toBe(5);
```

In `tests/SurvivalSession.test.ts`, update the day-one snapshot expectation and Energy Bar test to assert the new cap:

```ts
expect(state).toMatchObject({
  state: 'day', day: 1, health: 100, hunger: 20, energy: 3, hull: 75, food: 1,
});

it('uses the Energy Bar to restore the three-energy maximum', () => {
  const session = new SurvivalSession(saved('energyBar'), { seed: 1, initial: { energy: 1 } });
  expect(session.perform('useEnergyBar')).toMatchObject({ deltas: { energy: 2 } });
  expect(session.snapshot().energy).toBe(3);
  expect(session.snapshot().inventory['energyBar-1']?.condition).toBe('consumed');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for the old four-energy balance**

Run: `bun run test -- tests/survivalInventory.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because the current balance exposes `start.energy`, `dawn.normalEnergy`, and `maximumEnergy` as `4`, causing the new three-energy assertions to fail.

- [ ] **Step 3: Change the centralized survival balance**

In `src/survival/survivalBalance.ts`, make the maximum-related values read:

```ts
export const SURVIVAL_BALANCE = {
  start: { health: 100, hunger: 20, energy: 3, hull: 75 },
  dawn: { hungerIncrease: 18, starvationDamage: 15, normalEnergy: 3, hungryEnergy: 3, starvingEnergy: 2 },
  thresholds: { hungry: 70, starving: 90, maximum: 100 },
  actions: {
    fishEnergy: 2, diveEnergy: 3, repairEnergy: 2,
    foodHunger: -35, repairHull: 25, tapeHull: 15, treatmentHealth: 30, restEnergy: 2,
    bottledPaperEnergy: 1, bottledPaperRescueProgress: 15, maximumEnergy: 3,
  },
  // Keep all remaining balance sections unchanged.
} as const;
```

Do not edit `SurvivalSession.ts`: it already initializes from `start.energy`, selects the dawn tiers, and uses `maximumEnergy` for recovery validation and clamping.

- [ ] **Step 4: Run the focused tests and verify the regression expectations pass**

Run: `bun run test -- tests/survivalInventory.test.ts tests/SurvivalSession.test.ts`

Expected: PASS with the fresh session at three energy and an Energy Bar adding two energy from one to the three-energy cap.

**Full-suite follow-up:** `SurvivalUI` also displayed a hard-coded four-energy meter maximum and recovery previews. Add focused UI expectations for an energy meter maximum of `3`, an Energy Bar preview of `ENERGY TO 3`, and a full-energy Rest preview of `ENERGY +0`; then derive those UI values from `SURVIVAL_BALANCE` and run:

```bash
bun run test -- tests/SurvivalUI.test.ts
```

Expected: PASS with all UI meter and preview values matching the three-energy survival cap.

- [ ] **Step 5: Update player-facing survival copy**

In `README.md`, replace the two affected sentences with:

```md
In the lifeboat, each day gives three energy for daytime actions:
```

```md
- **Eat Energy Bar** consumes the bar and restores energy to three.
```

- [ ] **Step 6: Run the full project verification suite**

Run: `bun run typecheck; bun run test; bun run build`

Expected: each command exits with code `0`; all Vitest tests, including `SurvivalUI.test.ts`, pass and the Vite production build completes.

- [ ] **Step 7: Review and commit the focused change**

Run: `git diff --check -- src/survival/survivalBalance.ts src/ui/SurvivalUI.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts README.md docs/superpowers/plans/2026-07-16-survival-energy-cap.md`

Expected: no output.

```bash
git add -- src/survival/survivalBalance.ts src/ui/SurvivalUI.ts tests/survivalInventory.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts README.md docs/superpowers/plans/2026-07-16-survival-energy-cap.md
git commit -m "fix: cap survival energy at three"
```
