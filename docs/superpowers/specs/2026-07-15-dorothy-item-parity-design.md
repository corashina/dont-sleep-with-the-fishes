# Dorothy Item Parity Design

- **Status:** Approved
- **Date:** 2026-07-15
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest
- **Scope:** Dorothy scavenging items and their survival behavior

## 1. Objective

The Dorothy scavenging phase must contain the complete practical item set available during the opening ship sequence of *Don't Sleep With The Fishes*. Pickup quantities must match the approved Dorothy contract, every recovered item must have a real survival use, and each prop must resemble the original game's readable low-poly silhouette.

This change corrects the current invented quantities, removes the Water Bottle, expands the ship from 9 item types and 14 instances to 19 item types and 22 instances, and replaces the inaccurate flare-gun model. It retains the existing three-point weighted carry system and adapts original-game behavior to the project's current single-survivor rescue loop.

## 2. Sources and Scope Boundary

The implementation uses the following references, reviewed on 2026-07-15:

- item names and documented uses: <https://unoffdontsleepwiththefishes.fandom.com/wiki/Items>;
- item-related event responses and condition changes: <https://unoffdontsleepwiththefishes.fandom.com/wiki/Events>;
- official game presentation and release context: <https://store.steampowered.com/app/4834070/Dont_Sleep_With_The_Fishes/> and <https://dopplerghost.itch.io/dont-sleep-with-the-fishes>.

The wiki is evidence for the available item set and its behavior, not a runtime dependency. Production code must not fetch wiki content or external assets.

The scope includes only practical pickups available during Dorothy. It excludes:

- the Water Bottle, which is not part of the approved Dorothy set;
- the Repair Kit as a pickup because it is built into the lifeboat;
- the Chest and other later event loot;
- heart pieces, flowers, companions, trades, story branches, and alternate endings.

The current simplified rescue ending remains. Bottled Paper and applicable sightings feed its existing rescue-progress calculation instead of introducing the original game's broader story or ending chain.

## 3. Canonical Dorothy Catalog

A single typed catalog is the source for item IDs, labels, spawn counts, weights, charges, durability, breakability, supported actions, model metadata, placement category, and UI artwork. Scavenging, state transfer, survival, events, UI, model loading, and audits must consume this catalog rather than maintain parallel lists.

| Item ID | Display label | Count | Weight | Model strategy |
| --- | --- | ---: | ---: | --- |
| `cannedFood` | Food | 3 | 1 | Retain current model |
| `baitTin` | Bait | 2 | 1 | Retain current model |
| `ductTape` | Duct Tape | 1 | 1 | Retain current model |
| `compass` | Compass | 1 | 1 | Project-authored model |
| `map` | Map | 1 | 1 | Project-authored model |
| `medicalKit` | Medkit | 1 | 2 | Retain current model |
| `spyglass` | Spyglass | 1 | 1 | Project-authored model |
| `fishingNet` | Fishing Net | 1 | 2 | Project-authored model |
| `bucket` | Bucket | 1 | 2 | Kenney Survival Kit 2.0 |
| `flareGun` | Flare Gun | 1 | 1 | Replace with project-authored model |
| `scubaSet` | Scuba Gear | 1 | 3 | Retain current model |
| `anchor` | Anchor | 1 | 3 | Project-authored model |
| `bottledPaper` | Bottled Paper | 1 | 1 | Kenney bottle with project-authored note |
| `umbrella` | Umbrella | 1 | 2 | Project-authored model |
| `swimRing` | Swim Ring | 1 | 2 | Project-authored model |
| `flashlight` | Flashlight | 1 | 1 | Retain current model |
| `harpoonGun` | Harpoon Gun | 1 | 2 | Project-authored model |
| `energyBar` | Energy Bar | 1 | 1 | Project-authored model |
| `fishingRod` | Fishing Rod | 1 | 2 | Retain current model |

The table defines exactly 19 types and 22 physical instances. Food is the only three-instance type, Bait is the only two-instance type, and every other type has exactly one instance. Instance IDs are stable and unique. Catalog validation rejects duplicate type or instance IDs, nonpositive counts, unsupported weights, missing behavior definitions, and missing model records.

The internal ID is `spyglass`; old parity-branch references to `telescope` are translated during selective porting rather than preserved as a second alias.

## 4. State Model and Transfer

Scavenging keeps one state record per physical instance. The existing states remain `available`, `carried`, `saved`, and `lost`. Weight is calculated from the catalog and the total carried weight cannot exceed three.

Only saved instances transfer to survival. Survival keeps instance identity and adds the conditions `usable`, `broken`, `consumed`, and `lost`:

- usable items can provide actions or event responses;
- broken durable items remain aboard and visible but cannot be used;
- consumed items have spent their single use and no longer appear as usable supplies;
- lost items are removed by an event outcome and cannot be repaired.

