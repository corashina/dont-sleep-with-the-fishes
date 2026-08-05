# Underwater Menu Depth Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the underwater menu with a left foreground title sign, a skull-only small boat, distant sand hills, and a simplified wreck of Dorothy.

**Architecture:** Add three static scene components with explicit resource ownership: `MenuTitleSign`, `SunkenDorothyWreck`, and `DistantSeabed`. `UnderwaterMenuWorld` composes them, places the skull directly in the boat, and changes only the fixed camera target. `MenuUI` keeps an accessible hidden heading while the visible title moves into the Three.js texture.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, HTML Canvas 2D, Vitest 3, jsdom, Vite 7.

## Global Constraints

- Read `VISUAL_STYLE_GUIDE.md` before changing scene composition, lighting, materials, animation, or UI.
- Keep `MENU_CAMERA_POSITION` at `[0, 1.35, 7.8]`.
- Set the fixed camera target to `[0, 2.0, -4.8]`.
- Keep the small boat in the foreground and Dorothy behind it.
- Render only the skull. Do not render the procedural skeleton, `fishBone`, or `largeBone`.
- Put the exact visible title `don't sleep with the fishes` on the left wooden sign.
- Keep START and HOW TO PLAY as accessible HTML actions in their current positions.
- Keep the current sharks, fish, bubbles, particles, plants, caustics, pointer lock, fade, intro, and return-to-menu behavior.
- Add no downloaded model, package, audio, action, menu state, second wreck, or large anchor.
- Do not add reduced-motion behavior.
- Avoid allocations and repeated setup during frame updates and rendering.
- Keep all unrelated working-tree changes intact.

## File Structure

### New files

- `src/menu/MenuSceneComponent.ts` — shared static scene-component contract.
- `src/menu/MenuTitleSign.ts` — wooden sign, deterministic canvas title texture, and owned resources.
- `src/menu/SunkenDorothyWreck.ts` — simplified procedural Dorothy silhouette and owned resources.
- `src/menu/DistantSeabed.ts` — three ridge bands, sparse rocks, plants, and wooden debris.
- `tests/MenuTitleSign.test.ts` — sign texture, placement, structure, and disposal.
- `tests/SunkenDorothyWreck.test.ts` — wreck parts, placement, bounds, and disposal.
- `tests/DistantSeabed.test.ts` — ridge/detail counts, material sharing, bounds, and disposal.

### Modified files

- `src/menu/UnderwaterMenuWorld.ts` — new composition, camera target, skull placement, component rollback, and removal of bone actors.
- `src/menu/MenuUI.ts` — visually hidden accessible title and unchanged actions.
- `src/styles/main.css` — hidden-title rule and explicit first-row spacing.
- `tests/UnderwaterMenuWorld.test.ts` — revised composition, camera, rollback, and resource assertions.
- `tests/MenuUI.test.ts` — hidden title and action-layout contract.
- `README.md` — revised menu composition and module list.

### Deleted file

- `src/menu/SkeletonAssembly.ts` — obsolete procedural body assembly.

---

### Task 1: Build the textured title sign and hide the HTML title

**Files:**

- Create: `src/menu/MenuSceneComponent.ts`
- Create: `src/menu/MenuTitleSign.ts`
- Create: `tests/MenuTitleSign.test.ts`
- Modify: `src/menu/MenuUI.ts`
- Modify: `src/styles/main.css`
- Modify: `tests/MenuUI.test.ts`

**Interfaces:**

- Produces: `MenuSceneComponent` with `readonly root: Group` and `dispose(): void`.
- Produces: `MenuTitleSign implements MenuSceneComponent`.
- Produces: `MENU_SIGN_TITLE`, `MENU_TITLE_SIGN_POSITION`, and `MENU_TITLE_SIGN_ROTATION`.
- Produces: `TitleCanvasFactory`, used only at construction and injectable in tests.
- Preserves: `MenuUI.onStart`, guide actions, pointer-lock errors, and fade methods.

- [ ] **Step 1: Write the failing sign test**

Create `tests/MenuTitleSign.test.ts` with jsdom and a deterministic canvas surface:

```ts
// @vitest-environment jsdom
import { Mesh } from 'three';
import { expect, it, vi } from 'vitest';
import {
  MENU_SIGN_TITLE,
  MENU_TITLE_SIGN_POSITION,
  MenuTitleSign,
  type TitleCanvasSurface,
} from '../src/menu/MenuTitleSign';

function fakeSurface(): TitleCanvasSurface {
  const canvas = document.createElement('canvas');
  const gradient = { addColorStop: vi.fn() };
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
  return { canvas, context };
}

it('builds the left foreground title sign and owns its texture once', () => {
  const surface = fakeSurface();
  const sign = new MenuTitleSign(() => surface);
  expect(sign.root.name).toBe('menu:title-sign');
  expect(sign.root.position.toArray()).toEqual([...MENU_TITLE_SIGN_POSITION]);
  expect(surface.context.fillText).toHaveBeenCalledWith(MENU_SIGN_TITLE, 512, 184);
  expect(sign.root.getObjectByName('menu:title-sign-board')).toBeInstanceOf(Mesh);
  expect(sign.root.getObjectByName('menu:title-sign-post-left')).toBeInstanceOf(Mesh);
  expect(sign.root.getObjectByName('menu:title-sign-post-right')).toBeInstanceOf(Mesh);
  const textureDispose = vi.spyOn(sign.texture, 'dispose');
  sign.dispose();
  sign.dispose();
  expect(textureDispose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the sign test and verify the missing-module failure**

Run:

```powershell
npm.cmd exec -- vitest run tests/MenuTitleSign.test.ts
```

Expected: FAIL because `src/menu/MenuTitleSign.ts` does not exist.

- [ ] **Step 3: Add the shared component contract and minimal sign implementation**

Create `src/menu/MenuSceneComponent.ts`:

```ts
import type { Group } from 'three';

export interface MenuSceneComponent {
  readonly root: Group;
  dispose(): void;
}
```

Create `src/menu/MenuTitleSign.ts` with these exact exports and ownership rules:

```ts
import {
  BoxGeometry, CanvasTexture, Group, LinearFilter, Mesh,
  MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { disposeResourceSets } from '../world/SceneResources';

export const MENU_SIGN_TITLE = "don't sleep with the fishes";
export const MENU_TITLE_SIGN_POSITION = [-2.65, 0.05, 1.8] as const;
export const MENU_TITLE_SIGN_ROTATION = [0.02, 0.24, -0.06] as const;

export interface TitleCanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}
export type TitleCanvasFactory = () => TitleCanvasSurface;

function browserCanvas(): TitleCanvasSurface {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Menu title sign requires a 2D canvas context');
  return { canvas, context };
}

export class MenuTitleSign implements MenuSceneComponent {
  readonly root = new Group();
  readonly texture: CanvasTexture;
  private readonly geometries = new Set<BoxGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor(factory: TitleCanvasFactory = browserCanvas) {
    const { canvas, context } = factory();
    canvas.width = 1024;
    canvas.height = 320;
    const gradient = context.createLinearGradient(0, 0, 1024, 320);
    gradient.addColorStop(0, '#3b281d');
    gradient.addColorStop(0.48, '#76513a');
    gradient.addColorStop(1, '#2d2019');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 320);
    context.strokeStyle = '#21150f';
    context.lineWidth = 14;
    context.strokeRect(10, 10, 1004, 300);
    context.fillStyle = '#e5dcc2';
    context.font = '900 74px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(MENU_SIGN_TITLE, 512, 184);

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;

    const boardGeometry = new BoxGeometry(4.2, 1.2, 0.18);
    const leftPostGeometry = new BoxGeometry(0.22, 2.5, 0.22);
    const rightPostGeometry = new BoxGeometry(0.20, 2.2, 0.20);
    const boardMaterial = new MeshStandardMaterial({
      map: this.texture,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
    });
    const postMaterial = new MeshStandardMaterial({
      color: 0x4b3425,
      roughness: 1,
      metalness: 0,
    });
    this.geometries.add(boardGeometry);
    this.geometries.add(leftPostGeometry);
    this.geometries.add(rightPostGeometry);
    this.materials.add(boardMaterial);
    this.materials.add(postMaterial);

