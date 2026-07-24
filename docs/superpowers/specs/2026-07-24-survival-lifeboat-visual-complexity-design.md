# Survival Lifeboat Visual Complexity Design

**Date:** 2026-07-24

**Status:** Approved design

## Goal

Increase the survival lifeboat's visual complexity, replace its orange-dominant
finish with dark weathered wood, gather supplies into one readable bow station,
represent large quantities with capped physical piles, and move the permanent
hull-repair interaction onto a recognizable toolbox.

The result should draw from the supplied original-game reference without
copying its composition one-for-one. The boat must remain deterministic,
renderer-independent in its layout rules, locally self-contained at runtime,
and accessible with keyboard and mouse.

## Approved Direction

Use a forward supply bay with two staggered rows. Small supplies rest on a
shallow slatted platform, while bulky equipment keeps its existing scale and
rests around the platform's front and outer edges. The permanent fishing rod
remains mounted beside the station, and an open red repair toolbox occupies the
opposite flank.

The shared lifeboat structure receives the wood and geometry overhaul in both
scavenging and survival so the player sees the same vessel across the phase
transition. The supply platform, grouped piles, and repair toolbox are
survival-only outfitting.

## Shared Lifeboat Structure

Keep the current authored dimensions and all gameplay-space contracts:

- hull stations and interpolation;
- storage acceptance box;
- interior bounds;
- water-exclusion bounds;
- buoyancy origin and shared-wave motion;
- camera framing and fishing-water relationship.

Increase structural detail with:

- distinct longitudinal hull planks and inner floorboards;
- additional visible ribs and three substantial cross-benches;
- layered gunwales, bow and stern caps, and keel strips;
- seams, pegs, bolts, cleats, rope lashings, and refined oarlocks;
- retained and refined paddles;
- darker plank edges, scratches, repaired areas, and subtle waterline staining.

Broad orange-painted surfaces become dark weathered timber. Faded rescue orange
remains only as a narrow outer strake, worn gunwale patches, and selected small
fittings. The boat must read primarily as an old wooden lifeboat and secondarily
as former emergency equipment.

## Wood Texture Asset

Use the individual Poly Haven `wood_planks` asset:

- asset page: <https://polyhaven.com/a/wood_planks>;
- license: CC0;
- source type: individual texture asset, not an all-in-one bundle;
- required maps: diffuse/color, roughness, and OpenGL normal;
- runtime form: downsampled, color-graded, locally committed images;
- target appearance: stylized deep brown with restrained contrast and wear;
- runtime network access: none.

The source archive SHA-256, asset identifier or version, source entries,
processing commands, final image dimensions, license, and download date must be
recorded in `THIRD_PARTY_ASSETS.md`. Triangle counts are recorded as not
applicable for texture-only assets.

Processing should reduce photorealistic micro-detail and keep the material
coherent with the existing moderately detailed low-poly props. Authored UVs
must orient the grain along each structural plank rather than relying on
incidental box-face mapping.

## Survival Forward Supply Bay

Add a shallow slatted platform across the forward part of the survival boat.
Use two staggered rows for compact supplies. Preserve the existing scale of
every prop. Place the anchor, scuba gear, fishing net, umbrella, swim ring, and
harpoon around the platform's front and outer edges so their silhouettes remain
clear without spreading supplies throughout the boat.

The fishing rod remains mounted immediately beside the station so its resting
pose, line origin, casting animation, and fishing-camera composition remain
readable.

The layout is authored and deterministic. It must keep group interaction
centers separated and keyboard reachable at supported desktop 16:9 and 4:3
viewports.

## Grouped Quantity Presentation

Each item type is represented by one visual group and one interaction target.
The group tooltip reports the exact current quantity, for example `FOOD ×5`.
The number of visible physical copies is capped:

| Exact quantity | Visible copies |
| ---: | ---: |
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 or more | 3 |

Quantities use current session state rather than only the objects recovered
during scavenging. Resource groups use their current usable totals from every
source, while durable-item groups also retain broken props:

