# Frame and phase performance

Approved scope: implement suggestions 6 and 7 from the task conversation.

Use the copied working tree at baseline dc94533c. Keep changes isolated on codex/frame-phase-performance.

## Frame work

Reuse scavenging inventory and carried item snapshots across timer-only ticks. Invalidate those records when item state changes.
Reuse raycast target and hit arrays. Keep item/deposit selection and occlusion behavior.
Separate anchor layout updates from tooltip content. Cache viewport dimensions outside layout-write loops.
Anchor objects are mutable: compare primitive content values or revisions, not anchor identity.
Refresh content on language, snapshot, eligibility, selection, lab, and action state changes.
Prepare scene matrices once before projection and rendering where practical. Preserve direct projection calls and animated target accuracy.
No new recurring allocation in the changed hot paths.

## Phase loading

Show the menu after menu assets and menu audio load. Do not wait for ship geometry, physics, survival props, or gameplay audio.
Acquire ship assets and physics for the ship transition. Acquire survival resources for the survival transition.
Restore and event-test entry must load survival directly without requiring a ship visit.
Give each phase an audio lease. Common sounds can share existing reference-counted buffers. Event leases stay independent.
Keep shared graphics resources only while required by their owners. Ensure explicit disposal on phase changes, cancellation, failure, and final shutdown.
Use one asynchronous transition owner with generation checks. Stale completions must release their resources.
Keep an explicit loading UI and existing fatal error screen. Prevent duplicate commands during loading.
Retain existing start, restart, menu return, Continue, event test, ending preview, language, settings, and pointer-lock behavior.
Remove the eager startup path after callers move. Do not retain a production compatibility route.

## Texture work

Optimize embedded textures in starfish.glb and map.glb through the current processing pipeline.
Preserve geometry, material semantics, silhouette, texture UVs, and required surface detail.
Use existing glTF Transform and image tooling. Do not add packages.
Record processed hashes and compression settings wherever existing asset checks require them.
Add checks for the optimized texture dimensions and file-size ceilings.
Review before/after images. Do not change authored models beyond texture processing.

## Validation

Run existing tests at baseline and after integration. Add behavior and lifecycle regression tests for the changed ownership and cache rules.
Measure cache reuse and loading requests. Report exact asset bytes before and after.
Run TypeScript, lint, production bundling, model checks, and texture checks.
Use a browser smoke check for menu, ship transition, survival transition, and return to menu if a browser is available.
Do not claim measured FPS gains without a browser profile.

## Constraints

- Do not alter gameplay rules or timing.
- Do not implement reduced-motion variants.
- Do not add dependencies.
- Do not introduce compatibility layers or obsolete fallback paths.
- Preserve the visual style guide.
- Do not change the original checkout, merge, push, or publish.
