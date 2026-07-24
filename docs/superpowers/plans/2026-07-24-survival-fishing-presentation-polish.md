# Survival Fishing Presentation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center and lean the survival fishing rod, align its line to the visible tip, move the fishing composition into open water, animate staggered fading bite bubbles, remove the visible fishing instruction panel, and show one lightning emoji per energy point in physical-action tooltips.

**Architecture:** Keep gameplay and input sequencing unchanged. `BoatWorld` owns all authored fishing transforms, render resources, deterministic bubble animation, and disposal; `SurvivalUI` owns fishing overlay markup, focus, live announcements, and cost presentation; `SurvivalPhase` continues passing existing fishing states without new rules.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, HTML/CSS, Vite 7, Vitest 3, jsdom

## Global Constraints

- Do not change fishing odds, rewards, bait use, energy balance, bite timing, or day progression.
- Keep all fishing presentation deterministic; bubble phase is a pure function of elapsed time and pool index.
- Use the shared wave field as the source of truth for the bobber, bubbles, and bite projection.
- Allocate no objects, geometry, materials, or temporary collections in per-frame update paths.
- Give every new Three.js material one owner and dispose it exactly once.
- Preserve pointer casting, pointer reeling, `Enter`/`Space` controls, live announcements, and focus restoration.
- Keep desktop 16:9 and 4:3 layouts supported and honor `prefers-reduced-motion`.
- Add no third-party assets, dependencies, touch controls, saves, crewmates, multiplayer, or persistent progression.
- Preserve all unrelated working-tree changes and stage only the files named by each task.

## File Structure

- Modify `src/ui/SurvivalUI.ts`: remove visible fishing instruction markup, preserve accessible state announcements and focus, and format action energy indicators.
- Modify `src/styles/main.css`: remove obsolete instruction-panel rules and align the aiming reticle with the open-water camera target.
- Modify `tests/SurvivalUI.test.ts`: lock the tooltip energy mapping, explicit accessible wording, panel removal, and retained fishing controls/live region.
- Modify `src/survival/BoatWorld.ts`: author rod/camera/cast transforms, derive a rod-local tip anchor, and own deterministic per-bubble materials and animation.
- Modify `tests/BoatWorld.test.ts`: lock spatial composition, line origin, cast region, bubble staggering, reduced-motion behavior, pooling, and disposal.

---

### Task 1: Remove the fishing instruction panel and add energy-cost tooltips

**Files:**
- Modify: `src/ui/SurvivalUI.ts:20-78`
- Modify: `src/ui/SurvivalUI.ts:180-250`
- Modify: `src/ui/SurvivalUI.ts:286-305`
- Modify: `src/ui/SurvivalUI.ts:375-395`
- Modify: `src/ui/SurvivalUI.ts:569-605`
- Modify: `src/ui/SurvivalUI.ts:815-875`
- Modify: `src/ui/SurvivalUI.ts:1045-1060`
- Modify: `src/styles/main.css:381-405`
- Test: `tests/SurvivalUI.test.ts:130-165`
- Test: `tests/SurvivalUI.test.ts:455-490`
- Test: `tests/SurvivalUI.test.ts:885-950`

**Interfaces:**
- Consumes: `SURVIVAL_BALANCE.actions.{fishEnergy,diveEnergy,repairEnergy,bottledPaperEnergy}` and the existing `ActionDefinition`, `BoatInteractionAnchor`, and `FishingUiState`.
- Produces: `ActionDefinition.energyCost: number`, compact visible tooltip text, explicit accessible energy wording, and a focusable instruction-free fishing layer.

- [ ] **Step 1: Write failing tooltip-cost tests**

Replace the existing repair/scuba/fishing tooltip assertions and extend the bottled-paper test with this exact contract:

