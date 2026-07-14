# Survival Lifeboat Floor Seal

- **Status:** Approved design, awaiting implementation
- **Date:** 2026-07-14
- **Scope:** Survival-phase lifeboat geometry and water exclusion only

## Problem

The survival lifeboat floor does not meet the lower edge of the side walls. The floor sits below the wall bottom and its outline stops short of the wall interior, leaving a visible diagonal gap through which ocean water can be seen.

## Design

Keep the existing wooden floor appearance, item layout, hull silhouette, camera, and survival behavior. Replace the independent floor outline with an outline derived from the same `HULL_STATIONS` data that defines the side walls. The floor edge will extend far enough beneath the wall thickness to create a small geometric overlap at every station.

Raise the floor slightly so its upper surface intersects the lower edge of the side-wall geometry. The overlap must be large enough to remain sealed despite segment rotation, while staying below the visible interior wall surface and avoiding z-fighting.

The existing rectangular water exclusion remains centered on the boat. Its dimensions must cover the entire sealed floor and the overlap beneath the walls, so the ocean cannot render through the interior or the former seam.

## Constraints

- Survival boat only; scavenging boat geometry remains unchanged.
- No visible sealing strip or new decorative element.
- No change to item transforms, interaction anchors, paddles, camera framing, or survival rules.
- Floor and side walls must overlap continuously from bow to stern.
- The floor must remain inside the exterior hull silhouette.
- Existing resource ownership and exact-once disposal behavior must remain unchanged.

## Verification

Add a regression test before changing production geometry. The test will sample every adjacent hull station and assert that the floor reaches beneath the inner face of both side walls with positive horizontal overlap. It will also assert positive vertical overlap between the floor surface and the lower wall edge.

The water-exclusion test will verify that its bounds contain the sealed floor footprint and wall-overlap margin. Focused lifeboat and `BoatWorld` tests, the full test suite, typecheck, production build, and whitespace checks must pass.

Browser/Chrome visual QA remains excluded at the user's request.