- Food uses `SurvivalSnapshot.food` and displays canned-food models.
- Bait uses `SurvivalSnapshot.bait` and displays bait-tin models.
- Loose repair material uses `SurvivalSnapshot.repairMaterial` and displays
  compact patch-material bundles beside the toolbox.
- Other item types derive their usable and broken counts from the survival
  inventory and display up to three copies of the total still aboard. When a
  future or authored group contains both conditions, its accessible label
  reports the usable and broken counts separately.

Groups update when supplies are gained, consumed, broken, repaired, or lost.
Visual copies are created once and toggled during synchronization; ordinary
updates and renders allocate no models, geometries, materials, or collections.

## Group Interaction Semantics

One pointer or keyboard target covers the complete item-type group. The visible
and accessible label includes:

- item or resource name;
- exact quantity;
- condition when relevant;
- action, cost, effect, risk, and unavailable reason through the existing UI
  contracts.

The supply display never mutates survival state. It selects a deterministic
backing instance when an instance identity is required:

1. Prefer an event-required or explicitly selected usable instance.
2. Otherwise choose the lexicographically first usable instance.
3. If no usable instance exists, choose the lexicographically first broken
   instance for inspection and repair-selection presentation.

Every backing instance ID maps to the same group root. Event highlighting and
item-use animation affect the complete group, while the survival session
continues to own exact consumption, loss, breakage, and repair decisions.

## Repair Toolbox

Remove the loose plank-and-hammer repair target from the shared lifeboat.
Create a survival-only, project-authored open toolbox with:

- muted, weathered red steel case and hinged lid;
- reinforced corners, carry handle, latches, and edge hardware;
- shallow inner tray;
- visible hammer, wrench, and screwdriver silhouettes;
- scratches and darkened edges consistent with the worn boat.

The toolbox retains the existing permanent `repairTools` gameplay identity and
`repair` action. Project the interaction target from the full toolbox bounds.
The compact visible prompt becomes `REPAIR TOOLBOX ⚡⚡`; accessible text
continues to state the two-energy cost explicitly.

The toolbox remains present when repair is unavailable so focus or hover can
explain missing energy, an undamaged hull, missing repair material, or missing
duct tape. Loose repair-material bundles sit beside it but do not expand or
replace its interaction bounds. The damaged hull patch remains environmental
detail and is not an action target.

## Architecture and Ownership

### `LifeboatAssets`

Add an async asset library that loads the three locally committed wood maps
during game startup alongside models, furniture, and sky assets.

- Configure color space, wrapping, filtering, mipmaps, and anisotropy once.
- Fail startup with a specific asset-load error if a required map is missing or
  undecodable.
- Let the game own and dispose the shared textures exactly once.
- Do not let individual lifeboat instances dispose shared textures.

### `Lifeboat`

Continue to own shared hull geometry, boat-local materials, floor, benches,
fittings, paddles, acceptance bounds, interior bounds, and water exclusion.
Dispose each boat-local geometry and material exactly once through the existing
scene-resource lifecycle.

### `RepairToolbox`

Own the project-authored toolbox root and its focused geometry/material
construction. The toolbox is created once per survival world and disposed by
that world.

### `BoatSupplyLayout`

Own immutable group transforms and the offsets for one, two, or three visible
copies. Validate that authored positions remain within the lifeboat interior
and that unchanged prop scales are used.

### `BoatSupplyDisplay`

Own group roots, prebuilt model copies, repair-material bundle visuals,
condition-material bindings, visibility synchronization, backing-instance
selection, highlighting, event presentation, and group bounds.

### `BoatWorld`

Continue to own survival scene orchestration, snapshot synchronization,
projected interactions, fishing presentation, camera behavior, weather,
lighting, and disposal. Convert supply-display records into one interaction
anchor per visible group.

### `SurvivalUI`

Continue to own labels, exact quantity text, tooltips, keyboard order, action
preview text, unavailable reasons, and accessible descriptions.

## Data Flow

1. Game startup loads prop models, ship furniture, sky assets, and lifeboat
   texture assets in parallel.
2. The shared lifeboat builder receives the preloaded texture assets and builds
   the same refined wooden hull for scavenging and survival.
