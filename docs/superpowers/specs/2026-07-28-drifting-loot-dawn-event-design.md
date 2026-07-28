# Drifting Loot Dawn Event Design

## Goal

Turn Drifting Loot into a dedicated post-night day event. From day 3 onward,
each completed dawn has a 25 percent chance to reveal either a floating barrel
or floating crate. Retrieving it costs 3 energy, plays a fish-like pull toward
the player at the stern, shows the concrete reward, and then returns control to
the same day.

The [unofficial Events wiki][events-wiki] documents Drifting Loot as a day event
with a barrel or crate and a 3-energy retrieval cost. It explicitly states that
the original occurrence chance needs more research. This project therefore
uses the approved authored chance and reward balance below rather than claiming
undocumented parity.

[events-wiki]: https://unoffdontsleepwiththefishes.fandom.com/wiki/Events

## Scope

This feature:

- begins checking at dawn on day 3;
- makes one 25 percent occurrence roll per eligible dawn;
- selects barrel or crate with equal probability;
- uses one shared reward pool for both variants;
- plays a dedicated retrieval and result sequence;
- preserves deterministic rules and explicit resource ownership;
- records the event as the new day's daytime journal event.

Companion retrieval, companion needs, Captain Whiskers, companion rewards, and
other companion-dependent behavior are excluded. Other day events keep their
existing post-action timing.

## Gameplay Rules

### Occurrence

Drifting Loot no longer participates in the weighted post-action day-event
draw. After dawn applies hunger, energy restoration, and starvation damage,
terminal and rescue outcomes take priority. If the run continues:

- days 1 and 2 do not roll for Drifting Loot;
- day 3 and later roll once at a 25 percent chance;
- a failed occurrence roll consumes no variant or reward draw;
- a successful occurrence roll draws barrel or crate at 50/50;
- no additional cooldown applies;
- opening Drifting Loot marks the new day's day event as used.

Marking the event used prevents a second post-action day event during the same
day. If Drifting Loot does not occur, the other day-event flow remains
available as it is today.

### Choices

The event exposes two contextual choices:

- `Retrieve It — 3 Energy`
- `Let It Drift`

Retrieve is unavailable below 3 energy. Its unavailable text states the
requirement and current energy. Let It Drift is always available while the
event is pending.

Selecting Retrieve resolves the event atomically before its presentation
begins. Every reward charges exactly 3 energy. Repeated input cannot charge
energy or grant rewards twice.

### Rewards

Barrel and crate use the same weighted pool:

| Weight | Reward |
| ---: | --- |
| 45 | 2 food |
| 25 | 2 bait |
| 20 | 2 repair material |
| 10 | 1 Energy Bar |

The weights sum to 100 and therefore also describe the intended percentages.
If the Energy Bar's stable inventory slot is occupied, the existing acquisition
rule grants 1 food instead. The result presentation reports the applied
fallback, not the blocked Energy Bar.

Let It Drift grants nothing and costs no energy.

## State and Data Ownership

`SurvivalSession` owns the occurrence, variant, reward, and all associated
random draws through its injected `RandomSource`. Presentation code never
chooses a gameplay variant.

The pending event snapshot gains a nullable deterministic Drifting Loot
variant:

- `barrel`
- `crate`

It is non-null only while Drifting Loot is pending. Before resolving either
choice, the phase captures the variant into its own immutable presentation
state. Event resolution then clears the session-owned pending variant
atomically with the pending event. The phase-owned copy remains available
through retrieval and the locked result presentation, then clears with the
world presentation.

`beginDawn` remains the gameplay boundary for advancing the day. It applies the
existing dawn rules, resolves terminal or rescue priority, then performs the
eligible Drifting Loot roll. On success it opens the existing `dayEvent` state
with `drifting-loot` as the pending event and returns a dawn outcome whose
snapshot exposes the pending event.

The existing event resolver remains responsible for applying the shared reward
pool and 3-energy cost. `ActionOutcome` gains an optional immutable
`rewardSummary` containing the applied reward kind, identifier, and quantity.
Only outcomes that need a dedicated result presentation populate it. Drifting
Loot creates the summary after inventory fallback is known, so a blocked
Energy Bar reports 1 food. The phase formats the result from this summary; it
does not parse prose, inspect journal internals, infer, or reroll a reward.

The previous night's journal entry is finalized before dawn. A resolved
Drifting Loot encounter populates the new day's daytime journal record and is
finalized with that day's later night record.

## Phase Orchestration

`SurvivalPhase` owns the asynchronous sequence and lifecycle-generation guards.
The sequence is:

1. Complete a quiet night or resolve a night event.
2. Cover the scene and run dawn while fully covered.
3. If dawn is terminal or rescued, use the existing ending flow.
4. If no Drifting Loot is pending, settle and uncover the ordinary day.
5. If Drifting Loot is pending, stage the deterministic variant while covered.
6. Render and settle the completed daytime event scene while still covered.
7. Uncover directly into the encounter and enable its choices.
8. On Retrieve, resolve the choice atomically and render committed resources.
9. Play the dedicated stern retrieval animation.
10. Hold the retrieved prop beside the stern and show the result card.
11. On Continue, clear the prop and event UI, unlock commands, and remain in
    the same day.

Let It Drift plays a short receding beat, clears the event, and returns directly
to the same day without a result card.

