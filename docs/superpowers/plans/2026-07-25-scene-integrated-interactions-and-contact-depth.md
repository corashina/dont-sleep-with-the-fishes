# Scene-Integrated Interactions and Contact Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two routine full-screen survival overlays with projected scene cards, add authored construction to the freighter's focal cabin areas, and seat selected freighter and lifeboat objects with a reusable local contact-depth layer.

**Architecture:** A renderer-independent `ContactDepthLayer` owns shared seam/footprint resources and is borrowed by static ship builders and the survival supply display. `SurvivalUI` retains its existing modal/focus state machine but positions transparent routine-dialog containers from the existing boat anchors. Geometry additions remain visual-only and are folded into current ship and world disposal paths.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, DOM/CSS, Vitest 3.2, Vite 7.

## Global Constraints

- Preserve deterministic gameplay and keep presentation state out of gameplay modules.
- Preserve keyboard commands, focus visibility, modal ordering, live announcements, and `prefers-reduced-motion`.
- Do not change ship layout coordinates, collision boxes, searchable surfaces, physical slots, standing points, item placement, shared-wave behavior, or fishing endpoints.
- Do not add a screen-space AO pass, depth/normal target, global dirt treatment, screenshot harness, or general UI component framework.
- Every new Three.js geometry, material, group, and listener has one owner and idempotent disposal.
- Avoid allocation and repeated setup in per-frame update and render paths.
- Keep the current desktop keyboard-and-mouse scope.

---

### Task 1: Reusable Local Contact-Depth Layer

**Files:**
- Create: `src/world/ContactDepthLayer.ts`
- Create: `tests/ContactDepthLayer.test.ts`

**Interfaces:**
- Consumes: Three.js `Group`, `Mesh`, `PlaneGeometry`, `BoxGeometry`, `MeshBasicMaterial`, `Euler`, and `Vector3`.
- Produces:

```ts
export interface ContactAccentSpec {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface ContactDepthLayer {
  readonly root: Group;
  addFootprint(spec: ContactAccentSpec): Mesh;
  addSeam(spec: ContactAccentSpec): Mesh;
  dispose(): void;
}

export function createContactDepthLayer(): ContactDepthLayer;
```

- Ownership: the returned layer owns its root, one plane geometry, one box geometry, and one material. Callers own the layer and must call `dispose()` once; repeated calls are harmless.

- [ ] **Step 1: Write the failing resource-sharing and disposal tests**

