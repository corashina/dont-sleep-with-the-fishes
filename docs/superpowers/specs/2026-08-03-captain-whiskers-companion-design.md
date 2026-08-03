# Captain Whiskers Companion Design

## Goal

Make Captain Whiskers the game's only crewmate.

He uses the original crewmate need rules. Petting replaces talking. He keeps a passive fishing bonus.

The player can rescue him during scavenging. The player can then inspect and care for him during survival.

## Sources

The [unofficial original game wiki](https://unoffdontsleepwiththefishes.fandom.com/wiki/Characters) defines the crewmate rules.

It gives crewmates hunger, sickness, happiness, support rules, Drifting Loot work, and crewmate events.

Captain Whiskers is normally a passenger. This game promotes him to the full crewmate role.

`docs/VISUAL_STYLE_GUIDE.md` controls the visual direction.

## Scope

This feature includes:

- Rescue handoff from scavenging
- Companion needs and death
- Pet, Feed, Treat, and Delegate actions
- A scene-linked status card
- A passive fishing bonus
- Normal crewmate event roles
- Cat poses and short keyed actions

This feature does not include:

- Human crewmates
- Crew selection
- Spoken dialogue
- Lore dialogue
- An active support action
- A new Captain Whiskers model
- Save support
- Reduced-motion behavior

## Chosen structure

Use a dedicated companion state.

Do not store living needs on an inventory item. Do not build a generic multi-crewmate system.

This structure keeps companion rules separate from item rules. It also enforces the one-crewmate direction.

## Rescue handoff

Captain Whiskers keeps his current scavenging weight and pickup behavior.

At survival start, `SurvivalSession` finds the saved `captainWhiskers` item.

It removes that item from survival inventory. It creates one living companion state.

If the item was not saved, the companion state is `null`.

Living Whiskers cannot break, become lost, or become consumed as an item.

## State

`SurvivalSession` owns one mutable `CaptainWhiskersState` value.

The state contains:

- Alive state
- Hunger from zero through five
- Sickness from zero through five
- Unhappiness from zero upward
- Petted-today state
- Death cause when dead

Whiskers starts alive, satiated, healthy, happy, and not petted.

`SurvivalSnapshot` exposes an immutable companion snapshot or `null`.

### Hunger

Use these values:

| Value | Label |
| --- | --- |
| 5 | Satiated |
| 4 | Peckish |
| 3 or 2 | Hungry |
| 1 or 0 | Starving |

At each dawn, roll a 50 percent chance to reduce hunger by one.

Whiskers dies when hunger reaches zero.

Feed consumes one Food and sets hunger to five. It costs no Energy.

Feed is unavailable at hunger five, without Food, or after death.

### Sickness

Use these values:

| Value | Label |
| --- | --- |
| 0 | Healthy |
| 1 | Unwell |
| 2 or 3 | Sick |
| 4 | Dying |
| 5 | Dead |

At each dawn, test decline first.

The decline chance is `(sickness + 1) / 100`. Increase sickness by one on success.

Whiskers dies when sickness becomes greater than four.

If he remains alive and sick, test recovery.

The recovery chance is `((5 - sickness) * 3) / 100`. Set sickness to zero on success.

Treat consumes one usable Medkit and sets sickness to zero. It costs no Energy.

Treat is unavailable while healthy, without a Medkit, or after death.

### Happiness

Use these unhappiness values:

| Value | Label |
| --- | --- |
| 0 through 2 | Happy |
| 3 or 4 | Bored |
| 5 or 6 | Lonely |
| 7 | Depressed |
| 8 or more | Miserable |

If the player did not pet Whiskers that day, add one unhappiness at dawn.

If unhappiness is greater than ten, roll a 45 percent death chance.

Pet reduces unhappiness by four, to a minimum of zero. It costs no Energy.

Pet works once each day. It is unavailable after death or after use that day.

Reset the petted-today state after dawn processes the prior day.

### Dawn order

Process companion dawn rules in this order:

1. Hunger
2. Sickness decline
3. Sickness recovery
4. Happiness growth
5. Happiness death risk
6. Reset the daily pet state

Stop companion processing when Whiskers dies.

The player's run continues after his death.

## Actions

Add typed companion actions:

- `petWhiskers`
- `feedWhiskers`
- `treatWhiskers`
- `delegateWhiskers`

Invalid actions return a clear rejection. They do not change state or resources.

Pet, Feed, and Treat can occur during the day. They do not use Energy.

Record accepted actions and need changes in the journal.

## Status interaction

Captain Whiskers stays on the forward starboard gunwale.

His model becomes one companion presentation. It is not a normal supply copy.

Hover or keyboard focus shows `CAPTAIN WHISKERS: CHECK STATUS`.

Click, Enter, or Space opens a compact status card beside him.

The card shows:

- A five-step Hunger meter and its label
- Happiness and its label
- Health and its label
- Pet, Feed, and Treat controls
- `SHIP'S CAT: Slightly improves fishing luck`

The card shows exact unavailable reasons.

Escape, an outside click, or Close closes the card.

The card does not block the full scene. It supports visible keyboard focus.

## Visual treatment

Keep the ocean and boat dominant.

Use one compact weathered-paper or ink-backed status card. Do not use a generic full-screen panel.

Use stable marks for the five Hunger steps. Use text and shape with color for danger.

Use the current authored Captain Whiskers model and idle clip.

Add short keyed action poses:

- Pet: hand approach, head lean, short hold, and settle
- Feed: food approach, eating pose, short hold, and settle
- Healthy idle: alert seated pose
- Hungry idle: lowered head and focused stare
- Unhappy idle: turned-away settled pose
- Sick idle: low guarded pose

Choose one state pose by priority: sick, starving, unhappy, then healthy.

Do not add constant wobble or reduced-motion variants.

## Fishing bonus

Whiskers has no active support control.

While he is alive, multiply each eligible fish catch weight by `1.01`.

Apply the multiplier after the normal bait multiplier.

Do not change junk or utility weights.

Absent or dead Whiskers gives no bonus.

## Drifting Loot

Drifting Loot offers `SEND WHISKERS` while he is alive.

Delegation costs no Energy. It gives the same reward roll as player retrieval.

Calculate wellness as:

`hunger - sickness - unhappiness penalty`

Use this penalty table:

| Unhappiness | Penalty |
| --- | --- |
| 0 through 2 | 0 |
| 3 or 4 | 1 |
| 5 or 6 | 2 |
| 7 | 3 |
| 8 or 9 | 4 |
| 10 or more | 5 |

Whiskers can retrieve loot at wellness four or more.

At lower wellness, show a status-based reason. Do not expose the hidden wellness number.

## Crewmate events

Living Whiskers satisfies every crewmate requirement. Dead or absent Whiskers does not.

Add these original crewmate event roles:

- Sick Companion targets Whiskers.
- Shadow Figure uses a false Whiskers silhouette.
- Sea Watcher can kill Whiskers when the player sleeps.
- Guarded Sleep uses an alert cat pose instead of spoken dialogue.
- Swarm of Anglerfish requires living Whiskers.

Use these event catalog values:

| Event | Minimum day | Minimum pressure | Weight | Cooldown |
| --- | ---: | ---: | ---: | ---: |
| Sick Companion | 5 | 0 | 6 | 26 |
| Shadow Figure | 20 | 3 | 4 | 30 |
| Sea Watcher | 20 | 2 | 9 | 40 |
| Guarded Sleep | 7 | 0 | 50 | 0 |

Sick Companion offers these choices:

- Medkit: consume it and cure Whiskers.
- Energy Bar: consume it with no need change.
- Duct Tape: use outcome weights 80 for sickness plus one and 10 for no change.
- Sleep: add two sickness.

Shadow Figure offers these choices:

- Binoculars: add one pressure.
- Flashlight: use equal weights for pressure plus one or the kidnapped death ending.
- Flare Gun: consume it and trigger the kidnapped death ending.
- Sleep: make no rule change.

Sea Watcher offers these choices:

- Stay Awake: set the next day's Energy to zero.
- Sleep: use weight 90 to kill Whiskers and weight 10 for no change.

Guarded Sleep offers these choices:

- Let Whiskers Watch: test the 85 percent success chance.
- Sleep Normally: continue with normal night selection.

Guarded Sleep has an 85 percent success chance.

On success, replace the selected night with a peaceful night.

On failure, select the normal night event.

Crewmate event selection uses the existing pressure, day, weight, cooldown, and event-limit rules.

Companion event effects use validated typed data. Do not add hidden event-specific mutations.

## Data flow and ownership

1. Scavenging saves the Captain Whiskers item.
2. `Game` passes saved items to `SurvivalSession`.
3. `SurvivalSession` creates companion state and removes the item from inventory.
4. `SurvivalSession` updates companion rules and returns immutable snapshots.
5. `BoatWorld` syncs the companion presentation and projects its interaction anchor.
6. `SurvivalUI` renders the status card and sends typed actions.
7. `FishingSession` receives the current fish weight multiplier.
8. Event selection and resolution read and change companion state through typed contracts.

`CaptainWhiskersPresentation` owns the model clone, animation mixer, actions, and interaction root.

The shared model library owns shared geometry and materials. Each owner disposes its resources once.

## Error handling

Use `null` for an absent companion.

Clamp hunger and sickness to their valid ranges. Clamp unhappiness at zero only.

Reject companion actions outside the day phase.

Reject actions after death. Reject unavailable resources without partial changes.

Keep snapshots immutable. Keep all companion randomness behind the injected random source.

## Tests

Add unit tests for:

- Rescue handoff and absent-companion runs
- Initial state and immutable snapshots
- All status thresholds and labels
- Exact random boundaries for each dawn roll
- Dawn order and each death cause
- Pet, Feed, Treat, and resource use
- Exact unavailable reasons
- Wellness and Drifting Loot delegation
- Fish-only `1.01` weight changes
- No bonus while absent or dead
- Crewmate event eligibility and outcomes
- Player survival after companion death

Add presentation tests for:

- Companion model ownership and disposal
- State pose priority
- Pet and Feed action restoration
- Projected interaction anchors
- Pointer and keyboard status-card use
- Focus restoration and card closing
- Status labels, meter steps, and disabled reasons

Add integration tests for scavenging handoff, dawn updates, event resolution, and fishing selection.

## Acceptance criteria

- A rescued Captain Whiskers appears as the only crewmate during survival.
- The player can inspect Hunger, Happiness, and Health by selecting him.
- Pet, Feed, and Treat follow the specified rules.
- Need changes and deaths remain deterministic under an injected random source.
- Whiskers can handle valid Drifting Loot requests.
- He enables and receives normal crewmate events.
- His passive bonus changes only fish catch weights while alive.
- Runs without him keep their current non-crewmate behavior.
- The status interaction follows the visual style guide and works with keyboard input.
- All new resources have one clear owner and one disposal path.
