# Item Visual Refresh Design

**Date:** 2026-07-24
**Status:** Approved design

## Goal

Improve the visual quality and resting presentation of selected collectible items while preserving the game's moderately detailed, stylized look, deterministic asset pipeline, local runtime assets, and existing performance limits.

This work refreshes the fishing net, anchor, swim ring, umbrella, flare gun, map, and harpoon gun. It also removes the energy bar from the scavenging ship without removing the item from the broader game domain, because a future survival-phase floating-crate feature will provide it.

## Scope

### Fishing net

Replace the current handled hoop net with a loose, folded bundle of dark-brown rope mesh.

- Do not include a stick or rigid hoop.
- Use a dark-brown rope base near sRGB `#3b281b`, with slightly darker knots and gathered edges.
- Use layered folds, a thicker gathered perimeter, and visible knots to keep the silhouette readable.
- Make the bundle look like rope netting rather than a sheet of cloth or a pile of disconnected lines.

### Anchor

Retain the approved Quaternius anchor geometry and source identity.

- Convert its material to a cool steel gray.
- Override its single source material with an sRGB base color near `#66737d`, a metallic factor of `0.85`, and a roughness factor of `0.42`.
- Let lighting and ambient occlusion define recessed areas; do not add a runtime-only secondary material.

### Swim ring

Retain the orange-dominant ring design while improving the white bands.

- Orange should occupy approximately 80–85% of the visible circumference.
- Four white sections should occupy approximately 15–20% in total.
- Use a saturated safety orange near `#e86f28` and a warm white near `#f2ecdf`.
- White sections must conform to the torus rather than appear as rectangular boxes placed over it.

### Umbrella

Replace the open cone-like umbrella with a closed purple umbrella resting on its side.

- Include folded purple fabric with a readable segmented silhouette.
- Use a medium-deep purple near sRGB `#7046a3` for the fabric.
- Include visible ribs, a dark shaft, a metal tip, a fastening strap, and a curved handle.
- Avoid an open canopy and avoid a freestanding vertical presentation.

### Flare gun

Retain the approved Quaternius model and its existing materials.

- Change only its normalized resting presentation.
- Lay it on its side like a naturally placed handgun.
- The model's narrow thickness axis should be vertical, with the broad side of the grip and barrel approximately parallel to the supporting surface; the grip must not act as a vertical stand.

### Map

Replace the simple slab with a mostly flat, readable nautical chart.

- Use blue water and pale landmasses.
- Use desaturated blue water near `#6f9eac` and parchment land near `#d4c18a`.
- Include coastline detail, a navigation grid, route markings, and a small compass rose.
- Add shallow fold ridges and subtle corner curls for depth without obscuring the chart.
- The map must be recognizable from normal gameplay distance and readable as a chart when viewed nearby.

### Harpoon gun

Replace the simple mechanical launcher with a modern speargun.

- Include a long barrel, shaped grip, trigger and trigger guard, twin rubber bands, spear shaft, pointed head, and a small line spool.
- Keep the silhouette moderately detailed rather than realistic or mechanically exhaustive.
- Preserve a natural horizontal resting pose.

### Energy bar

Keep the energy-bar item definition, model, action, and survival-domain support.

- Exclude all energy-bar instances from the scavenging ship roster.
- Do not grant an energy bar when the survival phase starts.
- Do not implement the future floating-crate event in this change.
- The future crate event will be responsible for introducing energy bars during survival.

## Selected Asset Approach

Enhance the existing project-authored models instead of adding new third-party models.

This approach provides exact control over silhouette, palette, triangle count, and resting shape while keeping builds deterministic and avoiding new licensing or provenance risk. The existing Quaternius anchor and flare gun remain within their already approved exceptions.

Each refreshed project-authored model should use enough geometry to read cleanly at gameplay distance while remaining below the existing 3,000-triangle per-model limit. A practical target is approximately 300–1,500 triangles per refreshed model, but visual quality and the hard upper bound take precedence over hitting a particular number.

## Architecture and Ownership

### Project-authored model generation

`scripts/project-item-models.mjs` remains the sole owner of geometry and materials for the map, fishing net, umbrella, swim ring, and harpoon gun.

- Generated GLBs remain deterministic and self-contained.
- The project model recipe identity advances from `project-item-models@1` to `project-item-models@2`.
- The recipe identity, generated metadata, documentation, and audit tests must change together.
- The unchanged project-authored spyglass and energy-bar outputs remain part of the same versioned generator publication.

### Quaternius conversion

`scripts/quaternius-item-models.mjs` remains the sole owner of conversion for the anchor and flare gun.

