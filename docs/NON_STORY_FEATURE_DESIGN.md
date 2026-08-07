# Non-story feature design

## Purpose

This design adds the most important missing gameplay features.

It keeps the current first-person scavenging and physical lifeboat interface.

It uses the reference game for feature scope, not exact content.

## Goals

- Add one rescued crew member to each run.
- Add crew needs and support actions.
- Add hidden pressure that controls event difficulty.
- Add persistent Chests and a larger fishing catalog.
- Add difficulty modes and local progress.
- Add audio, settings, and key non-story events.

## Out of scope

- Damien and company lore
- Lore items and a lore archive
- Heart Pieces and the Heart of the Sea
- Red, Mirror, Ghost Ship, Kraken, and The One
- Story rescue chains
- Story endings
- Long conversations and crew backstories
- Active-run saving
- Mobile controls

## Priority

1. Run pressure and event rules
2. Fishing and Chest rewards
3. Crew rescue and crew needs
4. Difficulty and local progress
5. Audio and settings
6. Non-story event content

This order builds shared rules before content uses them.

## Architecture

Keep each system separate from rendering.

| Module | Owner | Purpose |
| --- | --- | --- |
| `RunPressure` | `SurvivalSession` | Tracks hidden pressure and damage scale. |
| `EventHistory` | `SurvivalSession` | Tracks event counts, flags, and cooldowns. |
| `ChestState` | `SurvivalSession` | Tracks one closed Chest and its age. |
| `CrewState` | `SurvivalSession` | Tracks the rescued crew member and needs. |
| `Difficulty` | `Game` | Supplies fixed balance values for one run. |
| `MetaProgress` | `Game` | Stores unlocks, records, and settings. |
| `AudioDirector` | `Game` | Owns audio channels and audio resources. |
| `CrewDisplay` | `BoatWorld` | Owns the crew model and crew action anchors. |
| `ChestDisplay` | `BoatWorld` | Owns the Chest model and Chest action anchor. |

`SurvivalSession` remains the sole owner of survival rules.

`BoatWorld` reads snapshots and presents state.

`SurvivalUI` presents actions, costs, results, and unavailable reasons.

All random choices use the existing injected random source.

## Run pressure

Add `pressure` to the survival snapshot.

Use integer values from zero through four.

Increase pressure at dawn on days 8, 15, 25, and 40.

Events can also add or remove pressure.

Keep `RiskLabel` as a visible label.

Do not use `RiskLabel` for event selection.

Add these event rules:

- `minimumPressure`
- `maximumPressure`
- `requiredFlags`
- `forbiddenFlags`
- `maximumAppearances`
- `cooldownDays`

Add these event effects:

- Set a flag.
- Clear a flag.
- Add pressure.
- Remove pressure.

Apply double night damage from day 50.

Difficulty can change the pressure schedule and damage scale.

## Fishing and Chest rewards

### Fishing

Add Flounder, Herring, Mackerel, Swordfish, and Fishlet.

Reuse the current fish model families where possible.

Give Swordfish three Food.

Treat Fishlet as junk.

Keep the current utility catches.

Keep Bait consumption limited to caught fish.

### Chest

Add one event-only Chest item.

The player can hold one closed Chest.

Mystery Chest gives the closed Chest.

Use `ChestState` with `none`, `closed`, and `mimic` states.

Do not store the Chest in `SurvivalInventoryState`.

The Chest appears on the forward platform.

Opening the Chest costs three Energy.

The reward table prefers missing durable items.

Remove invalid reward entries before the reward roll.

Use the injected random source for the reward roll.

The fallback reward gives two Food.

Store `acquiredDay` with the Chest state.

After two nights, the Chest can become a mimic.

The Chest Attack event handles the mimic.

The Fishing Net restores the closed Chest.

Other choices cause damage or destroy the Chest.

## Crew

### Scavenging

Add Laurel, Frederik, and Row to fixed ship rooms.

Use one interaction: `SEND TO LIFEBOAT`.

