# Centered HUD and Whole-Item Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the survival HUD, center every full-screen state and its vignette, and replace recovered-item dots with accessible whole-model interaction targets and model highlighting.

**Architecture:** Keep `SurvivalSession` and every survival snapshot field unchanged. `BoatWorld` projects each recovered prop's 3D bounds into a screen rectangle, `SurvivalUI` uses that rectangle for its existing accessible DOM button, and `SurvivalPhase` relays hover/focus identity back to `BoatWorld` for instance-local highlighting. Layout and overlay changes remain in the existing UI classes and stylesheet.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, DOM/CSS, Vitest 3.2 with jsdom, Bun, Vite 7.

## Global Constraints

- Keep `SurvivalSnapshot.hunger` and all hunger-based survival rules unchanged.
- Display Food as `clamp(100 - hunger, 0, 100)` and mark Food low at 30 or below.
- Remove only the persistent Food, Bait, Repair, and Rescue tallies; resource state, costs, outcome deltas, and fishing choices remain.
- Center scavenging start, pause, failure, and result states plus survival pause, fishing choice, event, outcome, and ending states.
- Recovered-item controls remain native DOM buttons with mouse, Tab, Shift+Tab, Enter, Space, ARIA descriptions, shortcuts, and unavailable explanations.
- Keep visible orange markers for the hull patch and horizon only.
- Preserve the existing reduced-motion media query; model highlighting changes state synchronously without adding animation.
- Preserve the unrelated performance-statistics work already present in `src/Game.ts`, `src/ui/PerformanceStats.ts`, and `src/styles/main.css`.
- Support the project's existing desktop keyboard-and-mouse viewport range; do not add touch controls or dependencies.

---

## File Map

- Modify `src/ui/SurvivalUI.ts`: Food presentation, tally removal, projected target sizing, hover/focus identity, and modal/busy cleanup.
- Leave `src/ui/GameUI.ts` unchanged: existing full-screen sections receive centered styling through their current classes.
- Modify `src/survival/BoatInteraction.ts`: projected rectangle types and pure 3D-bounds-to-screen helper.
- Modify `src/survival/BoatWorld.ts`: calculate item hit rectangles and apply instance-local model highlights.
- Modify `src/survival/SurvivalPhase.ts`: relay item highlight identity from UI to world.
- Modify `src/styles/main.css`: HUD zones, centered overlays/vignettes, item versus fixed target presentation, responsive rules, and FPS placement.
- Modify `tests/BoatInteraction.test.ts`: projection geometry and visibility tests.
- Modify `tests/BoatWorld.test.ts`: item rectangle and highlight restoration tests.
- Modify `tests/SurvivalUI.test.ts`: Food semantics, tally removal, target geometry, marker variants, hover/focus, and cleanup.
- Modify `tests/SurvivalPhase.test.ts`: highlight relay and disposal guard.
- Modify `tests/GameUI.test.ts`: centered scavenging screen contract.
- Modify `README.md`: describe the Food meter and remove the obsolete claim that loose stores are shown beside condition meters.

---

### Task 1: Food meter semantics and persistent tally removal

**Files:**
- Modify: `tests/SurvivalUI.test.ts:650-705, 907-922`
- Modify: `src/ui/SurvivalUI.ts:27-118, 190-205, 290-305, 552-584`
- Modify: `README.md:56-76`

**Interfaces:**
- Consumes: unchanged `SurvivalSnapshot.hunger: number` and loose-store fields.
- Produces: meter DOM still identified by `data-meter="hunger"`, but exposed as Food with `aria-valuenow = 100 - hunger`; no `.survival-stores` node.

- [ ] **Step 1: Write failing Food and tally tests**

Replace the hunger assertions in `uses each meter scale and direction for visual and accessible danger states` and the tally assertion in `renders illustrated conditions...` with these explicit expectations:

```ts
ui.render(snapshot({ health: 21, hunger: 20, energy: 4, hull: 21 }), () => null);

const food = mount.querySelector<HTMLElement>('[data-meter="hunger"]')!;
expect(food.getAttribute('aria-label')).toBe('FOOD');
expect(food.getAttribute('aria-valuenow')).toBe('80');
expect(food.style.getPropertyValue('--meter-value')).toBe('80%');
expect(food.querySelector('.survival-meter__label')?.textContent).toContain('FOOD');
expect(food.classList).not.toContain('is-danger');
expect(food.getAttribute('aria-valuetext')).toBeNull();

ui.render(snapshot({ health: 20, hunger: 70, energy: 1, hull: 20 }), () => null);

expect(food.getAttribute('aria-valuenow')).toBe('30');
expect(food.style.getPropertyValue('--meter-value')).toBe('30%');
expect(food.classList).toContain('is-danger');
expect(food.getAttribute('aria-valuetext')).toBe('30, low');
expect(food.querySelector('[data-meter-danger]')?.textContent).toBe('LOW');

ui.render(snapshot({ hunger: 90 }), () => null);
expect(food.getAttribute('aria-valuenow')).toBe('10');
expect(food.style.getPropertyValue('--meter-value')).toBe('10%');
expect(food.classList).toContain('is-danger');
```