```ts
import { Material, Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createContactDepthLayer } from '../src/world/ContactDepthLayer';

describe('ContactDepthLayer', () => {
  it('shares one footprint geometry, one seam geometry, and one material', () => {
    const layer = createContactDepthLayer();
    const first = layer.addFootprint({
      name: 'first-footprint',
      position: [1, 0, 2],
      scale: [2, 1, 3],
    });
    const second = layer.addFootprint({
      name: 'second-footprint',
      position: [-1, 0, -2],
      scale: [1, 1, 1],
    });
    const seam = layer.addSeam({
      name: 'wall-seam',
      position: [0, 1, 0],
      scale: [3, 0.02, 0.03],
    });

    expect(first.geometry).toBe(second.geometry);
    expect(first.geometry).not.toBe(seam.geometry);
    expect(first.material).toBe(second.material);
    expect(first.material).toBe(seam.material);
    expect(first.name).toBe('first-footprint');
    expect(first.position.toArray()).toEqual([1, 0, 2]);
    expect(first.scale.toArray()).toEqual([2, 1, 3]);
    expect(layer.root.children).toEqual([first, second, seam]);

    const material = first.material as Material & {
      depthWrite: boolean;
      polygonOffset: boolean;
      polygonOffsetFactor: number;
      polygonOffsetUnits: number;
    };
    expect(material).toMatchObject({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    layer.dispose();
  });

  it('disposes shared resources and detaches the root exactly once', () => {
    const layer = createContactDepthLayer();
    const footprint = layer.addFootprint({
      name: 'footprint',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    });
    const seam = layer.addSeam({
      name: 'seam',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    });
    const footprintDispose = vi.spyOn(footprint.geometry, 'dispose');
    const seamDispose = vi.spyOn(seam.geometry, 'dispose');
    const materialDispose = vi.spyOn(footprint.material as Material, 'dispose');

    layer.dispose();
    layer.dispose();

    expect(footprintDispose).toHaveBeenCalledOnce();
    expect(seamDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(layer.root.children).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the module is missing**

Run:

```powershell
npm.cmd test -- tests/ContactDepthLayer.test.ts
```

Expected: FAIL because `src/world/ContactDepthLayer.ts` does not exist.

- [ ] **Step 3: Implement the shared layer**

Implement a unit `PlaneGeometry(1, 1)` rotated onto the XZ plane, a unit
`BoxGeometry(1, 1, 1)`, and a single `MeshBasicMaterial`:

```ts
const material = new MeshBasicMaterial({
  color: 0x11181a,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  toneMapped: false,
});
```

Use one internal `add` helper to set the name, position, scale, optional Euler
rotation, `renderOrder = 1`, and parent under `root`. `dispose()` must detach
and clear the root before disposing the two geometries and material.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm.cmd test -- tests/ContactDepthLayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the contact-depth primitive**

```powershell
git add src/world/ContactDepthLayer.ts tests/ContactDepthLayer.test.ts
git commit -m "feat: add local contact depth layer"
```

---

### Task 2: Authored Freighter Construction and Contacts

**Files:**
- Modify: `src/world/Ship.ts`
- Modify: `src/world/ShipGeometry.ts`
- Modify: `src/world/ShipFurniture.ts`
- Modify: `tests/ShipGeometry.test.ts`
- Modify: `tests/ShipFurniture.test.ts`

**Interfaces:**
- `createShipGeometry(materials, layout = SHIP_LAYOUT, contactDepth?)` borrows an optional `ContactDepthLayer`; it does not dispose it.
- `createShipFurniture(materials, library, layout = SHIP_LAYOUT, contactDepth?)` borrows the same layer; it does not dispose it.
- `createShip` owns one contact layer, adds its root to the ship geometry root, and disposes it after smoke/rigging/details/furniture/geometry and before materials.

- [ ] **Step 1: Write failing exterior construction tests**

Add a test that creates a shared layer, passes it to `createShipGeometry`, and
asserts the named detail:

```ts
const expected = [
  'crew-cabin-roof-fascia-port',
  'crew-cabin-roof-fascia-starboard',
  'wheelhouse-window-sill-band',
  'wheelhouse-header-bracket-port',
  'wheelhouse-header-bracket-starboard',
  'wheelhouse-repair-plate-port-aft',
];
expected.forEach((name) => expect(build.root.getObjectByName(name), name).toBeInstanceOf(Mesh));
expect(build.shellColliders).toHaveLength(originalColliderCount);
expect(contact.root.getObjectByName('contact:crew-cabin-deck-seam')).toBeInstanceOf(Mesh);
expect(contact.root.getObjectByName('contact:wheelhouse-fascia-overlap')).toBeInstanceOf(Mesh);
```

Capture `originalColliderCount` from an unaccented `createShipGeometry(materials)`
build before creating the accented build. Check each added object's `Box3`
against the union of the `crewCabin` and `wheelhouse` bounds expanded by 0.2
metres, then dispose both builds, layer, and materials.

- [ ] **Step 2: Run the geometry test and confirm it fails**

Run:

```powershell
npm.cmd test -- tests/ShipGeometry.test.ts
```

Expected: FAIL because the optional layer parameter and named construction do
not exist.

- [ ] **Step 3: Add the exterior construction**

In `ShipGeometry.ts`, add a focused `addFocalSuperstructureDetails` helper that
uses the existing shared block geometry and `addBlock` with `collider` omitted.
Build:

- 0.10-metre fascia strips along the port/starboard roof edges of `crewCabin`;
- a 0.08-metre wheelhouse front sill band;
- two compact header brackets at the front port/starboard corners;
- regular 0.055-metre fastener blocks along the visible front frame;
- one shallow port-aft repair plate, slightly rotated around Z.

Use `materials.paintedPanel`, `materials.darkMetal`, and `materials.rust` so no
new ship material owner is introduced. Add narrow contact seams through the
borrowed layer at the crew-cabin wall/deck junction and wheelhouse fascia
overlap. Do not pass `shellColliders` to any detail helper.

- [ ] **Step 4: Run the geometry test**

Run:

```powershell
npm.cmd test -- tests/ShipGeometry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing crew-cabin furniture tests**

Create the same contact layer and assert:

```ts
const desk = build.root.getObjectByName('furniture:cabin-desk-aft')!;
const bookcase = build.root.getObjectByName('furniture:cabin-bookcase-forward')!;
expect(desk.getObjectByName('construction:desk-edge-band')).toBeInstanceOf(Mesh);
expect(desk.getObjectByName('construction:desk-floor-cleat-port')).toBeInstanceOf(Mesh);
expect(bookcase.getObjectByName('construction:bookcase-hinge-port')).toBeInstanceOf(Mesh);
expect(bookcase.getObjectByName('construction:bookcase-wall-bracket')).toBeInstanceOf(Mesh);
expect(contact.root.getObjectByName('contact:cabin-desk-aft')).toBeInstanceOf(Mesh);
expect(contact.root.getObjectByName('contact:cabin-bookcase-forward')).toBeInstanceOf(Mesh);
expect(build.colliders).toEqual(unaccented.colliders);
expect(build.surfaces).toEqual(unaccented.surfaces);
```

Also spy on the generated box geometry and confirm repeated
`disposeGeometry()` calls dispose it once.

- [ ] **Step 6: Run the furniture test and confirm it fails**

Run:

```powershell
npm.cmd test -- tests/ShipFurniture.test.ts
```

Expected: FAIL because the construction groups and borrowed contact layer do
not exist.

- [ ] **Step 7: Add model-instance construction and contacts**

In `ShipFurniture.ts`, add construction only when
`placementSpec.id === 'cabin-desk-aft'` or
`placementSpec.id === 'cabin-bookcase-forward'`. Use `geometry.box` and
`addBox`:

- desk edge band, two floor cleats, and two small bracket plates;
- bookcase two hinge plates, a wall bracket, and a slightly offset back seam.

Keep all accents parented to `placementRoot` so they inherit the authored
transform. Add contact footprints to the shared contact root using the
placement's world X/Z, rotation Y, and collider width/depth. Because the
contact layer is in ship-root coordinates, do not parent the footprints to the
animated/model root.

- [ ] **Step 8: Run the furniture test**

Run:

```powershell
npm.cmd test -- tests/ShipFurniture.test.ts
```

Expected: PASS.

- [ ] **Step 9: Make `createShip` the contact-layer owner and test cleanup**

Create the layer before child construction, pass it into geometry and
furniture, add `contactDepth.root` under `geometry.root`, and include
`contactDepth.dispose()` in both the construction catch path and final
idempotent `dispose`.

Extend the existing ship cleanup test to spy on the layer's shared resources
through the named contact meshes, call `ship.dispose()` twice, and assert one
disposal per resource.

- [ ] **Step 10: Run the focused ship tests**

Run:

```powershell
npm.cmd test -- tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/GameConstruction.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit the freighter slice**

```powershell
git add src/world/Ship.ts src/world/ShipGeometry.ts src/world/ShipFurniture.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts
git commit -m "feat: author freighter focal construction"
```

---

### Task 3: Lifeboat Platform and Supply Contacts

**Files:**
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/BoatSupplyDisplay.ts`
- Modify: `tests/BoatSupplyDisplay.test.ts`
- Modify: `tests/BoatWorld.test.ts`

**Interfaces:**
- `BoatWorld` owns one `ContactDepthLayer`, attaches its root to the lifeboat,
  and disposes it.
- `BoatSupplyDisplay` optionally borrows a `ContactDepthLayer`; it stores one
  returned footprint mesh per `BoatSupplyGroupId` and only toggles visibility.
- `BoatSupplyDisplay` never disposes the borrowed layer.

- [ ] **Step 1: Write failing supply-footprint tests**

Construct a layer and pass it as the fifth constructor argument:

```ts
const contact = createContactDepthLayer();
const display = new BoatSupplyDisplay(library, new Group(), foodItems, false, contact);
const footprint = contact.root.getObjectByName('contact:supply:cannedFood') as Mesh;
expect(footprint).toBeInstanceOf(Mesh);
expect(footprint.visible).toBe(false);

display.sync(snapshot({ food: 2, savedItems: foodItems }));
expect(footprint.visible).toBe(true);
const basePosition = footprint.position.clone();
const pending = display.playEventItemUse('cannedFood-1');
display.update(0.2);
expect(footprint.position).toEqual(basePosition);
display.update(1);
await pending;

display.sync(snapshot({ food: 0, savedItems: foodItems }));
expect(footprint.visible).toBe(false);
```

Add a second test that disposes `BoatSupplyDisplay`, confirms the borrowed
contact material is not disposed, then disposes the layer and confirms it is
disposed once.

- [ ] **Step 2: Run the supply test and confirm it fails**

