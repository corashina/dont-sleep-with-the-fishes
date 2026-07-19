# Scavenging Freighter Buoyancy

- **Status:** Approved design, pending implementation-plan review
- **Date:** 2026-07-19
- **Target:** Desktop web browser
- **Stack:** Vite, TypeScript, Three.js, Vitest

## Objective

Give the scavenging freighter a restrained floating pose driven by the same wave field that renders the ocean and moves the lifeboat. The player must keep colliding with the existing ship-local collision layout while the hull, camera, furniture, and items move together.

## Scope

`World` will sample the shared `DEFAULT_WAVES` field across a 30-unit length by 10-unit width footprint centered at the ship origin. It will smooth the sampled heave, pitch, and roll with damping `2.4`, then add that pose to the existing scripted sinking offset and list.

The freighter remains horizontally anchored. It does not use the normal-derived lateral drift that the lifeboat uses. This keeps the evacuation route and the lifeboat relationship stable while the hull moves with the sea.

The feature has no `prefers-reduced-motion` branch. It does not change controls, gameplay rules, item placement, assets, or the independently floating lifeboat.

## Architecture

`World` owns one reusable buoyancy solver and current/target poses for the freighter. The solver receives the existing allocation-free wave sampler, the 30 by 10 footprint, the current world time, and the sinking state's wave-amplitude scale. `World.update` samples the target and damps it before it writes the combined pose to the existing `sinking-ship` root.

The combined root transform follows this contract:

- position: fixed local X/Z, `sinkOffset + wave heave` on Y;
- rotation: scripted pitch/roll plus wave pitch/roll, no yaw;
- water exclusion: read from the final root world transform.

The player controller keeps its local position and resolves against the authored local collision boxes. It converts that local position through the ship root when it places the camera. The new root transform therefore carries both the player and the collision space without rebuilding or transforming collider data.

## Integration Details

The lifeboat continues to calculate its own buoyant pose at its established world anchor. Item throws and the lifeboat acceptance box continue to use the lifeboat's current world transform. Ship-bound props and carried items inherit the freighter root transform through their current parenting.

No new Three.js resources, listeners, textures, or render targets are introduced. The buoyancy solver only owns reusable sample and pose data, so it needs no disposal path.

## Testing

Add tests before production changes that prove:

1. A scavenging-world update produces the expected damped heave, pitch, and roll from the shared wave field and keeps the ship's X/Z position fixed.
2. The collision boxes and a representative local collision resolution remain unchanged after the freighter root moves.
3. The ocean water-exclusion region matches the final transformed freighter root.

Keep the existing transformed-deck interaction coverage. Run `bun run test`, `bun run typecheck`, and `bun run build` after the implementation. Inspect the title and active scavenging scenes to confirm the hull, player camera, colliders, and lifeboat route remain aligned.

## Acceptance Criteria

1. The freighter heaves, pitches, and rolls from `DEFAULT_WAVES` during scavenging.
2. The freighter uses the 30 by 10 sampling footprint and stays horizontally anchored.
3. Sinking offset and listing compose with the buoyant pose.
4. Local player collisions retain their authored behavior while the ship moves.
5. The water-exclusion mask stays aligned with the freighter.
6. No reduced-motion behavior or unrelated systems change.
