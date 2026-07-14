# Grounded Stylized Sky Rework Design

**Date:** 2026-07-14
**Target:** Desktop browser
**Stack:** Vite, TypeScript, Three.js, Vitest
**Status:** Approved in conversation

## 1. Objective

Rework the cloudless procedural sky so it feels believable at sea while retaining the game's simplified, muted visual language. The current three-band gradient, analytic moon disc, and uniform-looking stars read as artificial. The replacement will use a more physically inspired atmosphere, an original textured gibbous moon, a restrained sun halo, and naturally varied stars.

The change preserves the existing shared weather and phase palette, fog and ocean synchronization, 1.5-second transitions, cloudless requirement, and single-sphere rendering model.

## 2. Visual Direction

The target is grounded stylized realism rather than photographic simulation. Atmospheric cues should be physically recognizable, but colors, contrast, and detail remain controlled enough to sit beside the procedural ship, lifeboat, ocean, and UI art.

The revised sky will provide:

- A deeper zenith, brighter horizon, and smoother elevation response based on approximate atmospheric optical depth.
- Restrained blue-green maritime color rather than saturated fantasy blue.
- Fine, static luminance variation and dithering that prevent a sterile digital gradient without forming clouds.
- A compact sun disc, soft bloom, and broad low-intensity halo attenuated by weather haze.
- A textured, slightly gibbous moon with visible crater structure, a soft terminator, and a clean transparent edge.
- Sparse stars with varied scale and brightness, suppressed near the horizon and by weather haze.

No cloud mesh, cloud texture, shader cloud, moving vapor layer, or photographic sky panorama will be added.

## 3. Moon Asset

Create one original 512 by 512 RGBA moon texture for this project and commit it at `src/assets/sky/moon-gibbous.png`.

The texture will contain:

- A slightly gibbous illuminated shape.
- Grayscale crater and maria detail at a restrained contrast.
- A soft shaded terminator that gives the disc depth.
- Transparent pixels outside the lunar edge.
- A small amount of edge softness to avoid aliasing without producing a large painted glow.

The texture is original project art, not a third-party download. It therefore does not introduce a new external asset store or a `THIRD_PARTY_ASSETS.md` entry. Runtime code will load the committed local file and perform no remote asset request.

The shader treats the sampled texture as lunar luminance and alpha. Palette color supplies the final cool or neutral tint, while weather and phase control opacity. The moon texture itself does not encode sky color or a large halo.

## 4. Asset Ownership and Loading

Add a focused `SkyAssets` module that loads and owns the moon texture. Loading occurs during the existing startup asset phase, alongside the item-model library.

The startup flow will:

1. Load item models and sky assets before constructing `Game`.
2. Pass the loaded `SkyAssets` instance to `Game`.
3. Include the shared sky assets in each `GamePhaseContext`.
4. Pass the same moon `Texture` to every `Skybox` created by scavenging or survival.
5. Dispose `SkyAssets` once when `Game` shuts down, after the active phase has released its sky material.

`Skybox` samples the shared texture but does not dispose it. Its existing disposal remains responsible only for its sphere geometry and shader material. This prevents duplicate image decoding, duplicate GPU texture allocation, and disposal conflicts during phase changes or restarts.

`SkyAssets.load` accepts an injectable loader interface for tests. Production uses Three.js `TextureLoader.loadAsync` with the Vite-bundled texture URL. The loaded texture uses `ClampToEdgeWrapping`, `LinearFilter`, `LinearMipmapLinearFilter`, generated mipmaps, and `SRGBColorSpace`. Sampling therefore produces linear lunar luminance before palette tinting.

If the committed texture cannot load, startup reports an asset-loading failure through the existing compatibility/loading error path. It will not silently fall back to the current analytic moon.

## 5. Sky Shader

The renderer remains one inward-facing sphere centered on the active camera. It retains disabled depth writing, disabled depth testing, early render order, no scene fog, no frustum culling, and idempotent disposal.

### Atmosphere

Replace the current two smoothstep blends with an elevation-based approximation:

- Use view elevation to approximate longer optical paths near the horizon.
- Shape a broad Rayleigh-like zenith contribution from the palette's zenith and upper colors.
- Shape a Mie-like horizon haze contribution from the horizon color and haze scalar.
- Add a narrow, low-intensity horizon lift that matches the fogged ocean without drawing a hard band.
- Apply exposure after the atmospheric components are combined.
- Add very low-amplitude static variation and display-space dithering to reduce banding. Variation must not resemble clouds or animate across frames.

The palette remains the artistic control layer. The shader is physically inspired, not a wavelength-accurate scattering simulation.

### Sun

Render the sun from the angular distance between the view direction and a fixed sun direction. Combine three restrained components:

- A defined inner disc.
- A soft bloom immediately around the disc.
- A broad, faint atmospheric halo.

`sunVisibility` controls the disc, while haze attenuates bloom and spreads the remaining halo. Calm day has a clear warm sun. Overcast day diffuses it. Squall day reduces it to a weak cold presence. Night states hide it completely.

### Moon

Project view directions into a tangent basis centered on the fixed moon direction. This produces square texture coordinates in angular sky space, keeping the lunar disc circular at every viewport aspect ratio.