Add this structural assertion to the illustrated-HUD test:

```ts
expect(mount.querySelector('.survival-stores')).toBeNull();
expect(mount.querySelector('[data-store]')).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify the intended failures**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because the meter still exposes Hunger values and `.survival-stores` still exists.

- [ ] **Step 3: Implement Food as a presentation transform**

Extend `MeterDefinition` with a display transform and make every definition explicit:

```ts
interface MeterDefinition {
  id: MeterId;
  label: string;
  min: number;
  max: number;
  dangerLabel: 'LOW' | 'HIGH';
  displayValue: (value: number) => number;
  isDanger: (value: number) => boolean;
}

const identity = (value: number): number => value;

const METERS: readonly MeterDefinition[] = [
  { id: 'health', label: 'HEALTH', min: 0, max: 100, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 20 },
  { id: 'hunger', label: 'FOOD', min: 0, max: 100, dangerLabel: 'LOW', displayValue: (value) => 100 - value, isDanger: (value) => value <= 30 },
  { id: 'energy', label: 'ENERGY', min: 0, max: 4, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 1 },
  { id: 'hull', label: 'HULL', min: 0, max: 100, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 20 },
];
```

In `updateMeter`, clamp the transformed display value rather than the raw snapshot value:

```ts
const displayed = definition.displayValue(value);
const safe = Math.min(definition.max, Math.max(definition.min, displayed));
const danger = definition.isDanger(safe);
```

Keep `data-meter="hunger"` and `METER_ARTWORK.hunger` unchanged so internal naming and the stomach artwork stay stable.

- [ ] **Step 4: Remove persistent tally markup and writes**

Delete this constructor markup:

```html
<section class="survival-stores survival-tallies" aria-label="Loose supplies">
  <span>FOOD <strong data-store="food">0</strong></span>
  <span>BAIT <strong data-store="bait">0</strong></span>
  <span>REPAIR <strong data-store="repairMaterial">0</strong></span>
  <span>RESCUE <strong data-store="rescueProgress">0</strong></span>
</section>
```

Delete the four `updateStore` calls from `render` and delete `updateStore`. Retain this assignment because the fishing-choice flow still consumes it:

```ts
this.availableBait = snapshot.bait;
```

- [ ] **Step 5: Update player documentation**

Replace the obsolete README sentence about stores beside the meters with:

```markdown
Health, Food, Energy, and Hull remain visible as condition meters. Food is the inverse of internal hunger, so it drains toward zero as the survivor becomes hungry. Food, bait, repair material, and rescue progress still exist as separate stores used by actions and outcomes, but they are not persistently tallied in the HUD.
```

- [ ] **Step 6: Run the focused suite and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts README.md
git commit -m "feat: present hunger as food meter"
```

---

### Task 2: Balanced HUD zones and centered full-screen states

**Files:**
- Modify: `tests/SurvivalUI.test.ts:48-66, 907-922`
- Modify: `tests/GameUI.test.ts:20-35`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `src/styles/main.css:66-80, 475-530, 537-556`

**Interfaces:**
- Consumes: existing `.poster-screen`, `.cinematic-overlay`, `.survival-meters`, `.journal-marker`, and `.performance-stats` classes.
- Produces: top-center journal, top-right conditions, FPS below conditions, fixed viewport-centered overlay backdrops, and bounded inner content wrappers that own vertical scrolling.

- [ ] **Step 1: Replace top-biased style assertions with centered contracts**

In `tests/SurvivalUI.test.ts`, replace `aligns cinematic backing panels...` with:

```ts
it('centers survival HUD zones, overlay content, and vignette backing', () => {
  expect(mainStyles).toMatch(/\.survival-meters\s*\{[^}]*right:\s*22px;[^}]*left:\s*auto;[^}]*transform-origin:\s*top right;/s);
  expect(mainStyles).toMatch(/\.journal-marker\s*\{[^}]*right:\s*auto;[^}]*left:\s*50%;[^}]*translateX\(-50%\)/s);
  expect(mainStyles).toMatch(/\.cinematic-overlay\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*overflow:\s*hidden;[^}]*circle at 50% 50%/s);
  expect(mainStyles).toMatch(/\.cinematic-overlay__content\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  expect(mainStyles).toMatch(/\.cinematic-overlay::before\s*\{[^}]*top:\s*50%;[^}]*translate\(-50%,\s*-50%\)/s);
  expect(mainStyles).toMatch(/\.performance-stats\s*\{[^}]*top:\s*112px;[^}]*right:\s*24px;/s);
});
```

Add this markup assertion to the same file so the centered journal remains a complete component:

```ts
it('keeps day, phase, weather, and artwork in one journal marker', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  const journal = mount.querySelector('.journal-marker')!;
  expect(journal.querySelector('[data-ui-artwork="journal"]')).not.toBeNull();
  expect(journal.querySelector('[data-day]')).not.toBeNull();
  expect(journal.querySelector('[data-phase]')).not.toBeNull();
  expect(journal.querySelector('[data-weather]')).not.toBeNull();
  ui.dispose();
});
```

Add to `tests/GameUI.test.ts`:

```ts
it('centers every scavenging poster screen and its vignette', () => {
  expect(mainStyles).toMatch(/\.screen\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*overflow:\s*hidden;[^}]*text-align:\s*center;/s);
  expect(mainStyles).toMatch(/\.screen__content\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  expect(mainStyles).toMatch(/\.poster-screen\s*\{[^}]*background:\s*radial-gradient\(circle at 50% 50%/s);
});
```

- [ ] **Step 2: Run both UI suites and verify failure**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/GameUI.test.ts`

Expected: FAIL because survival overlays still use `50% 38%`, poster screens are left-aligned, and HUD groups occupy the old corners.

- [ ] **Step 3: Wrap and center the scavenging screens**

Wrap the existing contents of each `GameUI` full-screen section in one `<div class="screen__content">`. Keep every section attribute and every existing descendant role, data attribute, live region, and focus target unchanged. Replace the base `.screen` rule and final `.poster-screen` override with these complete rules:

```css
.screen {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: safe center;
  justify-items: center;
  padding: clamp(28px, 7vw, 96px);
  overflow: hidden;
  text-align: center;
  background: radial-gradient(circle at 50% 50%, #172227f5 0 24%, #101719eb 56%, #030404f5 100%);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 260ms ease, visibility 260ms ease;
}

.screen__content {
  display: grid;
  align-content: safe center;
  justify-items: center;
  gap: 18px;
  width: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.poster-screen {
  justify-items: center;
  background: radial-gradient(circle at 50% 50%, #101415f2 0 24%, #07090ae8 60%, #020303fa 100%);
}
```

Keep all existing heading, control, error, and animation rules. The outer screen keeps its backdrop fixed with `overflow: hidden`; the bounded inner wrapper centers normal content and uses safe-start scrolling when its contents exceed the available height.

- [ ] **Step 4: Move the survival HUD groups and protect FPS placement**

Replace the final illustrated-HUD position overrides with:

```css
.survival-meters {
  top: 18px;
  right: 22px;
  left: auto;
  display: flex;
  width: auto;
  gap: 12px;
  padding: 0;
  border: 0;
  transform-origin: top right;
}

.journal-marker {
  top: 18px;
  right: auto;
  bottom: auto;
  left: 50%;
  min-width: 180px;
  padding: 8px 12px 8px 58px;
  border: 0;
  transform: translateX(-50%) rotate(1.2deg);
  transform-origin: top center;
}

.performance-stats {
  position: fixed;
  top: 112px;
  right: 24px;
  z-index: 6;
  padding: 6px 9px;
  border: 2px solid #28170f;
  background: #090b0ce6;
  color: var(--ink-yellow);
  font: 800 0.7rem/1 ui-monospace, 'Cascadia Mono', monospace;
  letter-spacing: 0.08em;
  text-shadow: 2px 2px 0 var(--ink-outline);
  text-transform: uppercase;
  clip-path: polygon(3% 4%, 100% 0, 97% 96%, 0 100%);
  pointer-events: none;
  user-select: none;
}
```

Remove the unused `.survival-tallies` overrides after Task 1 deletes the node.

- [ ] **Step 5: Wrap and center survival overlays and their backing vignette**

Wrap the existing contents of each `SurvivalUI` cinematic overlay in one `<div class="cinematic-overlay__content">`. Keep each section role, modal state, accessible label, data attribute, live region, focus target, and button unchanged. Replace the final cinematic rules and low-height override with:

```css
.cinematic-overlay {
  align-content: safe center;
  justify-items: center;
  padding: 24px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 50%, #090b0cbb, #030404f2 72%);
  text-align: center;
}

.cinematic-overlay__content {
  display: grid;
  align-content: safe center;
  justify-items: center;
  gap: 14px;
  width: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.cinematic-overlay::before {
  top: 50%;
  width: min(720px, calc(100vw - 48px));
  min-height: min(420px, calc(100dvh - 48px));
  border: 0;
  background: linear-gradient(95deg, transparent, #090b0cf2 10% 90%, transparent);
  clip-path: polygon(4% 0, 98% 5%, 100% 92%, 3% 100%, 0 48%);
  transform: translate(-50%, -50%);
}

.cinematic-overlay.is-visible::before {
  transform: translate(-50%, -50%);
}

.cinematic-overlay__content > * {
  width: min(620px, calc(100vw - 96px));
  text-align: center;
}

@media (max-width: 980px) {
  .survival-meters {
    gap: 5px;
    transform: scale(.86);
    transform-origin: top right;
  }

  .journal-marker {
    transform: translateX(-50%) scale(.88) rotate(1.2deg);
    transform-origin: top center;
  }

  .performance-stats { right: 16px; }
  .pocket-watch { right: 82px; }
}

@media (max-height: 760px) and (min-width: 761px) {
  .cinematic-overlay__content { gap: 8px; }
  .cinematic-overlay::before { min-height: min(360px, calc(100dvh - 32px)); }
  .event-items { max-height: 126px; }
}
```

- [ ] **Step 6: Run both UI suites and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts tests/GameUI.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts src/ui/GameUI.ts src/styles/main.css tests/SurvivalUI.test.ts tests/GameUI.test.ts
git commit -m "feat: center hud and full-screen states"
```

---

### Task 3: Project recovered-item bounds into screen rectangles

**Files:**
- Modify: `tests/BoatInteraction.test.ts`
- Modify: `tests/BoatWorld.test.ts:217-246`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/BoatWorld.ts:1-35, 284-318`

**Interfaces:**
- Consumes: Three.js `Box3`, `PerspectiveCamera`, and recovered prop `Object3D` world transforms.
- Produces: `projectBoatBounds(bounds, camera, width, height): ProjectedBoatBounds` and optional `BoatInteractionAnchor.hitArea: { width; height; depth }` for item anchors.

- [ ] **Step 1: Write projection helper tests**

Replace the imports and add these tests in `tests/BoatInteraction.test.ts`:

```ts
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { ACTION_FOR_ITEM, projectBoatAnchor, projectBoatBounds } from '../src/survival/BoatInteraction';

it('projects item bounds with padding, a minimum target, and camera depth', () => {
  const camera = new PerspectiveCamera(65, 2, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const bounds = new Box3(
    new Vector3(-0.05, -0.05, -2.05),
    new Vector3(0.05, 0.05, -1.95),
  );

  const projected = projectBoatBounds(bounds, camera, 1000, 500);

  expect(projected.visible).toBe(true);
  expect(projected.x).toBeCloseTo(500);
  expect(projected.y).toBeCloseTo(250);
  expect(projected.width).toBeGreaterThanOrEqual(44);
  expect(projected.height).toBeGreaterThanOrEqual(44);
  expect(projected.depth).toBeCloseTo(2);
});

it('clips partial bounds and hides empty, off-screen, and behind-camera bounds', () => {
  const camera = new PerspectiveCamera(65, 2, 0.1, 100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const partial = projectBoatBounds(
    new Box3(new Vector3(-3, -0.2, -2), new Vector3(-1, 0.2, -2)),
    camera,
    1000,
    500,
  );
  expect(partial.visible).toBe(true);
  expect(partial.x - partial.width / 2).toBeGreaterThanOrEqual(0);

  expect(projectBoatBounds(new Box3(), camera, 1000, 500).visible).toBe(false);
  expect(projectBoatBounds(
    new Box3(new Vector3(50, 50, -2), new Vector3(51, 51, -1)),
    camera,
    1000,
    500,
  ).visible).toBe(false);
  expect(projectBoatBounds(
    new Box3(new Vector3(-1, -1, 1), new Vector3(1, 1, 2)),
    camera,
    1000,
    500,
  ).visible).toBe(false);
});
```

- [ ] **Step 2: Run the helper suite and verify failure**

Run: `bun run test -- tests/BoatInteraction.test.ts`

Expected: FAIL because `projectBoatBounds` is not exported.

- [ ] **Step 3: Add the projected-bounds type and helper**

Add these declarations and helper to `src/survival/BoatInteraction.ts`, retaining `projectBoatAnchor` for fixed points:

```ts
import { Box3, type PerspectiveCamera, Vector3 } from 'three';

export interface BoatInteractionHitArea {
  width: number;
  height: number;
  depth: number;
}

export interface ProjectedBoatBounds extends BoatInteractionHitArea {
  x: number;
  y: number;
  visible: boolean;
}

export interface BoatInteractionAnchor {
  id: string;
  itemType: ItemId | null;
  action: DayActionId | null;
  x: number;
  y: number;
  visible: boolean;
  depleted: boolean;
  remainingUses: number | null;
  hitArea?: BoatInteractionHitArea;
}

const TARGET_PADDING = 8;
const MINIMUM_TARGET = 44;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

function hiddenBounds(): ProjectedBoatBounds {
  return { x: 0, y: 0, width: 0, height: 0, depth: 0, visible: false };
}

function cornersOf(bounds: Box3): Vector3[] {
  const { min, max } = bounds;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
  ];
}

export function projectBoatBounds(
  bounds: Box3,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  if (bounds.isEmpty() || viewportWidth <= 0 || viewportHeight <= 0) return hiddenBounds();
  camera.updateWorldMatrix(true, false);
  const center = bounds.getCenter(new Vector3());
  const cameraCenter = center.clone().applyMatrix4(camera.matrixWorldInverse);
  if (cameraCenter.z >= 0) return hiddenBounds();

  const screenPoints = cornersOf(bounds).map((corner) => {
    const projected = corner.project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * viewportWidth,
      y: (-projected.y * 0.5 + 0.5) * viewportHeight,
    };
  });
  if (screenPoints.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return hiddenBounds();

  const rawLeft = Math.min(...screenPoints.map(({ x }) => x));
  const rawRight = Math.max(...screenPoints.map(({ x }) => x));
  const rawTop = Math.min(...screenPoints.map(({ y }) => y));
  const rawBottom = Math.max(...screenPoints.map(({ y }) => y));
  if (rawRight < 0 || rawLeft > viewportWidth || rawBottom < 0 || rawTop > viewportHeight) return hiddenBounds();

  const clippedLeft = clamp(rawLeft - TARGET_PADDING, 0, viewportWidth);
  const clippedRight = clamp(rawRight + TARGET_PADDING, 0, viewportWidth);
  const clippedTop = clamp(rawTop - TARGET_PADDING, 0, viewportHeight);
  const clippedBottom = clamp(rawBottom + TARGET_PADDING, 0, viewportHeight);
  const width = Math.min(viewportWidth, Math.max(MINIMUM_TARGET, clippedRight - clippedLeft));
  const height = Math.min(viewportHeight, Math.max(MINIMUM_TARGET, clippedBottom - clippedTop));
  const rawX = (clippedLeft + clippedRight) / 2;
  const rawY = (clippedTop + clippedBottom) / 2;

  return {
    x: clamp(rawX, width / 2, viewportWidth - width / 2),
    y: clamp(rawY, height / 2, viewportHeight - height / 2),
    width,
    height,
    depth: -cameraCenter.z,
    visible: true,
  };
}
```

- [ ] **Step 4: Run the helper suite and verify it passes**

Run: `bun run test -- tests/BoatInteraction.test.ts`

Expected: PASS.

- [ ] **Step 5: Make `BoatWorld` publish item hit areas**

Import `Box3` and `projectBoatBounds`. Replace the saved-prop projection body with:

```ts
const itemAnchors = this.savedProps.map(({ instance, prop }) => {
  const projection = projectBoatBounds(
    new Box3().setFromObject(prop, true),
    this.camera,
    width,
    height,
  );
  const { width: hitWidth, height: hitHeight, depth, ...point } = projection;
  return {
    id: instance.instanceId,
    itemType: instance.type,
    action: ACTION_FOR_ITEM[instance.type] ?? null,
    ...point,
    visible: prop.visible && point.visible,
    depleted: prop.userData.depleted === true,
    remainingUses: prop.userData.remainingUses as number | null,
    hitArea: { width: hitWidth, height: hitHeight, depth },
  } satisfies BoatInteractionAnchor;
});
```

Keep fixed anchors on `projectBoatAnchor`; they intentionally have no `hitArea`.

Extend the existing BoatWorld projection test with:

```ts
const itemAnchor = anchors.find(({ id }) => id === 'fishingRod-1')!;
const fixedAnchor = anchors.find(({ id }) => id === 'horizon')!;
expect(itemAnchor.hitArea).toEqual({
  width: expect.any(Number),
  height: expect.any(Number),
  depth: expect.any(Number),
});
expect(itemAnchor.hitArea!.width).toBeGreaterThanOrEqual(44);
expect(itemAnchor.hitArea!.height).toBeGreaterThanOrEqual(44);
expect(fixedAnchor.hitArea).toBeUndefined();
```

- [ ] **Step 6: Run projection/world suites and commit**

Run: `bun run test -- tests/BoatInteraction.test.ts tests/BoatWorld.test.ts`

Expected: PASS.

```bash
git add src/survival/BoatInteraction.ts src/survival/BoatWorld.ts tests/BoatInteraction.test.ts tests/BoatWorld.test.ts
git commit -m "feat: project item interaction bounds"
```

---

### Task 4: Use whole-item DOM targets while retaining fixed markers

**Files:**
- Modify: `tests/SurvivalUI.test.ts:68-190`
- Modify: `src/ui/SurvivalUI.ts:300-330, 489-545`
- Modify: `src/styles/main.css:220-315, 495-505`

**Interfaces:**
- Consumes: optional `BoatInteractionAnchor.hitArea` from Task 3.
- Produces: item buttons with `data-target-kind="item"`, projected dimensions, and depth stacking; fixed buttons with `data-target-kind="fixed"` and the existing dot.

- [ ] **Step 1: Write failing whole-target tests**

Update the projected-item tooltip test to supply an explicit hit area and assert the DOM geometry:

```ts
ui.setAnchors([{
  id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish', remainingUses: null,
  x: 320, y: 240, visible: true, depleted: false,
  hitArea: { width: 96, height: 52, depth: 2.4 },
}]);

const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-1"]')!;
expect(anchor.dataset.targetKind).toBe('item');
expect(anchor.style.transform).toBe('translate(320px, 240px)');
expect(anchor.style.width).toBe('96px');
expect(anchor.style.height).toBe('52px');
expect(anchor.style.marginLeft).toBe('-48px');
expect(anchor.style.marginTop).toBe('-26px');
expect(Number(anchor.style.zIndex)).toBeGreaterThan(0);
```

Add a fixed-target assertion:

```ts
const fixed = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-patch"]')!;
expect(fixed.dataset.targetKind).toBe('fixed');
expect(fixed.style.width).toBe('');
expect(fixed.style.height).toBe('');
```

Replace the old active-dot CSS assertion with:

```ts
expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="item"\]::before\s*\{[^}]*content:\s*none;/s);
expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="fixed"\]::before\s*\{[^}]*background:\s*var\(--anchor-accent\);/s);
expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="item"\]\[aria-disabled="true"\]\s*\{[^}]*border-color:\s*transparent;/s);
```

- [ ] **Step 2: Run the UI suite and verify failure**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because anchors do not expose target kind or projected dimensions and all anchors still draw dots.

- [ ] **Step 3: Apply projected geometry in `setAnchors`**

After setting each button's transform, add:

```ts
const itemTarget = anchor.itemType !== null;
button.dataset.targetKind = itemTarget ? 'item' : 'fixed';
if (itemTarget) {
  const hitArea = anchor.hitArea ?? { width: 54, height: 54, depth: 0 };
  const targetWidth = Math.round(hitArea.width);
  const targetHeight = Math.round(hitArea.height);
  button.style.width = `${targetWidth}px`;
  button.style.height = `${targetHeight}px`;
  button.style.marginLeft = `${-targetWidth / 2}px`;
  button.style.marginTop = `${-targetHeight / 2}px`;
  button.style.zIndex = String(Math.max(1, 100000 - Math.round(hitArea.depth * 100)));
} else {
  button.style.removeProperty('width');
  button.style.removeProperty('height');
  button.style.removeProperty('margin-left');
  button.style.removeProperty('margin-top');
  button.style.removeProperty('z-index');
}
```

The button remains centered at `(x, y)`; negative half-size margins make the rectangle cover the projected model footprint.

- [ ] **Step 4: Split item and fixed marker styling**

Replace the generic marker rule with these variants:

```css
.boat-anchor[data-target-kind="item"] {
  border-color: transparent;
  border-radius: 0;
  background: transparent;
}