3. Survival creates its toolbox and supply display after the shared hull.
4. `BoatWorld.syncInventory` passes the immutable survival snapshot to
   `BoatSupplyDisplay`.
5. The display derives exact group quantities and conditions, toggles its
   prebuilt copies, and selects deterministic backing instances.
6. The display exposes one presentation record and world-space bound per
   visible group.
7. `BoatWorld` projects those bounds into interaction anchors.
8. `SurvivalUI` renders one accessible target per group with exact quantity and
   the existing action contract.
9. User actions route back through `SurvivalPhase` and `SurvivalSession`; the
   presentation never updates rules directly.

## Failure Handling

- Missing, corrupt, or misconfigured wood maps fail asset loading with a
  lifeboat-specific error.
- Asset-policy checks reject missing source metadata, incorrect hashes, remote
  runtime URLs, unsupported image dimensions, or unexpected files.
- Invalid layout definitions fail deterministic tests rather than silently
  moving props.
- Snapshot quantities are expected to be non-negative integers; presentation
  clamps only the visible-copy count to zero through three and preserves the
  exact session quantity in labels.
- A group with no usable or broken backing instance exposes no event item
  identity.
- Disposed worlds ignore later synchronization and interaction calls through
  the existing lifecycle guards.
- No remote fallback asset or runtime-generated replacement hides a packaging
  error.

## Automated Verification

Add or update tests to verify:

- shared hull stations, acceptance box, interior bounds, water exclusion, and
  buoyancy contracts remain unchanged;
- new planks, floorboards, benches, ribs, fittings, and wear details have
  stable names and expected structural bounds;
- lifeboat textures load locally with correct color space, repeat, roughness,
  normal-map orientation, filtering, and ownership;
- the scavenging lifeboat receives the shared wood overhaul but not the
  survival supply platform, grouped piles, or toolbox;
- count transitions `0`, `1`, `2`, `3`, and `4+` produce the required visible
  copies and exact labels;
- food, bait, repair material, usable items, broken items, consumed items, and
  lost items synchronize correctly;
- every visible item type produces exactly one anchor;
- duplicate groups choose deterministic backing instances and prefer an
  event-required instance;
- all prop scales remain equal to their current survival presentation scales;
- full-inventory group targets remain separated and keyboard reachable at
  desktop 16:9 and 4:3;
- the toolbox alone owns the repair interaction and maintains the minimum
  pointer target;
- repeated construction, phase transitions, restarts, and disposal release
  each geometry, material, texture, and listener exactly once;
- existing fishing, event, phase, and UI contracts continue to pass.

## Visual Verification

Inspect:

- the empty wooden lifeboat during scavenging;
- sparse, medium, and maximum survival inventories;
- food, bait, and repair-material quantities above three;
- usable, broken, consumed, and lost transitions;
- calm, overcast, and squall weather;
- day and night lighting;
- fishing entry, casting, bite, reel, and return composition beside the supply
  station;
- supported desktop 16:9 and 4:3 viewports;
- normal and reduced-motion preferences.

Confirm that the boat reads as dark wood rather than orange, the faded rescue
accents remain secondary, all props retain their current scale, the bow station
looks compact rather than cluttered, exact quantities remain discoverable, and
interaction targets do not overlap.

## Required Commands

Run all repository checks required for asset changes:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

## Documentation

Update:

- `THIRD_PARTY_ASSETS.md` with complete texture provenance and processing;
- `README.md` where it describes the orange lifeboat or instance-per-prop
  survival presentation;
- model or asset audit metadata only when required by the existing policy
  scripts.

## Non-Goals

- Changing survival balance, item effects, event odds, fishing rewards, or
  action costs.
- Changing scavenging placement, carry weight, or storage acceptance rules.
- Scaling down existing item models.
- Changing fishing state transitions, bite timing, or rod animation behavior.
- Changing shared-wave motion, buoyancy, cameras, phase lifecycle, or input
  contracts beyond grouped target publication.
- Adding saves, persistent progression, touch controls, mobile layout,
  crewmates, multiplayer, or new collectible types.
- Adding runtime asset downloads or depending on an asset store in production.
