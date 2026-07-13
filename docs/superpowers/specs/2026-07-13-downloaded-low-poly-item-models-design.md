# Downloaded Low-Poly Item Models Design

**Date:** 2026-07-13  
**Status:** Approved implementation baseline

## Objective

Replace every procedural scavenging and survival item prop with a locally stored, downloaded low-poly model. All nine item types will come from the Poly Pizza platform, will remain recognizable in first-person play and lifeboat storage, and will have documented licenses and provenance. The game must not fetch models from the internet at runtime.

The replacement covers `flareGun`, `ductTape`, `fishingRod`, `baitTin`, `medicalKit`, `waterJug`, `cannedFood`, `flashlight`, and `scubaSet`. It does not replace the ship, lifeboat, ocean, environment, fixed boat fixtures, or fishing-catch model.

## Source Decision

Poly Pizza is the single approved source platform. The site curates downloadable low-poly models and exposes GLTF/GLB versions suitable for Three.js. Quaternius is the dominant creator because the [Quaternius Survival Pack](https://poly.pizza/bundle/Survival-Pack-XzvQPP0yWB) supplies most of the set in one CC0 visual language. Exact recognition takes priority over using one creator when Quaternius does not provide a suitable model.

No plugin or MCP integration is required. The implementation will download the public model files during development, optimize them where necessary, commit the resulting GLBs to the repository, and load only those local files in production.

Rejected source options:

- Kenney's CC0 Survival Kit was inspected directly, but its archive is oriented toward shelters, construction, terrain, and tools and does not cover the nine handheld supplies.
- Survival PSX covers several relevant props but ships FBX/DAE rather than GLB and leaves more gaps in the required set.
- Paid marketplace packs add purchasing, registration, or engine-extraction work without improving complete coverage.
- Mixing arbitrary sites would make licensing, visual consistency, and repeatable downloads harder to audit.

## Approved Model Set

| Game item | Poly Pizza model | Creator | License | Source geometry / treatment |
|---|---|---|---|---|
| Flare gun | [Flare Gun](https://poly.pizza/m/44H9OBUqTC) | Quaternius | CC0 1.0 | 540 triangles; retain recognizable red rescue-gun silhouette |
| Duct tape | [Tape](https://poly.pizza/m/fu49rGO7Ukc) | Poly by Google | CC-BY 3.0 | Copy the authoritative 20,332-triangle source GLB byte-for-byte unchanged; this accurate model has a documented 21,000-triangle exception because its disconnected topology cannot be simplified without losing the approved representation |
| Fishing rod | [Fishing Rod](https://poly.pizza/m/lDlWQjn9Zg) | Quaternius | CC0 1.0 | 910 triangles; retain rod and reel silhouette |
| Bait tin | `Can Red` from the [Quaternius Survival Pack](https://poly.pizza/bundle/Survival-Pack-XzvQPP0yWB) | Quaternius | CC0 1.0 | Use the red can as the authored bait-tin representation |
| Medical kit | [First Aid Kit](https://poly.pizza/m/Hp80p6148W) | Quaternius | CC0 1.0 | 268-triangle variant; retain medical marking and case silhouette |
| Water jug | [Water Bottle](https://poly.pizza/m/KpxDpidn1Z) | Quaternius | CC0 1.0 | 260 triangles; scale as the game's portable water container |
| Canned food | `Can` from the [Quaternius Survival Pack](https://poly.pizza/bundle/Survival-Pack-XzvQPP0yWB) | Quaternius | CC0 1.0 | Use a distinct orientation from bait tin and preserve its original can treatment |
| Flashlight | [Torch](https://poly.pizza/m/WGsvr4KOZd) | Quaternius | CC0 1.0 | 610 triangles; this model is an electric flashlight despite its title |
| Scuba set | [Scuba equipment](https://poly.pizza/m/7igrHLjaQlW) | Steren Giannini | CC-BY 3.0 | Source is about 4.7k triangles; use the complete equipment model, weld it, then simplify at ratio 0.55 and error 0.005 to 2,786 triangles |

The exact scuba result is uniquely identified by public model ID `7igrHLjaQlW`, title `Scuba equipment`, creator `Steren Giannini`, and direct GLB resource ID `efda7497-db5e-47e9-b317-8e8baeb1c616`. The implementation must reject any result whose title, creator, or license differs. Its permanent Poly Pizza detail URL and downloaded GLB resource identifier must be recorded in the repository asset ledger before the asset is accepted.

Eight checked-in models must remain at or below 3,000 triangles after offline processing. Duct tape is the explicit exception: its approved source GLB is copied byte-for-byte unchanged at 20,332 triangles and must remain at or below 21,000. The complete nine-template library must remain at or below 28,000 triangles. Models already below their limit should not be simplified unless inspection reveals redundant geometry. These budgets apply to the committed GLBs, not the source downloads. The earlier 19,872 count described a lightly simplified output, not the raw approved source.

## Repository Asset Layout and Ledger

Optimized files will live under `src/assets/models/items/` with stable item-ID filenames such as `flareGun.glb` and `scubaSet.glb`. Runtime code must not depend on creator filenames or remote URLs.

`THIRD_PARTY_ASSETS.md` will be the human-readable asset ledger. Each entry must include:

- game item ID and checked-in filename;
- original model title and creator;
- permanent Poly Pizza model or bundle URL;
- license name and license URL;
- original and committed triangle counts;
- modifications such as simplification, centering, material adjustment, or node removal;
- the calendar date on which the source file was downloaded.

CC-BY attribution for Tape and Scuba equipment must be visible in the ledger and preserved in distributed source artifacts. CC0 items will also retain provenance even though attribution is not required.

## Loading Architecture

A typed item-model manifest will map every `ItemId` to a local GLB URL plus its normalization data: target longest dimension, Euler rotation, optional position offset, and triangle budget. Static `new URL(..., import.meta.url)` references will allow Vite to emit hashed build assets.

A dedicated `PropModelLibrary` will use Three.js `GLTFLoader` to load all nine templates before the first game phase is constructed. The application launch path becomes asynchronous:

1. Render a lightweight `RECOVERING SUPPLIES` loading state in the mount.
2. Load and validate all nine local GLBs in parallel.
3. Construct `Game` with the ready model library.
4. Start the current scavenging phase normally.

The library is passed as an explicit dependency through the production phase factories into `World` and `BoatWorld`. Tests inject an in-memory model library. No mutable global model cache or network-dependent test fixture is introduced.

After startup, prop creation remains synchronous. `PropFactory` requests a template by `ItemId`, clones it, assigns the existing `prop:<instanceId>` name and item metadata, and returns a ready `Group`. The procedural `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, and `TorusGeometry` item branches are removed from production code.

## Normalization and Instance Ownership

Each loaded template will be normalized once from its bounding box:

- remove empty wrapper transforms where safe;
- center the visual model around a stable local origin suitable for carrying and storage;
- apply the manifest rotation so its readable face and primary silhouette are consistently oriented;
- scale its longest dimension to the manifest target size;
- preserve authored colors and textures unless the manifest documents a small material adjustment;
- enable cast and receive shadows for every mesh.

Each physical item instance must own independently cloneable render state. Geometry and materials will be cloned for every prop instance rather than shared with the template or sibling instances. This preserves the current depleted-item tint behavior, prevents one duplicate from recoloring another, and keeps the existing per-world disposal contract straightforward. With fourteen maximum scavenging instances and the approved triangle budgets, the memory cost is acceptable.

The existing world logic continues to move the returned root group without knowing its internal meshes. Pickup, carried-item attachment, throwing, landing, saving, lifeboat storage, projected interaction anchors, depletion visibility, and fishing-rod cue animation continue to target the existing prop root names and item IDs.

## Error Handling

Model validation occurs before the game starts. Startup fails with an item-specific error when:

- a manifest entry is missing for any `ITEM_IDS` value;
- a local GLB cannot be fetched or parsed;
- a loaded scene contains no visible mesh;
- geometry contains non-finite positions or produces an empty/non-finite bounding box;
- the committed model exceeds its item or library triangle budget;
- the asset ledger lacks a source or license entry.

The launch error screen will distinguish item-model loading failures from WebGL initialization failures while keeping the message safe for HTML display. There is no production fallback to the old procedural item models; a broken asset pipeline must be visible during development rather than silently producing a mixed visual set.

The asynchronous launcher must ignore a late load completion after disposal or replacement of its mount. A failed parallel load disposes any templates already created before reporting the error.

## Testing

Tests will be written before production changes and will cover:

- a manifest entry, asset-ledger entry, and resolvable local file for every `ITEM_IDS` value;
- successful parallel preload and an item-specific rejection for load or validation failure;
- a visible mesh and finite normalized bounding box for every template;
- per-file and aggregate triangle budgets;
- stable prop root name, instance ID, and item type metadata;
- independent roots, geometries, and materials for duplicate instances;
- independent depleted-color mutations between duplicate saved items;
- the current fishing cue locating and animating `prop:fishingRod-1`;
- disposal of every instance resource and loaded template exactly once;
- existing save, lose, land, boat-storage, interaction-anchor, and inventory behavior;
- launch error rendering without starting a partially loaded game.

Existing gameplay tests, type checking, the production build, and the complete Vitest suite must pass.

## Visual Verification

Browser verification will inspect all nine item types in both phases. It must confirm:

- all fourteen scavenging instances are present, sit on authored spawn surfaces, and are visually distinguishable;
- no prop is so small that it is hard to target or so large that it blocks navigation;
- carried combinations remain inside the camera attachment area without obscuring the crosshair;
- every prop can be dropped, thrown, landed, lost, and saved without transform jumps caused by its normalized origin;
- dense saved combinations fit inside the lifeboat storage layout without catastrophic overlap;
- survival props remain recognizable from the fixed first-person camera;
- depleted tinting affects only the correct physical instances;
- the fishing rod still animates during the fishing cue;
- the scuba set, tape roll, bait tin, canned food, and flashlight read as their intended items without relying on HUD text;
- day, night, overcast, and squall lighting do not make the imported materials unreadable.

Verification will use at least 1280x720 and 1920x1080 desktop viewports. Normalization values may be tuned during implementation, but the approved model identities, source platform, license policy, and triangle budgets may not change without updating this specification.

## Acceptance Criteria

1. Every one of the nine item types uses a checked-in Poly Pizza-derived GLB; no procedural production item branch remains.
2. All fourteen spawned physical instances and every saved survival instance use the new models.
3. Eight committed item models are at most 3,000 triangles, the byte-for-byte unchanged approved Tape model is at most 21,000 triangles, and the nine-template library totals at most 28,000 triangles.
4. Props have recognizable silhouettes, correct scale/orientation, shadows, independent depletion state, and safe disposal.
5. The game makes no runtime request to Poly Pizza or any other external asset host.
6. `THIRD_PARTY_ASSETS.md` records complete provenance, modifications, triangle counts, and required CC-BY attribution.
7. A missing, malformed, over-budget, or undocumented model fails startup clearly instead of falling back to an old prop.
8. Pickup, carry, drop, throw, save, lose, survival storage, projected actions, depletion, and fishing cues retain their current behavior.
9. Automated tests, type checking, production build, and browser visual verification pass.