```ts
expect(mount.querySelector('[data-action="sendMessage"] [role="tooltip"]')?.textContent)
  .toBe('BOTTLED PAPER ⚡');
expect(mount.querySelector('[data-action="sendMessage"]')?.getAttribute('aria-label'))
  .toBe('BOTTLED PAPER, one energy');

expect(repair.querySelector('[role="tooltip"]')?.textContent)
  .toBe('PLANK & HAMMER ⚡⚡');
expect(repair.getAttribute('aria-label')).toBe('PLANK & HAMMER, two energy');

expect(anchor.querySelector('[role="tooltip"]')?.textContent)
  .toBe('SCUBA GEAR ⚡⚡⚡');
expect(anchor.getAttribute('aria-label')).toBe('SCUBA GEAR, three energy');

expect(button.querySelector('[role="tooltip"]')?.textContent)
  .toBe('Fishing rod ⚡');
expect(button.getAttribute('aria-label')).toBe('Fishing rod, one energy');
expect(button.getAttribute('aria-description')).toContain('1 ENERGY');
```

Add a non-energy regression using an energy bar anchor:

```ts
ui.setAnchors([{
  id: 'energyBar-1',
  itemType: 'energyBar',
  toolId: null,
  action: 'useEnergyBar',
  remainingUses: 1,
  x: 140,
  y: 180,
  visible: true,
  depleted: false,
}]);
const energyBar = mount.querySelector<HTMLButtonElement>('[data-anchor-id="energyBar-1"]')!;
expect(energyBar.querySelector('[role="tooltip"]')?.textContent).toBe('ENERGY BAR');
expect(energyBar.getAttribute('aria-label')).toBe('ENERGY BAR');
```

- [ ] **Step 2: Run the tooltip tests to verify they fail**

Run:

```powershell
bun run test -- tests/SurvivalUI.test.ts -t "energy|repair tools|fishing rod|one-use actions"
```

Expected: FAIL because current visible tooltips contain no lightning suffix and accessible labels contain no worded energy cost.

- [ ] **Step 3: Add energy costs to action definitions and format tooltip content**

In `src/ui/SurvivalUI.ts`, add the field and populate it from balance constants:

```ts
interface ActionDefinition {
  id: DayActionId;
  label: string;
  shortcut: string;
  cost: string;
  energyCost: number;
  effect: string;
  risk: 'safe' | 'uncertain' | 'dangerous';
}

const ACTIONS: readonly ActionDefinition[] = [
  {
    id: 'fish',
    label: 'FISH',
    shortcut: '1',
    cost: '1 ENERGY',
    energyCost: SURVIVAL_BALANCE.actions.fishEnergy,
    effect: 'Chance to gain food',
    risk: 'uncertain',
  },
  {
    id: 'dive',
    label: 'DIVE',
    shortcut: '2',
    cost: '3 ENERGY',
    energyCost: SURVIVAL_BALANCE.actions.diveEnergy,
    effect: 'May recover supplies; injury risk',
    risk: 'dangerous',
  },
  { id: 'eat', label: 'EAT', shortcut: '3', cost: '1 FOOD', energyCost: 0, effect: 'HUNGER -35', risk: 'safe' },
  {
    id: 'repair',
    label: 'REPAIR',
    shortcut: '4',
    cost: '2 ENERGY + MATERIAL',
    energyCost: SURVIVAL_BALANCE.actions.repairEnergy,
    effect: 'HULL +25 (tape +15)',
    risk: 'safe',
  },
  { id: 'treat', label: 'TREAT', shortcut: '5', cost: '1 MEDKIT', energyCost: 0, effect: 'HEALTH +30', risk: 'safe' },
  { id: 'endDay', label: 'END DAY', shortcut: '7', cost: 'REST', energyCost: 0, effect: 'RESTORE ENERGY AT DAWN', risk: 'safe' },
  { id: 'repairItem', label: 'REPAIR ITEM', shortcut: '', cost: '1 DUCT TAPE', energyCost: 0, effect: 'Restore one broken item', risk: 'safe' },
  {
    id: 'sendMessage',
    label: 'SEND MESSAGE',
    shortcut: '',
    cost: '1 ENERGY',
    energyCost: SURVIVAL_BALANCE.actions.bottledPaperEnergy,
    effect: 'RESCUE +15',
    risk: 'safe',
  },
  { id: 'useEnergyBar', label: 'EAT ENERGY BAR', shortcut: '', cost: '1 ENERGY BAR', energyCost: 0, effect: 'ENERGY TO 3', risk: 'safe' },
];

const ENERGY_WORDS = ['', 'one', 'two', 'three'] as const;

function spokenEnergyCost(cost: number): string | null {
  if (cost <= 0) return null;
  return `${ENERGY_WORDS[cost] ?? String(cost)} energy`;
}
```

