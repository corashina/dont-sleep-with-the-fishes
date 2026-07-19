# Freighter Water-Exclusion Shape

- **Status:** Approved design, pending implementation-plan review
- **Date:** 2026-07-19
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest

## Objective

Keep the ocean visible beneath the scavenging freighter hull and around its rounded bow and stern. The freighter mask must follow the same exclusion contract as the lifeboat without changing collision, buoyancy, gameplay, or ocean rendering outside the hull.

## Root Cause

The lifeboat passes a tapered outline and a local-height threshold to `createWaterExclusion`. The freighter supplies only rectangular bounds. `createWaterExclusion` therefore uses its full-length rectangular default and masks water at every local height. That removes ocean fragments from corners outside the freighter's rounded ends and from below its keel.

## Design

`ShipGeometry` will publish a complete freighter water-exclusion profile:

- `halfWidth: 6.05` and `halfLength: 17.6`, unchanged;
- `taperStart: 13.6`, matching the cargo deck's straight section before its 4-unit rounded end caps;
- `minimumLocalY: 0.76`, matching the freighter hull bottom (`HULL_TOP_Y - HULL_HEIGHT`).

`World` will pass the complete profile into `createWaterExclusion`. The current shader already consumes both values. No shader, ocean-renderer, lifeboat, collision, buoyancy, or input changes are required.

The tapered mask follows the freighter's plan shape: it preserves a full 6.05-unit half-width through the straight hull, then narrows elliptically from `|z| = 13.6` to zero at `|z| = 17.6`. The height gate discards ocean only at or above local `y = 0.76`; lower trough water remains visible beneath the hull.

## Testing

Add failing world-level coverage before changing production code. It will verify the uploaded freighter exclusion profile, reject a transformed local point in a rounded exterior corner, preserve a transformed local point below the keel, and continue to exclude a transformed local point inside the hull above the keel. Retain the existing lifeboat assertions in the same test.

Run `bun run test -- tests/world.test.ts`, then `bun run test`, `bun run typecheck`, and `bun run build`. Inspect the scavenging freighter from the title scene and active run: water must remain visible at the rounded corners and beneath the hull while remaining hidden inside the hull outline.

## Acceptance Criteria

1. The freighter water mask narrows from `z = -13.6` through `z = 13.6` to rounded endpoints at `z = -17.6` and `z = 17.6`.
2. Water below local `y = 0.76` remains visible beneath the freighter.
3. Water at or above the keel stays excluded inside the freighter profile.
4. The mask remains aligned through the freighter's buoyant world transform.
5. Lifeboat water-exclusion behavior remains unchanged.
