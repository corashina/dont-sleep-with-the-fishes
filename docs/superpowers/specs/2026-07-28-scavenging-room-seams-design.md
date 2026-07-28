# Scavenging Room Seam and Wall-Finish Design

## Goal

Make every enclosed scavenging room visually light-tight and geometrically
even while preserving its distinct material identity. The crew cabin retains
warm painted panels, storage retains plain painted steel, and the wheelhouse
retains its authored window-and-frame treatment.

## Current defects

- Porthole wall panels are shortened by `0.00002` metres in both dimensions,
  leaving real gaps at adjacent walls, floors, and roofs.
- Solid box walls and extruded porthole walls generate UVs differently. The
  same material therefore appears at different scales and orientations on
  neighboring surfaces.
- Exact edge-to-edge shadow casters are vulnerable to raster and bias
  precision, so removing the explicit gaps alone may not eliminate every
  practical-light leak.
- The three enclosed rooms use separate construction paths, allowing their
  edge and texture behavior to drift.

## Design

Keep layout bounds as the visible source of truth. Each visible wall face will
end exactly on its authored room, door, window, and porthole boundaries.
Construction geometry may extend by a shared `0.01` metre sealing distance
*inside* adjacent wall, floor, or roof volumes. These hidden overlaps must not
alter the visible silhouette, room dimensions, openings, or collision boxes.

All vertical room panels will use one physical-scale planar UV convention:
one UV unit equals one metre, with horizontal distance following the wall and
vertical distance following wall height. Solid, doorway, window, and porthole
wall paths will produce the same texel density and upright orientation. This
changes mapping, not room identity; each room continues selecting its existing
authored material.

The shared wall construction rules apply to:

- crew-cabin solid and porthole panels;
- storage-workroom solid and porthole panels;
- wheelhouse straight, chamfered, framed, and glazed sections;
- every wall-to-wall, wall-to-floor, and wall-to-roof joint.

## Ownership and boundaries

`ShipLayout` continues to own room bounds and openings. `ShipGeometry` owns
visible panel extents, hidden seam sealing, and wall UV generation.
`ShipMaterials` continues to own and dispose the room materials and textures.
Collision remains derived from layout-visible wall volumes and does not include
hidden render-only sealing overlap.

No gameplay, navigation, lighting placement, room dimensions, or phase rules
change.

## Validation

Automated geometry tests will verify for every enclosed room:

- visible wall and roof bounds match the layout;
- wall endpoints meet every neighboring structural plane without gaps;
- hidden sealing does not intrude into doors, windows, portholes, or the
  walkable interior;
- wall collision remains unchanged and opening samples remain clear;
- all primary walls in a room use its intended material;
- UV density and upright orientation match across solid and cutout panels.

Renderer verification will inspect every room from interior viewpoints with
its practical lights active, focusing on wall corners, floor lines, roof lines,
door jambs, window frames, and porthole panels. Success means no visible light
leaks or pixel-width misalignment and no texture-style change between adjacent
walls within a room.

## Visual interpretation

The fix supports authored illustrated forms by making the rooms read as
deliberately assembled structures. Consistent physical texture mapping
preserves the restrained weathered finish, while hidden structural overlap
solves lighting artifacts without adding decorative grime or post-processing.
