# Balance and Interface Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved starting-balance, scavenging UI, freighter material, survival UI, camera, and End Day transition corrections as a minimal tested patch.

**Architecture:** Keep each change inside its existing owner: survival balance owns initial values, `GameUI` owns scavenging markup, the stylesheet owns presentation, ship builders select explicitly owned materials, and `BoatWorld` owns the authored camera pose. No new subsystem or dependency is introduced; tests pin each changed contract before its implementation.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, jsdom, CSS.

## Global Constraints

- Preserve unrelated uncommitted work; stage and commit only files named by the active task.
- Keep gameplay deterministic and renderer-independent.
- Keep keyboard operation, visible focus, semantic disabled states, and shortcut `7`.
- Preserve `prefers-reduced-motion` with a near-immediate sleep transition.
- Preserve the shared wave field, buoyant camera rig, and fishing camera endpoints.
- Keep the carry capacity at three weight units and preserve multi-slot item expansion.
- Do not add dependencies, saves, touch/mobile controls, crewmates, multiplayer, or persistent progression.
- Every created Three.js material has one owner and is disposed exactly once.
- Target desktop viewports are 1280×720 and 1920×1080.

---

## File map

- `src/survival/survivalBalance.ts`: authoritative initial Hull and hunger values.
- `src/ui/GameUI.ts`: scavenging start-screen groups and carry-slot markup.
- `src/styles/main.css`: start composition, vignette, carry treatment, tooltips, End Day button, and sleep fade.
- `src/world/ShipMaterials.ts`: owned plain material exceptions.
- `src/world/ShipGeometry.ts`: storage workroom wall, corner, and roof material selection.
- `src/world/ShipFurniture.ts`: aft-port cargo crate body material selection.
- `src/survival/BoatWorld.ts`: normal survival camera pose and look target.
- `tests/SurvivalSession.test.ts`: initial balance contract.
- `tests/SurvivalUI.test.ts`: displayed Food, tooltip, End Day, and sleep-cover contracts.
- `tests/GameUI.test.ts`: start hierarchy, removed copy, carry slots, and icon identity.
- `tests/ShipMaterials.test.ts`: map-free materials and disposal.
- `tests/ShipGeometry.test.ts`: storage workroom material assignment.
- `tests/ShipFurniture.test.ts`: cargo-crate exception assignment.
- `tests/BoatWorld.test.ts`: normal camera endpoint and unchanged fishing endpoint.

---

### Task 1: Start survival at Hull 100 and Food 100

**Files:**
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `src/survival/survivalBalance.ts`

**Interfaces:**
- Consumes: `SURVIVAL_BALANCE.start` and `SurvivalSession.snapshot()`.
- Produces: the unchanged `SurvivalSnapshot` shape with default
  `{ hull: 100, hunger: 0 }`; Food display remains `100 - hunger`.

- [ ] **Step 1: Pin the default snapshot and displayed Food value**

Update the existing “starts day one” expectation in
`tests/SurvivalSession.test.ts`:

```ts
expect(state).toMatchObject({
  state: 'day',
  day: 1,
  health: 100,
  hunger: 0,
  energy: 3,
  hull: 100,
  food: 1,
});
```

Add this focused assertion to the survival condition-layout test in
`tests/SurvivalUI.test.ts`:

```ts
ui.render(new SurvivalSession([], { seed: 1 }).snapshot(), () => null);
expect(
  mount.querySelector('[data-meter="hunger"] [data-meter-value]')?.textContent,
).toBe('100');
expect(
  mount.querySelector('[data-meter="hull"] [data-meter-value]')?.textContent,
).toBe('100');
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
npm.cmd test -- tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts
```

Expected: FAIL because the default snapshot still has `hunger: 20` and
`hull: 75`.

- [ ] **Step 3: Change only the authoritative starting balance**

In `src/survival/survivalBalance.ts`, replace the start tuple with:

```ts
start: { health: 100, hunger: 0, energy: 3, hull: 100 },
```

Do not change pooled `food`, canned-food initialization, dawn hunger growth, or
meter display logic.

- [ ] **Step 4: Re-run the focused tests**

Run:

```powershell
npm.cmd test -- tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the balance correction**

```powershell
git add src/survival/survivalBalance.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts
git commit -m "fix: start survival resources full"
```

---

### Task 2: Recompose the start screen and refresh the carry indicator

**Files:**
- Modify: `tests/GameUI.test.ts`
- Modify: `src/ui/GameUI.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: `GameUI.render(snapshot, sinking)`, `itemArtwork(id, className)`,
  and the existing `data-start-button`, `data-pointer-lock-error`, and
  `data-weight-circle` selectors.
- Produces: `.start-screen__top` and `.start-screen__action` layout groups;
  the same three carry slots and `data-item-type` semantics; no fine-print
  paragraph.

- [ ] **Step 1: Add failing start-hierarchy and carry-art tests**

Add to `tests/GameUI.test.ts`:

```ts
it('uses a top copy group and bottom action without desktop fine print', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  const start = mount.querySelector('[data-start]')!;

  expect(start.querySelector('.start-screen__top h1')).not.toBeNull();
  expect(start.querySelector('.start-screen__top .controls')).not.toBeNull();
  expect(start.querySelector('.start-screen__action [data-start-button]')).not.toBeNull();
  expect(start.querySelector('.start-screen__action [data-pointer-lock-error]')).not.toBeNull();
  expect(start.querySelector('.fine-print')).toBeNull();
  expect(start.textContent).not.toContain('Desktop keyboard and mouse required');
  expect(mainStyles).toMatch(
    /\.start-screen \[data-start-button\]\s*\{[^}]*min-width:\s*310px[^}]*min-height:\s*74px/s,
  );
  expect(mainStyles).toMatch(
    /\.poster-screen\.start-screen\s*\{[^}]*linear-gradient\(180deg/s,
  );
  ui.dispose();
});
```

Extend the existing scuba carry test:

```ts
const icons = [...mount.querySelectorAll('[data-weight-circle] [data-item-artwork="scubaSet"]')];
expect(icons).toHaveLength(3);
expect(mainStyles).toMatch(
  /\.weight-circle\s*\{[^}]*width:\s*96px[^}]*height:\s*96px/s,
);
expect(mainStyles).toMatch(
  /\.weight-circle__art\s*\{[^}]*width:\s*92%[^}]*height:\s*92%/s,
);
```

- [ ] **Step 2: Run the GameUI test and confirm failure**

Run:

```powershell
npm.cmd test -- tests/GameUI.test.ts
```

Expected: FAIL because the new groups and CSS dimensions do not exist and the
fine print is still present.

- [ ] **Step 3: Group the start markup without changing button semantics**

Replace only the start-screen content inside `src/ui/GameUI.ts` with this
structure:

```ts
<div class="screen__content">
  <div class="start-screen__top">
    <p class="kicker ui-role-context">THE HULL HAS BEEN BREACHED</p>
    <h1 class="ui-role-display">DON'T SLEEP<br>WITH THE<br>FISHES</h1>
    <p class="lead ui-role-narrative">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
    <dl class="controls ui-role-context"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>LEFT CLICK</dd></div></dl>
  </div>
  <div class="start-screen__action">
    <button type="button" class="primary-action timber-action ui-role-context" data-start-button>BEGIN EVACUATION</button>
    <p class="input-error illustrated-warning ui-role-narrative" data-pointer-lock-error aria-live="polite">
      ${uiArtwork('warning', 'illustrated-warning__art')}
      <span data-pointer-lock-error-copy></span>
    </p>
  </div>
</div>
```

Keep pause-screen pointer-lock markup unchanged.

- [ ] **Step 4: Apply the minimal top/bottom composition**

Update the authoritative late scavenging rules in `src/styles/main.css`:

```css
.poster-screen.start-screen {
  align-content: stretch;
  justify-items: stretch;
  padding: clamp(28px, 4.5vw, 68px);
  background:
    linear-gradient(180deg, #020303f5 0 28%, #0507088c 43%, transparent 57% 72%, #020303dc 100%);
  text-align: left;
}
.start-screen .screen__content {
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-content: stretch;
  justify-items: stretch;
  width: 100%;
  overflow: hidden;
}
.start-screen__top {
  display: grid;
  justify-items: start;
  gap: 14px;
  width: min(560px, 48vw);
}
.start-screen__action {
  grid-row: 3;
  align-self: end;
  display: grid;
  justify-items: start;
  gap: 12px;
}
.start-screen [data-start-button] {
  min-width: 310px;
  min-height: 74px;
  padding: 18px 28px;
  font-size: 1rem;
}
```

