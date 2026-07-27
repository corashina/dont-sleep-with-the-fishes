# Coastal Freighter Ship Redesign

**Date:** 2026-07-27
**Status:** Approved design, pending written-spec review

## Purpose

Upgrade the current ship into a larger, more believable coastal freighter
without changing its gameplay roles or breaking traversal, item interaction,
evacuation, buoyancy, or lifecycle behavior.

The redesign interprets the project visual guide through:

- authored ship construction rather than larger primitive shapes;
- scene-integrated item staging with open, readable routes;
- restrained sail and rigging motion with believable attachment;
- stronger material and color separation before post-processing.

The result should remain darkly comic and melancholic, but no longer uniformly
grey. White-painted structure, warm timber, deep blue water, pale canvas, and
small safety-color accents should stay readable in every weather and time state.

## Scope

This work includes:

- enlarging and reshaping the ship hull and deck;
- separating the crew cabin and wheelhouse with a wider clear passage;
- redistributing existing furniture and item surfaces;
- replacing two flag-like masts with one central working mast and real sails;
- changing hull, wall, floor, and sail materials;
- adding selective exterior construction details;
- retuning lighting, atmosphere, and all post-processing profiles;
- updating deterministic layout, collision, ownership, and rendering tests.

It does not add rooms, change room purposes, add collectibles, change gameplay
rules, introduce multiple deck levels, or alter the shared wave-field contract.

## Ship Form and Dimensions

The authored plan dimensions change from `16 × 44` to `20 × 55` world units.
The structural deck remains at the existing local `deckY` so player height,
sinking, buoyancy, and phase transitions do not acquire an unrelated vertical
offset. The visible hull extends farther below the deck and receives a fuller
midsection, sharper bow entry, and narrower stern termination.

The hull uses layered profiles:

1. a deep navy-charcoal lower hull;
2. a narrow contrasting waterline band;
3. weathered warm-white upper sides;
4. a warm timber deck bounded by a raised white gunwale and dark rail hardware.

The bow gains modest sheer and a more pronounced stem. The stern remains
walkable and compatible with the machinery area, but its outline narrows rather
than ending as a rounded platform. These are visual hull changes, not new
walkable elevations.

## Layout

All existing zone identities remain:

- `storageWorkroom` aft;
- open `cargoDeck` through midship;
- `crewCabin` forward-midship;
- `wheelhouse` near the bow;
- `lifeboatStation` on the starboard side.

The target plan uses these spatial rules:

- the crew cabin and wheelhouse remain separate enclosed structures;
- their facing walls have a 3.5-unit open-deck gap;
- the gap is a mostly clear passage, not a prop or mast cluster;
- the crew cabin and storage/workroom are 11.5 units wide, while the
  wheelhouse is 11 units wide, leaving generous port and starboard exterior
  routes inside the 20-unit beam;
- primary circulation remains at least 2.2 units wide;
- secondary standing access remains at least 1.4 units wide;
- door openings remain at least 2.4 units wide;
- the exterior loop, room-to-room route, bow access, stern access, and
  starboard evacuation route remain connected.

`ShipLayout` remains the sole source of truth for zone bounds, doors, lanes,
furniture, item surfaces, machinery closure, evacuation area, rail openings,
and rigging anchors. Geometry and collision must derive from this layout rather
than repeat placement constants.

## Central Mast and Sails

The two existing masts are replaced by one central mast located on the midship
centerline, outside the clear crew-cabin/wheelhouse passage. It has a visibly
supported base, a boom, shrouds, stays, attachment blocks, and rope connections.

The rig carries:

- one large triangular mainsail supported by the mast and boom;
- one smaller forward staysail tied to a dedicated deck attachment;
- reinforced hems, panel seams, corner patches, and slightly irregular edges;
- shallow curved cloth geometry so the sails read as tensioned fabric rather
  than flat flags.

The lowest sail cloth must remain above the existing safe player-clearance
contract. Rigging lines may cross overhead but must not create player colliders
or obscure interaction prompts at normal play distance.

The cloth geometry has a shallow static billow. Sail motion retains the
existing transform-based update pattern, applying only small rotations around
an authored neutral pose without allocating per frame. Reduced-motion mode
holds both sails at their neutral poses.

## Rooms, Furniture, and Items

Room purposes and item categories do not change.

### Crew cabin

- Place the two bunks against opposite side walls.
- Separate the desk, provisions cabinets, and bookcase along the remaining
  walls instead of clustering them.
- Preserve a broad central aisle and access from both side doors.

### Wheelhouse

- Center the helm/forward desk on the bow-facing wall.
- Group the chart station on the port side.
- Spread navigation instruments along the starboard side with reachable gaps.
- Keep a clear route between the aft and port doors and around the helm.

### Storage/workroom

- Place work surfaces against opposing side walls.
- Keep shelving against an end wall.
- Group repair and workshop items without blocking either side door or the
  required central access rectangle.

### Open cargo deck

- Arrange deck gear, spare supplies, crates, and racks in small functional
  clusters near room walls, the rig base, or machinery edges.
- Keep the visual center and all longitudinal lanes open.
- Do not add filler props solely because the deck is larger.

The current item catalog, category rules, deterministic assignment behavior,
and 21-item carrying flow remain unchanged. The redesigned furniture layout
must expose exactly 28 valid item surfaces, matching the current capacity, with
unique physical slots, category-compatible assignments, non-overlapping item
bounds, and at least one reachable standing point per assigned surface.

