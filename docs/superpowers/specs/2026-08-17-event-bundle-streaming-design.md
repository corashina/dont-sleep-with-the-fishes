# Event Bundle Streaming Design

## Goal

Load each survival event during the fade-out that precedes it.

Do not start fade-in until the full event is ready. Free event-only runtime resources during the covered exit transition.

Report a fatal error when a required event resource cannot load. Do not show an incomplete event.

## Scope

This design applies to every survival event in `EVENT_PRESENTATION_ROUTES`.

It covers event models, textures, geometry, materials, skeletons, animations, sounds, generated effects, presenters, and event UI hooks.

Resources used during normal boat play remain in the base survival load. Resources shared by many events can also remain shared when per-event ownership adds no useful memory saving.

The browser can retain downloaded files in its HTTP cache. JavaScript modules can also remain in the browser module cache. Bundle disposal must release the game-owned CPU, GPU, and decoded audio resources.

## Selected Approach

Use one strict event bundle manager.

Each event has one manifest entry. The entry declares its model assets, sound assets, presenter loader, and generated effects.

The manager permits one pending load and one active bundle. It rejects conflicting ownership instead of creating hidden fallback paths.

Route-level bundles were rejected because they load assets for events that are not active. Presenter-owned lazy loading was rejected because it spreads lifecycle rules across many classes.

## Architecture

### Event bundle manifest

`EventBundleManifest` maps every survival event ID to one immutable resource declaration.

Each declaration contains:

- Model IDs and asset URLs.
- Sound IDs and asset URLs.
- A lazy presenter factory.
- Event-only generated effect factories.

A completeness test must fail when an event route lacks a manifest entry.

### Event bundle loader

`EventBundleLoader` loads all declared resources in parallel. It creates the presenter only after every required resource succeeds.

If one resource fails, the loader disposes every completed resource. It then throws an event load error with the event ID and failed resource.

### Event bundle

`EventBundle` owns one event's runtime state. It exposes the presenter used by `BoatWorld` and an idempotent `dispose()` method.

Disposal must:

- Stop event voices and loops.
- Release decoded event audio buffers.
- Remove event scene roots.
- Stop animation mixers.
- Dispose owned geometry, materials, textures, and skeletons.
- Remove event listeners and UI hooks.
- Release generated effects and presenter state.

### Event bundle manager

`EventBundleManager` owns the pending load and active bundle.

It provides operations equivalent to:

- `beginLoad(eventId)` to start a guarded load.
- `activate(eventId)` to wait for and return the completed bundle.
- `releaseActive()` to detach and dispose the active bundle.
- `dispose()` to cancel work and clean all owned resources.

Load generations prevent stale work from attaching. A late result from a cancelled load disposes immediately.

### Boat world

`BoatWorld` keeps shared boat systems and shared presentation support. It no longer constructs all event presenters during startup.

It attaches one loaded presenter, stages it, updates it, and detaches it. Event interaction targets come only from the active presenter.

Generated event tableaus and route-specific presenters move out of the permanent presentation layers. Each event factory creates only its own content.

### Audio

`AudioSystem` keeps the audio context, buses, master controls, and shared sounds.

An event bundle acquires its declared sounds through a disposable event audio bank. The bank decodes sounds before activation. Its disposal stops owned voices and releases its buffers.

Event playback must never trigger a network fetch or decode operation after fade-in starts.

## Lifecycle

### Event entry

1. `SurvivalSession` selects the next event.
2. `SurvivalPhase` starts fade-out and `beginLoad(eventId)` together.
3. The cover reaches full opacity.
4. The prior bundle detaches and disposes, when present.
5. The phase waits for the new load to complete.
6. A failed load keeps the cover visible and enters the fatal error flow.
7. The world attaches and stages the completed presenter.
8. The phase renders one covered frame and waits for scene settlement.
9. Fade-in starts.
10. The event runs with no asset loading.

### Event exit

1. The event outcome finishes.
2. The phase starts the exit fade.
3. If a chained event is already known, its bundle load starts with this fade.
4. The cover reaches full opacity.
5. The old presenter detaches and its bundle disposes.
6. The phase activates the chained bundle or prepares the normal boat state.
7. The phase renders and settles one covered frame.
8. Fade-in starts.

The game must not remove visible event content before the cover reaches full opacity.

### Cancellation and shutdown

A restart, phase disposal, fatal error, or superseding generation cancels the pending ownership token.

Completed late resources dispose instead of attaching. Manager disposal also releases the active bundle.

## Error Handling

Missing manifest entries, failed downloads, decode errors, invalid models, presenter construction errors, and staging errors are fatal.

The cover remains visible. The existing fatal error handler receives an error that names the event and resource.

Do not use placeholder models, silent event substitutes, or partial presenter fallbacks.

Cleanup errors must not hide the original load error. Cleanup should still attempt every remaining resource.

## Tests

Add unit and integration tests that verify:

- Every routed event has one manifest entry.
- Every manifest entry declares its event-only resources.
- Loading starts before fade-out completes.
- Fade-in waits for the complete bundle.
- Visible event play performs no fetch or decode work.
- Exit cover disposes the active bundle.
- Chained events load during the prior event's exit fade.
- Cancellation disposes late resources.
- Partial failures dispose completed resources and report a fatal error.
- Shared resources remain loaded.
- Startup does not fetch event-only model or sound bytes.
- Bundle and manager disposal are idempotent.

Test doubles must record load, attach, stage, play, stop, detach, and dispose order.

## Acceptance Criteria

- Every survival event follows the covered bundle lifecycle.
- Event content is complete before any fade-in begins.
- No event-only model or sound loads during startup.
- No event asset loads while its event is visible.
- Event-only runtime resources are released after the covered exit.
- Chained events start loading with the prior exit fade.
- A required resource failure shows the fatal error flow.
- Existing event presentation and interaction behavior remains unchanged.
