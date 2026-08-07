# Subtle Underwater Light Rays

## Goal

Replace the basic rectangular menu light shafts with subtle surface light rays.
Keep the ship, signs, and open screen center easy to read.

## Design

Keep the existing four meshes and the shared plane geometry.
Increase vertical segments so the vertex shader can bend each ray gently.

The vertex shader will taper each ray toward the surface.
It will add slow lateral drift with a different phase for each ray.

The fragment shader will create several uneven strands inside each ray.
Procedural noise will break straight edges and vary strand strength.
The pattern will move slowly to suggest changing surface water.

Each ray will fade near its top, bottom, and outer edges.
Its color and opacity will weaken with depth.
Additive blending will remain subtle and will not wash out the wreck.

Each ray will receive fixed uniforms for width variation, taper, density, and phase.
`setTime` will only update existing uniform values.
The render loop will not allocate objects.

## Scope

Change only `UnderwaterLightShafts` and its focused tests.
Do not add textures, packages, post-processing passes, or new controls.

## Failure Handling

Clamp invalid animation time to zero, as the current component does.
Keep disposal idempotent and dispose each shared resource once.

## Verification

Focused tests will check mesh count, shared geometry, shader uniforms, animation, and disposal.
Type checking and the production build must pass.

Visual checks will cover 1365 by 768 and 1920 by 1080.
The rays must look irregular, soft, slow, and less rectangular.
They must preserve sign readability and the wreck silhouette.