The phase does not begin another dawn, increment the day, or schedule a second
day event after either choice. Ordinary commands remain locked from event
staging through Continue or completion of Let It Drift.

## World Presentation

`BoatWorld` exposes dedicated Drifting Loot operations behind its event
presentation boundary:

- stage the selected variant;
- reveal it on the shared wave field;
- retrieve it toward the stern;
- let it recede;
- project the held prop's screen bounds;
- clear and restore its base pose.

A focused `DriftingLootPresentation` component owns animation state, roots,
locally created helper geometry, and cleanup. It uses clones of the existing
authored barrel and cargo-crate furniture models. The furniture library retains
ownership of shared model geometry, materials, and textures; the presentation
component removes borrowed clone roots but does not dispose shared resources.
Any locally created splash or accent resources are owned and disposed by the
presentation component exactly once.

Both variants are constructed during world initialization. Runtime staging
only toggles and resets pooled roots. Update and render paths allocate no
geometry, material, vector, quaternion, promise, or setup object per frame.

While floating, the active variant samples the same shared wave field used by
the ocean and lifeboat. Its continuous buoyancy remains fluid. Authored
retrieval motion temporarily layers a keyed offset over that wave pose.

## Motion and Composition

The initial prop floats in readable water behind the boat, leaving the horizon
and ordinary condition UI clear. Only the selected variant is visible.

Retrieve follows the fishing interaction's motion language but uses the stern
as its destination:

1. a brief downward and outward anticipation;
2. decisive travel through the water toward the player at the stern;
3. a restrained overshoot at the destination;
4. an imperfect held pose with believable weight;
5. clean removal after Continue.

The animation does not add a rope, boathook, or player avatar. The object itself
travels to the player, matching the approved fishing-style interaction.

Let It Drift uses a short, quiet recession with the shared wave field still
active. It avoids exaggerated bounce, constant wobble, or elastic motion.

## Interface

The unresolved event uses the existing compact scene-integrated contextual
choice strip. The center of the scene remains open.

After a successful retrieval, a fishing-style result card anchors beside the
projected held prop:

- caption: `SALVAGE RECOVERED`;
- main line: the concrete applied reward, such as `+2 FOOD`, `+2 BAIT`,
  `+2 REPAIR MATERIAL`, `ENERGY BAR`, or the fallback `+1 FOOD`;
- detail: `−3 ENERGY`;
- action: `Continue`.

If the projected prop is offscreen or unavailable, the card uses the existing
safe routine-dialog fallback placement. Result text, unavailable state, focus,
and selection remain understandable without color.

Continue is keyboard operable and guarded against repeated activation. Focus
returns to an available daytime command after the event clears.

This feature adds no reduced-motion variant or `prefers-reduced-motion`
handling.

## Visual Interpretation

The event follows the visual guide's four pillars:

- **Authored illustrated forms:** reuse the constructed barrel and cargo-crate
  models instead of the current combined primitive placeholder.
- **Scene-integrated interface:** choices and reward information stay beside
  the physical subject rather than using a central software panel.
- **Tactile keyed motion:** retrieval uses anticipation, decisive travel,
  restrained overshoot, a held pose, and clean restoration.
- **Restrained print treatment:** existing lighting, contact depth, and print
  processing unify the event without replacing model, material, or motion
  substance.

The barrel and crate are separate variants, never staged together.

## Failure and Cancellation

- Insufficient energy rejects Retrieve without changing state, resources,
  variant, or reward.
- Let It Drift remains available when Retrieve is blocked.
- A terminal dawn or rescue prevents Drifting Loot from opening.
- A missing or invalid pending variant fails validation in tests and does not
  trigger presentation-layer randomness.
- Restart or disposal increments the existing lifecycle generation, settles
  active promises, removes the staged prop, hides result UI, and prevents stale
  continuations from granting rewards or restoring controls.
- Superseded or repeated Continue input clears the presentation once.
- Model loading failures remain startup failures through the existing furniture
  asset pipeline; the event does not create runtime placeholder assets.

## Verification

### Session tests

- no occurrence roll before day 3;
- exact 25 percent boundary from day 3 onward;
- one occurrence roll per eligible dawn;
- no variant draw after a failed occurrence roll;
- 50/50 barrel and crate boundary;
- rescue, death, and sinking priority over the event;
- Drifting Loot suppression of a second day event;
- unchanged post-action eligibility when Drifting Loot does not occur;
- 3-energy atomic cost and all four reward branches;
- occupied Energy Bar slot falling back to 1 food;
- insufficient-energy rejection without mutation;
- journal ownership by the new day.

### Phase and UI tests

- cover, dawn, stage, settle, uncover, and choice-unlock ordering;
- deterministic variant passed from session to world;
- committed state rendered before retrieval presentation;
- reward card content and held-prop anchoring;
- Continue cleanup, focus restoration, and same-day continuation;
- Let It Drift recession and direct same-day return;
- repeated input, restart, and disposal cancellation.

### World tests

- only the selected model variant is visible;
- floating motion samples the shared wave field;
- retrieval ends at the authored stern target and retains a stable held pose;
- projection follows the held prop;
- clear restores both variant base poses;
- no per-frame resource creation;
- borrowed furniture resources are never disposed by the event presentation;
- locally owned resources are disposed exactly once.

Final verification runs:

```bash
bun run test
bun run typecheck
bun run build
```