.boat-anchor[data-target-kind="item"]::before {
  content: none;
}

.boat-anchor[data-target-kind="item"][aria-disabled="true"] {
  border-color: transparent;
}

.boat-anchor[data-target-kind="fixed"]::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 3px solid #090b0c;
  border-radius: 50%;
  background: var(--anchor-accent);
  box-shadow: 0 0 0 2px #f2ead799;
  transform: translate(-50%, -50%);
}

.boat-anchor[data-target-kind="fixed"]:not(:disabled):not([aria-disabled="true"]):active::before {
  transform: translate(-50%, -50%) scale(.78);
}

.boat-anchor[data-target-kind="fixed"][aria-disabled="true"]::before,
.boat-anchor[data-target-kind="fixed"].is-depleted::before {
  opacity: .46;
}
```

Retain the generic tooltip, pointer, focus-visible, disabled-cursor, and fixed End Day tooltip rules. The focus outline now traces the item-sized transparent button without restoring a dot.

- [ ] **Step 5: Run the UI suite and commit**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: PASS.

```bash
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: make recovered items fully clickable"
```

---

### Task 5: Highlight hovered and focused 3D item instances

**Files:**
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `src/survival/BoatWorld.ts:120-180, 270-320, 397-420`
- Modify: `src/ui/SurvivalUI.ts:135-185, 270-290, 465-490, 595-660, 735-810`
- Modify: `src/survival/SurvivalPhase.ts:240-275`

**Interfaces:**
- Consumes: item anchor IDs and `BoatWorld.savedPropByInstanceId`.
- Produces: `SurvivalUI.onAnchorHighlight: (anchorId: string | null) => void` and `BoatWorld.setHighlightedItem(instanceId: string | null): void`.

- [ ] **Step 1: Write the world highlight restoration test**

Add to `tests/BoatWorld.test.ts`:

```ts
it('highlights only the selected instance and restores depleted presentation', () => {
  const savedItems = [savedItem('ductTape'), savedItem('ductTape', 2)];
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(),
    { matches: false } as MediaQueryList,
    propModels,
    savedItems,
  );
  const inventory = createSurvivalInventory(savedItems);
  inventory.ductTape.charges = 1;
  world.syncInventory(snapshot(savedItems, { inventory }));

  const first = world.scene.getObjectByName('prop:ductTape-1')!;
  const second = world.scene.getObjectByName('prop:ductTape-2')!;
  const firstMaterial = firstMesh(first).material as MeshStandardMaterial;
  const secondMaterial = firstMesh(second).material as MeshStandardMaterial;
  const firstEmissive = firstMaterial.emissive.getHex();
  const secondEmissive = secondMaterial.emissive.getHex();
  const depletedColor = secondMaterial.color.getHex();

  world.setHighlightedItem('ductTape-2');
  expect(secondMaterial.emissive.getHex()).not.toBe(secondEmissive);
  expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);

  world.setHighlightedItem(null);
  expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
  expect(secondMaterial.color.getHex()).toBe(depletedColor);

  world.setHighlightedItem('missing-instance');
  expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);
  expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
  world.dispose();
  propModels.dispose();
});
```

- [ ] **Step 2: Run the world suite and verify failure**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: FAIL because `setHighlightedItem` does not exist.

- [ ] **Step 3: Implement instance-local model highlighting**

Add this helper and state to `BoatWorld.ts`:

```ts
interface InteractionHighlightState {
  emissive: number;
  emissiveIntensity: number;
}

