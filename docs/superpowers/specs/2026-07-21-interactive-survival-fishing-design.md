# Interactive Survival Fishing Design

## Goal

Replace the survival phase's immediately resolved fishing action with a short,
interactive casting sequence. Every lifeboat has a fixed fishing rod at its
bow. Fishing costs one energy, lets the player cast at a chosen point on the
water, waits for a visible bite, and requires a fast reel input. A successful
reel yields one of the ordinary fish or simple junk catches documented by the
unofficial game wiki.

This feature remains deterministic and testable without Three.js. It keeps
gameplay state, input, UI, animation, world construction, and rendering under
separate owners. It targets desktop keyboard and mouse only.

## Approved Scope

### Included

- A fixed bow-mounted fishing rod available in every survival run.
- One-energy fishing attempts in every weather state.
- Smooth camera travel from the seated view toward the bow and back.
- Free mouse casting within a bounded visible water area.
- A centered keyboard cast point using `Enter` or `Space`.
- A deterministic three-to-seven-second bite delay.
- A 1.5-second reaction window when bubbles appear.
- Automatic bait use when bait is available.
- Bait consumption only when a fish is successfully reeled in.
- Thirteen wiki-listed fish species and three simple junk catches.
- One or two food depending on the catch.
- Project-authored procedural low-poly catch models.
- Mouse, keyboard, pause, resize, hidden-tab, and reduced-motion support.

### Excluded

- The wiki's Fishlet, tool, lore, and story catches.
- Unique downloaded models or copied wiki/game art for each catch.
- Mobile or touch controls.
- Fishing upgrades, multiple rods, bait selection, and fishing spots with
  different odds.
- A crewmate or Captain Whiskers fishing modifier.
- Saves or migration for the removed collectible fishing rod.

## Source and Adaptation Policy

The catch names, base relative weights, minimum-day gates, and ordinary food
values come from the unofficial Fishing wiki as reviewed on 2026-07-21:

`https://unoffdontsleepwiththefishes.fandom.com/wiki/Fishing`

The page does not document a complete bait/no-bait probability formula, so the
bait multipliers in this design are original balance rules. The wiki awards
three food for Swordfish; this design caps it at two to satisfy the approved
one-to-two-food requirement. The shipped game keeps a checked-in typed catalog
and never requests wiki content at runtime. Wiki images and original game
assets are not copied.

## Catch Catalog

The catalog stores stable ID, display name, base weight, minimum day, food,
size class, model family, and appearance parameters. A minimum day of zero is
eligible on the game's first playable day.

| ID | Name | Weight | Minimum day | Food | Size | Model family |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `cod` | Cod | 20 | 0 | 1 | small | ordinary fish |
| `flounder` | Flounder | 15 | 0 | 1 | small | flatfish |
| `salmon` | Salmon | 24 | 0 | 1 | small | ordinary fish |
| `tuna` | Tuna | 5 | 3 | 2 | large | ordinary fish |
| `crab` | Crab | 14 | 2 | 1 | small | crab |
| `squid` | Squid | 7 | 3 | 2 | large | squid |
| `sardine` | Sardine | 45 | 0 | 1 | small | ordinary fish |
| `bass` | Bass | 30 | 0 | 1 | small | ordinary fish |
| `herring` | Herring | 20 | 0 | 1 | small | ordinary fish |
| `redSnapper` | Red Snapper | 20 | 0 | 1 | small | ordinary fish |
| `mackerel` | Mackerel | 15 | 0 | 1 | small | ordinary fish |
| `clownfish` | Clownfish | 1 | 0 | 1 | small | ordinary fish |
| `swordfish` | Swordfish | 1 | 0 | 2 | large | swordfish |
| `seaweed` | Seaweed | 82 | 0 | 0 | junk | seaweed |
| `boot` | Boot | 72 | 0 | 0 | junk | boot |
| `plasticBottle` | Plastic Bottle | 60 | 0 | 0 | junk | bottle |

Fishlet is excluded even though the wiki classifies it as junk. The approved
junk pool is exactly Seaweed, Boot, and Plastic Bottle.

## Catch Weighting and Bait

Only entries whose minimum day has been reached participate in an attempt.
Without bait, each eligible entry uses its wiki base weight unchanged.

When at least one bait is available at the start of an attempt:

- every eligible small fish uses twice its base weight;
- Tuna, Squid, and Swordfish use three times their base weight;
- junk weights remain unchanged.

With the complete day-three pool, fish have total weight 217 and junk has
weight 214 without bait, or fish has weight 447 and junk 214 with bait. This
changes the fish share from approximately 50% to 68% and modestly favors large
fish without guaranteeing either.

