# Sunny Scavenging Weather Design

## Goal

Render the scavenging phase in calm, sunny daylight without rain. Keep the existing sea spray, sinking progression, ship motion, waves, alarm effects, and survival-phase weather behavior.

## Design

`Environment` continues to own the scavenging atmosphere. It will initialize and update `Skybox` with the existing `calm/day` state. The calm palette already supplies a visible sun, brighter daylight, lighter fog, and matching ambient and directional lighting, so this change does not add a new weather identifier or duplicate palette values.

The scavenging environment will stop constructing and updating the rain particle field. It will retain the sea-spray particle field and its reduced-motion behavior. `World` will continue to copy the environment palette into the ocean renderer and apply the existing sinking state to the ship, waves, lifeboat, alarm, and spray.

The calm sky will use zero weather severity throughout scavenging. Sinking progress will continue to affect physical motion and effects, but it will not darken the sky into a storm.

## Resource Ownership and Errors

Removing rain also removes its geometry, material, and per-frame buffer update. `Environment.dispose()` will continue to release the sky and sea-spray resources and restore the scene state it replaced. The change adds no new construction or runtime failure path; `World` will retain its existing environment rollback behavior.

## Scope

- Change `src/world/Environment.ts` and its focused tests.
- Do not change survival weather types, probabilities, labels, palettes, or transitions.
- Do not add assets or runtime network requests.

## Testing

Tests will assert that the scavenging world uses the calm daytime atmosphere, exposes a visible sun, does not add a `rain` object, retains `sea-spray`, and disposes its remaining environment resources. Existing world, sky, type-check, and build checks will cover atmosphere synchronization and integration.

Browser inspection will cover the title and active scavenging scenes. The inspection will confirm bright sunny lighting, no rain, visible sea spray, readable ship interiors and items, and unchanged sinking motion. It will also enter survival to confirm that survival weather still changes under its existing rules.