The player can select one crew member.

Selecting another crew member replaces the first selection.

Do not add pathfinding.

The selected crew member appears in the lifeboat after evacuation.

Add the selected crew ID to the phase handoff.

### Survival state

Use one `CrewState` value.

It contains:

- Crew ID
- Alive state
- Hunger from zero through five
- Sickness from zero through five
- Unhappiness from zero upward
- Spoken-today state
- Support-used state

Update crew needs only at dawn.

Use the injected random source for sickness changes.

Crew hunger can fall by one each dawn.

No Food at zero hunger kills the crew member.

Sickness can improve or become worse.

Unhappiness rises when the player does not talk.

Talking removes four unhappiness points.

### Crew actions

Project actions beside the seated crew member.

Add these actions:

- Talk
- Feed
- Treat
- Use support
- Delegate Drifting Loot

Talk costs no Energy.

Feed uses one Food.

Treat uses one Medkit.

Support costs one Energy.

Show the exact unavailable reason.

### Support roles

Laurel improves the next meal.

Frederik guarantees the next Bait catch.

Row reduces hull repair costs by two Energy.

Each support can appear once per day.

Use a 40 percent offer chance.

Only healthy and stable crew can offer support.

Keep support text practical.

Do not add lore dialogue.

### Crew presentation

Seat the crew member on the port side.

Use a strong silhouette and simple authored workwear.

Show need changes through pose, props, and short labels.

Keep persistent crew data off the main meter group.

Use a nearby tooltip during hover or keyboard focus.

## Difficulty and local progress

Add two modes:

- Standard
- Drowning

Standard stays unlocked.

Drowning unlocks after one completed survival run.

Each mode supplies one immutable balance object.

The balance object controls:

- Hunger growth
- Starvation damage
- Repair costs
- Fishing miss chance
- Dive risk
- Event damage
- Rescue chance
- Pressure growth

Use the current balance values for Standard.

Use these Drowning changes:

| Rule | Standard | Drowning |
| --- | --- | --- |
| Hunger each dawn | 18 | 22 |
| Starvation damage | 15 | 20 |
| Fishing reaction | 1.5 seconds | 1.1 seconds |
| Dive success change | None | Minus 0.10 |
| Dive injury change | None | Plus 0.10 |
| Event damage scale | 1.00 | 1.25 |
| Rescue chance scale | 1.00 | 0.75 |
| Pressure days | 8, 15, 25, 40 | 6, 12, 20, 32 |

Do not place difficulty checks inside rule methods.

Pass the balance object into `SurvivalSession`.

Add `MetaProgress` with versioned local storage.

Store only:

- Drowning unlock
- Best day
- Swordfish catch
- Non-story ending records
- Audio settings
- Camera settings

Use safe defaults when stored data is invalid.

Never block a new run because storage failed.

## Audio and settings

Add one game-owned `AudioDirector`.

Create these channels:

- Master
- Music
- Ambience
- Effects

Start audio after the first user action.

Use original or licensed audio only.

Add these audio groups:

- Ocean and wind ambience
- Ship alarm and hull stress
- Footsteps and item handling
- Fishing cast, bite, catch, and miss
- Rain, thunder, and wave impacts
- Event reveal and outcome cues
- Ending cues

Add these settings:

- Master volume
- Music volume
- Effects volume
- Invert mouse Y
- Head movement

Store settings through `MetaProgress`.

The `Game` owner disposes all audio resources once.

## Non-story events

Add these events after the shared rules exist:

1. Broken Boat
2. Chest Attack
3. Seagull
4. Flowers
5. Sleep Killer

### Broken Boat

Check the event before the normal night draw.

Enable the check when Hull is ten or lower.

Use `100 - Hull` as the event chance.

`SurvivalSession` performs the chance roll.

The event sinks the boat.

### Seagull

The player can feed or dismiss the seagull.

Feeding uses one Food.

Fed seagulls remain as boat props.

At three seagulls, use a 75 percent sinking chance at dawn.

