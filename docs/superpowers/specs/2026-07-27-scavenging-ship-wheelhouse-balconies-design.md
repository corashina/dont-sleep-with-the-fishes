# Scavenging Ship Wheelhouse and Balconies Design

## Goal

Redesign the scavenging ship's forward wheelhouse as an authored hybrid
bridge/captain's room, and convert the crew-cabin and storage-workroom roofs
nearest the central mast into climbable balconies.

The work preserves scavenging rules, existing searchable furniture surfaces,
room access, the ship footprint, and the current rigging layout.

## Visual interpretation

The feature follows the game's darkly comic, melancholic maritime direction
through constructed silhouettes, restrained personal traces, and distinct
weathered materials. Personality comes from faceted forms, captured glazing,
local repairs, and a few human objects rather than uniform grime or excessive
decoration.

The implementation emphasizes the visual guide's pillars as follows:

- Authored illustrated forms: chamfered wheelhouse corners, layered frames,
  visible brackets, coamings, rail joints, ladder mounts, and slight structural
  irregularity.
- Scene-integrated interface: no new persistent UI or interaction prompt is
  required; ladder entry follows player movement.
- Tactile keyed motion: ladder traversal has deliberate entry and dismount
  transitions without decorative wobble.
- Restrained print treatment: existing scene-level treatment remains unchanged;
  geometry and materials establish the redesign.

## Wheelhouse

The existing `wheelhouse` zone remains the captain room and retains its current
footprint, doors, searchable surfaces, and clear interior path.

### Exterior shape

Replace the plain rectangular visual shell with a faceted working bridge:

- chamfer the two forward corners in plan;
- taper the upper wall faces inward slightly;
- add a layered lower sill and header;
- use dark structural ribs at pane boundaries and chamfer joints;
- add a weathered-white roof with a modest overhang and visible brackets.

Collision should follow the new outer faces closely enough that the facade
cannot be walked through, while preserving all existing door approaches and
interior clearance.

### Windows

Use a wraparound front-and-side window band with deliberately varied pane
widths. Every pane is derived from the exact opening bounded by its sill,
header, pillars, and corner ribs. Glass is inset into that opening and visibly
captured on every edge. No pane may float in front of a wall, extend beyond its
frame, or leave an unintended seam.

The glass remains muted blue-grey and transparent. Dark frames, warm-white
painted structure, and selective exposed-metal fasteners provide separation at
gameplay distance.

### Interior dressing

The room reads first as a working bridge and second as a captain's personal
space. Existing helm and chart furniture remain dominant. Add a restrained,
purposeful set of procedural decorations:

- helm wheel and compact compass housing;
- pinned or laid chart;
- shaded working lamp;
- captain's logbook and mug;
- hanging coat and key hooks;
- one visibly repaired cabinet or panel.

Decorations are grouped around the helm and chart-working areas. They must not
overlap searchable item surfaces, block doors, narrow the clear path, or create
new gameplay interactions.

## Roof balconies

Only the two enclosed rooms closest to the central mast become balconies:

- `crewCabin`;
- `storageWorkroom`.

The `wheelhouse` roof remains a conventional roof.

Each balcony has:

- a timber walking surface seated directly above the structural roof;
- a raised weathered-white perimeter coaming matching the ship's deck edge;
- weathered-white rail posts;
- a dark timber or metal top rail;
- one centered opening on the edge facing the mast.

The timber surface is a distinct walkable support. Rail and coaming collisions
prevent accidental walk-off except at the ladder opening. Balcony construction
must remain clear of the current mast, stays, chimney housing, and room walls.

## Ladders and traversal

Both ladders are centered at `x = 0` and mounted on the transverse wall facing
the central mast:

- the crew-cabin ladder is on the room's aft wall;
- the storage-workroom ladder is on the room's forward wall.

This places each ladder between the existing paired portholes and directly
below its balcony railing opening. Each ladder uses dark side rails, worn
timber rungs, visible wall brackets, and grab rails that extend above the
balcony edge.

### Automatic interaction

No interact key or prompt is added. When the player enters a ladder activation
volume while moving toward the ladder, traversal enters climbing state.

While climbing:

- forward/backward movement controls ascent/descent;
- lateral drift is constrained to the ladder centerline;
- ordinary gravity and jumping do not interfere;
- camera look remains available;
- reaching either endpoint produces a clean deck or balcony dismount.

Leaving the ladder volume after a valid dismount restores ordinary movement,
gravity, jumping, and support detection. Approaching a ladder without movement
toward it must not capture the player.

## Architecture and ownership

`ShipLayout` owns authored balcony and ladder specifications: room identity,
mast-facing edge, center position, railing opening, ladder dimensions, and
activation volume.

`ShipGeometry` owns construction of:

- the faceted wheelhouse shell and window frames;
- glass panes derived from frame openings;
- wheelhouse exterior and interior procedural details;
- balcony roof layers, coamings, railings, and ladders;
- their shell colliders, walkable supports, and climb volumes.

All Three.js geometry and mesh resources created by these helpers remain owned
by the existing ship geometry build and are disposed exactly once.

A small renderer-independent ladder traversal module owns climb-state
transitions and position resolution. `PlayerController` supplies current
position and movement intent, delegates climbing decisions to this module, and
applies its deterministic result. Input handling, rendering, world
construction, and traversal rules remain separate.

No randomness is required.

## Validation

Automated tests cover:

- wheelhouse facade bounds and preserved doors/interior clearance;
- glass panes fully captured by their authored frames;
- balcony creation only for `crewCabin` and `storageWorkroom`;
- timber balcony surfaces and weathered-white perimeter treatment;
- rail collision and centered ladder openings;
- exact center-facing ladder placement between portholes;
- elevated balcony support and safe movement on both roofs;
- automatic climb entry only with movement toward a ladder;
- ascent, descent, lateral constraint, endpoint dismount, and movement restore;
- unchanged ordinary jumping, falling, room navigation, furniture access, and
  existing ship layout validation;
- geometry ownership and disposal through the existing ship build.

Verification finishes with focused geometry, layout, collision, and player
controller tests; the full test suite; a production build; and in-game visual
inspection from the main deck, both balconies, and inside the wheelhouse.
