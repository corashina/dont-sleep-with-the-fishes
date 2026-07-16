# Survival repair tools and unified rest design

## Goal

Remove every orange interaction dot from the survival phase. Hull repair remains an in-world action, represented by a visible plank and hammer. Ending the day is the sole rest action and controls the three-point energy economy.

## Interaction design

The lifeboat will include a small repair-tool group beside the damaged hull patch. It contains named plank and hammer meshes, built from the project's native Three.js geometry and materials. No external asset is needed.

The group owns one projected bounding-box hit target. It uses the same invisible, correctly sized click area as recovered item props, so clicking the tools opens hull repair without displaying a marker. The target remains visible and reports the existing unavailable reason when the hull is full or no repair material is available.

The current fixed repair-patch, rest, and horizon anchors are removed. Consequently, the survival UI has no fixed-anchor dot treatment. Recovered items and the repair-tool group remain clickable through projected transparent targets; recovered items retain their existing hover/focus highlighting.

The top-right END DAY button is the only way to rest and finish the day. Rest is not available as a separate scene target, keyboard shortcut, action, cue, or snapshot state.

## Energy rules

Energy has a maximum of three.

- A new survival run starts at 3 Energy.
- Resolving the night through END DAY restores Energy at dawn to 3 normally, 2 when hungry, and 1 when starving.
- An Energy Bar restores Energy only up to the three-point maximum.
- Existing action costs remain unchanged: fish and hull repair cost 2 Energy; dive costs 3 Energy.

This preserves the existing hunger penalty while making END DAY the only rest path. The deterministic session remains the source of truth: dawn applies the recovery, so night events resolve before the next day's energy is set.

## Module boundaries

- `world/Lifeboat.ts` owns construction and naming of the repair-tool meshes, alongside the existing damaged patch.
- `survival/BoatWorld.ts` owns projection of the repair-tool bounds into an interaction anchor.
- `survival/BoatInteraction.ts` describes the anchor presentation/hit-area contract needed to distinguish transparent prop targets from removed fixed markers.
- `ui/SurvivalUI.ts` owns the transparent target styling, accessible repair-tool copy, and removal of the Rest command.
- `survival/SurvivalSession.ts`, `survival/survivalTypes.ts`, and `survival/survivalBalance.ts` own removal of Rest and the three-point energy rules.

## Accessibility and feedback

The repair-tool target remains keyboard-focusable and announces its label, repair effect, cost, and any unavailable reason. It never receives item-specific visual highlighting. END DAY retains its existing focusable top-right control and keyboard shortcut. Removing Rest also removes its shortcut from the documented command list.

## Verification

Tests will verify that:

- the lifeboat owns named plank and hammer meshes;
- repair projects as a transparent prop-sized target without any rest or end-day scene anchors;
- no fixed anchor/dot styling remains in the survival UI;
- the repair tools activate hull repair and still expose unavailable feedback;
- Rest is no longer a valid survival action or UI command;
- energy clamps at 3, starts at 3, recovers at dawn to 3/2/1 for normal/hungry/starving states, and Energy Bars respect the new cap;
- keyboard focus and END DAY behavior continue to work.

Run `bun run test`, `bun run typecheck`, and `bun run build` after implementation.