In `refreshAnchorTooltip`, replace the current `visibleText` assignment and `tooltip.textContent` call:

```ts
const visibleLabel = anchor.toolId === 'fishingRod' ? 'Fishing rod' : itemLabel;
const energyCost = action?.energyCost ?? 0;
const energyIndicator = '⚡'.repeat(energyCost);
const tooltip = requireElement<HTMLElement>(button, '[role="tooltip"]');
tooltip.replaceChildren(document.createTextNode(visibleLabel));
if (energyIndicator !== '') {
  tooltip.append(document.createTextNode(' '));
  const indicator = document.createElement('span');
  indicator.className = 'boat-tooltip__energy';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.textContent = energyIndicator;
  tooltip.append(indicator);
}
const spokenCost = spokenEnergyCost(energyCost);
button.setAttribute(
  'aria-label',
  spokenCost === null ? visibleLabel : `${visibleLabel}, ${spokenCost}`,
);
button.setAttribute('aria-description', text);
```

Keep `text` and `preview.cost` unchanged so existing detailed descriptions and unavailable reasons remain intact.

- [ ] **Step 4: Run the tooltip tests to verify they pass**

Run:

```powershell
bun run test -- tests/SurvivalUI.test.ts -t "energy|repair tools|fishing rod|one-use actions"
```

Expected: PASS.

- [ ] **Step 5: Write a failing instruction-panel removal test**

Replace `renders every fishing mode with exact interaction copy` with:

```ts
it('keeps fishing state announcements and controls without a visible instruction panel', async () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);
  const layer = mount.querySelector<HTMLElement>('[data-fishing]')!;
  const live = mount.querySelector<HTMLElement>('[data-fishing-live]')!;

  expect(mount.querySelector('[data-fishing-instruction]')).toBeNull();
  expect(mount.querySelector('.fishing-instruction-panel')).toBeNull();

  ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
  await Promise.resolve();
  expect(layer.classList).toContain('is-visible');
  expect(layer.dataset.mode).toBe('aiming');
  expect(live.textContent).toBe('CLICK THE WATER TO CAST');
  expect(mount.querySelector('[data-fishing-reticle]')).not.toBeNull();

  ui.setFishingState({
    mode: 'bite',
    message: 'BITE - REEL NOW',
    biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
  });
  await Promise.resolve();
  expect(live.getAttribute('aria-live')).toBe('assertive');
  expect(live.textContent).toBe('BITE - REEL NOW');
  expect(mount.querySelector<HTMLButtonElement>('[data-fishing-bite]')?.hidden).toBe(false);

  ui.setFishingState({ mode: 'hidden', message: '', biteTarget: null });
  expect(layer.classList).not.toContain('is-visible');
  ui.dispose();
});
```

- [ ] **Step 6: Run the panel test to verify it fails**

Run:

```powershell
bun run test -- tests/SurvivalUI.test.ts -t "without a visible instruction panel"
```

Expected: FAIL because the panel still exists.

- [ ] **Step 7: Remove the panel while preserving focus and announcements**

In the fishing-layer markup, make the region programmatically focusable and delete only the instruction panel:

```html
<section class="fishing-layer" data-fishing role="region" aria-label="Fishing interaction" aria-hidden="true" inert tabindex="-1">
  <div class="fishing-reticle" data-fishing-reticle aria-hidden="true"></div>
  <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
  <button type="button" class="fishing-bite-target" data-fishing-bite aria-label="BITE - REEL NOW" hidden></button>
</section>
```

Delete `private readonly fishingInstruction`, its constructor lookup, and the line that assigns its `textContent`. Preserve `fishingMessage`, `fishingLive`, and `publishFishingAnnouncement`.

Change the fishing fallback in `focusModal`:

```ts
else if (layer === this.fishingLayer) {
  if (this.fishingMode === 'bite' && !this.fishingBiteTarget.hidden) {
    this.fishingBiteTarget.focus();
  } else {
    this.fishingLayer.focus();
  }
}
```

Delete these obsolete CSS rules from `src/styles/main.css`:

```css
.fishing-instruction-panel { /* entire rule */ }
.fishing-instruction { /* entire rule */ }
.fishing-instruction:focus { /* entire rule */ }
.fishing-help { /* entire rule */ }
```

- [ ] **Step 8: Run all SurvivalUI tests**

Run:

```powershell
bun run test -- tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the UI contract**

```powershell
git add -- src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: clarify survival fishing actions"
```

Expected: commit contains only the three files above.

---

### Task 2: Recompose the rod, line origin, camera, reticle, and cast region

**Files:**
- Modify: `src/survival/BoatWorld.ts:1-25`
- Modify: `src/survival/BoatWorld.ts:209-220`
- Modify: `src/survival/BoatWorld.ts:456-475`
- Modify: `src/survival/BoatWorld.ts:585-610`
- Modify: `src/styles/main.css:350-380`
- Test: `tests/BoatWorld.test.ts:930-955`
- Test: `tests/BoatWorld.test.ts:1190-1215`
- Test: `tests/BoatWorld.test.ts:1295-1330`

**Interfaces:**
- Consumes: existing `BoatWorld.enterFishingView`, `centeredFishingCast`, `playFishingCast`, `showFishingBite`, and `projectFishingBite`.
- Produces: a centered 22-degree rod pivot, rod-local `fishing-line-origin`, farther-aft camera endpoint, outward cast region, and centered open-water reticle composition.

- [ ] **Step 1: Write failing spatial-composition tests**

Update `authors the fishing rod forward from a named bow pivot`:

```ts
const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
const rod = world.scene.getObjectByName('lifeboat-equipment:fishingRod')!;
const tip = world.scene.getObjectByName('fishing-line-origin')!;
expect(pivot.position.x).toBe(0);
expect(pivot.position.z).toBeLessThan(-2);
expect(pivot.rotation.x).toBeCloseTo(MathUtils.degToRad(22), 8);
expect(tip.parent).toBe(rod);
expect(tip.position.y).toBeGreaterThan(0);
expect(tip.getWorldPosition(new Vector3()).z)
  .toBeLessThan(pivot.getWorldPosition(new Vector3()).z);
```

Import `MathUtils` from `three` in the test.

Add a camera/cast test:

```ts
it.each([
  [1280, 720],
  [1024, 768],
])('keeps the centered fishing target over open water at %ix%i', async (width, height) => {
  const camera = new PerspectiveCamera(65, width / height, 0.08, 220);
  camera.updateProjectionMatrix();
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    camera,
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
  );

  const entering = world.enterFishingView();
  world.update(1.1, 1.1);
  await entering;
  expect(camera.position.y).toBeGreaterThan(1.22);
  expect(camera.position.z).toBeGreaterThan(-1.62);

  const centered = world.centeredFishingCast();
  expect(centered).toEqual({ x: 0, z: -6.4 });
  world.showFishingBite(centered);
  world.update(1.2, 0.1);
  const target = world.projectFishingBite(width, height);
  expect(target.visible).toBe(true);
  expect(target.y + target.height / 2).toBeLessThan(height * 0.62);

  world.dispose();
  propModels.dispose();
});
```

Extend `starts the cast endpoint at the rod tip` to compare all coordinates:

```ts
world.update(0.000001, 0.000001);
const origin = lineOrigin.getWorldPosition(new Vector3());
const positions = line.geometry.getAttribute('position') as BufferAttribute;
expect(positions.getX(0)).toBeCloseTo(origin.x, 8);
expect(positions.getY(0)).toBeCloseTo(origin.y, 8);
expect(positions.getZ(0)).toBeCloseTo(origin.z, 8);
```

- [ ] **Step 2: Run the spatial tests to verify they fail**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts -t "rod forward|open water|rod tip"
```

Expected: FAIL on the off-center zero-degree pivot, old camera/cast point, and incomplete tip assertion.

- [ ] **Step 3: Add authored composition constants and a rod-local bounds helper**

Add `MathUtils` and `Matrix4` to the Three.js imports. Add:

```ts
const FISHING_CAST_MIN_X = -2.7;
const FISHING_CAST_MAX_X = 2.7;
const FISHING_CAST_MIN_Z = -8.5;
const FISHING_CAST_MAX_Z = -4.8;
const CENTERED_FISHING_CAST: FishingCastPoint = Object.freeze({ x: 0, z: -6.4 });
const FISHING_ROD_LEAN = MathUtils.degToRad(22);
```

