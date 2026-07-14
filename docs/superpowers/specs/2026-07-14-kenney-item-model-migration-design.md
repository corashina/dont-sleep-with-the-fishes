# Kenney Item Model Migration Design

**Date:** 2026-07-14  
**Status:** Approved design

## Objective

Move all nine downloaded item models to Kenney sources and make Kenney the project's required store for third-party game assets. Keep each runtime filename and `ItemId` stable so scavenging, carrying, lifeboat storage, survival actions, and saved-instance behavior remain unchanged.

The migration covers `flareGun`, `ductTape`, `fishingRod`, `baitTin`, `medicalKit`, `waterJug`, `cannedFood`, `flashlight`, and `scubaSet`. It removes all Poly Pizza provenance, download logic, and model binaries from the item library.

## Source Policy

Kenney becomes the exclusive store for third-party game assets in this repository. Contributors may continue to create original code-driven geometry, shaders, UI, and audio. A contributor who cannot find a suitable Kenney asset must ask the user before adding another store.

The repository will record the Kenney asset-page URL, pack name and version, archive SHA-256, archive entry path, source asset identity, processing steps, triangle counts, and download date. Runtime code will load committed local files and will not contact Kenney.

The project will download individual free packs from Kenney's asset pages. It will not depend on the optional All-in-1 bundle. Kenney publishes the selected packs under CC0 1.0, so the repository may modify and distribute their contents without attribution. The asset ledger will retain credit and provenance.

## Source Packs

The fetch pipeline will pin these official archives:

| Pack | Version | Asset page | Archive SHA-256 |
|---|---:|---|---|
| Blaster Kit | 2.1 | https://kenney.nl/assets/blaster-kit | `91E3093E95427D59625E7E2CE2D0399B861600160FD0B4ADA7714796B67CEA8C` |
| Food Kit | 2.0 | https://kenney.nl/assets/food-kit | `CDAD90853682499B94C9FDA2F87678B24BFD8F3264E0ED323F6B6A27FD7C6F6F` |
| Survival Kit | 2.0 | https://kenney.nl/assets/survival-kit | `C3586341B5932C87EB43D75D915434F47DAED168B17ED36A03E8CA9977C7443E` |
| Prototype Kit | 1.0 | https://kenney.nl/assets/prototype-kit | `213B522FB12BCC9B9AC66C4F7581F7C74623293272212E40A70C39936AD3DA95` |

The fetch script will stop before publication when an archive hash or required entry differs from this table. A Kenney pack update requires a deliberate review of the new archive, models, license file, and visual result.

## Approved Model Set

| Game item | Kenney source | Treatment |
|---|---|---|
| Flare gun | Blaster Kit `Models/GLB format/blaster-n.glb` | Copy the orange pistol-shaped blaster and embed its pack colormap. Its short barrel, black grip, and orange body provide the closest direct flare-gun silhouette in Kenney's catalog. |
| Duct tape | Prototype Kit `shape-hollow-cylinder-detailed.glb` | Copy the hollow cylinder, rotate it onto its side, and embed the Prototype Kit colormap. The hole and thick rim identify a tape roll at prop scale. |
| Fishing rod | Prototype Kit `shape-cylinder-detailed.glb` and `shape-hollow-cylinder-detailed.glb` | Build one offline GLB from a thin rod, a shorter grip, and a small reel. Clone only Kenney meshes; apply node transforms without generating replacement geometry. |
| Bait tin | Food Kit `Models/GLB format/can-small.glb` | Copy the low, wide tin and embed the Food Kit colormap. |
| Medical kit | Prototype Kit `shape-cube-rounded.glb` and `shape-cube-half.glb` | Build a compact case with a raised two-bar cross. Clone and transform Kenney meshes, then embed the Prototype Kit colormap. |
| Water jug | Survival Kit `Models/GLB format/bottle-large.glb` | Copy the broad orange bottle and embed the Survival Kit colormap. |
| Canned food | Food Kit `Models/GLB format/can.glb` | Copy the red food can and embed the Food Kit colormap. |
| Flashlight | Prototype Kit `shape-cylinder-detailed.glb`, `shape-cylinder.glb`, `shape-hollow-cylinder-detailed.glb`, and `shape-cube-half.glb` | Build a body, head, lens ring, and switch as one offline GLB. Clone and transform Kenney meshes without adding generated geometry. |
| Scuba set | Prototype Kit `shape-cylinder-detailed.glb`, `shape-cube-rounded.glb`, and `shape-hollow-cylinder-half-detailed.glb` | Build twin tanks, a central harness, shoulder loops, and a regulator. Clone and transform Kenney meshes so the first-person silhouette reads as diving equipment. |

Direct models and composites will use the stable output names under `src/assets/models/items/`. The build pipeline will embed referenced palette textures in each GLB because Kenney's source GLBs refer to a shared external `Textures/colormap.png`.

The composite builder may clone, translate, rotate, and scale Kenney nodes. It may remove unused nodes, embed source textures, and set material base-color factors to separate functional parts. It must not add procedural mesh geometry or draw new textures.

## Reproducible Build Pipeline

