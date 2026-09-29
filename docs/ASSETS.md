# Assets

[Game overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Development](DEVELOPMENT.md)

## Sources and style

Use the [visual style guide](../VISUAL_STYLE_GUIDE.md) for models, materials, light, composition, animation, and UI.
The game combines authored geometry and shaders with committed models, textures, fonts, and audio.

[src/assets/ATTRIBUTION.md](../src/assets/ATTRIBUTION.md) is the asset ledger.
Record source pages, creators, licenses, hashes, and processing details there.
Read the ledger before replacing an asset. Keep source credit with its runtime file.

Use Poly Pizza as the default item-model source. Prefer Poly by Google models when their form and budget fit.
Existing exceptions include Carlitos's Sketchfab model, Kenney furniture, and Poly Haven textures.
The current room timber maps use Poly Haven White Planks Clean.

Source new music and sound assets from Freesound.
Check the source page and license before downloading. Record the creator, source URL, and license in the ledger.

## Runtime ownership and manifests

| Asset group | Start here |
| --- | --- |
| Items and practical lights | [itemModelManifest](../src/world/itemModelManifest.ts), [practicalLightModelManifest](../src/world/practicalLightModelManifest.ts), [PropModelLibrary](../src/world/PropModelLibrary.ts). |
| Lifeboat equipment | [lifeboatEquipmentManifest](../src/world/lifeboatEquipmentManifest.ts). |
| Ship furniture and textures | [shipFurnitureManifest](../src/world/shipFurnitureManifest.ts), [ShipAssets](../src/world/ShipAssets.ts). |
| Menu | [menuModelManifest](../src/menu/menuModelManifest.ts), [MenuSandAssets](../src/menu/MenuSandAssets.ts). |
| Fishing | [fishingModelManifest](../src/survival/fishingModelManifest.ts), [fishingCatalog](../src/survival/fishingCatalog.ts). |
| Events | [world model manifest](../src/world/eventModelManifest.ts), [survival model manifest](../src/survival/eventModelManifest.ts), [event bundles](../src/survival/eventBundleManifest.ts). |
| Audio | [audioManifest](../src/audio/audioManifest.ts), [AudioSystem](../src/audio/AudioSystem.ts), [AudioScope](../src/audio/AudioScope.ts). |
| Sky and fonts | [SkyAssets](../src/world/SkyAssets.ts), [font styles](../src/styles/fonts.css). |

Phase leases own shared resources. Event bundles own encounter-specific loads.
Read [resource ownership](ARCHITECTURE.md#resource-ownership) before changing loading or disposal.
Asset imports must preserve the manifest's normalization and validation rules.

## Fetch and validate

Run commands from the repository root. Fetch commands need network access and can replace committed asset files.

| Command | Work |
| --- | --- |
| `bun run models:fetch:items` | Fetch, process, and publish item models. |
| `bun run models:fetch:ship` | Fetch ship furniture. |
| `bun run models:fetch:fishing` | Fetch fishing models. |
| `bun run models:fetch:events` | Fetch event models and the rescue boat. |
| `bun run models:fetch:menu` | Fetch menu models. |
| `bun run models:fetch` | Run the five model fetch groups above. |
| `bun run textures:fetch:lifeboat` | Fetch and process lifeboat maps. |
| `bun run textures:fetch:ship` | Fetch and process ship maps. |
| `node scripts/fetch-heart-models.mjs` | Fetch the three heart pieces. |
| `bun run audio:fetch` | Fetch and process audio. Some steps invoke Python. |
| `bun run thumbnails:generate` | Generate item thumbnails. |
| `bun run models:check` | Validate model groups and ship/lifeboat textures. |
| `bun run thumbnails:check` | Validate thumbnails. |

Use a matching `models:check:<group>` command for an individual model group.
Texture checks are `textures:check:lifeboat` and `textures:check:ship`.
The aggregate model fetch excludes textures, heart pieces, audio, and thumbnails. Run their commands when those assets change.

## Change an asset

1. Check the visual guide, ledger, source license, and existing import script.
2. Update source metadata and hashes through the asset's current fetch pipeline.
3. Update the runtime manifest and attribution for new files or IDs.
4. Run the matching checks. Regenerate thumbnails after item appearance changes.
5. Inspect scale, orientation, interaction bounds, and disposal in the game.

Keep runtime assets in the repository. Normal startup should load them from the built site.
