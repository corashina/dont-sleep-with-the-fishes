# Original-Inspired Survival Presentation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the survival presentation as an original-inspired staged boat tableau with a screenshot-like journal, physical item and event sequences, and a stronger hand-printed final image while leaving the upper-left indicators and gameplay balance unchanged.

**Architecture:** `SurvivalPhase` continues to own gameplay orchestration, a new `SurvivalPresentationDirector` serializes and cancels asynchronous visual work, `BoatWorld` owns all Three.js presentation resources, and `SurvivalUI` owns accessible scene-level controls and the journal. The existing post-processing pipeline gains deterministic posterization and a generated ink-frame texture without adding another full-screen pass.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, HTML/CSS, Vite 7, Vitest 3, jsdom

## Global Constraints

- Do not change the upper-left condition indicators' artwork, values, danger states, order, scale, layout, markup, or CSS declarations.
- Do not change survival balance, event weights, event outcomes, deterministic random draw order, shared wave-field ownership, or inventory capacity.
- Do not add crewmates, saves, progression, touch/mobile controls, multiplayer, or third-party runtime assets.
- Keep gameplay rules renderer-independent and isolate all visual sequencing from `SurvivalSession`.
- Keep one owner for every Three.js geometry, material, texture, render target, listener, and presentation sequence; disposal must be idempotent.
- Preserve keyboard operation, visible focus, live-region announcements, and `prefers-reduced-motion`.
- Allocate presentation vectors, transforms, materials, geometry, textures, and arrays during construction, never in per-frame update or render paths.
- Target desktop layouts at 1280 by 720 and 1920 by 1080.

---

## File Structure

### New files

- `src/survival/SurvivalPresentationDirector.ts` — exclusive sequence token, cancellation, and cleanup coordination; no rules or Three.js imports.
- `src/survival/eventItemSelection.ts` — pure mapping from event choices and inventory instances to physical selection records.
- `src/survival/BoatPresentation.ts` — camera poses, prop inspection transforms, reusable event-family setpieces, and presentation cleanup owned by `BoatWorld`.
- `src/rendering/inkFrameMask.ts` — deterministic generated `DataTexture` for the irregular ink border.
- `tests/SurvivalPresentationDirector.test.ts` — director ordering, cancellation, cleanup, and disposal.
- `tests/eventItemSelection.test.ts` — exact-instance selection mapping and fallback behavior.
- `tests/BoatPresentation.test.ts` — authored poses, setpiece reuse, reduced motion, restoration, and disposal.

### Modified files

- `src/ui/SurvivalUI.ts` — top-right journal/day marker, lower-right End Day, physical event-anchor routing, sparse scene captions, screenshot-like journal markup.
- `src/ui/PerformanceStats.ts` — keep FPS output hidden unless explicit development stats mode is enabled.
- `src/Game.ts` — enable development stats only for `?stats`.
- `src/styles/main.css` — survival layout, binder journal, scene captions, ink overlap, responsive and reduced-motion rules; existing meter rules remain untouched.
- `src/survival/survivalTypes.ts` — discriminated exact-instance `EventResponse` command.
- `src/survival/SurvivalSession.ts` — validate exact event item instance and target event mutations without changing outcome data or random draw order.
- `src/survival/SurvivalPhase.ts` — use the director for action, sleep, event reveal, exact item-use, dawn, and cancellation.
- `src/survival/BoatWorld.ts` — compose `BoatPresentation`, expose narrow presentation methods, and retain shared-wave update order.
- `src/ocean/OceanRenderer.ts` — increase existing foam and grazing-reflection response without bloom or a second wave source.
- `src/rendering/postProcessingProfiles.ts` — bounded posterization and ink-frame strengths per existing profile.
- `src/rendering/PrintShader.ts` — posterization and frame-mask uniforms in the existing pass.
- `src/rendering/PostProcessingPipeline.ts` — create, bind, resize, and dispose the generated frame texture.
- `tests/SurvivalUI.test.ts` — layout, journal, event anchors, keyboard, focus, and unchanged meter contract.
- `tests/PerformanceStats.test.ts` — normal hidden state and explicit development visibility.
- `tests/SurvivalSession.test.ts` — exact-instance validation and deterministic rejection.
- `tests/SurvivalPhase.test.ts` — sequence order, command locking, cancellation, and lifecycle invalidation.
- `tests/BoatWorld.test.ts` — presentation delegation and final update-order checks.
- `tests/OceanRenderer.test.ts` — foam and grazing-reflection uniform contract.
- `tests/postProcessingProfiles.test.ts` — profile values and bounds.
- `tests/PostProcessingPresentation.test.ts` — shader source and uniform contract.
- `tests/PostProcessingPipeline.test.ts` — generated texture binding and exact disposal.

---

### Task 1: Survival HUD Layout and Screenshot-Like Journal

**Files:**
- Modify: `src/ui/SurvivalUI.ts:270-365`
- Modify: `src/ui/PerformanceStats.ts`
- Modify: `src/Game.ts:270-280`
- Modify: `src/styles/main.css:720-930`
- Test: `tests/SurvivalUI.test.ts`
- Create: `tests/PerformanceStats.test.ts`

**Interfaces:**
- Consumes: existing `SurvivalUI.showJournal(entries)`, `hideJournal()`, journal navigation callbacks, and unchanged `meterMarkup()`.
- Produces: journal DOM hooks `[data-journal-book]`, `[data-journal-rings]`, `[data-journal-tabs]`, `[data-journal-close]`; unchanged public TypeScript API.

- [ ] **Step 1: Add failing layout and journal-structure tests**

