# Events

[Game overview](../README.md) · [Gameplay](GAMEPLAY.md) · [Architecture](ARCHITECTURE.md)

This guide covers event rules and their presentation. It contains spoilers.

## Definitions and selection

[eventCatalog](../src/survival/eventCatalog.ts) defines event IDs, choices, requirements, weighted outcomes, and timing.
[eventCatalogValidation](../src/survival/eventCatalogValidation.ts) checks definitions.
[eventSelection](../src/survival/eventSelection.ts) filters eligible events before a weighted draw.

Eligibility depends on phase, day bounds, weather, cooldown, appearance count, pressure, inventory, chest state, and companion state.
The selector excludes the previous event and applies session exclusions.
For repeated events, it divides draw weight by `(appearances + 1)³`.

[RunPressure](../src/survival/RunPressure.ts) raises pressure on days 8, 15, 25, and 30.
Each pressure level adds 25% to dangerous-event weight, up to four levels.
Event outcomes can change pressure. Quiet nights pass through the session's night flow.

From day three, the dawn flow has a 35% chance to draw a daytime event.
The day catalog contains Drifting Supplies, Drifting Chest, and Seagull Theft.
No eligible daytime event means no encounter. An empty night pool raises an error.
The Kraken bypasses the weighted pool: a complete heart schedules it at nightfall.

Sources: [SurvivalSession](../src/survival/SurvivalSession.ts), [balance](../src/survival/survivalBalance.ts).

## Outcomes and state

[eventChoiceRules](../src/survival/eventChoiceRules.ts) checks available responses.
[eventResolver](../src/survival/eventResolver.ts) and [eventOutcomeRules](../src/survival/eventOutcomeRules.ts) resolve weighted results.
The session applies resource changes, item mutations, chest changes, heart pieces, and next-dawn effects.
Presentation plays the resolved result; it must not draw a second gameplay outcome.

Use stable result IDs to distinguish response variants.
[eventPresentationOutcome](../src/survival/eventPresentationOutcome.ts) supplies variant seeds and presentation outcome data.
[journalRecords](../src/survival/journalRecords.ts) defines structured history.
Update translated setup, reaction, and journal result text with the rule change.

## Names and special cases

Some internal IDs differ from their visible scene. Use these mappings when searching code.

| Visible encounter | Code | Notes |
| --- | --- | --- |
| Jellyfish | `flowers` event; `flowers` heart piece | Net or Bucket retrieves the heart piece. The current catalog allows one appearance. |
| Ocean of Blood | `ocean-of-blood` | Scuba Gear retrieves the blood piece. |
| Drifting supplies | `drifting-supplies` | Barrel, lifeboat, container, debris, and whale variants share one event. |
| Chest attack | `chest-attack` | Requires a mimic chest. Knife reduces the attack damage. |
| Mimic encounter | `mimic` | Separate from the chest attack. |
| Tentacle Attack | `tentacle-attack` | Uses the Snatcher presentation. |
| Kraken | `kraken` | Completes the heart ending after the return sequence. |

[driftingSupplies](../src/survival/driftingSupplies.ts) derives supply kind and distance from the variant seed.
Its history keys use `drifting-supplies:<kind>`, with a three-day kind cooldown.
[tradeEvents](../src/survival/tradeEvents.ts) and [tradeRules](../src/survival/tradeRules.ts) handle trade variants.

## Presentation path

```text
SurvivalEventFlow → event bundle load → EventPresentationHost
                                             ↓
                                 EventPresentationRegistry
                                             ↓
                       route adapter → scene presentation
                                             ↓
                             choice → outcome → cleanup
```

[eventPresentationRoutes](../src/survival/eventPresentationRoutes.ts) assigns an event to a presentation family.
[EventPresentationRegistry](../src/survival/EventPresentationRegistry.ts) creates the matching adapter.
[eventPresentationAdapters](../src/survival/eventPresentationAdapters.ts) connects family-specific implementations to the shared lifecycle.
[EventPresentationHost](../src/survival/EventPresentationHost.ts) owns the active adapter and its replacement.

| Route | Purpose |
| --- | --- |
| `dedicated` | Event-specific scene behavior, including creatures, storms, and Carlitos encounters. |
| `focused` | Encounters viewed through a focused scene and camera. |
| `featured` | Boat-adjacent encounters such as drifting supplies and Jellyfish. |
| `weather`, `supernatural` | Shared animation families for related events. |
| `dangerousWaters`, `moon` | Specialized presentation adapters. |
| `null` | Quiet Night has no presentation adapter. |

[eventBundleManifest](../src/survival/eventBundleManifest.ts) declares event models and sounds.
[EventBundleManager](../src/survival/EventBundleManager.ts) loads and releases those resources.
Use [eventItemUseChoreography](../src/survival/eventItemUseChoreography.ts) for item motion and [EventItemUseController](../src/survival/EventItemUseController.ts) for its lifecycle.
Use [presentationWeather](../src/weather/presentationWeather.ts) for weather effects. Shared presentation weather has more variants than domain weather.

## Add or change an event

1. Define its rule, ID, choices, and schedule in the catalog. Set explicit result IDs for distinct outcomes.
2. Add text for English, Polish, and Argentinian Spanish, including reactions and journal results.
3. Assign a presentation route. Extend the matching factory or adapter and declare its resource bundle.
4. Apply rewards and damage through the session. Keep animation and camera state inside presentation owners.
5. Check save parsing and history validation for new IDs or state.
6. Check selection, requirements, outcomes, and disposal with the relevant existing tests.
7. Inspect the scene through System Tuning → Event Test. Check available and unavailable responses.

[EventTest](../src/app/EventTest.ts) builds inspection choices, deterministic variants, ending previews, and the item animation lab.
Inspection starts a prepared survival run; it does not prove that normal selection can reach the event.

Useful checks include [survivalEvents](../tests/survivalEvents.test.ts), [eventSelectionCoverage](../tests/eventSelectionCoverage.test.ts), and [eventResolver](../tests/eventResolver.test.ts).
For scene changes, check [EventPresentationRegistry](../tests/EventPresentationRegistry.test.ts) and [EventPresentationDisposal](../tests/EventPresentationDisposal.test.ts).
Follow the test-importance rule in [AGENTS.md](../AGENTS.md) before adding tests.