Food and Bait expose aggregate resource totals for the existing meters and actions, while preserving their contributing instance records. Each saved Food or Bait instance contributes exactly one unit. Consumption deterministically marks one usable matching instance as consumed, so the aggregate count and visible boat props cannot disagree.

The catalog creates all instances, the scavenging result transfers the saved subset, and survival derives its inventory from that result. No layer reconstructs items from a hard-coded type list.

## 5. Models and Asset Governance

The current Food, Bait, Duct Tape, Fishing Rod, Medkit, Flashlight, and Scuba Gear models remain because their silhouettes fit the target style. The direct bucket model comes from Kenney Survival Kit 2.0. Bottled Paper combines the pack's bottle with a clearly visible project-authored rolled note.

Compass, Map, Spyglass, Fishing Net, Anchor, Umbrella, Swim Ring, Harpoon Gun, Energy Bar, and Flare Gun use project-authored low-poly geometry with flat materials. Their forms may reuse the project's earlier procedural concepts, but they must be generated into committed GLBs through reproducible recipes. They must not copy or extract geometry, textures, or artwork from the original game.

The replacement Flare Gun restores the earlier readable signal-pistol silhouette: a short red or orange barrel, oversized cylindrical muzzle, dark angled grip, trigger guard, and visible break-action hinge. It must not use the current Kenney `blaster-n` model. Browser review compares its proportions and screen readability against the original game's presentation without copying the original asset.

Every runtime GLB has a stable filename, embedded materials and textures where applicable, deterministic triangle count, bounded dimensions, and a manifest record. Third-party rows in `THIRD_PARTY_ASSETS.md` record the asset-page URL, pack version, archive SHA-256, source entry, processing steps, source and committed triangle counts, CC0 license, and download date. Project-authored models are identified separately in the manifest and audit so they are not falsely attributed to Kenney.

The item publication script remains atomic. It stages the complete approved set, audits it, then swaps it into the runtime directory. A failed build cannot leave a partially published model set.

## 6. Dorothy Placement

All 22 pickups use unique authored positions. Placement remains deterministic and is organized by readable ship context:

- navigation and signaling equipment belongs in or near the wheelhouse;
- Food, Bait, Medkit, Energy Bar, Bottled Paper, and other compact supplies use cabin, galley, shelf, or counter surfaces;
- Fishing Rod, Fishing Net, Bucket, Anchor, Umbrella, Swim Ring, Harpoon Gun, and Scuba Gear use deck racks, wall storage, or open floor positions sized for bulky props.

The ship layout expands its item categories and slots rather than stacking new items onto the 14 existing points. Long or bulky props receive suitable clearance and orientation. Each item has a reachable standing point and interaction volume. Props cannot block doors, stairs, narrow routes, the lifeboat approach, or one another.

Automated layout checks cover pairwise separation, surfaces, walls, doors, and player routes. Browser inspection remains authoritative for visual clutter, recognizability, and practical reachability.

## 7. Survival Behavior

Every recovered item has a direct action, an event response, or both. Food, Bait, Duct Tape, Medkit, Flare Gun, Bottled Paper, Harpoon Gun, and Energy Bar are single-use resources. The corrected catalog removes the current extra Duct Tape and changes Medkit to one use.

The day-action behavior is:

- Fishing Rod enables fishing, with an optional Bait unit improving the result;
- Scuba Gear enables diving, with Flashlight modifying documented or existing visibility outcomes where applicable;
- Food reduces hunger and consumes one saved Food instance;
- Medkit restores health once and is then consumed;
- Energy Bar restores energy to the maximum of four and is consumed;
- Bottled Paper costs one energy, adds 15 rescue progress, records the sent message in the journal, and is consumed;
- the built-in lifeboat Repair Kit and recovered salvage material perform ordinary hull repairs;
- Duct Tape repairs one broken breakable item, answers a supported emergency event, or performs the existing emergency hull patch, then is consumed;
- Rest is item-independent, can be used once per day, and restores two energy.

Water charges, Water Bottle anchors, and water-dependent action text are removed.

Durable items become broken or lost only through outcomes documented for that item. Breakable behavior is declared in the catalog rather than inferred from durability. Broken items remain visible and inspectable. Duct Tape can restore one broken item to usable condition. Consumed and lost items cannot be repaired.

## 8. Event Adaptation

The event system becomes data-driven enough to represent multiple valid item responses and the following effects:

- resource and meter deltas;
- rescue progress or immediate rescue where the current ending supports it;
- consumption of a selected one-use item;
- breakage of a durable item;
- loss of an item;
- repair of a broken item.

Implementation selectively ports every wiki-documented ordinary response row that references one of the 19 Dorothy types and can be expressed in the current single-survivor loop. It excludes outcomes that require a named companion, a trade partner, later loot, story-only state, or an alternate ending. Excluded branches are not replaced with invented items.

