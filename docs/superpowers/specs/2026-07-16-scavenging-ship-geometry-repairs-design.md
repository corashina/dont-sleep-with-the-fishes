# Scavenging Ship Geometry Repairs

- **Status:** Approved
- **Date:** 2026-07-16
- **Target:** Desktop web browser
- **Scope:** Scavenging freighter smokestacks, enclosed-room roofs, and paired deck artifacts

## 1. Objective

Repair three visible defects on the scavenging freighter without changing its layout, navigation, furniture, collectible placement, materials, or gameplay:

1. Ground both smokestacks on the machinery island.
2. Cover the crew cabin and storage/workroom with flat steel roofs that match the wheelhouse roof.
3. Remove the paired drain and rust-strip meshes from the cargo deck near the side rails.

## 2. Root Causes

`ShipGeometry.ts` places each smokestack bottom at `y = 4.5`, while the machinery island ends at `y = 3.37`. The 1.13-unit gap makes both stacks float.

The room builder creates a roof for the wheelhouse inside its wall-specific code. It creates no roof for the other enclosed zones.

`addWeathering` places a drain mesh and a narrow rust mesh at `x = -4.8` and `x = 4.8` near the middle of the ship. These four meshes form the unwanted paired floor marks.

## 3. Approved Geometry

### 3.1 Smokestacks

Keep both smoke outlets at `y = 7.1` so smoke behavior and the ship silhouette retain their current upper bounds. Extend each stack cylinder down to the machinery-island top. Place each collar at that joint. The stack bottom and collar must touch the island without a visible gap.

Keep the port and starboard stack positions, radii, materials, smoke sources, and stack weathering. Do not raise the machinery island or add separate support pedestals.

### 3.2 Room Roofs

Create one roof slab for each enclosed zone:

- crew cabin;
- wheelhouse;
- storage/workroom.

Each slab follows its zone bounds, uses a 0.24-unit thickness, and extends 0.175 units past each wall face. Place the slab bottom at the top of that room's walls. Use painted steel for all three roofs.

Move roof construction out of the wheelhouse-only wall branch into a shared enclosed-room roof builder. Roofs remain visual geometry and do not add player colliders.

### 3.3 Deck Artifacts

Remove both `deck-drain-*` meshes and both `rust-streak-deck-drain-*` meshes. Keep the rust mark at the lifeboat rail opening and the stack-collar weathering.

## 4. Code Boundaries

`ShipGeometry.ts` owns the repair. `ShipLayout.ts` continues to supply room bounds and machinery bounds without new fields. `ShipSmoke.ts`, `ShipMaterials.ts`, furniture modules, item placement, and phase logic need no behavior changes.

The geometry builder will:

1. Build room walls and corners from the current layout.
2. Build roofs for the three enclosed zones from the same bounds.
3. Derive grounded stack height from the fixed outlet height and machinery-island top.
4. Build the remaining rail-opening weathering without the paired deck marks.

## 5. Testing

Add focused `ShipGeometry.test.ts` assertions before production edits:

- each enclosed zone has one named roof whose horizontal bounds cover its walls;
- each roof bottom meets its room's wall top;
- each smokestack and collar reaches the machinery-island top;
- stack outlets stay at their current positions;
- the scene contains no `deck-drain-*` or `rust-streak-deck-drain-*` meshes;
- the remaining lifeboat and stack weathering meshes still exist.

Run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

Inspect the ship in the title scene and active scavenging. Check both stack bases, all three enclosed rooms, and both cargo-deck edges from angles that expose gaps or overlapping surfaces.

## 6. Acceptance Criteria

1. Both smokestacks meet the machinery island with no visible space beneath them.
2. The crew cabin, wheelhouse, and storage/workroom each have a flat steel roof.
3. Roof slabs cover the full wall outline with the approved overhang and no exposed room opening.
4. The paired drain and rust-strip floor marks no longer appear.
5. Other weathering, smoke, navigation, furniture, collectibles, and gameplay remain unchanged.
6. Model checks, tests, typecheck, build, and browser inspection pass.
