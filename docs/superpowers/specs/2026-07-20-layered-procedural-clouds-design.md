# Layered Procedural Clouds Design

## Goal

Make daytime clouds read as recognisable maritime cloud formations rather than
a single soft noise patch, while preserving the procedural sky's seamless
coverage, weather transitions, bright ocean horizon, and low runtime cost.

## Scope

Change only the daytime cloud treatment in `Skybox` and the tests that describe
it. Continue to use the existing inward-facing sky sphere, `SkyPalette`, and
the `cloudCoverage` and `cloudContrast` weather controls. Do not add texture
assets, cloud meshes, cloud animation, or a new rendering pass.

Night sky rendering, celestial bodies, the white horizon band, ocean rendering,
and gameplay state are out of scope.

## Rendering Design

The fragment shader will replace the current two-sample 2D cloud field with a
seam-free 3D value-noise field evaluated from the normalized sky direction.
This avoids the focal, stretched appearance created by the current projected
2D coordinates.

The cloud field will use a bounded four-octave fractal sum. A low-frequency
sample will warp the domain before the higher-frequency samples are evaluated,
breaking the circular or grid-like contours into broad, irregular cloud banks.
The existing coverage and contrast values will still set the field threshold
and edge softness, preserving calm-to-overcast-to-squall progression.

Cloud colour will be computed from the same field:

- dark, blue-grey undersides come from the broad cloud density;
- muted off-white highlights appear at cloud edges and thinner areas;
- haze blends clouds into the horizon colour near the waterline.

The horizon-band pass remains after cloud shading, so the bright ocean/sky
separation is never obscured.

## Weather and Motion

Calm day retains partial, broken cloud banks. Overcast and squall use the
existing higher coverage values to form increasingly continuous layers, with
their palette haze and darker sky colours carrying the storm mood. The field is
static, as it is today; this avoids optional motion and therefore needs no
reduced-motion exception.

## Ownership and Performance

The existing `Skybox` material remains the sole owner of the shader. The change
adds no textures, geometry, scene nodes, listeners, render targets, or
per-frame allocations. The cloud calculation stays in the one existing sky
fragment shader and uses fixed iteration counts.

## Tests and Verification

Update `Skybox.test.ts` to assert that the material includes the new 3D
layered-cloud helpers while retaining the existing uniform and lifecycle
coverage. Keep `SkyPalette.test.ts` checks for progressively denser daytime
weather and disabled night clouds.

Verify with the focused sky tests, type-check, complete test suite, production
build, and browser screenshots of calm, overcast, and squall daytime views.