The attempt records bait availability when it starts, but does not spend bait
then. A valid reel that lands a fish consumes one bait and awards the fish's
food. Junk and missed reaction windows consume no bait. Other commands cannot
change inventory while fishing is active.

All draws use the existing injected `RandomSource`; fishing never calls
`Math.random()`.

## Architecture and Ownership

### Typed catch catalog

`src/survival/fishingCatalog.ts` owns the immutable catch data and catalog
validation. It exposes eligible entries and bait-adjusted weights but does not
read or mutate survival resources.

### Deterministic fishing attempt

`src/survival/FishingSession.ts` owns one fishing attempt. Its explicit states
are:

```text
aiming -> casting -> waiting -> bite -> reeling -> resolved
                                      \-> missed
```

It receives the current day, captured bait availability, injected random
source, and explicit elapsed time. It owns the cast point, bite delay, hidden
catch, reaction deadline, and idempotent command validation. It exposes
immutable snapshots and a single terminal result. It owns no DOM or Three.js
objects.

The delay is `3 + random.next() * 4` seconds. The eligible weighted catch is
selected deterministically for the attempt but is awarded only after a valid
reel command during the bite window. A missed window discards the hidden catch.

### Survival resources and orchestration

`SurvivalSession` remains the sole owner of energy, food, bait, daily-action
state, journal records, and terminal rules.

`beginFishing()` validates daytime state, energy, and the absence of another
active attempt. An accepted start spends one energy immediately, marks the
player as having acted, captures whether bait is available, and creates the
attempt with the session's injected random source. It returns the attempt to
the phase under a stable attempt ID.

`finishFishing(attemptId, result)` accepts exactly one terminal result from the
active attempt. A fish adds its food and consumes one bait if bait was captured
at start. Junk and misses change no resources. Duplicate, stale, or foreign
attempt IDs are rejected without mutation.

`SurvivalPhase` owns the active attempt handle and coordinates its state with
world and UI presentation. It blocks every other survival command until the
camera returns. It commits the terminal fishing result before presenting the
reel or miss, then synchronizes the resulting snapshot. The ordinary scheduled
day event is requested only after the camera has returned and fishing input has
been released.

### World presentation

`BoatWorld` owns:

- the fixed bow rod, reel, line, bobber, and their transforms;
- the normal and reduced-motion camera tracks;
- the bounded fishing-water interaction plane;
- the fixed bubble and splash pools;
- the procedural catch template library and active catch instance;
- reusable vectors, raycasters, and projection state.

It does not choose catches, measure the reaction deadline, spend resources, or
schedule events. It receives attempt snapshots and presentation commands from
`SurvivalPhase`.

The existing locally committed `fishingRod.glb` becomes fixed lifeboat
equipment. Its metadata moves out of the collectible item manifest into a
small lifeboat-equipment manifest. The model remains locally shipped and its
Kenney provenance remains recorded in `THIRD_PARTY_ASSETS.md`.

The catch library creates five fish families (ordinary fish, flatfish, crab,
squid, and swordfish) plus three simple junk forms. Species vary through
project-authored dimensions, proportions, fins, and colors. Templates are
created once and cloned or toggled for results; no geometry or material is
created in the frame loop.

### Interface and input

`SurvivalUI` owns fishing instructions, accessible live announcements, the
projected bite target, focus, background inertness, and the reduced-motion
camera-pose fade. It forwards intents but does not advance attempt time or
apply catches.

The fixed rod always exposes a projected action hotspot labeled
`FISH - 1 ENERGY`. Shortcut `1` activates the same action. The hotspot stays
focusable when the action is unavailable and communicates the existing
unavailable reason.

The old fishing bait-choice dialog and its option types are removed.

## Interaction Sequence

1. Clicking the rod or pressing `1` asks `SurvivalSession` to begin an attempt.
   A rejection shows ordinary feedback and does not move the camera.
2. An accepted attempt spends one energy, makes background actions inert, and
   moves the camera forward inside the boat toward the bow.
3. The instruction reads `CLICK THE WATER TO CAST`. A subtle reticle identifies
   the valid water region.
4. A mouse click is raycast against the bounded interaction plane. Outside
   clicks are ignored. `Enter` or `Space` casts at the centered default point.
5. The rod flexes and swings, the line travels in an arc, and the bobber creates
   a pooled splash at the authored water point.
6. The instruction changes to `WAIT FOR A BITE`. The bobber stays at the same
   horizontal world point and samples the shared wave field for vertical
   displacement.
7. After the deterministic three-to-seven-second delay, bubbles and a stronger
   ripple appear at the bobber for 1.5 seconds. The projected bite target
   follows that moving world point and receives keyboard focus. The instruction
   and live announcement read `BITE - REEL NOW`.
