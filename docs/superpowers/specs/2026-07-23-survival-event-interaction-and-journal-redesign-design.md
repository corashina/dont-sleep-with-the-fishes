# Survival Event Interaction and Journal Redesign

**Date:** 2026-07-23
**Status:** Approved design

## Goal

Replace the survival event response dialog with a scene-led sequence. The player sees the event through the lifeboat world, waits for the reveal to finish, and selects a suitable physical item on the boat. The selected model performs a short use animation before the session applies the event outcome.

Restyle the journal after the supplied reference screenshot. The new page keeps the current journal history and keyboard behavior while using a taller parchment leaf, dark cover, binding details, colored bookmarks, and a paper-strip close control.

## Scope

This milestone includes:

- a fade-to-sleep transition before night events and quiet nights;
- scene-led event reveals with authored captions;
- physical recovered-item selection in place of the event dialog;
- name-only tooltips and muted presentation for recovered items;
- eligibility highlighting after an event reveal;
- an Endure fallback when no usable item can help;
- a short camera and model animation for item use;
- exact-instance validation for duplicate item types;
- a journal visual redesign based on the supplied composition;
- keyboard, focus, reduced-motion, lifecycle, and disposal coverage;
- tests for the event definition, interaction, phase, world, and journal changes.

The milestone keeps event weights, outcomes, item durability, resource effects, quiet-night probability, and journal facts. It adds no save system, mobile controls, models, downloaded artwork, or event rebalance.

## Chosen Approach

`SurvivalPhase` owns the presentation sequence. `SurvivalSession` keeps rule and randomness ownership. `SurvivalUI` owns captions, tooltips, focus, and DOM interaction. `BoatWorld` owns camera movement, event effects, item materials, and model animation.

An internal presentation state records:

```text
idle -> sleeping -> revealing -> choosing -> using -> resolving -> idle
```

These stages do not enter `SurvivalSnapshot`. Session states remain `day`, `dayEvent`, `nightEvent`, and the existing terminal states.

This split keeps animation timing out of deterministic rules. It also gives one owner to each asynchronous step and temporary visual state.

## Player Flow

### Recovered items outside events

The boat keeps recovered-item targets available whenever the scene is visible. Pointer hover and keyboard focus show the item name. Recovered-item tooltips do not show descriptions, actions, costs, risks, condition prose, or event suitability.

BoatWorld applies a subdued, desaturated treatment to recovered models. The corresponding hit targets use a muted state. Hover and focus do not restore model color outside event selection. Permanent boat actions, such as fishing and repair, retain their current action and cost tooltips.

Broken items remain present when the current world rules show them. Consumed and lost items follow the existing visibility rules. Hover and focus do not activate a recovered item outside event selection.

### End Day and sleep

End Day commits the session transition once and locks survival commands.

For an event night, the phase runs this order:

1. Start the sleep cover and the existing nightfall presentation.
2. Reach black and hold for a short beat.
3. Render the committed night snapshot beneath the cover.
4. Uncover the nighttime scene.
5. Start the event reveal.

For a quiet night, the phase reaches black, holds, begins dawn, and uncovers the next day. It does not create event controls or an event caption.

Reduced-motion mode uses brief opacity changes and the same callback order. It removes the eyelid scale, camera nudge, model lift, and optional event motion.

### Event reveal

Every event definition gains one short `revealText` sentence. The title and sentence appear over the live scene during the reveal, then fade before item selection.

BoatWorld uses the event cue as the reveal source:

- `storm` changes light and weather treatment and adds boat motion;
- `impact` jolts the boat and camera;
- `fish` directs attention toward the water and fishing area;
- `darkness` lowers scene light;
- `sighting` exposes the distant vessel;
- other existing cues keep their established world presentation.

The reveal may use temporary light, tint, weather, or camera values. BoatWorld restores the committed session weather and base camera presentation after the sequence.

Recovered items remain hoverable and focusable during the visible reveal. Their names remain available, but activation has no effect. The phase does not enter `choosing` until the world cue and caption finish.

Day events use the same reveal path after the triggering daytime action. They skip the sleep cover.

### Item selection

At the start of `choosing`, the phase computes one immutable map from eligible physical instance IDs to authored choice IDs. It does not rebuild the map during frame updates.

BoatWorld restores normal color on suitable usable models and gives them a warm outline or halo. SurvivalUI applies the matching eligible state to their hit targets. Unsuitable, broken, or exhausted items stay desaturated.

Muted item buttons use `aria-disabled="true"` instead of native `disabled`. Keyboard users can focus them and read their names. SurvivalUI intercepts pointer, keyboard, and shortcut activation before it reaches the phase.

Eligible targets expose state through color, an outline, and accessible text. Color does not carry the state alone.

