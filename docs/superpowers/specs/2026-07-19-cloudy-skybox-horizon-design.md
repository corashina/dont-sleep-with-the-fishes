# Cloudy skybox and bright horizon design

## Goal

Replace the deliberately cloudless daytime atmosphere with a denser, weather-aware procedural cloud treatment. Every daytime scene—title, scavenging, and survival—will show layered clouds and a clearly bright white atmospheric separation immediately above the ocean. The woman in the reference image is not part of this scope.

## Constraints

- Keep the atmosphere procedural: do not add external sky art, textures, or network fetches.
- Preserve the existing sky palette as the shared source for scene fog, lighting, and ocean horizon/reflection colours.
- Keep cloud evaluation deterministic, texture-free, and allocation-free in the frame update path.
- Keep the existing moon, stars, weather transitions, resource ownership, and disposal behaviour intact.
- The bright cloud and horizon treatment applies during daytime only. Night remains free of daytime clouds and the white horizon band.

## Visual behaviour

### Daytime clouds

The sky fragment shader will derive a stable cloud mask from the normalized view direction. A broad warped value-noise field establishes large cloud masses, and a smaller second field breaks their edges. The result is intentionally soft and non-photorealistic, matching the existing procedural maritime presentation rather than introducing a photographic sky.

Cloud coverage and contrast are palette values. Calm day has visible but broken coverage; overcast day is substantially fuller; squall day is the densest and darkest. The shader receives the values through uniforms, so weather transitions continue to blend over the existing 1.5-second sky transition.

### Bright ocean–sky separation

The sky shader will add a narrow, high-luminance white atmospheric band centred immediately above the horizon. Its brightness and vertical falloff are daytime palette values, producing the distinct white line requested in the reference while avoiding a discontinuous hard edge.

The existing `horizonColor` remains the common atmospheric colour for the scene background, fog, and ocean shader. The new band is a sky-only highlight rather than a second ocean layer, so water geometry, shared waves, vessel buoyancy, and water exclusions remain unchanged.

### Time and weather boundaries

All three daytime weather states use the cloud layer and bright horizon band. Their palette values establish the intended intensity: calm is bright and broken, overcast is broad and muted, and squall is dense and subdued. Night palettes set cloud coverage and horizon-band intensity to zero, preserving the current night sky, moon, and stars.

## Architecture

`SkyPalette` gains scalar fields for cloud coverage, cloud contrast, horizon-band brightness, and horizon-band width. `skyPaletteFor` and `lerpSkyPalette` materialize and blend them beside the existing palette scalars.

`Skybox` adds matching uniforms and uploads the current palette values each frame. Its fragment shader owns all cloud and horizon-band rendering; it remains the only owner of the procedural-sky mesh and material. No new Three.js resources are created.

`Environment` and `BoatWorld` continue to consume `Skybox.palette` as they do now. `OceanRenderer` continues to receive only the established atmospheric values, ensuring the ocean retains a coherent reflection and fog relationship without coupling it to cloud implementation details.

## Tests and verification

Unit tests will assert that daytime palettes expose non-zero cloud and bright-horizon values, with calm, overcast, and squall ordered by their intended coverage. Night palettes will assert zero daytime cloud coverage and horizon-band brightness. Palette interpolation will cover the new scalars.

Skybox tests will assert the shader declares the new uniforms and cloud/horizon functions, verifies uniform upload from a weather state, and retains its existing shared-moon-texture and one-time-disposal contract. The project checks will include typecheck, the relevant sky tests, the full test suite, and a production build. Browser review will inspect title, scavenging, and survival daytime scenes, then a night survival scene, to confirm the treatment and colour synchronization.

## Out of scope

- Any character, UI, ocean geometry, wave, buoyancy, or gameplay changes.
- New sky textures, cubemaps, cloud geometry, or third-party assets.
- Animated cloud movement; the directional procedural pattern remains stationary.