Adjust the short-height rule so `.start-screen__top` uses a 10-pixel gap and
the button stays fully visible.

- [ ] **Step 5: Enlarge and illustrate the carry slots and icons**

Change the normal carry dimensions in `src/styles/main.css`:

```css
.weight-circles__row {
  grid-template-columns: repeat(3, 96px);
  gap: 13px;
}
.weight-circle {
  width: 96px;
  height: 96px;
  border-width: 5px;
  border-radius: 49% 46% 52% 47% / 46% 52% 48% 51%;
  background: radial-gradient(circle at 42% 34%, #2b4055aa, #080d16ef 72%);
  box-shadow:
    inset 0 0 0 2px #70869a55,
    inset 5px -6px 0 #02050955,
    3px 5px 0 #020509aa;
}
.weight-circle:nth-child(2) {
  border-radius: 46% 52% 47% 51% / 51% 46% 52% 48%;
}
.weight-circle:nth-child(3) {
  border-radius: 52% 47% 49% 45% / 47% 51% 46% 52%;
}
.weight-circle__art {
  z-index: 1;
  width: 92%;
  height: 92%;
  filter: drop-shadow(3px 4px 0 #020407dd);
}
.weight-circle__art .item-artwork__primary,
.weight-circle__art .item-artwork__secondary,
.weight-circle__art .item-artwork__light,
.weight-circle__art .item-artwork__ink,
.weight-circle__art .item-artwork__cutout {
  stroke-width: 5;
}
```

Change the compact breakpoint from 64 to 70 pixels and use a 9-pixel gap.
The existing per-item SVG paths already provide unique silhouettes and
selective light shapes; the stronger carry-scoped contour, scale, shadow, and
irregular frame are the approved icon update. Do not change `itemArtwork()` or
add a second icon system.

- [ ] **Step 6: Re-run GameUI tests**

Run:

```powershell
npm.cmd test -- tests/GameUI.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the scavenging UI correction**

```powershell
git add src/ui/GameUI.ts src/styles/main.css tests/GameUI.test.ts
git commit -m "fix: recompose scavenging interface"
```

---

### Task 3: Remove mapped textures from the confirmed freighter targets

**Files:**
- Modify: `tests/ShipMaterials.test.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/ShipFurniture.test.ts`
- Modify: `src/world/ShipMaterials.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `src/world/ShipFurniture.ts`

**Interfaces:**
- Consumes: `ShipMaterials`, `createShipGeometry()`, `createShipFurniture()`,
  `ShipFurniturePlacementSpec.id`.
- Produces: `ShipMaterials.plainPaintedSteel` and
  `ShipMaterials.plainTimber`, both owned by `ShipMaterials.dispose()`.

- [ ] **Step 1: Add failing map-free ownership tests**

Add to `tests/ShipMaterials.test.ts`:

```ts
it('owns map-free material exceptions for the storage room and adjacent crate', () => {
  const materials = createShipMaterials();
  for (const material of [materials.plainPaintedSteel, materials.plainTimber]) {
    expect(material.map).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.normalMap).toBeNull();
    expect(material.bumpMap).toBeNull();
  }
  expect(materials.ownedMaterialsForTest()).toContain(materials.plainPaintedSteel);
  expect(materials.ownedMaterialsForTest()).toContain(materials.plainTimber);
  materials.dispose();
});
```

Extend the existing exactly-once disposal test to include spies for both new
materials.

- [ ] **Step 2: Add failing geometry and furniture assignment tests**

Add to `tests/ShipGeometry.test.ts`:

```ts
it('uses the plain steel exception on every storage workroom exterior surface', () => {
  const materials = createShipMaterials();
  const build = createShipGeometry(materials);
  const names = [
    ...build.root.children
      .filter((object): object is Mesh => object instanceof Mesh)
      .filter((mesh) =>
        mesh.name.startsWith('storage-workroom-wall-')
        || mesh.name.startsWith('storageWorkroom-corner-')
        || mesh.name === 'storageWorkroom-roof'),
  ];
  expect(names.length).toBeGreaterThan(0);
  names.forEach((mesh) => expect(mesh.material).toBe(materials.plainPaintedSteel));
  build.disposeGeometry();
  materials.dispose();
});
```