Add this construction-only helper near `addOwnedFishingMesh`:

```ts
function localBoundsOf(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const bounds = new Box3().makeEmpty();
  const localMatrix = new Matrix4();
  const point = new Vector3();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const geometryBounds = object.geometry.boundingBox;
    if (geometryBounds === null) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let corner = 0; corner < 8; corner += 1) {
      point.set(
        corner & 1 ? geometryBounds.max.x : geometryBounds.min.x,
        corner & 2 ? geometryBounds.max.y : geometryBounds.min.y,
        corner & 4 ? geometryBounds.max.z : geometryBounds.min.z,
      ).applyMatrix4(localMatrix);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
}
```

This helper allocates only during world construction and does not enter an update path.

- [ ] **Step 4: Center and lean the rod and place the line marker on its visible tip**

Replace the rod setup with:

```ts
this.rodPivot.name = 'fishing-rod-pivot';
this.rodPivot.position.set(0, 0.56, -2.28);
this.rodPivot.rotation.x = FISHING_ROD_LEAN;
this.rod = propModels.createEquipment('fishingRod');
this.rod.position.set(0, 0, -0.9);
this.rod.rotation.x = -Math.PI / 2;
this.fishingLineOrigin.name = 'fishing-line-origin';
const rodBounds = localBoundsOf(this.rod);
this.fishingLineOrigin.position.set(
  (rodBounds.min.x + rodBounds.max.x) / 2,
  rodBounds.max.y,
  (rodBounds.min.z + rodBounds.max.z) / 2,
);
this.rod.add(this.fishingLineOrigin);
this.rodPivot.add(this.rod);
this.boat.add(this.rodPivot);
```

Keep `baseRodPivotRotationX = this.rodPivot.rotation.x`; all existing cast, reel, miss, reset, and event presentation offsets already compose relative to it.

- [ ] **Step 5: Move the camera and aim/target composition outward**

Replace the fishing camera fields:

```ts
private readonly bowCameraPosition = new Vector3(0, 1.38, -0.72);
private readonly bowCameraLookTarget = new Vector3(0, -0.32, -6.4);
```

Align the fixed reticle with the camera look target:

```css
.fishing-reticle {
  position: absolute;
  left: 50%;
  top: 50%;
  /* retain all remaining declarations */
}
```

- [ ] **Step 6: Run the spatial tests**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts -t "rod forward|open water|rod tip|raycasts only"
```

Expected: PASS.

- [ ] **Step 7: Run the complete BoatWorld and SurvivalUI suites**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the spatial fishing composition**

```powershell
git add -- src/survival/BoatWorld.ts src/styles/main.css tests/BoatWorld.test.ts
git commit -m "feat: recompose survival fishing view"
```

Expected: commit contains only the three files above.

---

### Task 3: Animate staggered fading bite bubbles

**Files:**
- Modify: `src/survival/BoatWorld.ts:160-170`
- Modify: `src/survival/BoatWorld.ts:239-325`
- Modify: `src/survival/BoatWorld.ts:1372-1395`
- Test: `tests/BoatWorld.test.ts:1160-1190`
- Test: `tests/BoatWorld.test.ts:1328-1365`

**Interfaces:**
- Consumes: `BoatWorld.currentTime`, `reducedMotion.matches`, `fishingPhase`, shared fishing wave position, and the fixed six-bubble pool.
- Produces: `FishingVisuals.bubbleMaterials: readonly MeshStandardMaterial[]` and allocation-free deterministic normal/reduced-motion bubble presentation.

- [ ] **Step 1: Write failing normal-motion bubble tests**

Add:

```ts
it('runs staggered fading bubble loops without growing the pool', () => {
  const propModels = createTestPropModels();
  const world = new BoatWorld(
    new PerspectiveCamera(65, 16 / 9, 0.08, 220),
    { matches: false } as MediaQueryList,
    propModels,
    createTestMoonTexture(),
  );
  world.showFishingBite(world.centeredFishingCast());
  const bubbles = world.scene.getObjectByName('fishing-bubbles')!;
  const poolSize = bubbles.children.length;

  world.update(1, 0.1);
  const first = bubbles.children.map((bubble) => {
    const material = (bubble as Mesh).material as MeshStandardMaterial;
    return {
      opacity: material.opacity,
      position: bubble.position.toArray(),
      scale: bubble.scale.x,
    };
  });
  world.update(1.45, 0.45);
  const second = bubbles.children.map((bubble) => {
    const material = (bubble as Mesh).material as MeshStandardMaterial;
    return {
      opacity: material.opacity,
      position: bubble.position.toArray(),
      scale: bubble.scale.x,
    };
  });

  expect(bubbles.children).toHaveLength(poolSize);
  expect(new Set(first.map(({ opacity }) => opacity)).size).toBeGreaterThan(1);
  expect(second).not.toEqual(first);
  expect(second.every(({ opacity }) => opacity >= 0 && opacity <= 0.72)).toBe(true);
  world.dispose();
  propModels.dispose();
});
```

- [ ] **Step 2: Extend the reduced-motion test to cover opacity, scale, and position**

Update the existing reduced-motion test:

```ts
world.update(1, 0.1);
const first = bubbles.children.map((bubble) => ({
  position: bubble.position.toArray(),
  scale: bubble.scale.toArray(),
  opacity: ((bubble as Mesh).material as MeshStandardMaterial).opacity,
}));
world.update(4, 0.1);
const second = bubbles.children.map((bubble) => ({
  position: bubble.position.toArray(),
  scale: bubble.scale.toArray(),
  opacity: ((bubble as Mesh).material as MeshStandardMaterial).opacity,
}));

