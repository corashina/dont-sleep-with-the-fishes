# Repository Guidance

## Visual direction

Aim for a cleaner, authored interpretation of the original game's character:
darkly comic and melancholic maritime, with enough detail and irregularity to
feel illustrated rather than basic or demo-like.

The visual language rests on four pillars: authored illustrated forms,
scene-integrated interface, tactile keyed motion, and restrained print
treatment. Geometry, materials, lighting, composition, and animation create
the substance; ambient occlusion, grain, halftone, and edge treatment only
unify it.

Before changing player-facing UI, models, materials, lighting, composition,
animation, or post-processing, read
[`docs/VISUAL_STYLE_GUIDE.md`](docs/VISUAL_STYLE_GUIDE.md). Use
[`docs/VISUAL_AUDIT.md`](docs/VISUAL_AUDIT.md) for the dated list of current
mismatches and recommended improvement sequence.

## Engineering rules

- Keep gameplay rules deterministic and testable without a renderer. Isolate randomness behind an injectable source.
- Keep phase lifecycle, game-state rules, input, UI, rendering, and world construction in separate modules with explicit ownership.
- Give each Three.js geometry, material, texture, render target, control, listener, and phase a clear owner that disposes it exactly once.
- Use the shared wave field as the source of truth for ocean rendering, buoyancy, and vessel motion.
- Support keyboard operation and honor `prefers-reduced-motion` for optional visual motion and UI transitions.
- Add or update tests whenever a gameplay mechanic, input contract, authored layout, item placement rule, or model manifest changes.
- Avoid allocations and repeated setup in per-frame update and render paths.
- Keep the current milestone focused on desktop browsers with keyboard and mouse. Do not add saves, touch/mobile controls, crewmates, multiplayer, or persistent progression without explicit approval.
