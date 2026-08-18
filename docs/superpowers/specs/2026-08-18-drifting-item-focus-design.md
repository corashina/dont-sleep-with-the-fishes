# Drifting Item Focus Design

## Summary

Drifting barrel, chest, and bottle events will start as world interactions.
The user's term "crate" maps to the existing drifting chest event.

The initial stern view will show the drifting item without a hover tooltip.
Selecting the item will move the camera to the existing fishing position.
The camera will turn toward the item and open a compact action panel.

The player or Carlitos can recover the item.
Recovered items will move to the bow and remain there until the event closes.
A back arrow will leave the item or return from a completed pickup.

## Goals

- Remove the initial hover tooltip from all three drifting items.
- Require item selection before pickup choices appear.
- Reuse the fishing camera position without coupling event state to fishing state.
- Keep the selected item framed during focus and pickup motion.
- Place recovered items at the bow near the focused camera.
- Add a separate energy resource for Carlitos.
- Preserve the current event rewards and weighted cargo outcomes.
- Keep mouse, keyboard, focus, and unavailable-state behavior clear.

## Non-goals

- Do not change fishing rules or fishing presentation.
- Do not change barrel or chest rewards.
- Do not add new drifting item types.
- Do not add reduced-motion behavior.
- Do not preserve obsolete drifting-event interaction paths.

## Interaction flow

### Initial reveal

The event reveal will retain the normal stern camera.
The active drifting item will remain clickable and keyboard accessible.
Its world anchor will set `tooltip: false`.
No pickup choice will appear before the item is selected.

The event will remain unresolved during this state.
Other commands will remain locked by the existing event presentation rules.

### Enter focus

Selecting `event:drifting-barrel`, `event:drifting-chest`, or
`event:drifting-bottle` will start event focus.
Repeated input will not start a second transition.

The camera will move to the same position used by fishing.
Its orientation will use the active presentation's item aim target.
The active item will remain framed while it floats.

The action panel will appear after the camera transition completes.
It will use the right screen edge and keep the screen center clear.
The panel will identify the item and show two pickup actions.

### Pickup actions

The player action will cost:

- Three player energy for the barrel.
- Three player energy for the chest.
- One player energy for the bottle.

The Carlitos action will cost three Carlitos energy for every item.
Existing Carlitos wellness rules will still control action availability.

Unavailable actions will remain visible.
Each unavailable action will explain the missing energy or wellness condition.
The session will validate the choice again before it changes state.

The bottle will gain a `delegate-carlitos` choice.
That choice will grant the same bottled paper as player retrieval.
It will not deduct player energy.

### Leave and return

The focus view will show a back arrow.
Before pickup, its accessible label will be `Let it drift and return`.
Selecting it will resolve the existing leave outcome.
The item will recede before the camera returns to the stern view.

After pickup, all three items will use the current drifting cargo result flow.
The existing panel will become the shared drifting item result panel.
Its Continue action will close the result and reveal the back arrow.
The arrow's accessible label will then be `Return to boat`.
Selecting it will return the camera to the stern view and clear the event.

The bottle's current `Sleep` leave choice will become `Let It Drift`.
Its result and lost-item motion will stay unchanged.

## Presentation architecture

### SurvivalPhase

`SurvivalPhase` will own the event-focus lifecycle.
It will distinguish these states:

- `idle`: no focused drifting item.
- `entering`: the camera is moving to the bow view.
- `choosing`: the action panel accepts one choice.
- `resolving`: pickup or leave motion is active.
- `result`: pickup result is visible in the bow view.
- `returning`: the camera is returning to the stern view.

The phase will lock duplicate input during transitions.
It will keep the event bundle active until the return completes.
It will connect UI actions to existing event resolution methods.

### BoatWorld

`BoatWorld` will expose explicit event-focus enter and exit methods.
Event focus will use its own state and animation operation.
Fishing state will remain unchanged.

The enter transition will reuse the fishing camera destination position.
It will calculate orientation from the active item's aim target.
The transition will use existing camera easing and duration conventions.

The focused camera update will reuse scratch vectors and quaternions.
It will not allocate objects in the frame loop.

The world will expose a bow pickup target.
It will replace the current stern or generic deck target for these items.
The target will keep each recovered item visible from the focused camera.

### Event presentations

