# Fishing Presentation Polish Design

## Goal

Polish the interactive survival-fishing sequence so that camera travel, rod
placement, casting, reeling, results, and repeat attempts match the intended
first-person experience. This amendment supersedes the post-fishing event and
single-attempt-per-day parts of the original interactive fishing design; all
other catalog, bait, timing, determinism, and lifecycle rules remain unchanged.

## Approved Player Flow

```text
rod click
  -> smooth camera entry
  -> choose water
  -> cast animation
  -> wait
  -> bubbles
  -> reel or miss animation
  -> fishing result dialog
  -> Continue
  -> smooth camera return
```

An accepted attempt spends one energy. Fishing is available when the player
has exactly one energy, so the final point may be spent. After the result dialog
is dismissed and the camera returns, the player may start another attempt while
at least one energy remains.

Fishing is the chosen daytime activity rather than an ordinary one-shot action.
Once the player begins fishing, further fishing attempts are allowed that day,
but other main daytime activities remain unavailable. If another main activity
was chosen first, fishing remains unavailable. Ending the day remains possible
after fishing presentation is complete.

Fishing does not request or open the ordinary scheduled daytime event. In
particular, the `Quiet Waters` fallback must never replace a fishing result.

## Rod Placement and Tooltip

The fixed rod moves to the furthest practical point at the lifeboat bow. Its
handle faces the player and its shaft points forward over the water. The exact
authored transform may be tuned in the browser, but the pole tip must clearly
extend beyond the bow and the rod must not appear sideways.

The rod uses a handle-level animation pivot. Casting and reeling rotate that
pivot instead of rotating the imported model around an arbitrary model origin.
The fishing-line origin follows the pole tip.

The visible pointer and focus tooltip is exactly `Fishing rod`. Availability
reasons and shortcut information remain available through accessible labels and
ordinary rejected-action feedback, without expanding the visual tooltip.

## Camera Presentation

Normal-motion entry and return use continuous eased interpolation from the
camera's actual current local position and orientation. Each track lasts roughly
1 to 1.2 seconds and must not snap at its first or final frame. Boat buoyancy
continues through the existing camera rig while the local pose interpolates.

The fishing pose is moved closer to the bow edge and looks farther outward and
downward. At supported desktop aspect ratios, only the lower rim of the boat
may occupy the bottom of the frame; the centered cast point and valid cast area
must lie beyond the hull rather than overlap it.

`prefers-reduced-motion` continues to use a short fade between stable poses.
Gameplay timing, the cast region, and input behavior do not change in reduced
motion mode.

## Cast and Reel Animation

Clicking valid water begins an authored throw rather than placing the tackle at
the destination immediately. The rod draws back, accelerates forward, and
settles with a small flex. During that motion, the bobber follows a visible arc
from the pole tip to the selected world point while the reusable line extends
between them. The landing splash appears only when the bobber reaches the
water. Keyboard casting uses the same animation toward the centered cast point.

When the player clicks the bite target, further reel input becomes inert. The
rod bends and draws back, the line tightens, and the prepared fish or junk rises
from the chosen cast point toward the bow. A miss receives its own line and rod
recovery motion. Committed resource changes may occur before presentation, but
no result copy appears until the corresponding animation resolves.

## Result Dialog

After reel or miss presentation finishes, `SurvivalUI` opens a dedicated,
keyboard-accessible fishing result dialog while the camera remains at the bow.
It contains a result heading, the resource consequence, and a `Continue`
button. Examples include:

- `COD` with `+1 FOOD`
- `TUNA` with `+2 FOOD` and `1 BAIT USED`
- `PLASTIC BOTTLE` with `NO FOOD`
- `IT GOT AWAY` with `NO CATCH`

The dialog takes focus and traps background interaction through the existing
modal-layer behavior. Activating `Continue` closes the dialog and starts the
smooth camera return. Normal boat interaction resumes only after that return
finishes. The rod regains a valid focus target when another attempt is allowed.

## State and Ownership

`SurvivalSession` owns a small daytime-activity discriminator: no activity,
fishing, or another main activity. It validates repeat fishing, energy, and
activity exclusivity. `FishingSession` remains the deterministic, renderer-free
owner of each individual attempt and its injected randomness.

`SurvivalPhase` sequences camera entry, cast, wait, bite, resource settlement,
reel or miss presentation, result-dialog acknowledgement, camera return, and
unlocking. It must not schedule a daytime event after fishing.

`BoatWorld` owns the revised rod transform and pivot, camera tracks, bobber arc,
line, splash, reel, miss, and catch presentation. It continues to allocate no
new rendering resources in per-frame paths and uses the shared wave field for
the landed bobber and bite effects.

`SurvivalUI` owns the simple rod tooltip, fishing instructions, bite target,
result dialog, focus movement, live announcements, and modal inertness.

## Error Handling and Lifecycle

- Invalid water clicks do not spend additional energy or begin a cast.
- Rapid or duplicate casts, reels, result acknowledgements, and returns are
  idempotently ignored.
- Pausing or hiding the document freezes active attempt and presentation time.
- Disposal during camera, cast, reel, result, or return settles outstanding
  presentation promises and restores owned state exactly once.
- A rejected repeat attempt leaves energy, bait, activity state, and camera
  presentation unchanged.

## Testing

Gameplay tests cover final-energy use, multiple attempts in one day, energy
deduction per attempt, fishing-versus-other-activity exclusivity, and the
absence of a post-fishing daytime event.

Phase and UI tests verify this ordering:

```text
finishFishing < reel/miss animation < result dialog < Continue < camera return
```

They also cover focus, keyboard activation, duplicate input, dialog contents,
simple tooltip copy, and return to an actionable rod when energy remains.

World tests verify the bow-most forward-facing rod transform, non-snapping
camera interpolation, revised framing, rod-pivot movement, bobber trajectory,
landing splash timing, catch lift, cleanup, and reduced-motion behavior.

Run `bun run test`, `bun run typecheck`, `bun run models:check`, and
`bun run build`, then inspect normal and reduced-motion fishing at 1280x720 and
1920x1080 in the browser.

## Acceptance Criteria

1. Camera entry and return visibly ease between poses without snapping.
2. The rod sits at the bow tip, faces forward, and shows only `Fishing rod` in
   its visible tooltip.
3. A water click produces a readable rod, line, bobber, and landing animation.
4. The fishing view is close enough to the bow that cast targets do not overlap
   the boat.
5. Catch or miss animation completes before a dedicated result dialog appears.
6. `Continue` dismisses the result and triggers the smooth return.
7. Fishing never opens the `Quiet Waters` fallback or another daytime event.
8. The player may repeat fishing while at least one energy remains, without
   mixing fishing with another main daytime activity that day.
9. Mouse, keyboard, pause, hidden-tab, resize, lifecycle, accessibility, and
   reduced-motion behavior remain correct.
