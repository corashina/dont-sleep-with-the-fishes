# Survival Energy Cap of Three — Design

## Goal

Match the original game's survival economy by making three the maximum energy available during the lifeboat survival phase.

## Scope

The centralized `SURVIVAL_BALANCE` remains the sole authority for survival energy. The change sets:

- starting energy to 3;
- normal dawn energy to 3;
- the recovery cap used by rest and Energy Bar actions to 3.

The hungry dawn value stays at 3 and the starving dawn value stays at 2. Action costs, hunger thresholds, event effects, and non-survival phases remain unchanged.

## Behaviour

A new survival session starts with three energy. At dawn, hunger below 70 refills energy to three; hunger from 70 through 89 also refills to three; hunger of 90 or higher refills to two. Rest and an Energy Bar can restore energy, but neither may raise it above three.

The existing balance constants already feed session initialization, dawn resolution, and energy recovery clamping, so no new state or special-case logic is needed.

## Documentation and Verification

Player-facing README text will describe three daily survival energy and Energy Bars restoring to three. Focused regression tests will assert the approved balance, a fresh session's energy, and Energy Bar recovery being capped at three. The focused tests, typecheck, and production build will verify the update.
