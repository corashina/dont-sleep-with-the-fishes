# Empty Lifeboat Event Design

## Goal

Add a recurring daytime survival event named Empty Lifeboat.

The event uses the shared drifting-item focus flow. Searching always grants the minimum useful reward: one food or one bait.

## Event Schedule

- Event ID: `empty-lifeboat`
- Phase: day
- Risk: safe
- Cue: sighting
- Earliest day: 10
- Weight: 1
- Cooldown: 3 days
- Maximum appearances: none

The event uses normal daytime selection, resolution, and journal systems.

## Reveal

Reveal text: `An empty lifeboat drifts close enough to search.`

The supplied raft model floats beside the boat. It follows the shared wave field and uses a seeded left or right side.

The initial camera remains in the normal survival view. The raft becomes the world interaction target.

## Choices

### Search It

Label: `Search It`

Requirement: at least one player energy.

Every accepted outcome removes one player energy.

| Weight | Result | Effects |
|---:|---|---|
| 1 | Food | Add one food. |
| 1 | Bait | Add one bait. |

Both outcomes have equal 50 percent odds. No empty outcome exists.

Rejected searches do not change energy, food, or bait.

### Let It Drift

Label: `Let It Drift`

This choice has no requirement, cost, or reward. The lifeboat drifts away.

## Interaction Flow

The lifeboat joins the existing `DriftingItemFlow` event family.

Selecting its world anchor moves the camera into the shared drifting-item focus view. The compact action panel shows Search It and Let It Drift.

Search It remains visible when energy is low. Its unavailable reason states the one-energy requirement.

After an accepted search, the session resolves one weighted result. The lifeboat moves closer, holds briefly, and then drifts away.

The shared reward view shows one food or one bait. The camera returns after the reward view closes.

Let It Drift plays the departure motion before the camera returns. It shows no reward view.

## Architecture

### Event Rules

`eventCatalog.ts` owns schedule, choices, requirements, weights, messages, resource effects, and presentation keys.

Both search outcomes use `empty-lifeboat.search`. The leave outcome uses `empty-lifeboat.drift`.

`balanceSimulation.ts` prefers Search It before Let It Drift.

### Shared Drifting-Item Flow

`DriftingItemEventId` includes Empty Lifeboat. `DriftingCargoEventId` remains limited to barrel and chest.

`DriftingItemFlow` accepts `search` as a supported choice. It retains existing lifecycle generation checks, focus entry, choice locking, rejection recovery, visibility handling, and camera return.

The world port gains one explicit lifeboat search command. The flow does not treat the lifeboat as retrieved cargo.

Shared energy-cost metadata derives from a drifting choice's energy requirement. It does not depend on the `retrieve` choice ID.

The lifeboat world anchor opens drifting-item focus. Its Search It action targets the lifeboat model.

### Event Resolution

`SurvivalEventFlow` resolves the session choice before it starts the search motion. It passes the accepted reward summary to the shared result view.

The reward view title is `LIFEBOAT SUPPLY`. It receives the exact one-resource reward summary from session resolution.

A missing reward summary for an accepted search is an invariant error. The flow skips the reward view and completes cleanup without inventing a reward.

### World Presentation

`EmptyLifeboatPresentation` remains a featured presenter. It owns raft staging, wave pose, search motion, departure motion, visibility, and cleanup.

`BoatWorld` bridges shared drifting-item commands to the featured presenter. Search uses `empty-lifeboat.search`. Leave uses `empty-lifeboat.drift`.

Barrel and chest retrieval methods remain unchanged. The lifeboat never moves to their persistent storage target.

Frame updates reuse vectors, quaternions, and wave samples. They create no repeated setup or per-frame allocations.

## Visual Design

Use the supplied Poly Pizza model at `https://poly.pizza/m/Hgf0R8s4Uo`.

The raft stays in the midground. It must remain clear against cool water without blocking the screen center.

The model uses its worn yellow and dark accents. No new material, light, post-processing, UI art, or sound is required.

Search motion brings the raft closer without lifting it from the water. Departure increases distance and lowers it slightly behind the waves.

## Asset Controls

Add `emptyLifeboat` to the event model source map, lock file, generated metadata, runtime model manifest, and event bundle.

Pin source and processed file hashes. Record the model title, author, license, source URL, triangle count, and output hash in the attribution ledger.

The processed model must contain at most 2,000 triangles. The event-model pipeline must reject a hash or limit mismatch.

Add no sound asset.

## Lifecycle and Errors

Duplicate focus, search, leave, and return input cannot start parallel operations.

If session validation rejects Search It, the focus panel reopens and shows the rejection. No resource changes remain.

Page hiding settles active camera and raft motion. It does not resolve an unselected choice.

Restart, event replacement, and disposal invalidate stale work. Cleanup hides the raft, clears interaction targets, restores camera ownership, and resolves pending animation promises.

Required model load failures use the existing event-bundle error path. Do not add a procedural model fallback.

Remove the obsolete generic Empty Lifeboat choice path. Do not keep a compatibility route.

## Testing

### Rules and Session

- The event is safe and daytime.
- Earliest day is 10, weight is 1, and cooldown is three days.
- Search requires one energy.
- A zero-energy search is rejected atomically.
- A low random roll grants one food and spends one energy.
- A high random roll grants one bait and spends one energy.
- Search never grants zero supplies or more than one supply.
- Let It Drift changes no resources.

### Shared Flow

- Selecting the lifeboat enters focus before choices appear.
- Search resolves once, hides focus, plays search motion, shows the reward, and then returns.
- Let It Drift plays departure without a reward.
- Rejected search restores the focus view.
- Visibility, cleanup, and stale operations cannot resolve twice.
- Barrel and chest flow order remains unchanged.

### Presentation and Integration

- The bundle loads the pinned `emptyLifeboat` model.
- The event registry routes Empty Lifeboat through the featured family.
- Seed parity selects stable opposite sides.
- Idle motion samples the shared wave field.
- Search approaches and then leaves.
- Let It Drift leaves without approaching.
- Completion, visibility settlement, clear, and disposal hide the raft.
- Projected bounds and aim targets use the active raft root.

### Verification

Run focused Vitest suites during test-driven development. Then run TypeScript checks, the production build, the event-model check, and the full Vitest suite.

Use the in-app browser Event Test tool to inspect reveal, focus, search, reward, departure, and camera return.

## Out of Scope

- Carlitos search support.
- More reward types or quantities.
- Empty, harmful, or multi-supply outcomes.
- A new focus panel.
- New sound, lighting, weather, or post-processing.
- Changes to barrel or chest rewards.
- Reduced-motion behavior.