```ts
it('keeps condition indicators unchanged and uses the approved survival perimeter layout', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);

  expect([...mount.querySelectorAll('[data-meter]')].map((meter) => meter.getAttribute('data-meter')))
    .toEqual(['health', 'hunger', 'energy', 'hull']);
  expect(mount.querySelector('[data-survival-top] [data-journal-open]')).not.toBeNull();
  expect(mount.querySelector('[data-survival-top] [data-action="endDay"]')).not.toBeNull();
  expect(mainStyles).toMatch(/\.survival-top\s*\{[^}]*top:\s*20px[^}]*right:\s*24px/s);
  expect(mainStyles).toMatch(/\.end-day-button\s*\{[^}]*right:\s*24px[^}]*bottom:\s*24px/s);
  expect(mainStyles).toMatch(/\.survival-meters\s*\{[^}]*top:\s*18px[^}]*left:\s*22px/s);
  ui.dispose();
});

it('renders the journal as a tall binder with rings, tabs, and a paper close strip', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  ui.showJournal(journalEntries);

  expect(mount.querySelector('[data-journal-book]')).not.toBeNull();
  expect(mount.querySelectorAll('[data-journal-ring]')).toHaveLength(3);
  expect(mount.querySelectorAll('[data-journal-tab]')).toHaveLength(4);
  expect(mount.querySelector('[data-journal-close]')?.textContent?.replace(/\s+/g, ' ').trim())
    .toBe('X CLOSE JOURNAL');
  expect(mainStyles).toMatch(/\.journal-book\s*\{[^}]*width:\s*min\(620px/s);
  expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*aspect-ratio:\s*0\.72/s);
  ui.dispose();
});
```

- [ ] **Step 2: Run the tests and verify the new contract fails**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because binder hooks do not exist and End Day is still top-right.

- [ ] **Step 3: Add the binder structure without changing meter markup**

Replace only the journal overlay body in `SurvivalUI.ts`:

```ts
<section class="survival-overlay journal-overlay" data-journal role="dialog"
  aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
  <div class="journal-book" data-journal-book>
    <div class="journal-book__cover" aria-hidden="true"></div>
    <div class="journal-book__rings" data-journal-rings aria-hidden="true">
      <i data-journal-ring></i><i data-journal-ring></i><i data-journal-ring></i>
    </div>
    <div class="journal-book__tabs" data-journal-tabs aria-hidden="true">
      <i data-journal-tab></i><i data-journal-tab></i>
      <i data-journal-tab></i><i data-journal-tab></i>
    </div>
    <article class="journal-page">
      <p class="journal-page__weather" data-journal-weather></p>
      <h2 data-journal-title tabindex="-1"></h2>
      <div class="journal-page__story" data-journal-story>
        <section aria-labelledby="journal-day-label">
          <h3 id="journal-day-label">DAY</h3><p data-journal-day></p>
        </section>
        <section aria-labelledby="journal-night-label">
          <h3 id="journal-night-label">NIGHT</h3><p data-journal-night></p>
        </section>
      </div>
      <nav class="journal-page__navigation" aria-label="Journal pages">
        <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous"
          data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
        <span class="journal-page__folio" data-journal-page-count>PAGE 0 OF 0</span>
        <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next"
          data-journal-next aria-label="Next journal page">&rsaquo;</button>
      </nav>
      <button type="button" class="journal-page__close-strip" data-journal-close>
        X  CLOSE JOURNAL
      </button>
    </article>
  </div>
</section>
```

Do not edit `meterMarkup()`, `METER_ARTWORK`, `METERS`, `.survival-meters`, `.survival-condition`, or any `.survival-meter--*` rule.

- [ ] **Step 4: Apply the approved layout and journal CSS**

Use these fixed layout anchors:

```css
.survival-top {
  position: absolute;
  top: 20px;
  right: 24px;
  left: auto;
  z-index: 3;
  display: grid;
  justify-items: end;
  gap: 8px;
  pointer-events: auto;
}
.survival-top__status-row { display: flex; flex-direction: row-reverse; align-items: flex-start; gap: 8px; }
.survival-status { min-width: 118px; padding: 5px 8px; text-align: right; }
.end-day-button {
  position: fixed;
  right: 24px;
  bottom: 24px;
  top: auto;
  min-width: 164px;
  min-height: 58px;
}
.journal-book {
  isolation: isolate;
  position: relative;
  width: min(620px, calc(100vw - 96px));
  max-height: calc(100dvh - 32px);
  padding: 20px 40px 20px 52px;
}
.journal-book__cover {
  position: absolute;
  inset: 0;
  z-index: -3;
  border: 8px solid #180c08;
  border-radius: 34px 44px 38px 30px;
  background: linear-gradient(105deg, #24120c, #5b3824 48%, #26140d);
  box-shadow: 0 32px 80px #000d, inset 0 0 24px #0a0504cc;
  clip-path: polygon(2% 1%, 96% 0, 100% 4%, 99% 97%, 94% 100%, 3% 99%, 0 94%, 1% 6%);
}
.journal-page {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  aspect-ratio: 0.72;
  max-height: calc(100dvh - 72px);
  padding: clamp(30px, 5vh, 54px) clamp(36px, 5vw, 62px) 28px;
}
.journal-book__rings { position: absolute; left: 32px; top: 19%; bottom: 19%; display: grid; align-content: space-between; z-index: 3; }
.journal-book__rings i { width: 34px; height: 18px; border: 5px solid #86745c; border-radius: 50%; box-shadow: inset 0 0 0 2px #241a12, 2px 3px 3px #0008; }
.journal-book__tabs { position: absolute; right: 13px; top: 25%; display: grid; gap: 28px; z-index: -1; }
.journal-book__tabs i { width: 58px; height: 24px; background: #b08a38; }
.journal-book__tabs i:nth-child(2) { background: #8f3f29; }
.journal-book__tabs i:nth-child(3) { background: #8a831e; }
.journal-book__tabs i:nth-child(4) { background: #315c87; }
.journal-page__close-strip { justify-self: center; min-height: 42px; padding: 6px 20px; border: 0; color: #2a1b13; background: #ead6a7; box-shadow: 3px 4px 0 #2b180e; transform: rotate(-1deg); }
```

Retain the existing short-height story scrolling, focus rules, and reduced-motion override.

- [ ] **Step 5: Hide FPS output outside explicit development stats mode**

Change `PerformanceStats` construction to:

```ts
constructor(mount: HTMLElement, visible = false) {
  this.element = document.createElement('output');
  this.element.className = 'performance-stats';
  this.element.dataset.performanceStats = '';
  this.element.hidden = !visible;
  this.element.textContent = 'FPS --';
  this.element.setAttribute('aria-label', 'Rendering performance: waiting for FPS data');
  mount.append(this.element);
}
```

Construct it in `Game.initialize()` with:

```ts
const showDevelopmentStats = import.meta.env.DEV
  && new URLSearchParams(window.location.search).has('stats');
this.performanceStats = new PerformanceStats(mount, showDevelopmentStats);
```