8. A click on the bubbles or `Enter`/`Space` during the window commits the
   hidden result exactly once. A late or duplicate command is rejected.
9. On success, the rod reels, the line tightens, and the named fish or junk mesh
   rises briefly. On a miss, the line slackens and the result reads
   `IT GOT AWAY`.
10. The camera returns smoothly, fishing presentation is cleared, normal input
    resumes, and any scheduled daytime event may open.

`Escape` pauses instead of cancelling or refunding the attempt. An accepted
attempt always costs one energy, including junk and misses.

## Camera, Ocean, and Motion

The ordinary survival camera begins at its current seated pose. Fishing moves
it locally within the boat camera rig toward the bow and tilts it down far
enough to keep the rod, bobber, and complete cast region visible. The boat and
camera continue to inherit the existing shared buoyancy transform.

Normal motion uses approximately one-second eased camera travel in each
direction, a visible rod cast, line arc, splash, reel, and light catch swing.
Exact authored transforms may be tuned during browser verification without
changing the interaction sequence or timing rules.

With `prefers-reduced-motion`, `SurvivalUI` presents a short fade while
`BoatWorld` switches between the two stable camera poses. Rod flex, line
flourish, and catch swing are minimized. The bite delay, 1.5-second reaction
deadline, cast area, input contract, and outcome odds remain unchanged.

The invisible interaction plane provides stable raycasting while the visual
ocean remains GPU-displaced. The authored cast point is stored in world
horizontal coordinates. Bobber, bubbles, and projected target sample the
shared `WaveField` every frame, keeping rendering, buoyancy, and fishing
presentation synchronized.

Fishing is legal in calm, overcast, and squall weather. Weather changes waves,
fog, light, and boat motion but does not change fishing odds or deadlines.

## Accessibility and UI State

The compact instruction line progresses through:

```text
CLICK THE WATER TO CAST
WAIT FOR A BITE
BITE - REEL NOW
<named catch or IT GOT AWAY>
```

During fishing, unrelated boat anchors and survival commands are inert. The
bite target is a real projected button aligned to the Three.js bubbles. It
receives focus automatically at bite time and has an urgent accessible label.
Mouse, `Enter`, and `Space` execute the same idempotent reel command.

Pausing, a hidden document, or a blocking browser state freezes both world
presentation and explicit attempt time so a bite cannot expire offscreen.
Resizing recomputes projection without changing the cast point or deadline.
The bounded cast area keeps the bobber and bite target visible at supported
desktop aspect ratios.

## Removal of the Collectible Rod

The fishing rod is removed from the scavenging item catalog, spawn counts,
placement categories, carry rules, inventory conditions, survival storage,
item descriptions, item artwork maps, projected saved-prop actions, and saved
item tests. There is no substitute rod upgrade or event item.

Dorothy changes from 19 collectible types and 22 physical pickups to 18 types
and 21 pickups. Food remains at three instances, Bait remains at two, and each
other collectible type remains at one. Fishing becomes available in every
survival run because the lifeboat owns its rod in the same way that it owns its
fixed repair equipment.

The fixed rod GLB remains a runtime asset and continues through the model audit
and provenance pipeline under its new equipment role.

## Error Handling and Lifecycle

- Starting outside daytime, without one energy, during another attempt, or
  after a terminal state returns an unavailable outcome and mutates nothing.
- Invalid or outside-water casts do not advance the attempt.
- Early, late, duplicate, stale, and foreign reel/finish commands mutate
  nothing.
- Bait availability is captured once and cannot be changed during the locked
  attempt.
- Pause and visibility changes freeze attempt time rather than comparing
  deadlines to wall-clock time.
- Phase disposal abandons the active attempt without scheduling callbacks.
  Because disposal destroys the session as part of phase teardown, no refund
  or completion is needed.
- Disposal restores the camera and releases the rod, line, bobber, interaction
  helpers, bubble pool, catch templates, materials, geometries, listeners, and
  UI exactly once.
- The fixed pools and reusable math objects prevent frame-loop allocations.
- A production path never waits on uncancelled timers; the game loop advances
  all attempt and animation time explicitly.

## Data Flow

### Start and cast

1. UI or shortcut emits a fish intent.
2. `SurvivalPhase` asks `SurvivalSession.beginFishing()`.
3. The survival session validates and spends one energy.
4. The phase locks commands and instructs the world to enter its fishing view.
5. A valid cast intent supplies the world point to the deterministic attempt.
6. Attempt snapshots drive rod, line, bobber, instructions, and bubbles.

### Reel or miss

1. A valid reel command or elapsed bite deadline produces one terminal attempt
   result.
2. `SurvivalPhase` passes that result and attempt ID to
   `SurvivalSession.finishFishing()`.