- Add a recipe-level material override mechanism.
- Apply the steel base color, metallic factor, and roughness to the anchor during conversion.
- Do not replace materials in runtime rendering code.
- Preserve the source archive, source entry, source triangle count, and committed runtime filename.

### Runtime presentation

`src/world/itemModelManifest.ts` remains the sole owner of normalized runtime size, offset, and resting rotation.

- Change the flare gun's presentation rotation so the gun rests naturally on its side.
- Update presentation expectations and normalized bounds through the existing metadata flow.
- Do not add per-frame corrections or item-specific renderer logic.

### Scavenging roster

The canonical item catalog continues to define every known item, including the energy bar. Introduce a phase-specific deterministic scavenging-roster function in the game-state layer.

- The roster function derives ship-spawned instances from the canonical catalog.
- It explicitly excludes `energyBar`.
- `ScavengePhase` uses this roster for `ScavengeSession`, world construction, placement, and interaction lookup.
- Survival-domain code retains the ability to create or receive an energy-bar instance later.
- The roster logic must not depend on a renderer or random source.

## Data Flow

1. The model publication pipeline builds project-authored and approved third-party GLBs into a guarded staging directory.
2. Generated metadata records triangle counts and raw bounds for every runtime model.
3. The item model manifest combines metadata with authored scale, offset, rotation, and provenance.
4. `PropModelLibrary` validates, loads, normalizes, and clones owned model resources.
5. The scavenging-roster function creates the phase's item instances without an energy bar.
6. `ScavengePhase` passes that exact roster to the session and world so placement, interaction, carrying, and evacuation share one source of truth.
7. Saved scavenging items enter survival as before; no energy bar is injected at the phase transition.

## Failure Handling

Existing asset validation remains fail-fast.

- Reject missing or extra runtime files.
- Reject mismatched recipe identities, provenance, triangle metadata, bounds, or ledger entries.
- Reject empty meshes, invalid indices, non-finite geometry, incorrect winding, or models above their triangle budgets.
- Reject a scavenging roster that is unstable, duplicated, or contains `energyBar`.
- Keep publication atomic so failed generation does not partially replace committed runtime assets.

No fallback remote models or runtime network requests are permitted.

## Automated Verification

Add or update tests to verify:

- The five rebuilt project models are deterministic, self-contained, finite, correctly wound, and at or below 3,000 triangles each.
- Generated triangle counts, bounds, material identities, and `project-item-models@2` provenance match the committed GLBs.
- The swim ring's white sections are materially narrower than its orange sections.
- The anchor conversion produces the intended steel-gray metallic material while retaining the approved Quaternius source identity and triangle count.
- The flare gun uses the new natural resting rotation.
- The canonical catalog still contains `energyBar`.
- The scavenging roster is deterministic, excludes `energyBar`, contains every other approved scavenging instance in the expected quantity, and has stable instance IDs.
- Ship item placement succeeds with the changed normalized model bounds.
- Existing resource ownership and disposal tests continue to pass.

## Visual Verification

Inspect the changed models in the browser in both scavenging and survival contexts. Use controlled test runs or existing deterministic fixtures to expose the required recovered-item combinations; do not add a production debug inventory.

- Each silhouette remains recognizable at normal gameplay distance.
- Props rest naturally on ship and lifeboat surfaces without floating or clipping.
- The net reads as a folded rope net, not cloth or a handled net.
- The anchor reads as steel under the active lighting and post-processing.
- The swim ring remains predominantly orange with narrow fitted white bands.
- The umbrella is clearly closed and purple.
- The flare gun lies naturally on its side.
- The map reads as a nautical chart nearby and remains identifiable at a distance.
- The harpoon gun reads as a modern speargun and matches the surrounding model detail.
- No energy bar appears anywhere on the scavenging ship.

Honor `prefers-reduced-motion` during inspection; the item changes do not introduce optional motion.

## Required Commands

Run all required repository checks after implementation:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

## Documentation

Update `THIRD_PARTY_ASSETS.md` with:

- the new project generator recipe identity;
- changed project-authored triangle counts;
- the anchor material-processing override;
- confirmation that no new third-party asset source was added.

Update other documentation only where it currently states that energy bars are found during scavenging or where exact item counts have changed.

## Non-Goals

- Implementing floating crates or any other new survival event.
- Adding saves, progression, touch controls, multiplayer, or new collectible item types.
- Replacing the approved Quaternius anchor or flare gun sources.
- Adding runtime-downloaded assets or textures.
- Raising the existing per-model or total runtime triangle budgets.
- Refactoring unrelated rendering, world construction, or survival systems.