If the player has no suitable usable instance, SurvivalUI shows a small scene-level Endure action after the reveal. The control does not sit inside a dialog. If at least one eligible item exists, the phase requires an item response and keeps Endure hidden.

### Item use and resolution

Selecting an eligible item locks event input. SurvivalPhase records the choice ID and the clicked instance ID while the session still owns a pending event.

BoatWorld moves the camera toward that model by a small amount and lifts or tilts the model in place. The animation does not create a first-person hand pose or move the item to screen center. Reduced-motion mode uses a static selected highlight for the same interval.

After the animation, SurvivalPhase sends the typed response to the session. The session validates the instance again and commits the outcome. It then renders the new snapshot, updates meters and inventory, and shows the authored result as a short caption.

The event reveal cue does not run a second time for a nonterminal result. Accepted nonterminal event resolutions return `none` as their outcome cue because the phase has played the reveal. Rescue, death, and sinking keep their terminal cues.

A daytime event returns to daylight commands after resolution. A night event begins dawn after resolution. A terminal night result opens the ending and skips dawn.

## Event Response Contract

The response API identifies the physical instance:

```ts
type EventResponse =
  | {
      readonly kind: 'item';
      readonly choiceId: EventResponseId;
      readonly instanceId: ItemInstanceId;
    }
  | {
      readonly kind: 'endure';
    };
```

For an item response, `SurvivalSession` checks:

- the pending event contains `choiceId`;
- the choice contains an item type;
- `instanceId` exists in the current inventory;
- the instance type matches the choice item type;
- the instance condition is `usable`.

The session rejects a stale or mismatched response without changing random state, resources, inventory, event state, or journal history.

The selected instance becomes the concrete target for consumption, breakage, or protection when the authored response affects that item. Duplicate instances of one type cannot cause the session to animate one instance and mutate another.

An Endure response maps to the event's itemless fallback. The session accepts it only when no suitable usable event item exists. Each event continues to define one itemless fallback choice.

## Component Responsibilities

### `src/survival/events.ts`

- Add `revealText` to each event and fallback definition.
- Keep title, phase, cue, weight, choices, outcomes, day bounds, and cooldowns.
- Validate nonblank reveal text with the event catalog.

### `src/survival/SurvivalSession.ts`

- Validate typed event responses.
- Resolve the clicked item instance.
- Preserve deterministic random draws and outcome application.
- Record the choice, attempted item, resolution, mutations, and journal facts.
- Reject stale responses without partial mutation.

### `src/survival/SurvivalPhase.ts`

- Own the event presentation state.
- Sequence sleep, reveal, selection, item use, resolution, dawn, and ending.
- Compute the instance-to-choice eligibility map from the pending event and snapshot once per selection stage.
- Lock commands at each noninteractive stage.
- Check lifecycle generation after each awaited transition.
- Ignore repeated selections.

### `src/ui/SurvivalUI.ts`

- Remove the event overlay, response list, and event modal focus rules.
- Render the scene caption and Endure control.
- Route eligible recovered-item anchors to the event response callback during `choosing`.
- Keep muted anchors focusable and block their activation.
- Render recovered-item tooltips with the item name alone.
- Preserve rich tooltips for permanent boat actions.
- Announce reveal, selection availability, unavailable activation, and result through live regions without duplicate announcements.

### `src/survival/BoatWorld.ts`

- Own muted, eligible, selected, and base material states for recovered models.
- Allocate any per-instance material clones during world construction and track them for disposal.
- Avoid material allocation in update and render paths.
- Play event reveals from existing cue families.
- Animate the exact selected model and camera.
- Restore temporary transform, material, light, tint, weather, and camera state after completion or interruption.
- Dispose each owned material once.

### `src/styles/main.css`

- Remove event dialog and response-button styling.
- Style the scene caption, Endure control, muted anchors, eligible anchors, and selected state.
- Add the revised journal cover, page, binding, bookmark, navigation, and close treatment.
- Keep supported desktop layouts, focus visibility, and reduced-motion rules.

## Journal Design

The journal remains a browsing-only modal opened from the top journal marker. Opening it selects the newest completed entry. Closing it never advances time or changes survival state.

The new composition uses original CSS and inline SVG:

- a tall parchment leaf with a narrower width than the current page;
- a thick dark-brown leather cover around the paper;
- a visible left binding edge with small metal clip details;
- uneven page edges, paper fibers, salt marks, stains, and restrained rules;
- four decorative colored bookmarks on the right edge;
- a cover shadow over a soft vignette that leaves the boat visible;
- a paper-strip `X Close Journal` control near the bottom edge.