An event may show several suitable recovered items. The player selects a usable instance, accepts the documented outcome, or endures the event. Broken, consumed, lost, or unsaved instances are not eligible. Choosing an unsuitable item follows the event's unsuitable outcome without corrupting that item's state.

Seeded randomness, day limits, weights, weather eligibility, and cooldowns remain deterministic under test. Event text and numerical effects are translated to the existing health, hunger, energy, hull, resource, and rescue-progress scales. Later events may award ordinary resources such as Food, Bait, or salvage, but they do not introduce a new non-Dorothy item type.

## 9. Interface and Presentation

The scavenging HUD, result summary, survival inventory, boat anchors, action panels, journal, and event choices use catalog labels and status data. New project-authored SVG artwork covers all 19 types. The Water Bottle artwork and styling are removed.

The carry display continues to show three capacity points. It represents weight, not item count, so a weight-three item fills the display while three weight-one items can be carried together. Pickup prompts and rejection text state the relevant item and weight when capacity prevents collection.

The result summary reports saved quantities without collapsing distinct instances incorrectly. Survival tooltips distinguish usable, broken, consumed, and lost states. Action costs and previews reflect corrected charges and the item-independent Rest action. All new controls remain keyboard accessible, retain visible focus, and restore focus correctly after action, event, and journal overlays.

Recovered boat props follow their condition state. Broken items remain present. Consumed or lost props stop presenting a usable interaction target. The interaction-anchor layout must remain legible at the supported viewport sizes even when many supplies were saved.

## 10. Failure and Lifecycle Behavior

All required model files preload before scavenging begins. A missing, malformed, mismatched, or unrecorded model raises an item-specific load error and shows the existing named-item recovery screen. Runtime code must not silently substitute a placeholder or fetch an asset.

Development validation fails on:

- any catalog total other than 19 types and 22 instances;
- any quantity that differs from the approved table;
- duplicate IDs or placement slots;
- a catalog item without behavior, artwork, placement, or model metadata;
- an unsupported state transition;
- a manifest, ledger, triangle, dependency, or bounds mismatch.

Phase disposal releases each loaded or generated resource once. Restarting from the ship rebuilds clean catalog and inventory state without retaining consumed, broken, or lost conditions from the previous run.

## 11. Verification

Implementation follows test-driven development. Unit and integration tests cover:

- the exact 19-type, 22-instance catalog;
- Food times three, Bait times two, and one of every remaining type;
- exactly one Duct Tape;
- absence of Water Bottle, Repair Kit pickup, Chest, heart pieces, flowers, and later loot;
- stable unique instance IDs and three-point weighted carrying;
- pickup, drop, throw-to-boat, save, and loss behavior for duplicate types;
- saved-instance transfer and Food/Bait aggregation;
- every supported action, event response, consumption, breakage, repair, and loss transition;
- rejection of broken, consumed, lost, or unsaved items;
- item-independent Rest, one-use Medkit, full-energy Energy Bar, and the Bottled Paper rescue effect;
- deterministic event eligibility and seeded outcomes;
- all 19 manifest entries and GLBs, exact triangle counts, embedded dependencies, stable filenames, bounds, and ledger records;
- all 22 placement slots, item separation, collision limits, and reachable standing points;
- UI labels, quantities, weight display, artwork coverage, conditions, focus behavior, and removed water references;
- clean preload failure, restart, and disposal behavior.

Browser checks inspect both phases at 1280 by 720 and 1920 by 1080. Scavenging review visits every pickup and verifies silhouette, scale, orientation, reachability, routes, shadows, and capacity feedback. Survival review saves representative combinations and the maximum practical variety, then checks boat clutter, anchors, tooltips, condition changes, actions, event choices, journal text, and day and night lighting. The replacement Flare Gun receives a specific silhouette comparison.

After asset or behavior changes, run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

## 12. Acceptance Criteria

The feature meets the design when:

1. Dorothy contains exactly the approved 19 item types and 22 physical pickups.
2. Food appears three times, Bait twice, and every other item exactly once.
3. Water Bottle and all later or story-only loot are absent from scavenging and survival inventory.
4. The three-point weighted carry system uses the approved item weights.
5. Every recovered item has an original-style survival action, event response, or both.
6. Item consumption, breakage, loss, and Duct Tape repair remain consistent across state, UI, journal, and visible boat props.
7. The new project-authored Flare Gun reads as the original game's compact signal pistol and no longer resembles a science-fiction blaster.
8. All 22 props are recognizable, reachable, separated, and do not obstruct ship routes.
9. Models are committed locally, reproducibly generated or processed, fully audited, and independent of runtime network access.
10. Model checks, tests, typecheck, production build, and browser review of both phases pass.