Run:

```powershell
npm.cmd test -- tests/BoatSupplyDisplay.test.ts
```

Expected: FAIL because the constructor does not accept a contact layer and no
footprints exist.

- [ ] **Step 3: Add stable supply footprints**

Import `boatSupplyGroupTransform` and create one footprint per
`BOAT_SUPPLY_GROUP_IDS` during construction. Name each
`contact:supply:${groupId}`. Apply the authored base X/Z, rotation Y, and a
bounded scale derived from the existing layout slot rather than model bounds.
Store meshes in `contactFootprintById`. In `syncGroup`, set footprint visibility
to `record.visibleCopies > 0`. Do not change footprint transforms in `update`,
`playEventItemUse`, or `cancelActiveAnimation`.

- [ ] **Step 4: Run the supply test**

Run:

```powershell
npm.cmd test -- tests/BoatSupplyDisplay.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing BoatWorld ownership and platform-contact tests**

Assert the scene contains:

```ts
expect(scene.getObjectByName('contact-depth-layer')).toBeInstanceOf(Group);
expect(scene.getObjectByName('contact:platform-rail-port')).toBeInstanceOf(Mesh);
expect(scene.getObjectByName('contact:platform-rail-starboard')).toBeInstanceOf(Mesh);
expect(scene.getObjectByName('contact:platform-slat-joint-3')).toBeInstanceOf(Mesh);
```

Spy on one footprint geometry, one seam geometry, and the shared material;
dispose the world twice and assert each resource is disposed once. Retain the
existing buoyancy/shared-wave assertions unchanged.

- [ ] **Step 6: Integrate and own the survival contact layer**

Create the layer immediately after the lifeboat build, attach its root to
`this.boat`, add the two rail seams and four selected slat-joint seams, and pass
it to `BoatSupplyDisplay`. Add `contactDepth.dispose()` to `BoatWorld.dispose`
after child displays stop using it and before the world-owned resource sets are
disposed. Ensure the layer's resources are not also inserted into
`ownedGeometries` or `ownedMaterials`.

- [ ] **Step 7: Run focused survival world tests**

Run:

```powershell
npm.cmd test -- tests/BoatSupplyDisplay.test.ts tests/BoatWorld.test.ts tests/BoatBuoyancy.test.ts tests/SceneResources.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the survival contact slice**

```powershell
git add src/survival/BoatWorld.ts src/survival/BoatSupplyDisplay.ts tests/BoatSupplyDisplay.test.ts tests/BoatWorld.test.ts
git commit -m "feat: seat lifeboat supplies with local contacts"
```

---

### Task 4: Projected Fishing and Repair Dialogs

**Files:**
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- `SurvivalUI` continues to expose `setAnchors`, `showFishingResult`,
  `hideFishingResult`, and existing action callbacks unchanged.
- Add private `positionRoutineDialog(layer, anchorId, size)` and
  `positionOpenRoutineDialogs()` helpers.
- Use deterministic dimensions:

```ts
const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;
const ROUTINE_DIALOG_SIZE = {
  fishing: { width: 360, height: 250 },
  repair: { width: 430, height: 360 },
} as const;
```

- [ ] **Step 1: Write failing structure and positioning tests**

Assert the two sections use `routine-dialog` and not the old visual classes:

```ts
const fishing = mount.querySelector<HTMLElement>('[data-fishing-result]')!;
const repair = mount.querySelector<HTMLElement>('[data-repair-options]')!;
expect(fishing.classList).toContain('routine-dialog');
expect(repair.classList).toContain('routine-dialog');
expect(fishing.classList).not.toContain('survival-overlay');
expect(fishing.classList).not.toContain('cinematic-overlay');
expect(repair.classList).not.toContain('survival-overlay');
expect(repair.classList).not.toContain('cinematic-overlay');
```

Set `window.innerWidth = 1280` and `window.innerHeight = 720`, publish a
`fishing-tools` anchor at `(980, 420)`, call `showFishingResult`, and assert a
left placement with numeric `--routine-x` and `--routine-y` inside the margin.
Move the same anchor to `(120, 120)` through `setAnchors` and assert the same
DOM node changes to right placement. Repeat for `repair-tools` and a short
720×480 viewport. Publish no relevant anchor and assert deterministic
`data-anchor-state="fallback"` coordinates.