## Exterior Details

Add only details that clarify construction or use:

- layered gunwale and rail profiles;
- selective hull ribs or plate seams;
- porthole frames and fasteners;
- anchor fitting and hawse detail;
- one deck hatch;
- restrained rope coils, vents, and drainage details;
- localized salt marks, rust at joints and drainage paths, and handled-edge
  wear.

Details should be grouped by function and must not block tested routes. The
ship should retain meaningful negative space and must not become a uniformly
decorated prop field.

## Materials

Material identity is established at gameplay distance:

- **Upper hull and walls:** warm weathered white with restrained roughness and
  panel variation, not pure white.
- **Deck and room floors:** medium warm timber with longitudinal plank
  direction, seams, modest color variation, and non-metallic response.
- **Lower hull:** deep navy-charcoal with a distinct waterline boundary.
- **Sails:** pale blue-grey canvas with warmer lit faces and darker reinforced
  edges.
- **Hardware:** dark painted metal with selective exposed-metal edges.
- **Accents:** ochre rope, localized rust, red safety markings, and warm
  practical lights.

Procedural or existing owned textures remain deterministic. Added materials,
textures, and geometry have one explicit owner and are disposed exactly once.

## Lighting, Atmosphere, and Post-Processing

Every visual profile becomes more colorful and higher contrast, including
night, overcast, and squall. Weather differences remain meaningful:

- daytime emphasizes cobalt/cyan sky and sea against the white hull and wood;
- overcast preserves blue-green separation rather than collapsing into grey;
- squalls retain cold saturated storm color and readable white structure;
- night uses cool cyan moonlight against warm practical lamps rather than
  global desaturation.

The implementation order is:

1. establish material value and hue separation;
2. retune sky, fog, key light, fill light, and practical lights;
3. retune post-processing profiles;
4. apply selective contact depth and quiet print treatment.

All post-processing profiles move from their current below-neutral saturation
to a `1.02–1.12` range and use a `1.08–1.14` contrast range. Shadow lift
preserves interactive detail, and highlight compression protects the white
hull and sails without crushed blacks. Each base sky palette reduces fog
density by 10 percent to improve sea/ship color separation while preserving
weather hierarchy.

AO remains localized to deck contacts, wall seams, furniture feet, rigging
joints, and hull overlaps. Grain, halftone, vignette, chromatic separation, and
ink framing remain subordinate to geometry, materials, and lighting.

## Architecture and Data Flow

- `ShipLayout` owns authored spatial data and validates all navigation
  contracts.
- `ShipGeometry` consumes layout data to build the hull, deck, rooms, rails,
  openings, and shell collision.
- `ShipMaterials` owns ship materials and procedural textures.
- `ShipRigging` consumes the single mast specification and owns mast, sail,
  boom, and rope geometry.
- `ShipFurniture` and `ShipItemPlacement` consume layout furniture and surface
  definitions without introducing placement constants elsewhere.
- `PostProcessingPipeline` continues to consume selected immutable visual
  profiles; profile selection rules do not change.
- `Environment`, `Skybox`, and existing practical-light owners provide the
  underlying lighting and atmosphere.
- Ocean rendering, buoyancy, and vessel motion continue to read from the shared
  wave field.

No gameplay module depends on renderer state. No resource is disposed by more
than one owner.

## Validation and Failure Handling

Layout validation must reject:

- non-finite or out-of-hull geometry;
- doors, rail openings, or passages below required clearance;
- furniture or deck details overlapping required lanes;
- unreachable navigation or item-standing targets;
- duplicate or invalid item surfaces;
- mast placement inside evacuation or required navigation areas;
- sail geometry below safe cloth clearance;
- invalid sail dimensions or missing rig attachment points.

Rendering remains procedural and local, so there is no new runtime network
failure path. Existing asset-loading fallbacks continue to apply to furniture.
If post-processing initialization fails, the existing direct-render fallback
remains authoritative.

## Verification

Automated verification must cover:

- exact ship plan dimensions and unchanged structural deck elevation;
- the 3.5-unit gap between crew cabin and wheelhouse;
- minimum primary and secondary clearances;
- complete exterior, room-to-room, bow, stern, and evacuation traversal;
- door, rail, room, machinery, and hull collision boundaries;
- exactly one mast and valid mainsail/staysail geometry;
- sail-player clearance and rig placement outside required lanes;
- exactly 28 valid item surfaces and successful 21-item assignment across
  deterministic seeds;
- furniture and item non-overlap;
- material and texture ownership with idempotent disposal;
- finite, clamped values for every visual profile;
- no remote textures or new per-frame allocation paths.

Completion requires:

1. TypeScript typecheck;
2. full Vitest suite;
3. production Vite build;
4. visual inspection at representative day, night, overcast, and squall states;
5. confirmation that white structure, warm wood, blue/cyan environment, canvas,
   and safety accents remain distinguishable in each state.

## Acceptance Criteria

The redesign is successful when:

- the ship reads immediately as a larger, constructed vessel rather than an
  enlarged platform;
- white sides and walls, wood floors, and proper sails are visible at normal
  gameplay distance;
- the two forward rooms are visibly separate with a clear 3.5-unit passage;
- all existing gameplay roles and interactions remain available;
- every tested navigation route and item standing point remains reachable;
- all time and weather states are more colorful and contrast-rich without
  losing their distinct mood;
- the scene retains authored negative space and restrained print treatment.