This ending uses a non-story ending ID.

### Flowers

The player can use the Bucket or Fishing Net.

The action has no large reward.

It adds visual variety and a journal line.

### Sleep Killer

Unlock this event after two completed runs.

Use a timed sleep action.

Using an item causes death.

Sleeping before the timer ends survives the event.

Keep all timing state inside the survival phase.

Keep its outcome rules inside `SurvivalSession`.

## Data flow

1. `Game` selects difficulty and loads local progress.
2. `ScavengePhase` records the selected crew ID.
3. `Game` passes items, crew ID, difficulty, and random source.
4. `SurvivalSession` creates the complete rule state.
5. `BoatWorld` presents crew, Chest, items, and events.
6. `SurvivalUI` sends typed actions to `SurvivalSession`.
7. `SurvivalSession` returns one immutable outcome.
8. `Game` records completed-run progress.

## UI design

Keep the ocean and boat visible during routine actions.

Place Crew actions beside the crew model.

Place Open Chest beside the Chest.

Show difficulty on the start screen.

Use full panels only for settings and endings.

Use short captions for support and need changes.

Use text and shape with color for danger.

Keep all new actions keyboard accessible.

## Ownership

`Game` owns `MetaProgress`, `Difficulty`, and `AudioDirector`.

`ScavengePhase` owns crew selection controls.

`SurvivalSession` owns all mutable rule state.

`BoatWorld` owns crew and Chest models.

`SurvivalUI` owns its controls and listeners.

Each owner disposes its resources once.

Do not allocate models, materials, or controls during frame updates.

## Error handling

Reject invalid actions without changing state.

Return one clear reason for each rejected action.

Ignore invalid local progress and use defaults.

Reject invalid event definitions during startup.

Reject invalid difficulty values during startup.

Keep fallback rewards deterministic.

## Tests

### Rule tests

- Pressure changes on exact days.
- Event rules use pressure, flags, counts, and cooldowns.
- Day 50 doubles night damage.
- Fishing uses the complete non-story catalog.
- Chest age, opening, rewards, and mimic changes are deterministic.
- Crew needs update once per dawn.
- Crew actions spend correct resources.
- Each support changes only its intended rule.
- Difficulty changes values through its balance object.
- Invalid local progress uses safe defaults.

### Lifecycle tests

- Crew selection crosses the phase boundary.
- Restart clears run state but keeps local progress.
- Audio starts after user input.
- Audio resources dispose once.
- Crew and Chest models dispose once.

### UI tests

- Each action shows its cost.
- Each unavailable action shows one reason.
- Keyboard focus reaches Crew and Chest actions.
- Settings load and save.
- Ending and event panels keep focus.

### Visual checks

- Crew remains readable at both target viewports.
- Crew actions stay near the crew model.
- Chest actions stay near the Chest.
- Seagulls do not hide supplies.
- New event tableaus keep the horizon readable.
- Print effects do not hide need or danger states.

## Delivery slices

### Slice 1: shared rules

Add pressure, event flags, damage scale, and difficulty injection.

### Slice 2: rewards

Add missing fish, the closed Chest, Open Chest, and Chest Attack.

### Slice 3: crew selection

Add ship crew models, one selection, and phase handoff.

### Slice 4: crew survival

Add needs, actions, support, display, and Drifting Loot delegation.

### Slice 5: progress

Add Drowning, local progress, records, and settings.

### Slice 6: audio

Add audio ownership, channels, assets, cues, and controls.

### Slice 7: event pack

Add Broken Boat, Seagull, Flowers, and Sleep Killer.

## Completion criteria

- One crew member can survive, suffer, help, and die.
- Pressure changes event access without visible story state.
- Chests remain aboard until opened or changed.
- The fishing catalog includes all important non-story catches.
- Drowning changes rules through one balance object.
- Local progress survives a reload.
- Audio follows settings and disposes cleanly.
- All new rules pass without a renderer.
- All new visuals follow the visual style guide.