Add:

```ts
it('hides FPS output by default and exposes it only when requested', () => {
  const mount = document.createElement('main');
  const normal = new PerformanceStats(mount);
  expect(mount.querySelector<HTMLOutputElement>('[data-performance-stats]')?.hidden).toBe(true);
  normal.dispose();
  const debug = new PerformanceStats(mount, true);
  expect(mount.querySelector<HTMLOutputElement>('[data-performance-stats]')?.hidden).toBe(false);
  debug.dispose();
});
```

- [ ] **Step 6: Run UI tests and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/PerformanceStats.test.ts tests/GameLifecycle.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts src/ui/PerformanceStats.ts src/Game.ts src/styles/main.css tests/SurvivalUI.test.ts tests/PerformanceStats.test.ts
git commit -m "feat: restage survival hud and journal"
```

---

### Task 2: Stronger Print Treatment and Irregular Ink Frame

**Files:**
- Create: `src/rendering/inkFrameMask.ts`
- Modify: `src/rendering/postProcessingProfiles.ts`
- Modify: `src/rendering/PrintShader.ts`
- Modify: `src/rendering/PostProcessingPipeline.ts`
- Modify: `src/ocean/OceanRenderer.ts`
- Test: `tests/postProcessingProfiles.test.ts`
- Test: `tests/PostProcessingPresentation.test.ts`
- Test: `tests/PostProcessingPipeline.test.ts`
- Test: `tests/OceanRenderer.test.ts`

**Interfaces:**
- Produces: `createInkFrameMask(size?: number): DataTexture`; profile fields `posterizationLevels` and `inkFrameStrength`; shader uniforms `tInkFrame`, `uPosterizationLevels`, `uInkFrameStrength`.
- Consumes: existing `SceneVisualState`, profile selection, `PostProcessingPipeline.dispose()`, and shared ocean wave uniforms.

- [ ] **Step 1: Write failing mask, profile, shader, pipeline, and ocean tests**

```ts
it('builds a deterministic frame with a clear center and dark irregular perimeter', () => {
  const texture = createInkFrameMask(64);
  const data = texture.image.data as Uint8Array;
  expect(data[(32 * 64 + 32) * 4]).toBeLessThan(20);
  expect(data[(1 * 64 + 1) * 4]).toBeGreaterThan(180);
  expect(data[(1 * 64 + 32) * 4]).not.toBe(data[(1 * 64 + 10) * 4]);
  texture.dispose();
});

it('keeps survival posterization and ink frame inside approved bounds', () => {
  const profile = selectPostProcessingProfile(survivalState('day', 'calm'));
  expect(profile.posterizationLevels).toBeGreaterThanOrEqual(6);
  expect(profile.posterizationLevels).toBeLessThanOrEqual(12);
  expect(profile.inkFrameStrength).toBeGreaterThanOrEqual(0.55);
  expect(profile.inkFrameStrength).toBeLessThanOrEqual(0.9);
});

expect(PrintShader.fragmentShader).toContain('uniform sampler2D tInkFrame');
expect(PrintShader.fragmentShader).toContain('uPosterizationLevels');
expect(PrintShader.fragmentShader).toContain('uInkFrameStrength');
```

Add these pipeline and ocean assertions:

```ts
const pipeline = new PostProcessingPipeline(renderer);
const frame = shaderPass.uniforms.tInkFrame.value as DataTexture;
const disposeFrame = vi.spyOn(frame, 'dispose');
pipeline.dispose();
pipeline.dispose();
expect(disposeFrame).toHaveBeenCalledOnce();

expect(OCEAN_PRESENTATION.foamGain).toBe(1.15);
expect(OCEAN_PRESENTATION.grazingReflectionGain).toBe(1.12);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- tests/postProcessingProfiles.test.ts tests/PostProcessingPresentation.test.ts tests/PostProcessingPipeline.test.ts tests/OceanRenderer.test.ts`

Expected: FAIL because the mask and new fields do not exist.

- [ ] **Step 3: Implement the deterministic frame texture**

```ts
import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';