function setPropHighlighted(root: Object3D, highlighted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const state = material.userData.interactionHighlight as InteractionHighlightState | undefined;
    if (state === undefined) {
      material.userData.interactionHighlight = {
        emissive: material.emissive.getHex(),
        emissiveIntensity: material.emissiveIntensity,
      } satisfies InteractionHighlightState;
    }
    const original = material.userData.interactionHighlight as InteractionHighlightState;
    if (highlighted) {
      material.emissive.setHex(0x6f4218);
      material.emissiveIntensity = Math.max(.65, original.emissiveIntensity);
    } else {
      material.emissive.setHex(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    }
  });
}
```

Do not add a tween or timer around this helper. Immediate emissive changes preserve the existing reduced-motion contract while keeping hover and keyboard focus visible.

Add the field and public method:

```ts
private highlightedItemId: string | null = null;

setHighlightedItem(instanceId: string | null): void {
  if (this.disposed || instanceId === this.highlightedItemId) return;
  if (this.highlightedItemId !== null) {
    const previous = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
    if (previous !== undefined) setPropHighlighted(previous, false);
  }
  this.highlightedItemId = null;
  if (instanceId === null) return;
  const next = this.savedPropByInstanceId.get(instanceId as ItemInstance['instanceId']);
  if (next === undefined || !next.visible) return;
  setPropHighlighted(next, true);
  this.highlightedItemId = instanceId;
}
```

At the end of `syncInventory`, clear a highlight whose consumed prop became hidden:

```ts
if (this.highlightedItemId !== null) {
  const highlighted = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
  if (highlighted === undefined || !highlighted.visible) this.setHighlightedItem(null);
}
```

At the start of `dispose`, call `this.setHighlightedItem(null)` before setting `this.disposed = true`.

- [ ] **Step 4: Run the world suite and verify it passes**

Run: `bun run test -- tests/BoatWorld.test.ts`

Expected: PASS.

- [ ] **Step 5: Write UI hover/focus and cleanup tests**

Add to `tests/SurvivalUI.test.ts`:

```ts
it('publishes item hover and focus while ignoring fixed anchors and clearing for modals', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = createUI(mount);
  const highlight = vi.fn();
  ui.onAnchorHighlight = highlight;
  ui.render(snapshot(), () => null);
  const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;
  const fixed = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-patch"]')!;

  item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
  item.focus();
  item.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
  expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
  item.blur();
  expect(highlight).toHaveBeenLastCalledWith(null);

  fixed.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  expect(highlight).toHaveBeenLastCalledWith(null);

  item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves.', danger: 'dangerous' }, snapshot());
  expect(highlight).toHaveBeenLastCalledWith(null);
});

