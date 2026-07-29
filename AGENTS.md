# Repository Guidance

Be Brief. Use ASD-STE100 Simplified Technical English. Use one word for one idea. Do not use two words for the same thing. Write short sentences. Use 20 words or less for instructions.
Use active voice. Write "Turn the switch", not "The switch must be turned". Write short paragraphs. Keep one topic in each paragraph. The goal is easy reading. Many readers are not native English speakers. Clear text helps them do the work in a safe and correct way. 

Do not use the Superpowers plugin unless I have explicitly requested it at least once earlier in the current conversation. If I have not explicitly asked to use Superpowers, assume it should not be used. 


## Visual direction

Be brief. Aim for a cleaner, authored interpretation of the original game's character:
darkly comic and melancholic maritime, with enough detail and irregularity to
feel illustrated rather than basic or demo-like.

The visual language rests on four pillars: authored illustrated forms,
scene-integrated interface, tactile keyed motion, and restrained print
treatment. Geometry, materials, lighting, composition, and animation create
the substance; ambient occlusion, grain, halftone, and edge treatment only
unify it.

Before changing player-facing UI, models, materials, lighting, composition,
animation, or post-processing, read
[`docs/VISUAL_STYLE_GUIDE.md`](docs/VISUAL_STYLE_GUIDE.md).

## Engineering rules

- Do not implement reduced-motion variants or `prefers-reduced-motion` handling unless the user explicitly requests it.
- Keep gameplay rules deterministic and testable without a renderer. Isolate randomness behind an injectable source.
- Keep phase lifecycle, game-state rules, input, UI, rendering, and world construction in separate modules with explicit ownership.
- Give each Three.js geometry, material, texture, render target, control, listener, and phase a clear owner that disposes it exactly once.
- Use the shared wave field as the source of truth for ocean rendering, buoyancy, and vessel motion.
- Avoid allocations and repeated setup in per-frame update and render paths.