    const board = new Mesh(boardGeometry, boardMaterial);
    board.name = 'menu:title-sign-board';
    board.position.set(0, 1.55, 0);
    const leftPost = new Mesh(leftPostGeometry, postMaterial);
    leftPost.name = 'menu:title-sign-post-left';
    leftPost.position.set(-1.45, 0.45, 0.03);
    leftPost.rotation.z = 0.04;
    const rightPost = new Mesh(rightPostGeometry, postMaterial);
    rightPost.name = 'menu:title-sign-post-right';
    rightPost.position.set(1.48, 0.52, 0.02);
    rightPost.rotation.z = -0.035;

    this.root.name = 'menu:title-sign';
    this.root.position.set(...MENU_TITLE_SIGN_POSITION);
    this.root.rotation.set(...MENU_TITLE_SIGN_ROTATION);
    this.root.add(board, leftPost, rightPost);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.texture.dispose();
    disposeResourceSets(this.geometries, this.materials);
  }
}
```

- [ ] **Step 4: Run the sign test**

Run:

```powershell
npm.cmd exec -- vitest run tests/MenuTitleSign.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Add the failing hidden-title UI assertions**

Update the first and last tests in `tests/MenuUI.test.ts`:

```ts
const title = mount.querySelector<HTMLHeadingElement>('h1')!;
expect(title.textContent).toBe("DON'T SLEEP WITH THE FISHES");
expect(title.classList).toContain('menu-title-accessible');
expect(mainStyles).toMatch(/\.menu-title-accessible\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
expect(mainStyles).toMatch(/\.underwater-menu-screen__content::before\s*\{[^}]*grid-row:\s*1/s);
```

Run:

```powershell
npm.cmd exec -- vitest run tests/MenuUI.test.ts
```

Expected: FAIL because the title is still visible and the layout spacer is absent.

- [ ] **Step 6: Hide the HTML title and reserve its layout row**

Change the `h1` in `MenuUI.ts`:

```html
<h1 class="menu-title-accessible">DON'T SLEEP WITH THE FISHES</h1>
```

Replace the visible title CSS with:

```css
.menu-title-accessible {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.underwater-menu-screen__content::before {
  grid-row: 1;
  min-height: clamp(88px, 14vh, 150px);
  content: '';
}
```

Remove the old `.underwater-menu-screen h1` visible-title rule. Keep the existing four grid rows and START on row 3.

- [ ] **Step 7: Run focused tests and type-check**

Run:

```powershell
npm.cmd exec -- vitest run tests/MenuTitleSign.test.ts tests/MenuUI.test.ts
npm.cmd run typecheck
```

Expected: both test files pass and TypeScript exits 0.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/menu/MenuSceneComponent.ts src/menu/MenuTitleSign.ts src/menu/MenuUI.ts src/styles/main.css tests/MenuTitleSign.test.ts tests/MenuUI.test.ts
git commit -m "feat: add underwater title sign"
```

---

### Task 2: Build the simplified Dorothy wreck

**Files:**

- Create: `src/menu/SunkenDorothyWreck.ts`
- Create: `tests/SunkenDorothyWreck.test.ts`

**Interfaces:**

- Consumes: `MenuSceneComponent` from Task 1.
- Produces: `SunkenDorothyWreck implements MenuSceneComponent`.
- Produces: `DOROTHY_WRECK_POSITION`, `DOROTHY_WRECK_ROTATION`, and `DOROTHY_WRECK_PART_NAMES`.

- [ ] **Step 1: Write the failing wreck test**

Create `tests/SunkenDorothyWreck.test.ts`:

```ts
import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DOROTHY_WRECK_PART_NAMES,
  DOROTHY_WRECK_POSITION,
  SunkenDorothyWreck,
} from '../src/menu/SunkenDorothyWreck';