Each page keeps the current day heading, weather, daytime account, nighttime account, and folio. Subtle arrows inside the page edges browse history. Boundary arrows stay in the DOM with a faded disabled state. The colored bookmarks do not control navigation or represent categories.

The layout targets 1280 by 720 and 1920 by 1080. At short desktop heights, the story area scrolls inside the paper. The heading, navigation, folio, and close control remain reachable.

The modal traps focus, supports Escape, and restores focus to the journal marker. Navigation buttons expose descriptive labels. Reduced-motion mode removes page movement and keeps direct visibility changes.

## Accessibility and Input

- Pointer hover and keyboard focus expose the same recovered-item name.
- Muted items stay focusable during the visible event reveal and selection stages.
- Muted activation produces no session command.
- Eligible items use visible outline and shape treatment in addition to color.
- The scene caption uses a polite live region. A dangerous event may use assertive announcement once at reveal start.
- Endure joins the normal tab order when shown.
- Pause and terminal layers keep precedence over captions and event controls.
- The sleep cover and captions do not capture pointer input.
- Reduced motion preserves state order and selection timing.

## Lifecycle and Error Handling

- SurvivalPhase accepts one event response.
- The phase checks lifecycle generation after sleep, reveal, item use, resolution cue, and dawn.
- Restart and disposal invalidate pending continuations.
- Pause keeps event state intact and blocks new input.
- A pending event present at phase start enters the reveal path before selection.
- An unknown pending event ID remains a development error covered by catalog and phase tests.
- A rejected response keeps the event pending and restores selection if the lifecycle remains active.
- BoatWorld restores visual state if an animation ends, gets replaced, or the world disposes.
- SurvivalUI removes listeners, captions, focus state, and event routing during disposal.

## Testing

Implementation follows test-driven development.

### Event catalog tests

- Each event and fallback has nonblank reveal text.
- Existing IDs, choices, weights, bounds, cooldowns, and outcome data remain unchanged.

### Session tests

- The session accepts a matching usable instance.
- The session rejects missing, broken, consumed, lost, mismatched, and stale instances without mutation.
- Duplicate item types mutate the clicked instance.
- Endure works when no suitable usable item exists.
- Endure rejects when an eligible item exists.
- Journal records preserve suitable-item and Endure facts.

### Phase tests

- Event-night order is cover, nightfall, uncover, reveal, selection.
- Quiet-night order reaches dawn without event presentation.
- Day events enter reveal after the action cue.
- Item selection runs animation before session resolution.
- Repeated clicks resolve once.
- Night resolution reaches dawn; day resolution returns to day commands.
- Terminal resolution skips dawn.
- Restart, pause, and disposal prevent late callbacks from mutating state.
- Reduced motion preserves call order.

### UI tests

- Event dialog and generated response buttons do not exist.
- Recovered-item tooltips contain the item name alone.
- Permanent-action tooltips retain action details.
- Muted items support focus and block activation.
- Eligible items route the clicked instance and choice.
- Endure appears only with no eligible item.
- Captions announce once and do not trap focus.
- Journal markup, browsing, focus trap, Escape behavior, and focus restoration remain correct.

### World tests

- Recovered models use muted presentation outside event selection.
- Eligible models regain color and highlight after reveal.
- The clicked instance performs the item-use animation.
- Camera, model, light, weather, tint, and material values return to their base state.
- Reduced motion skips optional movement.
- Disposal releases owned material clones once.
- Update and render paths allocate no new materials or vectors.

### Completion checks

Run:

```text
bun run test
bun run typecheck
bun run build
```

Inspect these browser cases:

- quiet night;
- storm, fish, impact, darkness, and sighting reveals;
- one eligible item;
- several eligible items;
- no eligible item;
- duplicate item instances;
- interrupted item animation;
- day event, night event, and terminal event;
- journal at 1280 by 720 and 1920 by 1080;
- keyboard-only and reduced-motion operation.

## Acceptance Criteria

1. End Day fades to sleep before the player sees a night event or dawn.
2. The player sees each event in the live scene before event input activates.
3. The event dialog and response list no longer exist.
4. Recovered items remain hoverable and focusable by name whenever the scene is visible.
5. Suitable usable physical items gain color and highlight after the reveal.
6. Unsuitable or unavailable items remain muted and cannot resolve the event.
7. Endure appears when no suitable usable item exists.
8. The selected physical instance animates before the session applies its response.
9. Duplicate item types animate and mutate the same clicked instance.
10. Event rules and random outcomes remain deterministic.
11. The journal matches the approved cover-and-parchment composition with decorative bookmarks and page-edge navigation.
12. Focus, keyboard, reduced motion, pause, restart, and disposal behavior remain correct.
13. Tests, type checking, production build, and browser checks pass.
