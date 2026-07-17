# Quaternius Strict Item Replacements Design

## Goal

Replace only the project-authored pickup models that have a direct, readable match in the downloaded Quaternius packs. Keep gameplay IDs, placement rules, and the nine current Kenney-derived models intact.

## Approved replacements

| Runtime item | Source pack | Archive entry | Reason |
|---|---|---|---|
| `compass` | Survival Pack, September 2020 | `OBJ/Compass_Open.obj` | An open compass keeps the existing item's identity clear at pickup distance. |
| `flareGun` | Survival Pack, September 2020 | `OBJ/FlareGun.obj` | The pack provides a model made for the same item. |
| `anchor` | Pirate Kit, November 2023 | `glTF/Prop_Anchor.gltf` | The pack provides a direct nautical anchor prop. |

The project keeps its authored `map`, `spyglass`, `fishingNet`, `umbrella`, `swimRing`, `harpoonGun`, and `energyBar` models. Neither approved pack contains a direct equivalent for those items, so a substitute would weaken recognition.

## Asset inputs and provenance

The project will retain only the selected source inputs, not either full downloaded archive. A source-preparation script will verify the user-supplied archive hashes, extract the three approved entries, reject unexpected paths, and store the selected source files under a dedicated Quaternius source directory in the repository.

- Survival Pack archive SHA-256: `DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5`.
- Pirate Kit archive SHA-256: `ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36`.

`THIRD_PARTY_ASSETS.md` will record the pack page, archive hash, exact archive entry, source and committed triangle counts, processing steps, download date, and CC0 license. The repository policy and README will retain Kenney as the default store while documenting the user-approved Quaternius exception for these three models.

## Build and publication

A Quaternius item builder will own conversion and packaging:

1. Import the two selected OBJ files and their material definitions without accepting external runtime dependencies.
2. Repackage the anchor glTF with its required source texture.
3. Prune, deduplicate, unpartition, and embed all referenced resources in each output GLB.
4. Write `compass.glb`, `flareGun.glb`, and `anchor.glb` into the existing atomic item-model publication stage.
5. Run the existing metadata generator after all nineteen item files reach the stage.

The item publication script will combine three builders: Kenney for nine items, project geometry for seven items, and Quaternius for the three approved replacements. The runtime model path and item IDs remain unchanged.

## Runtime metadata

`itemModelManifest.ts` will add Quaternius as a third-party creator and set Quaternius provenance for `compass`, `flareGun`, and `anchor`. Their presentation rotation, offset, and target dimension will change only when measured bounds or visual inspection require it. The other seven project provenance records remain project-authored.

## Validation

Tests will cover:

- archive hashes, safe selective extraction, and missing-source failures;
- OBJ conversion and glTF repackaging with embedded resources;
- expected output IDs, triangle counts, bounds metadata, and per-model limits;
- manifest provenance and ledger row validation;
- rejection of third-party ledger rows for the seven remaining authored models.

The final verification runs `bun run models:check`, `bun run test`, `bun run typecheck`, and `bun run build`. A browser check will inspect the three replacements in scavenging and survival phases, including pickup targeting and carry attachment.

## Scope limits

This change does not replace the remaining seven authored props, change item mechanics, add runtime network requests, modify ship furniture, or add assets from another source.
