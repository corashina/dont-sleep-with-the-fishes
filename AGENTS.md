# Repository Guidance

## Engineering rules

- Keep gameplay rules deterministic and testable without a renderer. Isolate randomness behind an injectable source.
- Keep phase lifecycle, game-state rules, input, UI, rendering, and world construction in separate modules with explicit ownership.
- Give each Three.js geometry, material, texture, render target, control, listener, and phase a clear owner that disposes it exactly once.
- Use the shared wave field as the source of truth for ocean rendering, buoyancy, and vessel motion.
- Support keyboard operation and honor `prefers-reduced-motion` for optional visual motion and UI transitions.
- Add or update tests whenever a gameplay mechanic, input contract, authored layout, item placement rule, or model manifest changes.
- Avoid allocations and repeated setup in per-frame update and render paths.
- Keep the current milestone focused on desktop browsers with keyboard and mouse. Do not add saves, touch/mobile controls, crewmates, multiplayer, or persistent progression without explicit approval.

## Third-party assets

Use [Kenney](https://kenney.nl/assets) as the sole third-party asset store unless the user approves another source.

- Download individual free CC0 packs. Do not make the project depend on the optional All-in-1 bundle.
- Commit processed runtime assets locally. Production code must not fetch models, textures, audio, UI art, or effects from a store.
- Record the asset-page URL, pack version, archive SHA-256, source entry, processing steps, triangle counts, license, and download date in `THIRD_PARTY_ASSETS.md`.
- Embed textures and other runtime dependencies in the committed artifact where the format permits it.
- Keep downloaded model filenames stable once runtime code references them.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` after asset changes. Inspect changed visual assets in the browser in both game phases.