Add to `tests/ShipFurniture.test.ts` using its existing library fixture:

```ts
it('removes wood maps only from the aft-port cargo crate body', () => {
  const materials = createShipMaterials();
  const library = createTestShipFurniture();
  const build = createShipFurniture(materials, library);
  const plain = build.root
    .getObjectByName('furniture:cargo-crate-aft-port')!
    .getObjectByName('crate-body') as Mesh;
  const textured = build.root
    .getObjectByName('furniture:cargo-crate-aft-starboard')!
    .getObjectByName('crate-body') as Mesh;
  expect(plain.material).toBe(materials.plainTimber);
  expect(textured.material).toBe(materials.timber);
  build.disposeGeometry();
  materials.dispose();
  library.dispose();
});
```

- [ ] **Step 3: Run the focused ship tests and confirm failure**

Run:

```powershell
npm.cmd test -- tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts
```

Expected: FAIL because the plain materials do not exist and all confirmed
targets still use mapped materials.

- [ ] **Step 4: Create two explicitly owned solid materials**

Extend `ShipMaterials` in `src/world/ShipMaterials.ts`:

```ts
plainPaintedSteel: MeshStandardMaterial;
plainTimber: MeshStandardMaterial;
```

Create them in `createShipMaterials()`:

```ts
const plainPaintedSteel = new MeshStandardMaterial({
  color: 0x77868b,
  roughness: 0.9,
  metalness: 0.24,
  flatShading: true,
});
const plainTimber = new MeshStandardMaterial({
  color: 0x60442f,
  roughness: 0.96,
  metalness: 0,
  flatShading: true,
});
```

Add both to `ownedMaterials` and the returned object. Do not add them to
`ownedTextures`; their map properties must remain `null`.

- [ ] **Step 5: Select the plain storage material on walls, corners, and roof**

In `src/world/ShipGeometry.ts`, make these three selections explicit:

```ts
const material = segment.zoneId === 'crewCabin'
  ? materials.paintedPanel
  : materials.plainPaintedSteel;
```

```ts
const material = zone.id === 'storageWorkroom'
  ? materials.plainPaintedSteel
  : materials.paintedPanel;
```

```ts
material: zone.id === 'storageWorkroom'
  ? materials.plainPaintedSteel
  : materials.paintedSteel,
```

The first snippet applies only inside the existing non-wheelhouse branch.

- [ ] **Step 6: Select plain timber only for `cargo-crate-aft-port`**

Change `createCargoCrate()` in `src/world/ShipFurniture.ts` to accept an
explicit body material:

```ts
function createCargoCrate(
  parent: Group,
  geometry: BoxGeometry,
  materials: ShipMaterials,
  bodyMaterial: Material,
  size: readonly [number, number, number],
): void {
  addBox(parent, geometry, bodyMaterial, 'crate-body', size, [0, size[1] / 2, 0]);
  // existing dark-metal bands remain unchanged
}
```

Call it with:

```ts
const bodyMaterial = placementSpec.id === 'cargo-crate-aft-port'
  ? materials.plainTimber
  : materials.timber;
createCargoCrate(
  placementRoot,
  geometry.box,
  materials,
  bodyMaterial,
  placementSpec.colliderSize,
);
```

- [ ] **Step 7: Re-run the focused ship tests**

Run:

```powershell
npm.cmd test -- tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the material exceptions**

```powershell
git add src/world/ShipMaterials.ts src/world/ShipGeometry.ts src/world/ShipFurniture.ts tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts
git commit -m "fix: remove maps from selected freighter props"
```

---

### Task 4: Enlarge survival tooltips, align End Day, and restore the slow fade

**Files:**
- Modify: `tests/SurvivalUI.test.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: existing `.boat-tooltip`, `.end-day-button`, `.sleep-cover`, and
  `.sleep-cover.is-covered` selectors; `SurvivalUI.setSleepCovered()`.
- Produces: unchanged DOM and promise APIs with corrected authoritative CSS.

- [ ] **Step 1: Update the failing presentation assertions**