it('builds one large buried Dorothy silhouette', () => {
  const wreck = new SunkenDorothyWreck();
  expect(wreck.root.name).toBe('menu:dorothy-wreck');
  expect(wreck.root.position.toArray()).toEqual([...DOROTHY_WRECK_POSITION]);
  for (const name of DOROTHY_WRECK_PART_NAMES) {
    expect(wreck.root.getObjectByName(name)).toBeInstanceOf(Mesh);
  }
  wreck.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(wreck.root);
  expect(bounds.getSize(new Vector3()).z).toBeGreaterThan(12);
  const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull') as Mesh;
  const dispose = vi.spyOn(hull.geometry, 'dispose');
  wreck.dispose();
  wreck.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the wreck test and verify the missing-module failure**

Run:

```powershell
npm.cmd exec -- vitest run tests/SunkenDorothyWreck.test.ts
```

Expected: FAIL because the wreck module does not exist.

- [ ] **Step 3: Implement the static wreck and exact named parts**

Create `src/menu/SunkenDorothyWreck.ts` with these exports:

```ts
export const DOROTHY_WRECK_POSITION = [4.5, -0.9, -22] as const;
export const DOROTHY_WRECK_ROTATION = [0.12, -0.55, -0.30] as const;
export const DOROTHY_WRECK_PART_NAMES = [
  'menu:dorothy-wreck-hull',
  'menu:dorothy-wreck-deck',
  'menu:dorothy-wreck-bridge',
  'menu:dorothy-wreck-funnel',
  'menu:dorothy-wreck-mast',
  'menu:dorothy-wreck-yard',
  'menu:dorothy-wreck-torn-plate-1',
  'menu:dorothy-wreck-torn-plate-2',
  'menu:dorothy-wreck-torn-plate-3',
] as const;
```

Build the hull from this fixed indexed geometry:

```ts
const vertices = new Float32Array([
   0, 0.65, -7,  -1.6, 0.5, -4.8,   1.6, 0.5, -4.8,
  -2.1, 0.55, 7,   2.1, 0.55, 7,     0, -0.9, -6.4,
  -0.7, -1.15, -3.8, 0.7, -1.15, -3.8,
  -1.2, -1.0, 6.8,  1.2, -1.0, 6.8,
]);
const indices = [
  0, 2, 1, 1, 2, 4, 1, 4, 3,
  0, 1, 6, 0, 6, 5, 1, 3, 8, 1, 8, 6,
  0, 5, 7, 0, 7, 2, 2, 7, 9, 2, 9, 4,
  5, 6, 8, 5, 8, 9, 5, 9, 7,
  3, 4, 9, 3, 9, 8,
];
const hullGeometry = new BufferGeometry();
hullGeometry.setAttribute('position', new BufferAttribute(vertices, 3));
hullGeometry.setIndex(indices);
hullGeometry.computeVertexNormals();
```

Use layered `BoxGeometry`, low-segment `CylinderGeometry`, and this custom hull. Use three materials only:

- hull: `0x36565a`, roughness `0.9`, metalness `0.15`;
- rust: `0x7b4430`, roughness `1`, metalness `0.05`;
- exposed wood: `0x654735`, roughness `1`, metalness `0`.

Create the remaining named parts with these local dimensions and transforms:

| Part | Geometry | Position | Rotation | Material |
| --- | --- | --- | --- | --- |
| deck | box `[3.4, 0.25, 10.8]` | `[0, 0.76, 0.7]` | `[0, 0, 0]` | hull |
| bridge | box `[2.5, 1.35, 2.2]` | `[-0.15, 1.55, 1.65]` | `[0, 0.05, 0]` | hull |
| funnel | cylinder `[0.4, 0.52, 1.3, 8]` | `[0.45, 2.55, 0.55]` | `[0, 0, -0.14]` | rust |
| mast | cylinder `[0.08, 0.12, 4.0, 6]` | `[-0.45, 2.65, -1.8]` | `[0, 0, -0.38]` | exposed wood |
| yard | box `[2.6, 0.10, 0.10]` | `[-1.0, 3.38, -1.8]` | `[0.15, 0.12, -0.18]` | exposed wood |
| torn plate 1 | box `[0.12, 0.9, 2.1]` | `[-1.75, 0.2, -2.7]` | `[0.2, 0.15, -0.25]` | rust |
| torn plate 2 | box `[0.14, 0.75, 1.5]` | `[1.7, 0.05, 2.9]` | `[-0.25, -0.2, 0.22]` | rust |
| torn plate 3 | box `[1.1, 0.10, 1.6]` | `[0.9, 0.9, 5.1]` | `[0.18, 0.35, -0.12]` | exposed wood |

The cylinder geometry tuple is `[radiusTop, radiusBottom, height, radialSegments]`. Name every mesh with the matching exported part name. Register every geometry and material in retained sets. Set root placement from the exported constants. Make `dispose()` idempotent and use `disposeResourceSets`.

- [ ] **Step 4: Run the wreck test and type-check**

Run:

```powershell
npm.cmd exec -- vitest run tests/SunkenDorothyWreck.test.ts
npm.cmd run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/menu/SunkenDorothyWreck.ts tests/SunkenDorothyWreck.test.ts
git commit -m "feat: add sunken Dorothy wreck"
```

---

### Task 3: Build the distant seabed ridges and sparse debris

**Files:**

- Create: `src/menu/DistantSeabed.ts`
- Create: `tests/DistantSeabed.test.ts`

**Interfaces:**

- Consumes: `MenuSceneComponent` from Task 1.
- Produces: `DistantSeabed implements MenuSceneComponent`.
- Produces: `DISTANT_RIDGE_COUNT`, `DISTANT_ROCK_COUNT`, `DISTANT_PLANT_COUNT`, and `DISTANT_DEBRIS_COUNT`.

- [ ] **Step 1: Write the failing distant-seabed test**

Create `tests/DistantSeabed.test.ts`:

```ts
import { Box3, Mesh, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import {
  DISTANT_DEBRIS_COUNT, DISTANT_PLANT_COUNT, DISTANT_RIDGE_COUNT,
  DISTANT_ROCK_COUNT, DistantSeabed,
} from '../src/menu/DistantSeabed';

it('builds three sparse deterministic depth layers', () => {
  const distant = new DistantSeabed();
  expect(distant.root.name).toBe('menu:distant-seabed');
  expect(distant.root.getObjectByName('menu:distant-ridges')?.children).toHaveLength(DISTANT_RIDGE_COUNT);
  expect(distant.root.getObjectByName('menu:distant-rocks')?.children).toHaveLength(DISTANT_ROCK_COUNT);
  expect(distant.root.getObjectByName('menu:distant-plants')?.children).toHaveLength(DISTANT_PLANT_COUNT);
  expect(distant.root.getObjectByName('menu:distant-debris')?.children).toHaveLength(DISTANT_DEBRIS_COUNT);
  const bounds = new Box3().setFromObject(distant.root);
  expect(bounds.getSize(new Vector3()).z).toBeGreaterThan(30);
  expect(bounds.max.y).toBeLessThanOrEqual(2.2);
  const first = distant.root.getObjectByName('menu:distant-debris-1') as Mesh;
  const second = distant.root.getObjectByName('menu:distant-debris-2') as Mesh;
  expect(first.geometry).toBe(second.geometry);
  expect(first.material).toBe(second.material);
  const dispose = vi.spyOn(first.geometry, 'dispose');
  distant.dispose();
  distant.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the distant-seabed test and verify the missing-module failure**

Run:

```powershell
npm.cmd exec -- vitest run tests/DistantSeabed.test.ts
```

Expected: FAIL because `DistantSeabed.ts` does not exist.

- [ ] **Step 3: Implement deterministic ridge and detail groups**

Create `src/menu/DistantSeabed.ts` with these exact counts and ridge specs:

```ts
export const DISTANT_RIDGE_COUNT = 3;
export const DISTANT_ROCK_COUNT = 7;
export const DISTANT_PLANT_COUNT = 10;
export const DISTANT_DEBRIS_COUNT = 8;

const RIDGES = [
  { width: 42, depth: 10, z: -12, height: 1.05, phase: 0.2 },
  { width: 52, depth: 13, z: -22, height: 1.65, phase: 1.1 },
  { width: 64, depth: 17, z: -35, height: 2.05, phase: 2.0 },
] as const;
```

For each ridge, create one `PlaneGeometry(width, depth, 12, 6)`, rotate it onto the XZ plane, and update each Y value with this deterministic function:

```ts
const wave = Math.sin(x * 0.19 + spec.phase) * 0.48
  + Math.cos(z * 0.23 - spec.phase) * 0.32
  + Math.sin((x + z) * 0.11) * 0.2;
position.setY(index, Math.max(-0.15, wave) * spec.height - 0.25);
```

Create named groups `menu:distant-ridges`, `menu:distant-rocks`, `menu:distant-plants`, and `menu:distant-debris`.

Keep these fixed detail arrays in the module. Each tuple is `[x, y, z, scale, yaw]`:

```ts
const ROCKS = [
  [-7.8, -0.20, -10.5, 0.75, 0.2], [7.5, -0.15, -13.5, 1.1, 1.1],
  [-11.5, -0.35, -19.0, 1.35, 0.6], [12.0, -0.30, -21.5, 0.9, 2.2],
  [-15.0, -0.40, -29.0, 1.6, 0.4], [15.5, -0.35, -33.0, 1.25, 1.8],
  [-2.0, -0.25, -37.0, 1.0, 2.7],
] as const;

const PLANTS = [
  [-6.2, -0.10, -9.8, 0.8, 0.1], [-9.0, -0.15, -14.2, 1.1, 0.5],
  [6.5, -0.12, -15.0, 0.9, 1.2], [10.0, -0.18, -18.5, 1.3, 2.0],
  [-13.0, -0.22, -22.0, 1.0, 0.8], [1.5, -0.15, -24.5, 0.75, 1.6],
  [13.8, -0.28, -27.0, 1.2, 2.4], [-17.0, -0.30, -32.0, 1.4, 0.3],
  [7.0, -0.25, -35.0, 0.9, 1.9], [-5.5, -0.30, -39.0, 1.1, 2.8],
] as const;

const DEBRIS = [
  [-3.8, -0.05, -10.2, 0.8, -0.35], [-1.8, -0.08, -13.1, 1.0, -0.5],
  [0.4, -0.10, -16.0, 0.7, -0.62], [2.5, -0.12, -19.0, 1.15, -0.72],
  [9.0, -0.10, -12.0, 0.75, 0.42], [7.6, -0.12, -15.2, 1.1, 0.28],
  [6.2, -0.14, -18.2, 0.85, 0.15], [5.0, -0.16, -20.8, 1.0, 0.05],
] as const;
```

Use one `DodecahedronGeometry(0.55, 0)` for rocks, one `ConeGeometry(0.12, 1.3, 5)` for plants, and one `BoxGeometry(1.25, 0.08, 0.22)` for debris. Reuse each geometry across its group. Use four shared materials: one sand material, one rock material, one plant material, and one wood material. Do not use `Math.random()`.

Use `disposeResourceSets` in one idempotent `dispose()` method.

- [ ] **Step 4: Run the distant-seabed test and type-check**

Run:

```powershell
npm.cmd exec -- vitest run tests/DistantSeabed.test.ts
npm.cmd run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/menu/DistantSeabed.ts tests/DistantSeabed.test.ts
git commit -m "feat: add distant underwater terrain"
```

---

### Task 4: Integrate the new composition and remove the body skeleton

**Files:**

- Modify: `src/menu/UnderwaterMenuWorld.ts`
- Delete: `src/menu/SkeletonAssembly.ts`
- Modify: `tests/UnderwaterMenuWorld.test.ts`

**Interfaces:**

- Consumes: `MenuTitleSign`, `SunkenDorothyWreck`, `DistantSeabed`, and `MenuSceneComponent`.
- Produces: `UnderwaterMenuComponentFactories` for focused failure injection.
- Preserves: `UnderwaterMenuWorld.actors`, animated actor counts, camera fixed flag, scene restoration, and idempotent disposal.

- [ ] **Step 1: Rewrite the composition assertions before production code**

Update `tests/UnderwaterMenuWorld.test.ts` to require:

```ts
expect(created).not.toContain('fishBone');
expect(created).not.toContain('largeBone');
expect(created.filter((id) => id === 'skull')).toHaveLength(1);
expect(world.root.getObjectByName('menu:seated-skeleton')).toBeUndefined();
expect(world.root.getObjectByName('menu:skull')).toBeDefined();
expect(world.root.getObjectByName('menu:title-sign')).toBeDefined();
expect(world.root.getObjectByName('menu:dorothy-wreck')).toBeDefined();
expect(world.root.getObjectByName('menu:distant-seabed')).toBeDefined();
expect(camera.position.toArray()).toEqual([0, 1.35, 7.8]);

const expected = new PerspectiveCamera();
expected.position.set(0, 1.35, 7.8);
expected.lookAt(new Vector3(0, 2.0, -4.8));
expect(camera.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-8);

const skullPosition = world.root.getObjectByName('menu:skull')!.getWorldPosition(new Vector3());
const boatPosition = world.root.getObjectByName('menu:boat')!.getWorldPosition(new Vector3());
expect(skullPosition.distanceTo(boatPosition)).toBeLessThan(1.25);
```

Add a second test that injects component factories. Make title-sign creation succeed and Dorothy creation throw. Assert title-sign disposal and every created model disposer each run once. Assert the original error is preserved.

- [ ] **Step 2: Run the world test and verify the expected failures**

Run:

```powershell
npm.cmd exec -- vitest run tests/UnderwaterMenuWorld.test.ts
```

Expected: FAIL because the old body and bones remain, the camera target is low, components are absent, and no factories exist.

- [ ] **Step 3: Add the component-factory contract and default factories**

Add this interface to `UnderwaterMenuWorld.ts`:

```ts
export interface UnderwaterMenuComponentFactories {
  createTitleSign(): MenuSceneComponent;
  createDorothyWreck(): MenuSceneComponent;
  createDistantSeabed(): MenuSceneComponent;
}

const DEFAULT_COMPONENT_FACTORIES: UnderwaterMenuComponentFactories = {
  createTitleSign: () => new MenuTitleSign(),
  createDorothyWreck: () => new SunkenDorothyWreck(),
  createDistantSeabed: () => new DistantSeabed(),
};
```

Add an optional fourth constructor parameter:

```ts
constructor(
  scene: Scene,
  camera: PerspectiveCamera,
  models: ModelFactory,
  components: UnderwaterMenuComponentFactories = DEFAULT_COMPONENT_FACTORIES,
)
```

Create components in order: title sign, Dorothy, distant seabed. Keep a retained `MenuSceneComponent[]`. On a later construction failure, call completed component disposers in reverse order and model-instance disposers. Use `ignoreCleanupError` so cleanup cannot replace the primary error.

- [ ] **Step 4: Remove the body and place only the skull**

Remove the `SkeletonAssembly` imports, field, creation, scene addition, and disposal step.

Remove `fishBone` and `largeBone` model creation and placement.

Replace the skeleton placement with:

```ts
skull.root.name = 'menu:skull';
skull.root.position.set(0.12, 1.32, -4.35);
skull.root.rotation.set(0.3, 0.45, -0.22);
```

Add `skull.root`, `titleSign.root`, `dorothy.root`, and `distantSeabed.root` to the world root. Add component disposers to world disposal before shared world resources.

Set:

```ts
export const MENU_CAMERA_TARGET = [0, 2.0, -4.8] as const;
```

Keep `MENU_CAMERA_POSITION` unchanged. Reuse one retained `Vector3` or direct numeric arguments during construction. Do not add camera work to `update()`.

Delete `src/menu/SkeletonAssembly.ts` after removing its last import.

- [ ] **Step 5: Run world, actor, lifecycle, and UI tests**

Run:

```powershell
npm.cmd exec -- vitest run tests/UnderwaterMenuWorld.test.ts tests/UnderwaterMenuAnimator.test.ts tests/MainMenuPhase.test.ts tests/MenuTitleSign.test.ts tests/MenuUI.test.ts
npm.cmd run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 6: Verify obsolete runtime references are gone**

Run:

```powershell
rg "SkeletonAssembly|createSeatedSkeleton|disposeSeatedSkeleton|menu:seated-skeleton" src
```

Expected: no matches.

Run:

```powershell
rg "createModel\(models, '(fishBone|largeBone)'" src/menu/UnderwaterMenuWorld.ts
```

Expected: no matches.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/menu/UnderwaterMenuWorld.ts src/menu/SkeletonAssembly.ts tests/UnderwaterMenuWorld.test.ts
git commit -m "feat: deepen underwater menu composition"
```

---

### Task 5: Document and verify the complete scene

**Files:**

- Modify: `README.md`
- Modify only if QA finds a reproduced defect: files from Tasks 1–4 and their focused tests.

**Interfaces:**

- Consumes: the complete new menu composition.
- Produces: verified documentation, full automated evidence, and three viewport checks.

- [ ] **Step 1: Update README menu documentation**

Replace the current menu description with this factual summary:

```md
The main menu uses a fixed underwater camera. A skull rests in a small sunken boat in the foreground. The title is painted onto a planted wooden sign on the left. Sand ridges, sparse debris, and a large tilted wreck of Dorothy create the distant depth layers. Sharks, fish, kelp, bubbles, suspended matter, and caustics animate while the camera stays fixed.
```

Add these modules to the architecture list:

```md
- `src/menu/MenuTitleSign` — the owned title canvas texture and wooden sign geometry.
- `src/menu/SunkenDorothyWreck` — the simplified static Dorothy silhouette.
- `src/menu/DistantSeabed` — the static ridge, rock, plant, and debris depth layers.
```

- [ ] **Step 2: Run the complete automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node scripts/check-menu-models.mjs
git diff --check
```

Expected:

- all Vitest files pass;
- TypeScript exits 0;
- Vite completes the production build;
- eight committed menu models and their hashes pass the audit;
- no whitespace errors appear.

- [ ] **Step 3: Start the local server for viewport QA**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Use the Browser skill. Open:

```text
http://127.0.0.1:5173/dont-sleep-with-the-fishes/
```

- [ ] **Step 4: Verify the three required viewports**

Check `1440x810`, `1920x800`, and `1024x700`.

At each size, confirm all of these points:

- the wooden sign stays on the left and its exact lowercase title is readable;
- the sign does not cover the small boat;
- the skull is visible inside the small boat;
- no ribs, limbs, `fishBone`, or `largeBone` appear;
- Dorothy reads as a large ship behind the small boat;
- Dorothy is tilted and partly buried in a ridge;
- the lower third contains hills and sparse detail;
- the upper frame contains more open water than seabed;
- no foreground or distant geometry edge is visible;
- START and HOW TO PLAY remain clear and clickable.

- [ ] **Step 5: Verify interaction and a stable ten-second sample**

Open and close HOW TO PLAY with mouse and Escape. Confirm focus returns to HOW TO PLAY.

Press START. If trusted pointer lock is available, confirm the existing fade and intro handoff. If the browser denies pointer lock, confirm the menu stays usable and reports the existing guidance.

Observe the menu for ten seconds. Confirm the camera does not move. Confirm sharks, fish, plants, bubbles, particles, and caustics move. Confirm no new menu root or DOM node appears during the sample.

- [ ] **Step 6: Fix only reproduced defects and repeat their focused checks**

If QA finds a defect, add one failing focused regression test before changing production code. Apply the smallest fix. Repeat the affected viewport and the focused test.

Do not add polish that is not in the design spec.

- [ ] **Step 7: Commit Task 5**

```powershell
git add README.md src/menu src/styles/main.css tests
git commit -m "docs: describe deeper underwater menu"
```

Before committing, use `git status --short` to ensure the command includes only Task 5 files and any verified QA fix.
