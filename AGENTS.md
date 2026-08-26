- Be Brief. Use ASD-STE100 Simplified Technical English. Use one word for one idea. Do not use two words for the same thing. Write short sentences. Use 20 words or less for instructions.
Use active voice. Write "Turn the switch", not "The switch must be turned". Write short paragraphs. Keep one topic in each paragraph.
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Do not implement reduced-motion variants or `prefers-reduced-motion` handling unless the user explicitly requests it.
- Avoid allocations and repeated setup in per-frame update and render paths.
- Use only Freesound.org when finding or recommending sound assets.

Before changing player-facing UI, models, materials, lighting, composition,
animation, or post-processing, read [`VISUAL_STYLE_GUIDE.md`](VISUAL_STYLE_GUIDE.md).
