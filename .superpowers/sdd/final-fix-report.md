# Kenney Model Audit Final-Fix Report

Date: 2026-07-14

## Scope

Hardened the final pre-publication model audit without changing fetch orchestration, gameplay,
trusted custom recipe paths, the required nine-file set, triangle budgets, ledger checks, or
`--models-dir` behavior.

The audit now rejects, with the affected GLB path in each diagnostic:

- missing or empty `POSITION` geometry;
- non-finite position components or computed position bounds;
- empty or non-finite world-space model bounds;
- non-data external buffer URIs;
- non-data external image/texture URIs; and
- material-referenced textures whose image source has no non-empty embedded bytes.

The archive-source fixture also contains `unapproved-sentinel.txt` and proves that the allowlisted
extractor leaves it inside the archive.

## RED Evidence

Tests were added before production changes. Command:

```text
bun run test -- tests/itemModelAudit.test.ts tests/KenneyItemSources.test.ts
```

Observed: exit 1; 7 failed and 8 passed across 15 tests.

- Missing `POSITION`, empty `POSITION`, non-finite positions, and non-finite model bounds were
  incorrectly accepted with exit status 0.
- External buffer and texture fixtures were rejected only by the existing unexpected-entry guard;
  the required item-specific URI diagnostic was absent.
- A referenced texture without image bytes reached the parser's generic
  `Missing resource URI or buffer view.` error instead of an item-specific audit error.
- All 6 Kenney source-guard tests passed, including the new archive sentinel assertion.

This is the exact RED summary printed by Vitest:

```text
Test Files  1 failed | 1 passed (2)
Tests       7 failed | 8 passed (15)
```

## GREEN Evidence

First GREEN attempt:

```text
bun run test -- tests/itemModelAudit.test.ts tests/KenneyItemSources.test.ts
```

Observed: exit 1; 14 passed and 1 failed. All validation worked; only the model-bounds diagnostic
wording did not match the intentional item-specific wording. The production diagnostic was
tightened, then the focused gate passed. A separate empty-model-bounds fixture was retained in the
final focused suite.

Final focused command:

```text
bun run test -- tests/itemModelAudit.test.ts tests/KenneyItemSources.test.ts
```

Observed: exit 0.

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

## Verification Results

```text
bun run models:check
# exit 0; all nine GLBs accepted; total: 2640 / 28000 triangles

bun run typecheck
# first run: exit 1 because concurrent, unrelated BoatWorld.ts work referenced missing
# legacyOceanAtmosphere and survivalLighting
# fresh run after that workspace work settled: exit 0

bun run test
# an initial run overlapped the same incomplete unrelated BoatWorld.ts edit and exited 1 with
# 18 BoatWorld.test.ts ReferenceError failures; both scoped suites passed in that run
# fresh final-tree run after the workspace settled: exit 0; 45 files and 463 tests passed

bun run build
# exit 0; its tsc --noEmit gate passed and Vite emitted all nine GLBs

git diff --check -- scripts/check-item-models.mjs tests/itemModelAudit.test.ts tests/KenneyItemSources.test.ts
# exit 0
```

## Self-Review

- Error messages identify the affected GLB and distinguish missing/empty positions, non-finite
  positions, empty/non-finite model bounds, external resource URIs, and missing embedded image data.
- Bounds are computed from every scene-instanced mesh in world space. A malformed mesh cannot be
  hidden by a valid sibling because each transformed position must remain finite.
- Material texture references include core texture slots and extension texture slots discovered
  recursively; common alternative image-source extensions are resolved.
- Embedded image validation accepts non-empty buffer-view or data-URI bytes and rejects absent,
  zero-length, truncated, or external image sources.
- The requested staging directory remains authoritative. Tests copy the exact nine-file set into a
  temporary `--models-dir`, mutate only one model, and continue to exercise the exact-set guard.
- Existing nine-file, triangle, aggregate budget, ledger, `--assets-only`, argument parsing, and
  `--models-dir` paths remain in place.
- The current nine committed Kenney GLBs pass the hardened audit unchanged.
- The commit is limited to the audit script, its two requested test files, and this report.

## Concerns

- An earlier full-suite attempt overlapped an incomplete unrelated `BoatWorld.ts` edit. The fresh
  final-tree run passes all 45 files and 463 tests; the earlier transient result is retained above
  for exact chronology.
- `@gltf-transform/core` continues to print its existing optional `KHR_texture_transform` warnings
  while reading the nine current GLBs. The audit exits 0.
- Vite continues to emit the existing advisory for a JavaScript chunk larger than 500 kB. The build
  exits 0; bundle splitting is outside this fix.

## Final Re-review: Triangle Validity Hardening

Date: 2026-07-14

### Root Cause

The audit counted indexed elements without dereferencing them, so an accessor containing index `3`
for three `POSITION` vertices still contributed one triangle. It also treated finite, ordered model
bounds as sufficient evidence of geometry, allowing a collinear zero-area triangle to pass.

### RED Evidence

The CLI-boundary fixtures were added before the second production change. Both replace only
`flareGun.glb` inside a temporary copy of the exact nine-file staged set and assert item-specific
errors.

```text
bun run test tests/itemModelAudit.test.ts
```

Observed against the unchanged audit: exit 1. The non-indexed collinear triangle and indexed
out-of-range triangle were both incorrectly accepted with exit status 0.

```text
Test Files  1 failed (1)
Tests       2 failed | 10 passed (12)
```

### GREEN Evidence

```text
bun run test tests/itemModelAudit.test.ts
```

Observed after implementation: exit 0.

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

The final suite includes a positive non-degenerate planar triangle fixture, proving that a zero
volume on one bounding-box axis is not mistaken for zero triangle area.

### Verification

```text
bun run models:check
# exit 0; all nine production GLBs pass; total: 2640 / 28000 triangles

bun run typecheck
# exit 0

bun run test
# exit 0; 45 files and 466 tests passed

bun run build
# exit 0; TypeScript and Vite production build passed and emitted all nine GLBs
```

### Self-Review

- Every index is required to be an integer in `[0, POSITION.count)` before model-bounds traversal.
- Existing triangle-mode and element-count divisibility checks retain their order and diagnostics.
- Indexed and non-indexed primitives are grouped into triangle triplets after each node's world
  transform.
- Triangle area is tested from scale-normalized edge directions, avoiding overflow/underflow while
  rejecting repeated and collinear points.
- The model must have finite bounds, at least one positive extent, and at least one non-degenerate
  world-space triangle. Legitimate planar meshes remain valid.
- A valid sibling cannot conceal an invalid index, while one valid world-space triangle is enough
  for the item/model-level visibility requirement.
- Fetch orchestration, custom recipe paths, gameplay, exact-file checks, budgets, ledger validation,
  and `--models-dir` behavior remain unchanged.
