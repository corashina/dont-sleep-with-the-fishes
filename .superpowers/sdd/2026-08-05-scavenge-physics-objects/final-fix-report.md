# Final Fix Report

Date: 2026-08-05

## Status

Implemented every final-review finding in one fix wave.

No object profile or event asset changed. No package was added. No pointer-lock run was claimed.

## Fixes

### Inactive ship tracking

`ScavengePhysics.update` now tracks the ship pose while inactive.

It moves each body from its stored ship-local pose. It does not step dynamics.

It stores moved local positions and rotations after active steps. Later pauses keep that state.

The inactive pose also becomes the next active pose. This removes the intro catch-up impulse.

### Door blocking

Each door candidate now names its real `SHIP_LAYOUT` door.

Eligibility uses the real opening width, authored yaw, collider size, and 0.35 m player radius.

The selector assigns blocking objects to doors first. It then assigns the other categories.

The pool still has 14 candidates. Selection still returns two door, two exterior, two center, and one storage candidate.

### Placement validation

Pool validation now rejects duplicate coordinates and unknown categories.

### Catalog contract

Tests now assert every collider dimension, restitution, linear damping, and angular damping value.

### Failure debug attachment

Failure attachment now moves the dynamic debug root under the ship with the frozen visual root.

The debug colliders stay aligned while the ship sinks.

## TDD Evidence

### RED

Command:

```text
npm.cmd exec vitest -- run tests/ScavengePhysicsObjectPlacement.test.ts --reporter=verbose
```

Output:

```text
Test Files  1 failed (1)
Tests       4 failed | 3 passed (7)
Failures: missing door eligibility, missing door linkage, duplicate coordinates accepted, invalid category accepted.
```

Command:

```text
npm.cmd exec vitest -- run tests/ScavengePhysics.test.ts --reporter=verbose
```

Output:

```text
Test Files  1 failed (1)
Tests       1 failed | 21 passed (22)
Failure: inactive ship motion kept the stale spawn-local pose.
```

The first World RED pattern run reached the 120 second command limit. A failing debug assertion skipped cleanup.

The test now uses `try/finally`. The focused World GREEN run completes in 2.71 seconds.

Tool note:

```text
bun test ...
bun: command not found

npm exec ...
npm.ps1: script execution is disabled
```

All later commands used `npm.cmd`.

### GREEN

Command:

```text
npm.cmd exec vitest -- run tests/ScavengePhysicsObjectPlacement.test.ts tests/ScavengePhysicsObjectCatalog.test.ts tests/ScavengePhysics.test.ts --reporter=verbose
```

Output:

```text
Test Files  3 passed (3)
Tests       30 passed (30)
Duration    2.10s
```

Command after the deterministic Rapier door-path test was added:

```text
npm.cmd exec vitest -- run tests/ScavengePhysics.test.ts --reporter=verbose
```

Output:

```text
Test Files  1 passed (1)
Tests       23 passed (23)
Duration    1.71s
```

Command:

```text
npm.cmd exec vitest -- run tests/world.test.ts -t "keeps revealed physics visuals aligned|keeps attached debug object meshes aligned" --reporter=verbose
```

Output:

```text
Test Files  1 passed (1)
Tests       2 passed | 35 skipped (37)
Duration    2.71s
```

Command:

```text
npm.cmd exec vitest -- run tests/ScavengePhysics.test.ts tests/ScavengePhysicsObjectPlacement.test.ts tests/ScavengePhysicsObjectCatalog.test.ts tests/PlayerController.test.ts tests/GameLifecycle.test.ts tests/world.test.ts --reporter=dot
```

Output:

```text
Test Files  6 passed (6)
Tests       170 passed (170)
Duration    14.30s
```

Command:

```text
npm.cmd run typecheck
```

Output:

```text
> tsc --noEmit
Exit code: 0
```

Command:

```text
npm.cmd test -- --reporter=dot
```

Output:

```text
Test Files  1 failed | 85 passed (86)
Tests       1 failed | 1456 passed (1457)
Duration    62.53s
Failure: unrelated ShipItemPlacement cold-construction test exceeded its 5 second limit.
```

Command:

```text
npm.cmd exec vitest -- run tests/ShipItemPlacement.test.ts -t "keeps cold placement construction deterministic without a warm context cache" --reporter=verbose
```

Output:

```text
Test Files  1 passed (1)
Tests       1 passed | 19 skipped (20)
Test time   3.789s
Duration    5.45s
```

`git diff --check` returned exit code 0.

Asset checks were not run. This wave did not change assets, manifests, fetch scripts, or asset checks.

## Files

- `src/physics/ScavengePhysics.ts`
- `src/physics/ScavengePhysicsDebugView.ts`
- `src/world/ScavengePhysicsObjectPlacement.ts`
- `src/world/World.ts`
- `tests/ScavengePhysics.test.ts`
- `tests/ScavengePhysicsObjectCatalog.test.ts`
- `tests/ScavengePhysicsObjectPlacement.test.ts`
- `tests/world.test.ts`
- `.superpowers/sdd/2026-08-05-scavenge-physics-objects/final-fix-report.md`

## Self-review

- Inactive updates reuse stored vectors and quaternions. They add no per-frame application allocations.
- Active updates remain unchanged apart from storing each object rotation in the ship frame.
- Door eligibility uses real layout data. It does not duplicate opening widths.
- Selection stays deterministic for an injected random sequence.
- The selector still assigns every unique object exactly once.
- The Rapier test checks the widest legal player path for every eligible door and object pair.
- The World intro test checks scene-root visuals against the ship transform.
- The debug lifecycle test checks the collider center against the visual pose during sinking.
- Disposal remains idempotent after debug reparenting.
- No obsolete path, fallback, migration, or reduced-motion path was added.

## Concerns

The full suite had one unrelated load-sensitive timeout. The same test passed alone in 3.789 seconds.

Rapier prints its existing deprecated-initialization warning in physics suites.

The environment blocks pointer lock. Verification uses deterministic integration tests only.
