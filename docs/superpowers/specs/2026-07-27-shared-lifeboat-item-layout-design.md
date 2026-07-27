# Shared Lifeboat Item Layout Design

## Summary

Create one authored item layout for the small lifeboat and use it during both
scavenging and survival. Saved items must retain the same position, resting
rotation, and scale across the phase transition.

Keep the three existing lifeboat benches unchanged. Add one transverse bench
toward the bow as a display shelf. Arrange small supplies on this shelf and
bulky equipment on the floor between it and the seated player. Together, the
items form a compact shallow arc facing the player rather than a straight row.

## Goals

- Give every scavenging item instance one canonical lifeboat transform.
- Use those exact transforms in scavenging and survival.
- Add one shared bow-side display bench without changing the three existing
  benches.
- Keep every visible item recognizable, fully visible, and selectable.
- Group supplies compactly without intersections or uniform showroom spacing.
- Place bait closest to the fishing rod.
- Preserve current inventory rules, highlighting, condition presentation, and
  item-use animation.

## Non-goals

- Changing item models, inventory capacity, survival balance, or item effects.
- Removing or repositioning the three existing benches.
- Redesigning the fishing rod, repair toolbox, lantern, or selection UI.
- Adding procedural physics to stored items.
- Reflowing the layout according to which items are present.

## Visual interpretation

The arrangement is a compact, weathered still life: practical clutter with
authored asymmetry and clear silhouettes. Items rest with believable weight.
Their player-facing orientation comes from individually authored rotations,
not from standing objects unnaturally upright.

Duplicate supplies use small offsets and restrained rotation differences to
form stacks or fans. Contact shadows and overlaps should make the display feel
seated in the boat, while spacing preserves recognition and selection. The
bench reuses the lifeboat's timber construction, material treatment, thickness,
rails, and wear language.

## Physical layout

### Lifeboat bench

`createLifeboat` will continue to construct the existing three benches without
changing their transforms. It will additionally construct exactly one
transverse display bench toward the bow, between the player and the fishing
rod. The bench is part of the shared lifeboat model and therefore appears in
both phases.

The survival-only slatted supply platform will be removed. The new bench and
the lifeboat floor become the visible support surfaces.

### Shelf items

The display shelf holds:

- bait tins;
- canned food;
- energy bars;
- map;
- compass;
- duct tape;
- flashlight;
- flare gun;
- spyglass;
- bottled paper;
- medical kit.

Shelf transforms form the far portion of a shallow arc centered on the seated
player. Each model's recognizable face or profile points toward the player.
Bait occupies the shelf anchor closest to the fishing-rod pivot.

### Floor items

The floor between the player and shelf holds:

- bucket;
- fishing net;
- scuba set;
- anchor;
- umbrella;
- swim ring;
- harpoon gun.

Floor transforms form the near portion of the same shallow arc. Long objects
follow the arc with varied, slight angles. They do not form a line and do not
block the shelf silhouettes behind them.

### Duplicate and survival-only supplies

Every scavenged item instance has its own fixed transform. Multiple instances
of one type form a compact stack or fan at that type's location.

Food or bait gained during survival may exceed the scavenged instance count.
These quantity-only rewards use reserved overflow transforms in the same
food/bait stack. They do not move any scavenged instance.

Repair material has no scavenging counterpart. It remains a survival-only
floor cluster beside the repair toolbox and does not participate in the
cross-phase equality requirement.

## Canonical layout and ownership

One world-layer layout module will be the sole source of item transforms. Each
scavenging instance entry records:

- item and instance identity;
- support surface (`shelf` or `floor`);
- local position;
- full resting rotation;
- scale.

The same module also owns reserved transforms for generated food, bait, and
repair-material copies. Layout lookup remains deterministic and performs no
random placement.

The scavenging world consumes the canonical instance transform when an item is
deposited into the lifeboat. The survival supply display consumes the same
instance transform when it creates the corresponding visible copy. The current
independent scavenging and survival coordinate tables will not remain as
separate sources of truth.

The shared lifeboat owns and disposes the new bench geometry and materials.
The scavenging world and survival supply display retain their current ownership
of item scene nodes and presentation resources.

## Runtime behavior

1. Scavenging deposits an item into its canonical instance transform.
2. The phase result passes saved instance identities to survival unchanged.
3. Survival creates or reveals each saved instance at the same local position,
   rotation, and scale.
4. Inventory changes only affect visibility, condition treatment, and
   quantity copies; remaining instance transforms never reflow.
5. Interaction anchors continue to derive from the visible object bounds.
6. Highlighting and item-use animation operate relative to each new resting
   transform and restore it exactly when finished.

Transforms are resolved during construction or inventory synchronization, not
in per-frame update paths.

## Validation and error handling

- Unknown, malformed, or out-of-range instance IDs fail with a descriptive
  layout error.
- Every defined scavenging instance must have exactly one canonical transform.
- Every canonical transform must use finite values and a positive scale.
- Shelf entries must rest on the display bench; floor entries must rest on the
  lifeboat floor.
- Item presentation failure must follow existing constructor rollback and
  idempotent disposal behavior.

## Testing

### Layout tests

- Every catalog instance resolves to one canonical transform.
- Malformed and out-of-range instance IDs are rejected.
- Each shelf/floor classification matches the approved lists.
- The bait display anchor is closer to the fishing-rod pivot than every other
  supply anchor.
- Duplicate and overflow transforms are stable and non-identical.
- Production-model bounds do not intersect one another, the hull, or the wrong
  support surface beyond a small contact tolerance.

### Cross-phase tests

- Scavenging storage and survival display use equal local position, quaternion,
  and scale for every saved instance.
- Depositing items in a different order does not change any transform.
- Hiding, breaking, consuming, repairing, or gaining another item does not
  move unaffected instances.

### Lifeboat and interaction tests

- The three existing benches retain their names and transforms.
- Exactly one new display bench exists in the shared lifeboat.
- Survival no longer constructs the slatted supply platform.
- All visible supply groups continue to produce selectable interaction
  anchors.
- Item-use animation returns the item to its canonical transform.
- Normal and failed construction dispose new resources exactly once.

### Visual verification

Inspect a full inventory from the normal scavenging and survival cameras:

- all items are fully visible and recognizable;
- shelf and floor placements read as one shallow arc rather than rows;
- long items face the player without blocking smaller shelf items;
- duplicate stacks remain individually legible;
- bait is visibly closest to the fishing rod;
- no model floats or clips through the hull, floor, bench, or another item.

## Acceptance criteria

- The small boat has its original three benches plus exactly one bow-side
  display bench.
- The survival-only slatted platform is gone.
- Every saved item has identical local position, resting rotation, and scale
  in scavenging and survival.
- Small items lie on the display shelf and bulky or long items lie on the
  floor according to the approved lists.
- Shelf and floor items form one compact shallow arc facing the seated player.
- Duplicate items form stable, legible stacks or fans.
- Bait is the closest displayed supply to the fishing rod.
- Every visible item is fully visible and selectable.
- No placement reflow or layout allocation occurs per frame.
- Existing gameplay rules and inventory behavior remain unchanged.
