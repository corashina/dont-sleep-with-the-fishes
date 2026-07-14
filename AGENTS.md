# Repository Guidance

## Third-party assets

Use [Kenney](https://kenney.nl/assets) as the sole third-party asset store unless the user approves another source.

- Download individual free CC0 packs. Do not make the project depend on the optional All-in-1 bundle.
- Commit processed runtime assets locally. Production code must not fetch models, textures, audio, UI art, or effects from a store.
- Record the asset-page URL, pack version, archive SHA-256, source entry, processing steps, triangle counts, license, and download date in `THIRD_PARTY_ASSETS.md`.
- Embed textures and other runtime dependencies in the committed artifact where the format permits it.
- Keep downloaded model filenames stable once runtime code references them.
- Run `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build` after asset changes. Inspect changed visual assets in the browser in both game phases.