`DriftingCargoPresentation` will use the bow pickup target for barrel and chest retrieval.
`DriftingBottlePresentation` will use the same target for bottle retrieval.
Existing wave motion, retrieve timing, and recede timing will remain.

Each presentation will continue to provide an interaction root, aim target,
and result root through `FeaturedEventPresentations`.

### SurvivalUI

`SurvivalUI` will add one drifting-item focus layer.
The layer will contain:

- The item heading.
- The player pickup action.
- The Carlitos pickup action.
- Clear energy costs and unavailable reasons.
- The back arrow.

The focus layer will use the existing event choice visual language.
It will use the same material, stroke, type, and focus treatment.
It will remain compact and keep the world dominant.

Focus will move into the panel after the camera transition.
Disabled actions will use `aria-disabled` and remain readable.
The back arrow will always have a text accessible label.
After a leave or completed event, focus will return to the normal command surface.

## Carlitos energy

`CarlitosState` will add an integer `energy` field.
The default value and maximum value will both be three.
State creation and mutation will clamp it between zero and three.

A successful `delegateCarlitos` event choice will deduct three Carlitos energy.
Rejected choices will not deduct energy.
The deduction will occur inside `SurvivalSession` with the event resolution.

At dawn, Carlitos will recover one energy after the existing dawn checks.
He will recover only if he survives those checks.
Recovery will stop at three.
Carlitos will not recover energy after death.

`CompanionEventActionAvailability` will include the energy constraint.
A living but tired Carlitos will remain visible as an unavailable choice.
The reason will report his current energy and the three-energy cost.

The Carlitos status card will add an `ENERGY` row with three steps.
Snapshots will expose the energy value through `CarlitosSnapshot`.
Carlitos dawn journal records will include before and after energy values.
Journal copy will report energy only when its value changes.

## Data rules

Barrel and chest player outcomes will keep their current resource effects.
Bottle player retrieval will keep its one-energy cost.

Carlitos barrel and chest outcomes will keep their current rewards.
The new bottle delegation outcome will grant `bottledPaper`.
All Carlitos pickup outcomes will use the fixed three-energy companion cost.

The leave arrow will map to each event's existing leave choice:

- `drifting-barrel`: `sleep` with `drifting-barrel.drift`.
- `drifting-chest`: `sleep` with `drifting-chest.drift`.
- `drifting-bottle`: `sleep` with `drifting-bottle.lost`.

## Lifecycle and errors

The focus operation will use the existing lifecycle generation checks.
Restart and disposal will cancel active focus work and restore the base camera.

Page hiding will settle active camera and item motion through existing visibility handling.
It will not resolve a choice or clear an unresolved event.

If a session choice fails, the focus panel will remain open.
The UI will show the rejection and restore its choosing state.

The event bundle will remain active during focused results.
It will release only after the camera return and event cleanup finish.

## Testing

### Carlitos state and session

- Carlitos starts with three energy.
- Energy clamps between zero and three.
- Living Carlitos recovers one energy at dawn.
- Recovery stops at three and does not occur after death.
- Successful delegation spends three energy.
- Rejected delegation spends no energy.
- Low energy keeps the action visible and unavailable.
- Dawn journal records include energy changes.

### Event rules

- Barrel and chest player costs remain three.
- Bottle player cost remains one.
- Bottle offers Carlitos delegation.
- Bottle delegation grants bottled paper without player energy loss.
- Each back arrow maps to the correct leave outcome.

### Phase flow

- Initial reveal does not enter focus.
- Item selection enters focus once.
- Choices remain hidden until entry completes.
- Pickup resolution remains in the bow view.
- Result Continue reveals the return arrow.
- Leave waits for recede motion before camera return.
- Restart, disposal, and visibility changes settle safely.

### World presentation

- Entry uses the fishing camera position.
- The camera aims at each selected item.
- All recovered items settle at the bow target.
- Exit restores the exact base camera pose.
- Frame updates do not create repeated setup or allocations.

### UI

- Initial drifting anchors have no tooltip node.
- The item anchor remains clickable and keyboard accessible.
- The side panel shows correct player and Carlitos costs.
- Disabled actions show clear reasons.
- The arrow label changes after pickup.
- Focus enters and leaves the panel correctly.

Run focused Vitest files during development.
Then run the full test suite, TypeScript checks, and production build.
