# Energy-Scaled Hull Repair Design

## Goal

The permanent toolbox repairs the lifeboat without supplies.

Repair spends available Energy automatically. Each Energy restores up to 33 Hull.

Remove repair material from the game. Keep Duct Tape only for broken item repairs.

## Repair Rule

Repair is available during the day when Hull is below 100 and Energy is above zero.

Calculate the result once with a shared pure function:

```text
missingHull = 100 - hull
energySpent = min(energy, 3, ceil(missingHull / 33))
hullRestored = min(missingHull, energySpent * 33)
```

The action commits `energy: -energySpent` and `hull: hullRestored`.

Repair never spends more than three Energy. Bonus Energy above three remains available.

Repair stops at 100 Hull. It never wastes Energy after the Hull becomes full.

| Starting Energy | Starting Hull | Energy spent | Hull restored | Final state |
| --- | ---: | ---: | ---: | --- |
| 3 | 7 | 3 | 93 | Energy 0, Hull 100 |
| 3 | 90 | 1 | 10 | Energy 2, Hull 100 |
| 1 | 7 | 1 | 33 | Energy 0, Hull 40 |
| 3 | 66 | 2 | 34 | Energy 1, Hull 100 |
| 4 | 1 | 3 | 99 | Energy 1, Hull 100 |

Hull 100 remains unavailable because no repair is needed. Energy zero remains unavailable because repair needs at least one Energy.

## Game-State Changes

Remove `repairMaterial` from resource deltas, snapshots, checkpoints, saves, reward summaries, journals, and session state.

Remove the `hullRepair` action option. Hull repair takes no option. Item repair keeps its target option.

Remove repair-material storage groups, boat props, interaction records, labels, and counts.

Remove hull repair with Duct Tape. Duct Tape remains a one-use item for broken item repairs.

Use the shared repair calculation for action rules, committed deltas, balance simulation, and UI previews.

The UI shows the exact Energy cost and Hull gain before repair. It uses the normal hull-repair sound and animation.

No save migration or compatibility layer will preserve repair material.

## Reward Changes

Common repair-material rewards become Food and Bait:

- A successful Dive reward gives Food at 37.5% and Bait at 37.5%.
- Its remaining 25% gives a rescue trace, or nothing after the trace cap.
- A Drifting Supplies barrel or cooler gives Food at 60% and Bait at 40%.
- A Drifting Supplies container gives Food at 55%, Bait at 35%, and an Energy Bar at 10%.
- A Wreckage surface search gives Food at 43%, Bait at 37%, and injury at 20%.

Rare repair-material rewards become Duct Tape:

- The Chest converts its repair-material reward weight into a Duct Tape item reward.
- The existing rare Wreckage dive Duct Tape reward remains unchanged.

The Chest keeps the previous combined repair-related weight. Duct Tape has weight four when none is active and weight two when one is active.

Removed repair outcomes and identifiers do not remain as aliases.

## Tests

Unit tests cover the five repair examples and both unavailable states.

Session tests prove repair needs no item or resource. They also prove Duct Tape is not consumed.

UI tests prove the preview matches the committed Energy and Hull deltas.

Reward tests cover every new probability boundary and Chest Duct Tape weight.

Save, journal, event, world-display, and type tests remove all repair-material fields and fixtures.

Verification runs lint, type checking, all tests, the production build, and the survival balance simulation.

The balance report records changed survival results. It does not hide them with unrelated tuning.