Replace the blue End Day assertions in `tests/SurvivalUI.test.ts`:

```ts
expect(mainStyles).toMatch(
  /\.end-day-button\s*\{[^}]*min-width:\s*260px[^}]*min-height:\s*74px/s,
);
expect(mainStyles).toMatch(
  /\.end-day-button\s*\{[^}]*#914f42/s,
);
```

Add:

```ts
expect(mainStyles).toMatch(
  /\.boat-tooltip\s*\{[^}]*max-width:\s*min\(340px,\s*calc\(100vw - 32px\)\)[^}]*padding:\s*14px 18px[^}]*font-size:\s*1rem[^}]*line-height:\s*1\.4/s,
);
```

Update the sleep-cover assertion to:

```ts
expect(mainStyles).toMatch(
  /\.sleep-cover\s*\{[^}]*opacity:\s*0[^}]*transition:\s*opacity 2500ms ease-in-out[^}]*pointer-events:\s*none/s,
);
expect(mainStyles).toMatch(
  /\.sleep-cover\.is-covered\s*\{[^}]*opacity:\s*1[^}]*\}/s,
);
expect(mainStyles).not.toMatch(
  /\.sleep-cover\s*\{[^}]*transform:\s*scaleY/s,
);
```

Keep the existing timer, transition-end, interruption, focus-layer, and
reduced-motion tests.