it('clears item highlighting when busy, removed, and disposed', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  const highlight = vi.fn();
  ui.onAnchorHighlight = highlight;
  const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;

  item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  ui.setBusy(true);
  expect(highlight).toHaveBeenLastCalledWith(null);

  ui.setBusy(false);
  item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  ui.setAnchors([]);
  expect(highlight).toHaveBeenLastCalledWith(null);

  ui.dispose();
  expect(highlight).toHaveBeenLastCalledWith(null);
});
```

- [ ] **Step 6: Implement UI highlight state and delegated events**

Add the public callback and private fields:

```ts
onAnchorHighlight: (anchorId: string | null) => void = () => undefined;

private hoveredAnchorId: string | null = null;
private focusedAnchorId: string | null = null;
private publishedAnchorId: string | null = null;
```

Register the delegated listeners in the constructor:

```ts
this.root.addEventListener('pointerover', this.handleAnchorPointerOver);
this.root.addEventListener('pointerout', this.handleAnchorPointerOut);
this.root.addEventListener('focusin', this.handleAnchorFocusIn);
this.root.addEventListener('focusout', this.handleAnchorFocusOut);
```

Add these helpers and handlers:

```ts
private itemAnchorId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>('.boat-anchor[data-target-kind="item"]');
  return button !== null && this.root.contains(button) ? button.dataset.anchorId ?? null : null;
}