3. The survival session atomically applies food and conditional bait use.
4. The phase synchronizes the snapshot and presents the committed result.
5. After the camera returns, the phase unlocks input and requests the ordinary
   post-action daytime event if eligible.

## Testing

### Catalog and resolver tests

- Assert the exact 13 fish and three junk IDs, labels, weights, minimum days,
  food values, size classes, and model families.
- Assert Fishlet, tool catches, lore catches, and story catches are absent.
- Assert the day gates for Crab, Tuna, and Squid.
- Assert unbaited and baited weighted boundaries, including the 2x small-fish
  and 3x large-fish rules.
- Assert Swordfish yields two food rather than the wiki's three.
- Assert deterministic replay from identical random sequences.

### Fishing attempt tests

- Cover every legal state transition and reject illegal transitions.
- Prove bite delays at the lower and upper random boundaries.
- Prove a reel just inside 1.5 seconds succeeds and one at or after expiry
  misses under one documented boundary convention.
- Cover outside casts, early reels, duplicate casts, duplicate reels, and
  stale commands.
- Prove pause/hidden intervals do not advance attempt time.

The reaction window uses a half-open interval: a reel is accepted when elapsed
bite time is less than 1.5 seconds and rejected at 1.5 seconds or later.

### Survival rules tests

- Starting an accepted attempt spends exactly one energy and marks the day as
  acted.
- Start rejection is atomic for no energy, wrong phase, active attempt, and
  terminal state.
- Landed fish award one or two food and consume one captured bait.
- Landed fish without bait award food and consume none.
- Junk and misses consume no bait and award no food.
- Finish is idempotent and validates the attempt ID.
- Named results enter daytime journal data.
- The scheduled day event waits until fishing presentation completes.

### World and integration tests

- The fixed rod exists without a saved rod and projects the permanent fish
  action anchor.
- The collectible item catalog, authored placements, storage transforms, and
  model manifests no longer expose a fishing-rod item.
- The equipment manifest still loads and audits the committed rod GLB.
- Valid screen points map into the fishing region; invalid points do not.
- Bobber, bubbles, and target projection follow the shared wave sample.
- Camera travel and return reach their authored poses under normal and reduced
  motion.
- Rod, line, splash, bubbles, catches, and camera reset after success and miss.
- Pausing, resizing, hiding, restarting, and disposing are safe in every
  fishing state.
- World resources and listeners are disposed once, and updates perform no
  repeated setup.

### UI tests

- Fixed rod click and shortcut `1` emit one start intent.
- `Enter`/`Space` cast at the centered point and reel only during a bite.
- Instructions, live announcements, focus, and inert background controls match
  the active state.
- Unavailable reasons remain keyboard accessible.
- Rapid clicks and key repeats do not duplicate commands.
- `Escape` pauses and resumes without cancelling the attempt.

## Manual Verification

Run complete scavenging-to-survival paths and verify:

- the collectible rod is absent from Dorothy;
- the fixed rod is present at the survival bow in every run;
- a no-bait fish, baited fish, junk result, and missed bite;
- early and late bite delays and the short reaction window;
- mouse casting at multiple valid water points;
- keyboard-only casting and reeling;
- camera framing, line arc, bobber placement, bubbles, catch reveal, and camera
  return;
- calm, overcast, and squall weather;
- normal and reduced-motion presentation;
- pause, hidden-tab resume, resize, and restart during fishing;
- 1280x720 and 1920x1080 desktop viewports.

After the asset-role and authored-layout changes, run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Inspect the changed rod presentation in both scavenging and survival phases.

## Acceptance Criteria

1. Every survival lifeboat has a fixed, usable rod at the bow.
2. Dorothy has no collectible fishing rod and its item counts remain internally
   consistent.
3. Starting fishing costs one energy and smoothly enters the bow view.
4. Mouse users can cast anywhere in the valid water region; keyboard users can
   cast at the centered point.
5. Bubbles appear after a deterministic three-to-seven-second delay and remain
   reelable for exactly 1.5 seconds of active attempt time.
6. A landed catch is one of the approved 13 fish or three junk entries.
7. Fish award one or two food. Junk and misses award none.
8. Available bait automatically improves weights and is consumed only for a
   landed fish.
9. Camera, rod, line, bobber, bubbles, and catch animation complete smoothly
   and return to a clean idle state.
10. Mouse, keyboard, pause, resize, hidden-tab, and reduced-motion behavior are
    functional and deterministic.
11. Fishing rules are renderer-independent, all randomness is injectable, and
    frame updates avoid allocations and repeated setup.
12. Model checks, automated tests, type checking, production build, and manual
    browser verification pass.