Sample the moon only inside its bounded angular region. Multiply sampled luminance by `moonColor`, sampled alpha, `moonVisibility`, and haze attenuation. Add a small analytic halo outside the texture so the image retains a clean edge and the glow can respond independently to weather.

The moon remains fixed in direction because the game has phase-based days and nights rather than a continuous clock. Dynamic lunar phases are outside this change.

### Stars

Replace the single thresholded cell hash with two deterministic star layers at different angular cell scales. Each candidate star receives a stable brightness and size variation. A small minority may lean subtly cool or warm, but the field stays mostly neutral.

Stars fade near the horizon, behind haze, and with reduced `starVisibility`. They do not twinkle or move. Calm night shows a sparse readable field, overcast night suppresses most stars, and squall night leaves only rare faint points.

## 6. Weather and Phase Treatment

The existing six authored atmosphere states remain, with palette values retuned for the new shader.

### Calm day

- Clear maritime blue with a pale horizon.
- Warm compact sun and restrained halo.
- Low haze and the highest daylight exposure.

### Overcast day

- Muted steel-blue atmosphere with low contrast.
- Dense aerosol haze without cloud shapes.
- Diffused sun with a weak disc.

### Squall day

- Cold, desaturated upper sky and murky horizon.
- Thick haze and a barely visible sun.
- Scavenging sinking severity deepens the upper sky and fog gradually without turning the entire frame uniformly black.

### Calm night

- Deep navy zenith with a subtle cool horizon lift.
- Clearly readable textured gibbous moon.
- Sparse varied stars.

### Overcast night

- Desaturated blue-black atmosphere.
- Moon softened by haze.
- Most stars suppressed.

### Squall night

- Near-black maritime blue with strong horizon haze.
- Moon almost veiled.
- Rare faint stars and stronger fog-to-ocean blending.

Weather and phase transitions continue to interpolate over 1.5 seconds. Reduced-motion preference does not remove these color transitions because they introduce no camera or object motion.

## 7. Integration

`SkyPalette` remains the single source for sky, fog, ambient light, key light, and ocean reflection colors. Its public weather, phase, and severity inputs do not change.

`Skybox` gains the shared moon texture and any additional scalar uniforms required by the revised atmosphere. `Skybox.update` remains allocation-free for palette colors and continues to return the current interpolated palette after uploading shader uniforms.

Scavenging remains cloudless with rain and sea spray. It continues to use squall day plus sinking severity. Survival continues to select calm, overcast, or squall and day or night. The dive cue continues to apply a transient tint after the base sky update.

Fog and ocean input ordering remains unchanged: update the sky, apply the current palette to scene fog and lighting, apply transient cues, then send the current sky and fog colors to the ocean in the same frame.

## 8. Testing

### Sky asset tests

- Load the exact bundled moon URL through an injected loader.
- Configure the expected wrapping, filtering, color-space treatment, and update flags.
- Reject a loader failure without leaking a partially owned texture.
- Dispose the loaded moon texture exactly once.

### Skybox tests

- Bind the injected moon texture to the shader sampler.
- Keep moon projection in normalized angular sky space rather than screen aspect space.
- Include separate moon texture and moon halo treatment.
- Include multi-component sun treatment.
- Include two deterministic star layers and haze/horizon attenuation.
- Preserve camera following, transient tint behavior, allocation-free palette updates, and exact-once geometry/material disposal.
- Confirm that `Skybox.dispose` does not dispose the shared moon texture.

### Palette and integration tests

- Preserve all six weather and phase states and 1.5-second convergence.
- Assert the revised calm, overcast, and squall visibility relationships for sun, moon, stars, haze, and exposure.
- Confirm scavenging severity deepens the squall without reintroducing clouds.
- Confirm survival transitions sky, fog, lights, and ocean together.
- Confirm restarts create one active sky while retaining the shared moon texture until game shutdown.
- Confirm startup failure handling when sky assets cannot load.

## 9. Verification

Because this change adds a visual runtime asset, run all repository asset and quality gates:

- `bun run models:check`
- `bun run test`
- `bun run typecheck`
- `bun run build`
- `git diff --check`

Inspect scavenging and survival in the browser at 1280 by 720, 1440 by 900, and 1920 by 1080. Verify calm, overcast, squall, day, night, sinking severity, nightfall, dawn, dive tint, reduced motion, phase restart, horizon continuity, and console output.

The visual pass must specifically confirm that the moon has no square boundary, remains circular at every aspect ratio, carries readable but restrained surface detail, and blends into haze rather than appearing pasted over the sky.

## 10. Definition of Done

- The sky reads as grounded maritime atmosphere while matching the procedural game art.
- The moon is a textured, slightly gibbous body with crater detail and a soft terminator.
- Sun, stars, and horizon shaping no longer look like simple analytic placeholders.
- Calm, overcast, squall, day, night, sinking, and cue transitions remain synchronized with fog, lighting, and ocean.
- The scene remains cloudless.
- The moon texture is original, committed locally, loaded once, and disposed once.
- No runtime asset is fetched from an external store.
- Automated asset checks, tests, type checking, build, and diff validation pass.
- Browser QA finds no horizon seam, moon edge artifact, aspect distortion, transition snap, or lifecycle leak.