private publishAnchorHighlight(): void {
  const next = this.focusedAnchorId ?? this.hoveredAnchorId;
  if (next === this.publishedAnchorId) return;
  this.publishedAnchorId = next;
  this.onAnchorHighlight(next);
}

private clearAnchorHighlight(): void {
  this.hoveredAnchorId = null;
  this.focusedAnchorId = null;
  this.publishAnchorHighlight();
}

private readonly handleAnchorPointerOver = (event: Event): void => {
  this.hoveredAnchorId = this.itemAnchorId(event.target);
  this.publishAnchorHighlight();
};

private readonly handleAnchorPointerOut = (event: Event): void => {
  const pointerEvent = event as MouseEvent;
  const current = this.itemAnchorId(event.target);
  if (current === null || this.itemAnchorId(pointerEvent.relatedTarget) === current) return;
  if (this.hoveredAnchorId === current) this.hoveredAnchorId = null;
  this.publishAnchorHighlight();
};

private readonly handleAnchorFocusIn = (event: FocusEvent): void => {
  this.focusedAnchorId = this.itemAnchorId(event.target);
  this.publishAnchorHighlight();
};

private readonly handleAnchorFocusOut = (event: FocusEvent): void => {
  const current = this.itemAnchorId(event.target);
  if (current === null || this.itemAnchorId(event.relatedTarget) === current) return;
  if (this.focusedAnchorId === current) this.focusedAnchorId = null;
  this.publishAnchorHighlight();
};
```

Use these exact integrations for busy state, anchor removal, modal opening, and disposal:

```ts
setBusy(busy: boolean): void {
  if (this.disposed || this.busy === busy) return;
  this.busy = busy;
  if (busy) {
    this.clearAnchorHighlight();
    this.root.setAttribute('aria-busy', 'true');
  } else {
    this.root.removeAttribute('aria-busy');
  }
  this.syncCommandState();
}

