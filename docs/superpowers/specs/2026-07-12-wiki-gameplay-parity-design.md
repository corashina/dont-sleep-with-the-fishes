# Wiki Gameplay Parity Design

## Goal

Bring Don't Sleep With The Fishes' survival gameplay close to the Don't Sleep With The Fishes Fandom wiki while keeping this project independent of story content. The checked-in game data must reproduce every exact, relevant value documented by the selected wiki snapshot. Where the wiki is silent, incomplete, or contradictory, the game preserves its current behavior. New ship items that have no documented weight or spawn count use weight `1` and spawn count `1`.

Canonical source pages:

- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Items>
- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Fishing>
- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>
- <https://unoffdontsleepwiththefishes.fandom.com/wiki/Don%27t_Sleep_With_The_Fishes_%28Unofficial%29_Wiki>

The wiki is a development-time reference only. The shipped game remains fully offline and does not scrape or fetch Fandom at runtime.

## Scope

### Included

- Practical survival items used during scavenging, fishing, healing, repair, ordinary loot, or non-story event responses.
- Documented item labels, uses, durability, break/loss behavior, and consumption rules.
- Fishing energy costs, bait behavior, catch outcomes, and documented weighted probabilities.
- Survival values that the wiki states explicitly, including health damage, boat damage, energy effects, food changes, and repair effects.
- Ordinary survival events: peaceful nights, repeatable hazards, loot encounters, and other events not classified by the wiki as story-related.
- Event chance weights, minimum and maximum days, repeat cooldowns, danger requirements, prerequisites that do not depend on excluded story state, item choices, weighted outcomes, and numeric ranges.
- Procedural in-game representations and accessible UI for all included items and event choices.

### Excluded

- Crewmates, passengers, character needs, character condition, dialogue, and relationship mechanics.
- Endings, ending counters, rescue-story chains, and ending-specific outcomes.
- Heart of the Sea pieces and their progression.
- Journal and lore progression.
- Any event the wiki classifies as story-related, even when one branch also grants resources.
- Items whose only function is an excluded story, character, or ending mechanic.
- Wiki artwork, audio, or other copyrighted assets. New items receive original procedural props.

Mixed-purpose items remain available for their ordinary survival functions, but excluded story effects are not implemented.

## Canonical Data Architecture

Create a focused `src/canonical` layer containing typed, checked-in records for:

- source metadata and the wiki snapshot date;
- item definitions and acquisition defaults;
- fishing and daytime action rules;
- ordinary event definitions and outcomes;
- survival values shared by actions and events;
- a parity audit that classifies every reviewed wiki item and event.

Each imported or retained field carries provenance through a small status type:

- `wiki`: the value is explicitly documented and must match exactly;
- `preserved`: the wiki does not resolve the value, so the pre-parity game value remains;
- `default`: a new item lacks a current or documented value and uses the approved value `1`.

The runtime consumes resolved values, while tests and audit tooling consume the provenance metadata. This keeps game code simple without losing traceability.

The parity audit classifies every reviewed wiki entry as one of:

- `included`;
- `story-excluded`;
- `unsupported-undocumented`.

Every classification includes a concise reason. No reviewed entry may disappear silently.

## Gameplay Model Changes

### Items and scavenging

The existing item catalog becomes an adapter over the canonical item definitions. Scavenging reads labels, weights, spawn counts, and durability from this catalog. Existing undocumented values keep their current values. A newly added ship item without a documented weight or count receives weight `1` and count `1`, both marked `default`.

Saved physical instances remain the handoff between scavenging and survival. The procedural prop factory adds distinct original shapes where practical and a deliberate generic fallback so every canonical item can render safely.

### Inventory condition

Survival inventory state expands beyond `owned`, `charges`, and `durable`. Each instance can be usable, broken, consumed, or lost. Counts and condition changes must support:

- single-use items;
- persistent tools;
- tools that can break;
- items that can be lost;
- stackable resources such as food and bait;
- repair of broken items when the wiki documents it.

The UI derives available choices and status text from this same state. Broken, consumed, and lost items cannot be selected as usable event responses.

### Fishing and ordinary actions

Fishing and action resolution read typed outcome tables rather than hard-coded branches. A rule can declare an energy cost, eligibility, optional bait behavior, and one or more weighted outcomes. Bait is consumed only under the conditions documented by the wiki. Undocumented behavior stays as it was before this change.

### Events

The event schema supports:

- multiple valid item responses;
- weighted outcomes per response;
- inclusive integer ranges for damage or rewards;
- item consumption, breakage, loss, and repair;
- minimum and maximum day conditions;
- danger and ordinary inventory prerequisites;
- repeat cooldowns;
- peaceful/no-effect outcomes.

Events whose eligibility requires excluded story state are excluded instead of approximated. Documented ranges are sampled as inclusive ranges, never averaged. All selection uses the existing seeded random source so outcomes remain reproducible.

## Data Flow

1. A developer reviews the selected wiki pages and updates the checked-in canonical records and parity audit.
2. Catalog validation rejects malformed or internally inconsistent data.
3. Scavenging builds physical item instances from the canonical item adapter.
4. Saved instances create condition-aware survival inventory state.
5. Actions and event resolution read canonical costs, eligibility rules, and outcomes.
6. The seeded random source selects weighted results and values from inclusive ranges.
7. State changes update the lifeboat props, tooltips, action availability, and event choices through the existing session snapshot flow.

No runtime path depends on network access or wiki availability.

## Validation and Error Handling

Catalog validation fails tests and development startup for:

- duplicate item or event IDs;
- missing labels or source metadata;
- negative chance weights;
- reversed or non-integer ranges;
- impossible day bounds or cooldowns;
- references to unknown or excluded items;
- empty weighted-outcome groups;
- parity-audit entries without a classification reason.

An unexpected item still renders through the generic procedural prop fallback. A malformed canonical rule does not silently fall back during play; it is treated as a development error. Wiki omissions use explicitly marked `preserved` or `default` values rather than implicit guesses.

## Testing

Implementation follows test-driven development.

### Data-contract tests

- Assert every documented number, range, weight, day constraint, cooldown, and item effect exactly.
- Assert every resolved value has `wiki`, `preserved`, or `default` provenance.
- Assert every reviewed item and event appears in the parity audit.
- Assert excluded entries cannot enter runtime catalogs.

### Unit tests

- Catalog validation and provenance resolution.
- Inclusive range boundaries.
- Weighted choice boundaries with deterministic random sequences.
- Event eligibility, day limits, danger requirements, and cooldowns.
- Item use, consumption, breakage, repair, and loss.
- Fishing, bait consumption, catches, repairs, healing, and energy changes.

### Integration and regression tests

- Scavenging instance creation through survival inventory handoff.
- Lifeboat props and tooltips for new, broken, consumed, and lost items.
- Event-choice availability and outcome application.
- Existing tests for all behavior intentionally marked `preserved`.
- Full restart with the expanded catalogs.

### Completion verification

- Run the complete test suite.
- Run TypeScript type-checking.
- Produce a successful production build.
- Play through the scavenging-to-survival handoff in a browser and exercise fishing, inventory condition, and representative ordinary events.

## Success Criteria

- Every in-scope exact value documented by the selected wiki snapshot exists once in the canonical data layer and is covered by a data-contract test.
- Story-related content is absent from runtime catalogs and recorded as excluded in the audit.
- Undocumented existing behavior is unchanged and marked `preserved`.
- New undocumented ship items use the approved weight `1` and spawn count `1`, marked `default`.
- The game remains deterministic under a fixed seed, offline-capable, accessible by keyboard, and compatible with the current desktop-browser milestone.
- All automated verification and the representative browser playthrough pass.
