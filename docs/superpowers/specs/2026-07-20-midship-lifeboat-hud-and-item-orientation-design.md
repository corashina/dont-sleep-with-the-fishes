# Midship Lifeboat, Scavenging HUD, and Item Orientation Design

## Goal

Move the scavenging lifeboat and its drop-off area to the middle of the freighter, place the countdown watch to the right of the three carry circles, and make each supply rest in a natural pose.

## Scope

This change affects the scavenging ship layout, scavenging HUD layout, and the shared runtime item presentation manifest. It keeps scavenging rules, carry capacity, timer behavior, item placement categories, survival rules, and vessel motion unchanged.

The lifeboat remains outside the starboard rail. "Middle" means the ship's longitudinal midpoint at local `z = 0`. Containers with a natural upright stance, including food cans and the bucket, keep that pose.

## Midship Lifeboat Station

`src/world/ShipLayout.ts` will keep the authored station geometry and navigation data aligned at `z = 0`:

- lifeboat station bounds: `x = 3.8..6`, `z = -1.6..1.6`;
- station clear center: `x = 5.05..5.75`, `z = -0.35..0.35`;
- evacuation target: `[5.4, 0]`;
- evacuation rectangle: `x = 5.05..5.75`, `z = -0.35..0.35`;
- starboard rail opening: center `z = 0`, width `3.2`.

`src/world/Ship.ts` will move the physical endpoints to match the layout:

- evacuation point: `[5.4, 3.72, 0]`;
- lifeboat anchor: `[9.0, 0.35, 0]`.

The boat will keep its current scale, starboard offset, acceptance box, buoyancy, and water exclusion. The existing world code will continue to apply wave-driven motion around the new anchor. Throw acceptance and evacuation distance checks will use the moved world objects and points without new rules.

The centered rail opening overlaps an existing midship collision test. Tests will replace the old expectation of a solid midship rail with assertions that the new opening permits the intended crossing while rail segments outside the opening still block the player.

## Scavenging HUD

`src/ui/GameUI.ts` will keep the carry-circle row before the pocket watch in DOM order. `src/styles/main.css` will change `.carried` from a vertical column to a horizontal row. The watch will sit to the right of the three circles with a small gap and no top margin.

The desktop layout will remain centered as one group with a 12-pixel gap between the circle row and watch. The narrow viewport rule will keep the existing 64-pixel circles, use an 8-pixel group gap, and fit the watch within a 96-by-72-pixel box. The timer text, critical-state animation, crosshair, prompt, and FPS overlay will retain their behavior. The existing reduced-motion rule will continue to suppress optional animation.

## Item Orientation Audit

`src/world/itemModelManifest.ts` will remain the shared source for model rotations in scavenging and survival. The audit uses the meaning and contact surface of each object. It will not rotate models from dimensions alone.

The following corrections will make gear rest on a broad side:

| Item | Rotation |
| --- | --- |
| Duct Tape | `[0, 0, 0]` |
| Fishing Net | `[Math.PI / 2, 0, 0]` |
| Scuba Gear | `[Math.PI / 2, 0, 0]` |
| Bottled Paper | `[Math.PI / 2, 0, 0]` |
| Umbrella | `[Math.PI / 2, 0, 0]` |
| Flashlight | `[Math.PI / 2, 0, 0]` |

The fishing rod keeps its existing quarter-turn because that pose places its long axis parallel to the deck. Food, bait, compass, map, medkit, spyglass, bucket, flare gun, anchor, swim ring, harpoon gun, and energy bar keep their current rotations. Food and bucket remain upright because that pose matches their normal resting orientation.

The manifest will recalculate normalized sizes and bounds from each corrected rotation. `ShipItemPlacement` will continue using those generated bounds for surface fit, clearance, scaling, and contact height. `src/world/BoatStorage.ts` will adjust the six affected slot heights so each corrected model preserves its prior lowest point above the lifeboat floor. The slot audit will also move a slot in the horizontal plane if the broader pose creates overlap. Boat storage will keep its type-specific yaw and scale after the shared model rotation.

## Testing

Tests will cover these contracts before production changes:

- `ShipLayout` defines the station, evacuation target, evacuation rectangle, and rail opening at `z = 0`;
- `Ship` exposes the matching evacuation point and lifeboat anchor;
- collision tests allow passage through the centered opening and block adjacent rail spans;
- throw simulation reaches the moved lifeboat from the moved drop-off point;
- `GameUI` keeps the dots before the watch and CSS arranges the group in one row at desktop and narrow widths;
- the manifest contains the approved rotations for all nineteen item types;
- normalized model bounds and authored ship placement remain valid after the rotation changes;
- corrected boat-storage props preserve their floor contact and do not overlap;
- scavenging and survival use the same corrected model templates.

After the focused red-green test cycles, run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Browser verification will inspect the active scavenging HUD, the centered starboard drop-off and lifeboat, all nineteen supplies on ship surfaces, and recovered supplies in the survival boat. Desktop and narrow viewport checks will confirm that the watch does not overlap the circles or leave the viewport.

## Acceptance Criteria

1. The scavenging lifeboat floats outside the starboard side at local `z = 0`.
2. The rail opening, drop-off target, evacuation trigger, and boat acceptance area align at the same midpoint.
3. The pocket watch appears to the right of the three carry circles during active scavenging.
4. Elongated gear lies on a natural side while food cans and the bucket remain upright.
5. Corrected item poses match in scavenging and survival.
6. Model audit, tests, typecheck, and production build pass.