// In setAnchors, after collecting `seen` and before removing stale buttons:
if (this.publishedAnchorId !== null && !seen.has(this.publishedAnchorId)) {
  this.clearAnchorHighlight();
}

private showLayer(layer: HTMLElement): void {
  this.clearAnchorHighlight();
  layer.classList.add('is-visible');
  this.syncBackgroundInteraction();
}
```

At the start of `dispose`, call `clearAnchorHighlight()` before setting `disposed = true`, remove the four delegated listeners, and reset the callback:

```ts
this.clearAnchorHighlight();
this.disposed = true;
this.root.removeEventListener('pointerover', this.handleAnchorPointerOver);
this.root.removeEventListener('pointerout', this.handleAnchorPointerOut);
this.root.removeEventListener('focusin', this.handleAnchorFocusIn);
this.root.removeEventListener('focusout', this.handleAnchorFocusOut);
this.onAnchorHighlight = () => undefined;
```

- [ ] **Step 7: Wire highlight identity through `SurvivalPhase` and test it**

Add this test to `tests/SurvivalPhase.test.ts`:

```ts
it('relays item highlight identity to the world and ignores it after disposal', () => {
  const setHighlightedItem = vi.fn();
  const ui: Partial<SurvivalUI> = { dispose: vi.fn() };
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => snapshot()) },
    world: { setHighlightedItem, dispose: vi.fn() },
    ui,
  });

  ui.onAnchorHighlight?.('fishingRod-1');
  ui.onAnchorHighlight?.(null);
  expect(setHighlightedItem).toHaveBeenNthCalledWith(1, 'fishingRod-1');
  expect(setHighlightedItem).toHaveBeenNthCalledWith(2, null);

  phase.dispose();
  ui.onAnchorHighlight?.('fishingRod-1');
  expect(setHighlightedItem).toHaveBeenCalledTimes(2);
});
```

Import the UI type and add this assignment in `wireUI`:

```ts
this.ui.onAnchorHighlight = (anchorId) => {
  if (!this.disposed) this.world.setHighlightedItem?.(anchorId);
};
```

- [ ] **Step 8: Run focused integration tests**

Run: `bun run test -- tests/BoatWorld.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts`

Expected: PASS.

- [ ] **Step 9: Run complete verification and commit**

Run: `bun run typecheck`

Expected: exit code 0 with no TypeScript diagnostics.

Run: `bun run test`

Expected: every Vitest file passes.

Run: `bun run build`

Expected: TypeScript and Vite production build complete successfully and write `dist/`.

```bash
git add src/ui/SurvivalUI.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: highlight interactive boat items"
```

After committing, run `git status --short` and confirm that only pre-existing unrelated worktree changes remain.