- [ ] **Step 2: Run the UI test and confirm it fails**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts
```

Expected: FAIL because the dialogs still use cinematic full-screen classes and
have no projected placement.

- [ ] **Step 3: Implement deterministic projected placement**

Change the markup to:

```html
<section class="routine-dialog routine-dialog--fishing" ...>
  <div class="routine-dialog__card fishing-result-card">...</div>
</section>
<section class="routine-dialog routine-dialog--repair" ...>
  <div class="routine-dialog__card">...</div>
</section>
```

Keep `role="dialog"`, `aria-modal="true"`, labels, `inert`, and all data
attributes. In `positionRoutineDialog`:

1. read the current anchor from `this.anchors`;
2. use `window.innerWidth/innerHeight` with a minimum of one pixel;
3. place to the right when it fits, otherwise to the left;
4. clamp X/Y to `ROUTINE_DIALOG_MARGIN`;
5. set `--routine-x`, `--routine-y`, `data-placement`, and
   `data-anchor-state="projected"`;
6. use `x = viewportWidth * 0.56` and `y = viewportHeight * 0.52` before
   clamping when the anchor is absent or invisible, and set
   `data-anchor-state="fallback"`.

Call the helper from `setAnchors`, `showLayer` for either routine dialog, and
the existing resize-driven anchor update path. Reuse the existing modal list,
background `inert`, focus trap, Continue/Cancel/Escape, and focus return.

- [ ] **Step 4: Replace the full-screen CSS treatment**

Make `.routine-dialog` a transparent absolute inset interaction container with
no pseudo-element or background. Position `.routine-dialog__card` with:

```css
left: var(--routine-x);
top: var(--routine-y);
width: min(var(--routine-width), calc(100vw - 40px));
transform: translateY(8px) rotate(-0.35deg);
opacity: 0;
```

The visible state uses a 180-ms opacity/transform reveal and enables pointer
events only on the card. Repair targets remain scrollable at short heights.
Under `prefers-reduced-motion: reduce`, remove travel/rotation and set a
near-immediate opacity transition. Preserve the current typography, buttons,
focus outlines, and semantic state styles.

- [ ] **Step 5: Run the full SurvivalUI contract**

Run:

```powershell
npm.cmd test -- tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/FishingSession.test.ts
```

Expected: PASS with unchanged action payload and lifecycle assertions.

- [ ] **Step 6: Commit the scene-integrated UI slice**

```powershell
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: project routine survival dialogs"
```

---

### Task 5: Regression and Visual Verification

**Files:**
- Modify only if verification exposes a scoped defect in the files already
  listed above.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run the focused three-slice suite**

```powershell
npm.cmd test -- tests/ContactDepthLayer.test.ts tests/ShipGeometry.test.ts tests/ShipFurniture.test.ts tests/ShipLayout.test.ts tests/ShipItemPlacement.test.ts tests/BoatSupplyDisplay.test.ts tests/BoatWorld.test.ts tests/BoatBuoyancy.test.ts tests/SceneResources.test.ts tests/SurvivalUI.test.ts tests/SurvivalPhase.test.ts tests/FishingSession.test.ts
```

Expected: all focused test files pass with zero failures.

- [ ] **Step 2: Run the full automated suite**

```powershell
npm.cmd test
```

Expected: all test files pass with zero failures.

- [ ] **Step 3: Run the production build**

```powershell
npm.cmd run build
```

Expected: TypeScript emits no errors and Vite completes the production build.
The existing chunk-size warning is informational.

- [ ] **Step 4: Perform the desktop visual matrix**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

At 1280×720 and 1920×1080 inspect:

- fishing catch and miss result cards beside the rod/catch area;
- repair selection with one and several broken items beside the toolbox;
- keyboard focus, Escape, Continue, Cancel, and short-height clamping;
- normal and reduced-motion entry;
- the start-screen crew-cabin/wheelhouse silhouette;
- active crew-cabin desk/bookcase traversal;
- survival supplies with sparse and full inventory.

Reject contact accents that read as opaque stickers, broad outlines, or grime.
Confirm the sea, sky, controls, collision response, item placement, and vessel
motion are unchanged.

- [ ] **Step 5: Inspect the final diff and repository status**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended implementation files plus the
user's pre-existing `AGENTS.md` modification are present.

- [ ] **Step 6: Commit any verification-only correction**

If Step 4 required a scoped correction, stage only its implementation and test
files and commit:

```powershell
git commit -m "fix: refine local visual slice presentation"
```

If no correction was required, do not create an empty commit.