`scripts/fetch-item-models.ps1` will replace its Poly Pizza page scraping with four pinned Kenney archive downloads. It will verify each archive hash, read the included license, extract only approved GLBs and colormaps into an operating-system temporary directory, and call a Node builder for direct packaging and composite assembly.

A focused `scripts/build-kenney-item-models.mjs` module will own model recipes. Each recipe will name its source pack entries and either package one direct model or assemble a composite from cloned Kenney meshes. The builder will write nine self-contained GLBs to the existing guarded staging directory.

The existing publication helper will keep the directory swap atomic. The script will run the asset-only audit against the staging directory before replacing `src/assets/models/items/`. A download, hash, extraction, build, or audit failure will leave the committed directory intact.

The repository will not store source archives, temporary extracted files, external palette PNGs, or obsolete Poly Pizza binaries.

## Manifest and Provenance

`src/world/itemModelManifest.ts` will retain local URLs, presentation transforms, normalized sizes and bounds, triangle budgets, creator, source URL, and license URL. It will rename `resourceId` to `sourceAssetId` because Kenney identifies assets by pack and archive entry instead of an opaque resource identifier.

Each source identity will use this stable form:

```text
<pack-slug>@<version>:<archive-entry-or-composite-recipe>
```

Examples include `food-kit@2.0:Models/GLB format/can.glb` and `prototype-kit@1.0:composite/flashlight`.

`THIRD_PARTY_ASSETS.md` will use the same identity and record all source components for composite models. The loader will continue checking that each ledger row matches the manifest before it loads any binary.

## Documentation

`README.md` will state that the world combines original procedural scenery with local CC0 Kenney item models. A short asset-policy section will link to Kenney, describe local runtime loading, and direct readers to the asset ledger.

A new root `AGENTS.md` will tell future contributors to:

- use Kenney as the sole third-party asset store unless the user approves another source;
- prefer individual free CC0 packs and commit local processed outputs;
- keep pack versions, hashes, entry paths, modifications, and dates in the asset ledger;
- embed all runtime dependencies in committed assets;
- run the asset audit, tests, typecheck, build, and browser verification after asset work.

The migration will preserve unrelated README edits already present in the working tree.

## Geometry and Runtime Budgets

Each committed model must contain visible triangle primitives, finite positions, finite non-empty bounds, and embedded textures. Every item, including duct tape, must remain at or below 3,000 triangles. The library will retain its 28,000-triangle aggregate ceiling, though the Kenney set should sit far below it.

The implementation will recompute presentation rotations, offsets, normalized sizes, conservative bounds, per-file triangle counts, and the exact aggregate count from the committed binaries. It will keep the existing target longest dimensions unless browser inspection shows that a new silhouette needs a small adjustment.

## Testing

Tests will change before production scripts and metadata. They will cover:

- a Kenney source identity, official asset-page URL, creator, CC0 license, and local GLB for each `ItemId`;
- absence of Poly Pizza URLs and identifiers from the active manifest, ledger, fetch script, and asset checks;
- exact archive descriptors, hashes, required entries, and direct or composite recipes;
- direct packaging with an embedded colormap;
- composite assembly from source meshes with no generated primitive geometry;
- one visible, finite, self-contained model per item;
- a 3,000-triangle per-item limit and the existing 28,000 aggregate limit;
- exact normalized sizes and conservative bounds for all nine committed files;
- unchanged prop instance names, metadata, material ownership, pickup behavior, storage, depletion, and disposal;
- guarded staging and rollback when fetching, building, or auditing fails.

The implementation will run the focused tests after each red-green cycle, then run the model audit, full Vitest suite, typecheck, and production build.

## Visual Verification

Browser inspection will cover all nine models in the ship and survival lifeboat at desktop resolution. Verification will confirm that each item:

- reads as its gameplay concept without relying on HUD text;
- rests on authored surfaces without floating or clipping;
- fits the carry attachment and does not block the crosshair;
- remains distinct in dense lifeboat storage;
- keeps authored colors under day, night, overcast, and squall lighting;
- retains per-instance depleted tinting and the fishing cue animation.

The model recipes or manifest transforms may change after inspection. Pack identities and the Kenney-only policy will remain fixed unless the user approves another design.

## Rejected Approaches

Using one unrelated direct model for each missing concept would make the fishing rod, medical kit, flashlight, and scuba set hard to identify. Renaming gameplay items to match Kenney's catalog would expand this task into balance, UI, and narrative changes. Keeping Poly Pizza for gaps would violate the approved Kenney-only policy.

## Acceptance Criteria

1. All nine committed item GLBs derive only from the four approved Kenney CC0 packs.
2. The active item pipeline, manifest, ledger, README, and agent guidance contain no Poly Pizza dependency or recommendation.
3. Kenney becomes the documented exclusive store for third-party game assets unless the user approves an exception.
4. The fetch pipeline reproduces all nine files from pinned archives, verifies hashes and entries, embeds textures, audits staging, and publishes atomically.
5. Each item remains recognizable, uses its existing runtime filename and `ItemId`, and stays below 3,000 triangles.
6. Scavenging, carrying, throwing, saving, lifeboat storage, survival actions, depletion, fishing cues, and disposal retain their current behavior.
7. Focused tests, the model audit, the full test suite, typecheck, production build, and browser verification pass.