function hash(x: number, y: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function createInkFrameMask(size = 128): DataTexture {
  if (!Number.isInteger(size) || size < 32) throw new RangeError('Ink frame size must be an integer of at least 32.');
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / size;
      const wobble = ((hash(x >> 1, y >> 1) & 255) / 255 - 0.5) * 0.055;
      const alpha = Math.round(255 * Math.min(1, Math.max(0, (0.115 + wobble - edge) / 0.095)));
      const offset = (y * size + x) * 4;
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.name = 'survival-ink-frame-mask';
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 4: Add bounded profile and shader controls**

Add to `PostProcessingProfile`:

```ts
posterizationLevels: number;
inkFrameStrength: number;
```

Use `posterizationLevels: 10, inkFrameStrength: 0.72` for calm day, 9/0.76 for overcast day, 8/0.82 for squall day, and 8/0.78, 7/0.82, 6/0.88 for the three night profiles. Use 12/0.42 for scavenge.

Add shader uniforms and apply them after tinting but before grain:

```glsl
uniform sampler2D tInkFrame;
uniform float uPosterizationLevels;
uniform float uInkFrameStrength;

float levels = max(2.0, uPosterizationLevels);
color = floor(color * levels + 0.5) / levels;
float frameInk = texture2D(tInkFrame, vUv).r;
color *= 1.0 - frameInk * uInkFrameStrength;
```

Clamp levels to 4–16 and frame strength to 0–0.95 in `PostProcessingPipeline.applyProfile()`.

- [ ] **Step 5: Bind and dispose the frame texture exactly once**

Add:

```ts
private readonly inkFrame = createInkFrameMask();
```

After obtaining uniforms:

```ts
this.uniforms.tInkFrame.value = this.inkFrame;
```

In `dispose()`:

```ts
this.inkFrame.dispose();
this.printPass.dispose();
this.outputPass.dispose();
this.composer.dispose();
```

The early constructor failure path must dispose `inkFrame` before rethrowing.

- [ ] **Step 6: Increase existing ocean foam/reflection response**

Use these exact multipliers on the existing foam brightness and grazing reflection calculations, keep their current clamps, and do not add a bloom pass, new render target, or second wave sampler:

```ts
export const OCEAN_PRESENTATION = Object.freeze({
  foamGain: 1.15,
  grazingReflectionGain: 1.12,
});
```

- [ ] **Step 7: Run focused tests and commit**

Run: `bun run test -- tests/postProcessingProfiles.test.ts tests/PostProcessingPresentation.test.ts tests/PostProcessingPipeline.test.ts tests/OceanRenderer.test.ts`

Expected: PASS.

```bash
git add src/rendering/inkFrameMask.ts src/rendering/postProcessingProfiles.ts src/rendering/PrintShader.ts src/rendering/PostProcessingPipeline.ts src/ocean/OceanRenderer.ts tests/postProcessingProfiles.test.ts tests/PostProcessingPresentation.test.ts tests/PostProcessingPipeline.test.ts tests/OceanRenderer.test.ts
git commit -m "feat: strengthen survival print treatment"
```

---

### Task 3: Exact Physical Event-Item Contract

**Files:**
- Create: `src/survival/eventItemSelection.ts`
- Modify: `src/survival/survivalTypes.ts`
- Modify: `src/survival/SurvivalSession.ts`
- Test: `tests/eventItemSelection.test.ts`
- Test: `tests/SurvivalSession.test.ts`

**Interfaces:**
- Produces:

```ts
export type EventResponse =
  | { readonly kind: 'item'; readonly choiceId: EventResponseId; readonly instanceId: ItemInstanceId }
  | { readonly kind: 'endure' };

export interface EventItemSelection {
  readonly instanceId: ItemInstanceId;
  readonly itemId: ItemId;
  readonly choiceId: EventResponseId | null;
  readonly eligible: boolean;
  readonly reason: 'eligible' | 'unsuitable' | 'unavailable';
}

export function eventItemSelections(
  event: Pick<SurvivalEventDefinition, 'choices'>,
  inventory: SurvivalInventorySnapshot,
): readonly EventItemSelection[];
```

- Consumes: event choice IDs, inventory instance IDs, and existing weighted outcome definitions.

- [ ] **Step 1: Write failing pure mapping and session-validation tests**

```ts
it('maps every physical inventory instance and preserves duplicate identities', () => {
  const selections = eventItemSelections(testEvent(['anchor']), inventory([
    usable('anchor-1', 'anchor'),
    usable('anchor-2', 'anchor'),
    usable('map-3', 'map'),
    broken('bucket-4', 'bucket'),
  ]));
  expect(selections).toEqual([
    { instanceId: 'anchor-1', itemId: 'anchor', choiceId: 'anchor', eligible: true, reason: 'eligible' },
    { instanceId: 'anchor-2', itemId: 'anchor', choiceId: 'anchor', eligible: true, reason: 'eligible' },
    { instanceId: 'map-3', itemId: 'map', choiceId: null, eligible: false, reason: 'unsuitable' },
    { instanceId: 'bucket-4', itemId: 'bucket', choiceId: null, eligible: false, reason: 'unavailable' },
  ]);
});

it('rejects a mismatched or stale exact instance without mutation or random draws', () => {
  const random = { next: vi.fn(() => 0) };
  const session = eventSessionWith(['anchor', 'map'], random);
  const before = session.snapshot();
  expect(session.resolveEvent({ kind: 'item', choiceId: 'anchor', instanceId: 'map-2' }))
    .toMatchObject({ accepted: false, code: 'item-mismatch' });
  expect(session.snapshot()).toEqual(before);
  expect(random.next).not.toHaveBeenCalled();
});
```

Add a duplicate-instance test that resolves `anchor-2` and verifies any choice-targeted consume, break, or protection uses `anchor-2`, not `anchor-1`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- tests/eventItemSelection.test.ts tests/SurvivalSession.test.ts`

Expected: FAIL because the response is still `choiceId | null`.

- [ ] **Step 3: Implement the pure event selection mapper**

```ts
export function eventItemSelections(
  event: Pick<SurvivalEventDefinition, 'choices'>,
  inventory: SurvivalInventorySnapshot,
): readonly EventItemSelection[] {
  const choiceByItem = new Map(
    event.choices.flatMap((choice) => choice.itemId === undefined ? [] : [[choice.itemId, choice.id]]),
  );
  return Object.values(inventory)
    .filter((item): item is Readonly<SurvivalItemState> => item !== undefined)
    .map((item) => {
      const choiceId = choiceByItem.get(item.type) ?? null;
      const usable = item.condition === 'usable';
      return {
        instanceId: item.instanceId,
        itemId: item.type,
        choiceId,
        eligible: usable && choiceId !== null,
        reason: !usable ? 'unavailable' : choiceId === null ? 'unsuitable' : 'eligible',
      } as const;
    });
}
```

- [ ] **Step 4: Replace the session response input and validate before drawing**

Change `resolveEvent` to:

```ts
resolveEvent(response: EventResponse): ActionOutcome {
  // existing terminal and pending-event checks stay first
  if (response.kind === 'endure') return this.resolveEventChoice('sleep', null, null);

  const item = this.inventory.snapshot()[response.instanceId];
  const choice = this.pendingEvent?.choices.find(({ id }) => id === response.choiceId);
  if (choice?.itemId === undefined) return this.reject('choice-unavailable', 'That response is not available for this event.');
  if (item === undefined) return this.reject('item-unavailable', 'That item is no longer on the boat.');
  if (item.type !== choice.itemId) return this.reject('item-mismatch', 'That physical item does not match the selected response.');
  if (item.condition !== 'usable') return this.reject('item-unavailable', 'That item has no uses remaining.');
  return this.resolveEventChoice(choice.id, response.instanceId, choice.itemId);
}
```

Extract the current accepted-resolution body into `resolveEventChoice(choiceId, selectedInstanceId, attemptedItemId)`. Pass `selectedInstanceId` into mutation helpers as the preferred concrete instance and add it to mutation exclusions only where the existing rule protects the attempted item. Do not add, remove, or reorder random calls after validation succeeds.

- [ ] **Step 5: Update all session tests to the discriminated response**

Use:

```ts
session.resolveEvent({ kind: 'item', choiceId: 'anchor', instanceId: 'anchor-1' });
session.resolveEvent({ kind: 'endure' });
```

Keep every existing outcome, delta, journal, and random-draw assertion.

- [ ] **Step 6: Run session and event suites and commit**

Run: `bun run test -- tests/eventItemSelection.test.ts tests/SurvivalSession.test.ts tests/eventResolver.test.ts tests/eventParityAudit.test.ts`

Expected: PASS with unchanged authored outcomes.

```bash
git add src/survival/eventItemSelection.ts src/survival/survivalTypes.ts src/survival/SurvivalSession.ts tests/eventItemSelection.test.ts tests/SurvivalSession.test.ts
git commit -m "feat: resolve events from exact physical items"
```

---

### Task 4: Exclusive Presentation Director

**Files:**
- Create: `src/survival/SurvivalPresentationDirector.ts`
- Create: `tests/SurvivalPresentationDirector.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PresentationRun {
  readonly generation: number;
  isCurrent(): boolean;
  wait(work: Promise<void>): Promise<boolean>;
}

export interface SurvivalPresentationCleanup {
  resetWorldPresentation(): void;
  clearUiPresentation(): void;
}

export class SurvivalPresentationDirector {
  constructor(cleanup: SurvivalPresentationCleanup);
  run(
    work: (run: PresentationRun) => Promise<void>,
    options?: { readonly hold?: boolean },
  ): Promise<boolean>;
  cancel(): void;
  dispose(): void;
}
```

- [ ] **Step 1: Write failing sequence tests**

```ts
it('cancels the previous run, resolves it false, and cleans both surfaces', async () => {
  const gate = deferred<void>();
  const cleanup = {
    resetWorldPresentation: vi.fn(),
    clearUiPresentation: vi.fn(),
  };
  const director = new SurvivalPresentationDirector(cleanup);
  const first = director.run(async (run) => { await run.wait(gate.promise); });
  const second = director.run(async () => undefined);
  gate.resolve();
  await expect(first).resolves.toBe(false);
  await expect(second).resolves.toBe(true);
  expect(cleanup.resetWorldPresentation).toHaveBeenCalledTimes(2);
  expect(cleanup.clearUiPresentation).toHaveBeenCalledTimes(2);
});

it('makes disposal idempotent and prevents later runs', async () => {
  const cleanup = { resetWorldPresentation: vi.fn(), clearUiPresentation: vi.fn() };
  const director = new SurvivalPresentationDirector(cleanup);
  director.dispose();
  director.dispose();
  await expect(director.run(async () => undefined)).resolves.toBe(false);
  expect(cleanup.resetWorldPresentation).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `bun run test -- tests/SurvivalPresentationDirector.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the director**

```ts
export class SurvivalPresentationDirector {
  private generation = 0;
  private disposed = false;
  private active = false;
  private held = false;

  constructor(private readonly cleanup: SurvivalPresentationCleanup) {}

  async run(
    work: (run: PresentationRun) => Promise<void>,
    options: { readonly hold?: boolean } = {},
  ): Promise<boolean> {
    if (this.disposed) return false;
    this.cancel();
    const generation = ++this.generation;
    this.active = true;
    const isCurrent = () => !this.disposed && generation === this.generation;
    const run: PresentationRun = {
      generation,
      isCurrent,
      wait: async (pending) => {
        await pending;
        return isCurrent();
      },
    };
    try {
      await work(run);
      return isCurrent();
    } finally {
      if (isCurrent()) {
        this.active = false;
        if (options.hold === true) this.held = true;
        else this.cleanupNow();
      }
    }
  }

  cancel(): void {
    if (this.disposed) return;
    this.generation += 1;
    if (this.active || this.held) this.cleanupNow();
  }

  dispose(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.disposed = true;
    this.cleanupNow();
  }

  private cleanupNow(): void {
    this.active = false;
    this.held = false;
    let firstError: unknown;
    try {
      this.cleanup.resetWorldPresentation();
    } catch (error) {
      firstError = error;
    }
    try {
      this.cleanup.clearUiPresentation();
    } catch (error) {
      if (firstError === undefined) firstError = error;
    }
    if (firstError !== undefined) throw firstError;
  }
}
```

Add:

```ts
it('runs both cleanup ports and rethrows the first cleanup error', async () => {
  const first = new Error('world cleanup failed');
  const gate = deferred<void>();
  const cleanup = {
    resetWorldPresentation: vi.fn(() => { throw first; }),
    clearUiPresentation: vi.fn(),
  };
  const director = new SurvivalPresentationDirector(cleanup);
  const running = director.run(async (run) => { await run.wait(gate.promise); });
  expect(() => director.cancel()).toThrow(first);
  expect(cleanup.clearUiPresentation).toHaveBeenCalledOnce();
  gate.resolve();
  await expect(running).resolves.toBe(false);
});
```

- [ ] **Step 4: Run the director tests and commit**

Run: `bun run test -- tests/SurvivalPresentationDirector.test.ts`

Expected: PASS.

```bash
git add src/survival/SurvivalPresentationDirector.ts tests/SurvivalPresentationDirector.test.ts
git commit -m "feat: serialize survival presentation sequences"
```

---

### Task 5: Boat Presentation Rig and Reusable Event Setpieces

**Files:**
- Create: `src/survival/BoatPresentation.ts`
- Modify: `src/survival/BoatWorld.ts`
- Create: `tests/BoatPresentation.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- Produces:

```ts
export type EventFamily = 'sighting' | 'floatingObject' | 'impact' | 'storm' | 'darkness';

export interface BoatPresentationHost {
  readonly camera: PerspectiveCamera;
  readonly cameraRig: Group;
  readonly scene: Scene;
  readonly props: ReadonlyMap<ItemInstanceId, Object3D>;
  readonly distantVessel: Object3D;
  readonly reducedMotion: Pick<MediaQueryList, 'matches'>;
}

export class BoatPresentation {
  constructor(host: BoatPresentationHost);
  playItem(instanceId: ItemInstanceId, cue: PresentationCue): Promise<void>;
  playEvent(family: EventFamily, cue: PresentationCue): Promise<void>;
  update(deltaSeconds: number): void;
  skip(): void;
  reset(): void;
  dispose(): void;
  resourceCountForTest(): number;
}
```

Also export:

```ts
export function eventFamilyForCue(cue: PresentationCue): EventFamily {
  if (cue === 'sighting' || cue === 'rescue') return 'sighting';
  if (cue === 'storm') return 'storm';
  if (cue === 'darkness' || cue === 'nightfall') return 'darkness';
  if (cue === 'impact' || cue === 'sinking') return 'impact';
  return 'floatingObject';
}
```

`BoatWorld` exposes `playItemPresentation(instanceId, cue)`, `playEventPresentation(family, cue)`, and `resetPresentation()`.

- [ ] **Step 1: Write failing presentation-rig tests**

```ts
it('lifts the exact prop and restores its authored transform', async () => {
  const propA = new Group();
  const propB = new Group();
  propA.position.set(1, 2, 3);
  const rig = createPresentation(new Map([['a', propA], ['b', propB]]));
  const playing = rig.playItem('a' as ItemInstanceId, 'impact');
  rig.update(0.45);
  expect(propA.position.equals(new Vector3(1, 2, 3))).toBe(false);
  expect(propB.position.equals(new Vector3())).toBe(true);
  rig.skip();
  await playing;
  rig.reset();
  expect(propA.position.toArray()).toEqual([1, 2, 3]);
});

it('constructs each event family once and reuses it', async () => {
  const rig = createPresentation();
  const first = rig.playEvent('floatingObject', 'impact');
  rig.skip();
  await first;
  const count = rig.resourceCountForTest();
  const second = rig.playEvent('floatingObject', 'impact');
  rig.skip();
  await second;
  expect(rig.resourceCountForTest()).toBe(count);
});
```

Add reduced-motion and exact-disposal tests.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- tests/BoatPresentation.test.ts tests/BoatWorld.test.ts`

Expected: FAIL because the presentation helper does not exist.

- [ ] **Step 3: Implement authored poses and transform capture**

Use immutable pose constants:

```ts
const BASE_CAMERA = Object.freeze({ position: [0, 0.78, 2.7], lookAt: [0, -0.2, -1.55] });
const ITEM_CAMERA = Object.freeze({ position: [0, 0.92, 2.18], lookAt: [0, 0.12, -1.25] });
const EVENT_CAMERA = Object.freeze({ position: [0, 1.02, 2.42], lookAt: [0, 0.28, -5.8] });

interface StoredTransform {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
}
```

Capture each prop transform once in the constructor. During item presentation, interpolate the selected prop toward a camera-facing foreground anchor while leaving every other prop untouched. Reduced motion applies the selected outline and final camera pose without interpolation.

- [ ] **Step 4: Build reusable original setpieces**

Construct one hidden root per family:

- `sighting`: reuse the existing distant vessel through an injected object.
- `floatingObject`: low-poly dark debris group with two owned box geometries and one owned material.
- `impact`: two reused ripple rings and one dark water silhouette.
- `storm`: reused spray sheets and light overrides; boat motion still comes from shared waves.
- `darkness`: one localized warm point light and surrounding visibility/tint override.

Store all owned geometries and materials in sets and use `disposeResourceSets()` once. Event calls only toggle visibility, opacity, transforms, and light values.

- [ ] **Step 5: Delegate from `BoatWorld` without changing update order**

Construct `BoatPresentation` after saved props exist. In `update()` call `presentation.update(delta)` after base camera/cue application and before `scene.updateMatrixWorld(true)`. Keep the order:

```text
shared-wave hull pose -> base camera -> presentation -> sky/ocean
-> final matrices -> fishing line -> water exclusion -> interaction projection
```

`BoatWorld.dispose()` calls `presentation.dispose()` before disposing shared scene resources.

- [ ] **Step 6: Run world tests and commit**

Run: `bun run test -- tests/BoatPresentation.test.ts tests/BoatWorld.test.ts tests/WaterExclusion.test.ts tests/BoatBuoyancy.test.ts`

Expected: PASS.

```bash
git add src/survival/BoatPresentation.ts src/survival/BoatWorld.ts tests/BoatPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "feat: stage boat items and event setpieces"
```

---

### Task 6: Scene-Led Event UI and Phase Orchestration

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/SurvivalPhaseFocus.test.ts`

**Interfaces:**
- Consumes: `EventResponse`, `eventItemSelections()`, `SurvivalPresentationDirector`, and the new `BoatWorld` presentation methods.
- Produces:

```ts
SurvivalUI.onEventItem:
  (response: Extract<EventResponse, { readonly kind: 'item' }>) => void;
SurvivalUI.showEventSelection(
  event: SurvivalEventDefinition,
  snapshot: SurvivalSnapshot,
  selections: readonly EventItemSelection[],
): void;
SurvivalUI.clearTransientPresentation(): void;
SurvivalPhase.openPendingEventForTest(): Promise<void>;
```

- [ ] **Step 1: Write failing UI and phase sequence tests**

```ts
it('uses scene captions and physical boat anchors instead of an event dialog', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  const event = testEvent(['map']);
  const state = snapshot();
  ui.setAnchors([{
    id: 'map-1', itemType: 'map', toolId: null, action: null,
    remainingUses: null, x: 200, y: 220, visible: true, depleted: false,
  }]);
  ui.showEventSelection(event, state, eventItemSelections(event, state.inventory));

  expect(mount.querySelector('[data-event][role="dialog"]')).toBeNull();
  expect(mount.querySelector('[data-event-items]')).toBeNull();
  const map = mount.querySelector<HTMLButtonElement>('[data-anchor-id="map-1"]')!;
  expect(map.dataset.eventChoice).toBe('map');
  expect(map.dataset.eventInstance).toBe('map-1');
  expect(map.dataset.eventEligible).toBe('true');
});

it('reveals an event before enabling selection and animates before resolving', async () => {
  const order: string[] = [];
  const rig = createPhaseRig({
    world: {
      playEventPresentation: vi.fn(async () => { order.push('reveal'); }),
      playItemPresentation: vi.fn(async () => { order.push('item'); }),
      resetPresentation: vi.fn(),
    },
    ui: {
      showEventSelection: vi.fn(() => { order.push('selection'); }),
      clearTransientPresentation: vi.fn(),
    },
    session: {
      resolveEvent: vi.fn(() => { order.push('resolve'); return acceptedEvent(); }),
    },
  });
  rig.phase.start();
  await rig.phase.openPendingEventForTest();
  rig.phase.handleEventItem({ kind: 'item', choiceId: 'map', instanceId: 'map-1' });
  await flushPromises();
  expect(order).toEqual(['reveal', 'selection', 'item', 'resolve']);
});
```

Add cancellation tests for restart/dispose during reveal and item lift; assert no late `resolveEvent` call and restored input/focus.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts`

Expected: FAIL because event UI is modal and phase resolves before physical animation.

- [ ] **Step 3: Convert the event overlay to a nonmodal scene caption**

Replace the event dialog with:

```ts
<section class="survival-event-caption" data-event aria-hidden="true" aria-live="polite">
  <p class="event-danger" data-event-danger></p>
  <h2 data-event-title></h2>
  <p data-event-prompt></p>
  <p class="event-target" data-event-target hidden></p>
  <button type="button" class="event-endure timber-action" data-endure hidden>ENDURE</button>
</section>
```

`showEventSelection()` sets `data-event-choice`, `data-event-instance`, `data-event-eligible`, and accessible reason text on existing anchor buttons. Ineligible buttons remain focusable with `aria-disabled="true"` and cannot emit a response. Endure is visible only when there is no eligible selection.

Add `private eventSelectionActive = false`. Remove `eventLayer` from `modalLayers`, and keep ordinary day-action buttons disabled while `eventSelectionActive` is true. Event anchor buttons stay focusable; only eligible event anchors activate. `clearTransientPresentation()` sets `eventSelectionActive = false`, hides the caption and Endure, removes all event data attributes from anchor buttons, and runs `syncCommandState()`.

Clicking or pressing Enter/Space on an eligible anchor emits:

```ts
this.onEventItem({
  kind: 'item',
  choiceId: button.dataset.eventChoice!,
  instanceId: button.dataset.eventInstance! as ItemInstanceId,
});
```

Handle `data-event-choice` before the ordinary `data-action` branch in `handleClick`, so a canned food, medical kit, or other dual-purpose anchor cannot accidentally run its day action during an event.

Replace the modal event CSS with:

```css
.survival-event-caption {
  position: absolute;
  top: 34px;
  left: 50%;
  z-index: 5;
  display: grid;
  justify-items: center;
  width: min(620px, calc(100vw - 360px));
  color: var(--ink-bone);
  text-align: center;
  text-shadow: 3px 3px 0 var(--ink-outline);
  opacity: 0;
  transform: translate(-50%, -8px);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: none;
}
.survival-event-caption.is-visible { opacity: 1; transform: translate(-50%, 0); }
.survival-event-caption .event-danger { margin: 0; color: var(--ink-yellow); }
.survival-event-caption h2 { margin: 2px 0; font-size: clamp(1.55rem, 3vw, 2.7rem); }
.survival-event-caption > p { margin: 0; }
.event-endure { margin-top: 14px; pointer-events: auto; }
.boat-anchor[data-event-eligible='true'] {
  outline: 4px solid var(--ink-yellow);
  filter: drop-shadow(0 0 12px #f0b13acc);
}
.boat-anchor[data-event-eligible='false'] { filter: grayscale(1) brightness(.55); }
```

Under reduced motion, set the caption transition to `1ms` and remove its transform.

- [ ] **Step 4: Integrate the director in `SurvivalPhase`**

Construct:

```ts
this.presentation = new SurvivalPresentationDirector({
  resetWorldPresentation: () => this.world.resetPresentation?.(),
  clearUiPresentation: () => this.ui.clearTransientPresentation?.(),
});
```

Event reveal:

```ts
private async openPendingEvent(snapshot: SurvivalSnapshot): Promise<void> {
  if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
  const event = survivalEventById(snapshot.pendingEventId);
  if (event === undefined) throw new Error(`Unknown pending survival event: ${snapshot.pendingEventId}`);
  this.setBusy(true);
  const completed = await this.presentation.run(async (run) => {
    if (!await run.wait(this.world.playEventPresentation?.(
      eventFamilyForCue(event.cue), event.cue,
    ) ?? Promise.resolve())) return;
  }, { hold: true });
  if (!completed) return;
  this.ui.showEventSelection?.(event, snapshot, eventItemSelections(event, snapshot.inventory));
  this.setBusy(false);
}
```

Item response:

```ts
private async runEventItem(response: Extract<EventResponse, { kind: 'item' }>): Promise<void> {
  if (!this.canAcceptCommand()) return;
  const eventState = this.session.snapshot().state;
  this.setBusy(true);
  const completed = await this.presentation.run(async (run) => {
    if (!await run.wait(this.world.playItemPresentation?.(
      response.instanceId, 'none',
    ) ?? Promise.resolve())) return;
    const outcome = this.session.resolveEvent?.(response);
    if (outcome === undefined || !outcome.accepted) {
      if (outcome !== undefined) this.ui.showFeedback?.(outcome);
      return;
    }
    await this.finishEventOutcome(outcome, eventState, run);
  });
  if (completed) this.setBusy(false);
}
```

Endure sends `{ kind: 'endure' }` and skips prop lift. Reuse the existing dawn and terminal behavior after the accepted outcome.

Extract the current accepted event-resolution tail exactly once:

```ts
private async finishEventOutcome(
  outcome: ActionOutcome,
  eventState: SurvivalState,
  run: PresentationRun,
): Promise<void> {
  if (!await run.wait(this.world.play?.(outcome.cue) ?? Promise.resolve())) return;
  let snapshot = this.renderSnapshot(false, false);
  this.ui.showFeedback?.(outcome);
  if (isTerminal(snapshot.state)) {
    this.presentTerminalOnce(snapshot);
    return;
  }
  if (eventState === 'nightEvent') {
    const dawn = this.session.beginDawn?.();
    if (dawn?.accepted && !await run.wait(this.world.play?.(dawn.cue) ?? Promise.resolve())) return;
    snapshot = this.renderSnapshot(false, false);
  }
  this.presentTerminalOnce(snapshot);
  this.ui.restoreCommandFocus?.();
}
```

- [ ] **Step 5: Wire lifecycle cleanup**

Call `presentation.cancel()` before restart and on phase-changing interruptions. Call `presentation.dispose()` before `world.dispose()` and `ui.dispose()`. Check the director token after every sleep, reveal, item, resolution, and dawn await.

Expose the existing private entry point only through the current test surface:

```ts
openPendingEventForTest(): Promise<void> {
  return this.openPendingEvent(this.session.snapshot());
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalSession.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css src/survival/SurvivalPhase.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts
git commit -m "feat: reveal survival events through the boat scene"
```

---

### Task 7: Sleep, Activity, and Fishing Presentation Polish

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `src/survival/BoatPresentation.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/BoatPresentation.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Produces: UI sleep stages `open | closing | covered | opening`; `BoatPresentation.playActivity(cue: PresentationCue): Promise<void>` and `playSleepGesture(): Promise<void>`; no gameplay API changes. `BoatWorld` adds test-only `cameraPoseForTest(): { position: [number, number, number]; lookAt: [number, number, number] }` and `rodForegroundForTest(): boolean`.

- [ ] **Step 1: Write failing sleep, reduced-motion, and fishing-view tests**

```ts
it('uses irregular eyelid stages and preserves noninteractive cover semantics', async () => {
  const mount = document.createElement('main');
  const ui = new SurvivalUI(mount, { matches: false });
  const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;
  const closing = ui.setSleepCovered(true);
  expect(cover.dataset.stage).toBe('closing');
  await vi.advanceTimersByTimeAsync(650);
  await closing;
  expect(cover.dataset.stage).toBe('covered');
  expect(cover.getAttribute('aria-hidden')).toBe('true');
});

it('uses a fixed bow tableau with the rod in the foreground', async () => {
  const world = createBoatWorld();
  const entering = world.enterFishingView();
  world.update(0, 1);
  await entering;
  expect(world.cameraPoseForTest()).toMatchObject({
    position: [0, 1.12, -1.45],
    lookAt: [0, -0.18, -6.2],
  });
  expect(world.rodForegroundForTest()).toBe(true);
});
```

Add a reduced-motion test that sleep uses opacity only, prop/tool gestures use their final static pose, and callback order is unchanged.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/BoatPresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts`

Expected: FAIL because stage data and the stronger fishing pose do not exist.

- [ ] **Step 3: Implement irregular sleep cover and hand/tool silhouette**

Use two pseudo-elements with asymmetric clip paths:

```css
.sleep-cover::before,
.sleep-cover::after {
  content: '';
  position: absolute;
  left: -5%;
  width: 110%;
  height: 58%;
  background: #010202;
  transition: transform 650ms cubic-bezier(.7, 0, .3, 1);
}
.sleep-cover::before { top: -8%; clip-path: polygon(0 0,100% 0,100% 78%,74% 91%,49% 82%,23% 94%,0 76%); transform: translateY(-100%); }
.sleep-cover::after { bottom: -8%; clip-path: polygon(0 24%,25% 8%,51% 18%,77% 6%,100% 25%,100% 100%,0 100%); transform: translateY(100%); }
.sleep-cover[data-stage='closing']::before,
.sleep-cover[data-stage='covered']::before,
.sleep-cover[data-stage='closing']::after,
.sleep-cover[data-stage='covered']::after { transform: translateY(0); }
```

Build one low-poly presentation-only hand/tool silhouette in `BoatPresentation`; allocate it once, hide it at base, and dispose its geometry/material with the other helper resources.

- [ ] **Step 4: Strengthen activity and fishing poses**

Use:

```ts
const FISHING_CAMERA = Object.freeze({
  position: [0, 1.12, -1.45],
  lookAt: [0, -0.18, -6.2],
});
```

Keep the existing cast point, shared-wave bobber height, line buffer reuse, bite timing, and fishing outcomes. Remove only the full-screen aiming reticle; retain the accessible instruction and bite target. Position the rod and hand/tool silhouette in the lower foreground during fishing.

- [ ] **Step 5: Route End Day through the director**

Sequence:

```text
lock commands -> playSleepGesture + nightfall -> close eyelids
-> render committed night snapshot while covered -> hold
-> reveal event or dawn -> restore base -> unlock commands/focus
```

Reduced motion uses the same order with 1 ms opacity transitions and static final presentation poses.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/BoatPresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts tests/FishingSession.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css src/survival/BoatPresentation.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts tests/SurvivalUI.test.ts tests/BoatPresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: polish survival activity and sleep staging"
```

---

### Task 8: Integrated Verification and Visual Acceptance

**Files:**
- No planned production edits; route every discovered regression back to the responsible task and add a focused test before correcting it.
- Test: all existing and added test files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a verified production build and browser-reviewed survival presentation.

- [ ] **Step 1: Run model policy checks**

Run: `bun run models:check`

Expected: both item and ship model checks pass. No asset metadata changes are expected because this plan adds no downloaded assets.

- [ ] **Step 2: Run the complete automated suite**

Run: `bun run test`

Expected: all Vitest suites pass with no unhandled promise rejections.

- [ ] **Step 3: Run static verification**

Run: `bun run typecheck`

Expected: TypeScript exits 0 with no diagnostics.

- [ ] **Step 4: Build production output**

Run: `bun run build`

Expected: Vite production build exits 0.

- [ ] **Step 5: Inspect survival at both authored viewport sizes**

Open the local game and check 1280 by 720 and 1920 by 1080:

1. top-left indicators are unchanged;
2. journal marker is upper-right and End Day is lower-right;
3. journal has a tall parchment, thick brown cover, three rings, four colored tabs, page-edge navigation, and bottom paper close strip;
4. physical props dominate the boat and item selection lifts the exact clicked prop;
5. event caption is sparse and no generic event dialog appears;
6. sighting, floating object, impact, storm, and darkness families visibly alter the world and restore afterward;
7. fishing uses the fixed bow tableau without a persistent reticle;
8. sleep closes irregular eyelids, holds black, and reveals night or dawn;
9. print texture is stable, the center remains readable, and the ink frame does not cover permanent controls.

- [ ] **Step 6: Inspect keyboard and reduced motion**

Repeat journal, one physical item event, fishing, End Day, pause, restart, and event interruption using keyboard only. Repeat with `prefers-reduced-motion: reduce`; verify state order is identical while camera travel, prop lift, gestures, jolts, and animated grain are removed.

- [ ] **Step 7: Check repository cleanliness and commit any scoped verification fixes**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional redesign files changed.

If a scoped correction was required, stage only its files and commit:

```bash
git commit -m "fix: complete survival presentation verification"
```