- [ ] **Step 2: Run SurvivalUI tests and confirm failure**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts
```

Expected: FAIL on the old tooltip dimensions, blue End Day palette, and
scale-based sleep cover.

- [ ] **Step 3: Enlarge the authoritative late tooltip rule**

Update the late `.boat-tooltip` override in `src/styles/main.css`:

```css
.boat-tooltip {
  max-width: min(340px, calc(100vw - 32px));
  padding: 14px 18px;
  border: 0;
  background: #090b0cf2;
  color: var(--ink-bone);
  font-family: var(--font-context);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
  clip-path: polygon(2% 2%, 98% 0, 100% 92%, 5% 100%, 0 54%);
}
```

Do not change anchor hit areas, projection, flipping, or semantic copy.

- [ ] **Step 4: Align End Day with the red-brown evacuation treatment**

Replace the blue override:

```css
.end-day-button {
  position: fixed;
  right: 24px;
  bottom: 24px;
  top: auto;
  min-width: 260px;
  min-height: 74px;
  padding: 16px 30px;
  border-color: #b88772;
  background: linear-gradient(174deg, #914f42, #67352d 54%, #7c493b);
  color: var(--ink-bone);
  font-size: 1rem;
  letter-spacing: .08em;
}
```

Retain `.timber-action` grain, hover, active, focus-visible, disabled, and
`aria-disabled` behavior.

- [ ] **Step 5: Make the sleep cover opacity-only**

Replace the normal-motion rules:

```css
.sleep-cover {
  position: absolute;
  inset: -10%;
  z-index: 19;
  background: #010202;
  opacity: 0;
  transition: opacity 2500ms ease-in-out;
  pointer-events: none;
}
.sleep-cover.is-covered {
  opacity: 1;
}
```

Keep the reduced-motion rule at 1 ms. `SurvivalUI.setSleepCovered()` already
waits for `propertyName === 'opacity'` and uses the 2500 ms timeout, so no
TypeScript change is required.

- [ ] **Step 6: Re-run SurvivalUI tests**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the survival UI corrections**

```powershell
git add src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "fix: polish survival actions and sleep fade"
```

---

### Task 5: Move the normal survival camera forward

**Files:**
- Modify: `tests/BoatWorld.test.ts`
- Modify: `src/survival/BoatWorld.ts`

**Interfaces:**
- Consumes: the `BoatWorld` constructor and existing camera rig.
- Produces: base camera position `[0, 0.88, 1.72]` looking at
  `[0, -0.18, -1.55]`; fishing camera constants remain unchanged.

- [ ] **Step 1: Pin the new base pose and unchanged fishing endpoint**

Extend “keeps the survival camera locked to its authored base view” in
`tests/BoatWorld.test.ts`:

```ts
expect(camera.position.toArray()).toEqual([0, 0.88, 1.72]);
const expectedBaseQuaternion = new Quaternion().setFromRotationMatrix(
  new Matrix4().lookAt(
    new Vector3(0, 0.88, 1.72),
    new Vector3(0, -0.18, -1.55),
    camera.up,
  ),
);
expect(camera.quaternion.toArray()).toEqual(expectedBaseQuaternion.toArray());
```

Keep the existing fishing test that expects `FISHING_PLAYER_SEAT` and the
fishing look target `[0, -0.42, -7.4]`.

- [ ] **Step 2: Run the focused BoatWorld test and confirm failure**

Run:

```powershell
npm.cmd test -- tests/BoatWorld.test.ts
```

Expected: FAIL because the base camera is still at `[0, 0.88, 2.35]`.

- [ ] **Step 3: Change only the normal base pose**

In `src/survival/BoatWorld.ts`, set:

```ts
private readonly baseCameraLookTarget = new Vector3(0, -0.18, -1.55);
```

and in the constructor:

```ts
camera.position.set(0, 0.88, 1.72);
camera.lookAt(this.baseCameraLookTarget);
```

Do not change `FISHING_PLAYER_SEAT`, `fishingCameraAngleOrigin`,
`fishingCameraLookTarget`, animation duration, motion rig, or restoration
logic.

- [ ] **Step 4: Re-run BoatWorld tests**

Run:

```powershell
npm.cmd test -- tests/BoatWorld.test.ts
```

Expected: PASS, including projected anchors and fishing restoration.

- [ ] **Step 5: Commit the camera correction**

```powershell
git add src/survival/BoatWorld.ts tests/BoatWorld.test.ts
git commit -m "fix: move survival camera past foreground bench"
```

---

### Task 6: Full verification and visual QA

**Files:**
- Modify only if verification finds an in-scope defect in files already named
  above.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: evidence that all approved requirements pass automated and visual
  verification.

- [ ] **Step 1: Run every focused test together**

Run:

```powershell
npm.cmd test -- tests/SurvivalSession.test.ts tests/GameUI.test.ts tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```powershell
npm.cmd test
```

Expected: PASS with no failing test files.

- [ ] **Step 3: Run typecheck and production build**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript emits no errors and Vite completes a production build.

- [ ] **Step 4: Inspect the scavenging presentation at both target viewports**

Serve the local app and inspect 1280×720 and 1920×1080. Verify:

- title, warning, description, and controls are at the top;
- Begin Evacuation and its error region are at the bottom;
- no desktop fine print is present;
- the vignette is top/bottom and the ship remains visible through the center;
- the button is visibly larger with keyboard focus;
- carry circles are slightly larger, irregular, legible, and remain clear of
  the watch in empty, partial, and full states;
- the storage workroom walls, corners, roof, and aft-port crate have solid
  surfaces while neighboring targets keep their mapped textures.

- [ ] **Step 5: Inspect survival at both target viewports**

Verify:

- Food and Hull begin at 100;
- the foreground bench no longer dominates the base camera;
- every projected item and tool remains visible and focusable;
- tooltips are larger and remain inside left and right viewport edges;
- End Day uses the red-brown evacuation-button language with visible hover,
  focus, active, disabled, and `aria-disabled` states;
- End Day fades to black gradually for 2.5 seconds and fades back gradually;
- reduced motion performs the same state order with a near-immediate fade;
- fishing still enters and exits its unchanged dedicated camera view.

- [ ] **Step 6: Review the final diff for scope and ownership**

Run:

```powershell
git diff --check
git status --short
git log -6 --oneline
```

Expected: no whitespace errors; only the intended changes from Tasks 1–5 plus
pre-existing unrelated worktree changes; the two new solid materials are
disposed through `ShipMaterials`.

- [ ] **Step 7: Commit any verification-only correction**

Only if Step 4 or Step 5 required a small in-scope correction:

```powershell
git add src/survival/survivalBalance.ts src/ui/GameUI.ts src/styles/main.css src/world/ShipMaterials.ts src/world/ShipGeometry.ts src/world/ShipFurniture.ts src/survival/BoatWorld.ts tests/SurvivalSession.test.ts tests/GameUI.test.ts tests/ShipMaterials.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts
git commit -m "fix: finish interface polish verification"
```

If no correction was necessary, do not create an empty commit.