expect(bubbles.visible).toBe(true);
expect(second).toEqual(first);
expect(first.every(({ opacity }) => opacity > 0 && opacity < 0.68)).toBe(true);
```

- [ ] **Step 3: Run the bubble tests to verify they fail**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts -t "bubble"
```

Expected: FAIL because all bubbles share one material/opacity and current animation only oscillates height.

- [ ] **Step 4: Give each pooled bubble one owned material**

Extend `FishingVisuals`:

```ts
interface FishingVisuals {
  readonly root: Group;
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly linePositions: Float32Array;
  readonly linePositionAttribute: BufferAttribute;
  readonly bobber: Group;
  readonly splash: Group;
  readonly bubbles: Group;
  readonly bubbleMaterials: readonly MeshStandardMaterial[];
  readonly ripples: Group;
  readonly catchDisplay: Group;
}
```

Replace the shared bubble material construction:

```ts
const bubbles = new Group();
bubbles.name = 'fishing-bubbles';
const bubbleGeometry = new SphereGeometry(0.055, 6, 4);
geometries.add(bubbleGeometry);
const bubbleMaterials: MeshStandardMaterial[] = [];
for (let index = 0; index < 6; index += 1) {
  const material = new MeshStandardMaterial({
    color: 0xb7d9d6,
    roughness: 0.3,
    transparent: true,
    opacity: 0.42,
    flatShading: true,
  });
  materials.add(material);
  bubbleMaterials.push(material);
  const bubble = new Mesh(bubbleGeometry, material);
  bubble.castShadow = true;
  bubble.receiveShadow = true;
  bubbles.add(bubble);
}
bubbles.visible = false;
root.add(bubbles);
```

Return `bubbleMaterials` with the other fishing visuals. The existing owned-material set disposes each material exactly once.

- [ ] **Step 5: Replace height-only oscillation with deterministic staggered cycles**

Replace the bubbles branch in `updateFishingEffects`:

```ts
if (this.fishing.bubbles.visible) {
  const bubbleCount = this.fishing.bubbles.children.length;
  for (let index = 0; index < bubbleCount; index += 1) {
    const bubble = this.fishing.bubbles.children[index]!;
    const material = this.fishing.bubbleMaterials[index]!;
    const angle = index * Math.PI * 2 / bubbleCount;
    const baseScale = 0.72 + (index % 3) * 0.18;

    if (this.reducedMotion.matches) {
      const radius = 0.18 + (index % 2) * 0.04;
      bubble.position.set(
        Math.cos(angle) * radius,
        0.04 + index * 0.02,
        Math.sin(angle) * radius,
      );
      bubble.scale.setScalar(baseScale);
      material.opacity = 0.3 + (index % 3) * 0.06;
      continue;
    }

    const cycle = (time * 0.55 + index / bubbleCount) % 1;
    const fadeIn = Math.min(1, cycle / 0.18);
    const fadeOut = Math.min(1, (1 - cycle) / 0.32);
    const radius = 0.15 + cycle * 0.2;
    bubble.position.set(
      Math.cos(angle) * radius,
      0.025 + cycle * 0.34,
      Math.sin(angle) * radius,
    );
    bubble.scale.setScalar(baseScale * (0.78 + cycle * 0.34));
    material.opacity = 0.72 * Math.min(fadeIn, fadeOut);
  }
}
```

This updates existing vectors/scales and materials only; it allocates nothing per frame.

- [ ] **Step 6: Run the bubble and wave-synchronization tests**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts -t "bubble|shared wave|pool"
```

Expected: PASS.

- [ ] **Step 7: Run all BoatWorld tests**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the bubble presentation**

```powershell
git add -- src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "feat: animate survival fishing bubbles"
```

Expected: commit contains only the two files above.

---

### Task 4: Integrated verification and browser acceptance

**Files:**
- Modify only if verification exposes a scoped defect: `src/survival/BoatWorld.ts`, `src/ui/SurvivalUI.ts`, `src/styles/main.css`, `tests/BoatWorld.test.ts`, `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified desktop normal-motion and reduced-motion survival fishing presentation with no rule changes.

- [ ] **Step 1: Run all focused survival presentation tests**

Run:

```powershell
bun run test -- tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts tests/SurvivalPhaseFocus.test.ts tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full automated verification**

Run each command separately:

```powershell
bun run models:check
bun run test
bun run typecheck
bun run build
```

Expected: every command exits with code 0.

- [ ] **Step 3: Inspect normal-motion fishing at 16:9**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Open the local Vite URL at 1280×720, enter survival, and verify:

- rod mount is horizontally centered on the bow;
- resting rod visibly leans forward;
- fishing line begins at the visible rod tip throughout cast, wait, bite, and reel;
- fishing camera is farther aft and slightly higher;
- reticle and projected bite target remain over open water, not the boat;
- no visible instruction panel appears in aiming, waiting, or bite modes;
- bite bubbles continuously fade in, rise, spread, grow slightly, fade out, and restart out of phase;
- fishing, scuba, repair, and bottled-paper tooltips show `⚡`, `⚡⚡⚡`, `⚡⚡`, and `⚡`;
- pointer and `Enter`/`Space` casting/reeling still work.

- [ ] **Step 4: Inspect 4:3 and reduced-motion behavior**

At 1024×768, repeat the open-water target and line-tip checks. Emulate
`prefers-reduced-motion: reduce` and verify:

- camera and rod transitions remain minimal;
- bite bubbles form one static softly faded cluster;
- the bite target remains usable;
- tooltip transitions do not animate;
- keyboard focus remains visible and returns to the originating action after fishing.

- [ ] **Step 5: Fix only scoped defects and rerun the affected gate**

If a check fails, add or tighten the smallest relevant test first, verify it
fails, make the smallest correction in the owning file, then rerun the focused
test and the exact failed command. Do not alter gameplay balance or unrelated
rendering/ship-layout work.

- [ ] **Step 6: Review the final diff for scope and per-frame allocations**

Run:

```powershell
git diff --check
git diff -- src/survival/BoatWorld.ts src/ui/SurvivalUI.ts src/styles/main.css tests/BoatWorld.test.ts tests/SurvivalUI.test.ts
git status --short
```

Expected: no whitespace errors; only approved survival files differ from their
task commits; pre-existing unrelated working-tree changes remain unstaged and
untouched.

- [ ] **Step 7: Commit any browser-acceptance correction**

Skip this step when Step 5 required no source change. Otherwise stage only the
scoped correction:

```powershell
git add -- src/survival/BoatWorld.ts src/ui/SurvivalUI.ts src/styles/main.css tests/BoatWorld.test.ts tests/SurvivalUI.test.ts
git commit -m "fix: refine survival fishing presentation"
```

Expected: the commit contains only files actually changed by the scoped correction.
