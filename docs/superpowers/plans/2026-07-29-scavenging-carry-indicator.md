# Scavenging Carry Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scavenging carry drawings with model thumbnails, move the watch right, soften the circles, and show a full-hand prompt.

**Architecture:** A development-only browser renderer creates transparent PNG files from the existing normalized GLB models. `GameUI` uses a typed thumbnail manifest and three persistent slot elements. It updates a slot only when its item type changes.

**Tech Stack:** TypeScript, Three.js, Vite, Vitest, jsdom, CSS, Node.js

## Global Constraints

- Keep three weight slots and the current carry rules.
- Repeat one thumbnail across every weight slot that its item uses.
- Keep the slot group centered.
- Place the pocket watch from the slot group's right edge.
- Show `HANDS FULL - RETURN TO THE BOAT` only at carried weight three.
- Do not render 3D thumbnails during the game.
- Do not add reduced-motion behavior.
- Do not allocate slot arrays or rebuild unchanged slot DOM during each frame.
- Preserve all existing uncommitted work.
- Stage only feature-owned files or feature-owned hunks.

---

## File Map

- `scripts/item-thumbnail-renderer.html`: Loads the development thumbnail renderer.
- `scripts/item-thumbnail-renderer.ts`: Renders normalized item models and uploads PNG bytes.
- `scripts/generate-item-thumbnails.mjs`: Starts Vite, launches a headless browser, and writes PNG files.
- `scripts/check-item-thumbnails.mjs`: Verifies exact thumbnail coverage and valid PNG files.
- `src/assets/models/item-thumbnails/*.png`: Stores generated transparent thumbnails.
- `src/ui/itemThumbnailManifest.ts`: Maps each scavenging `ItemId` to its Vite asset URL.
- `src/ui/GameUI.ts`: Owns persistent carry slots, thumbnails, and the full-hand status.
- `src/styles/main.css`: Owns carry layout, transparency, thumbnail treatment, and responsive sizing.
- `tests/itemThumbnailManifest.test.ts`: Tests thumbnail URL coverage.
- `tests/GameUI.test.ts`: Tests carry state and DOM reuse.
- `package.json`: Adds thumbnail generation and check commands.

### Task 1: Thumbnail Asset Pipeline

**Files:**

- Create: `scripts/item-thumbnail-renderer.html`
- Create: `scripts/item-thumbnail-renderer.ts`
- Create: `scripts/generate-item-thumbnails.mjs`
- Create: `scripts/check-item-thumbnails.mjs`
- Create: `src/assets/models/item-thumbnails/*.png`
- Create: `src/ui/itemThumbnailManifest.ts`
- Create: `tests/itemThumbnailManifest.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `SCAVENGE_ITEM_IDS`, `PropModelLibrary.load()`, and `PropModelLibrary.create(instance)`.
- Produces: `itemThumbnailUrl(id: ItemId): string`.
- Produces: `npm run thumbnails:generate`.
- Produces: `npm run thumbnails:check`.

- [ ] **Step 1: Write the failing thumbnail manifest test**

```ts
import { describe, expect, it } from 'vitest';
import { SCAVENGE_ITEM_IDS } from '../src/game/scavengeCatalog';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

describe('item thumbnail manifest', () => {
  it('maps every scavenging item to one PNG asset', () => {
    for (const id of SCAVENGE_ITEM_IDS) {
      expect(itemThumbnailUrl(id)).toMatch(/\.png(?:\?|$)/);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
npm run test -- tests/itemThumbnailManifest.test.ts
```

Expected: FAIL because `src/ui/itemThumbnailManifest.ts` does not exist.

- [ ] **Step 3: Add the development renderer page**

Create `scripts/item-thumbnail-renderer.html` with one module entry:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Item thumbnails</title></head>
  <body>
    <script type="module" src="/scripts/item-thumbnail-renderer.ts"></script>
  </body>
</html>
```

In `scripts/item-thumbnail-renderer.ts`:

- Load `PropModelLibrary`.
- Create a 256x256 alpha `WebGLRenderer`.
- Use an orthographic camera at a fixed three-quarter view.
- Add hemisphere, key, and fill lights.
- Create each model with `${id}-1` as its instance ID.
- Apply only the declared thumbnail rotation override.
- Center the model from its world-space `Box3`.
- Fit the orthographic camera with a 12 percent margin.
- Render with clear alpha zero.
- Upload `canvas.toBlob('image/png')` to `/__item-thumbnail/${id}`.
- Dispose clone geometry, clone materials, the library, and the renderer exactly once.
- POST `/__item-thumbnail-complete` after all items finish.

Use this fixed override contract:

```ts
const THUMBNAIL_ROTATIONS: Readonly<Partial<Record<ItemId, readonly [number, number, number]>>> = {
  map: [-0.35, 0.25, -0.08],
  fishingNet: [0, -0.35, 0],
  bottledPaper: [0, -0.3, 0],
  umbrella: [0, -0.45, 0],
  swimRing: [-0.25, 0.3, 0],
  harpoonGun: [0, -0.35, 0],
};
```

- [ ] **Step 4: Add the Node generator**

In `scripts/generate-item-thumbnails.mjs`:

- Start a Vite development server on an available localhost port.
- Add POST middleware for item PNG bytes and completion.
- Reject item IDs outside the runtime scavenging catalog.
- Write only to `src/assets/models/item-thumbnails`.
- Find Chrome or Edge from `CHROME_PATH` and standard Windows, macOS, and Linux paths.
- Launch one headless browser process with the renderer page URL.
- Stop after completion or a 60-second timeout.
- Close the browser and Vite server in `finally`.
- Fail when any expected thumbnail was not written.

The browser arguments must include:

```js
[
  '--headless=new',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  rendererUrl,
]
```

- [ ] **Step 5: Add the asset check**

In `scripts/check-item-thumbnails.mjs`:

- Read `ITEM_IDS` from `src/game/itemCatalog.ts`.
- Exclude only `energyBar`.
- Require one `<id>.png` file per remaining ID.
- Reject extra files.
- Check the eight-byte PNG signature.
- Require width and height of 256 from the IHDR chunk.
- Require color type 6 for RGBA output.
- Print each accepted file and set exit code 1 for any error.

- [ ] **Step 6: Add package commands**

Add these scripts:

```json
"thumbnails:generate": "node scripts/generate-item-thumbnails.mjs",
"thumbnails:check": "node scripts/check-item-thumbnails.mjs"
```

- [ ] **Step 7: Generate the PNG files**

Run:

```powershell
npm run thumbnails:generate
```

Expected: 18 transparent 256x256 PNG files appear in `src/assets/models/item-thumbnails`.

- [ ] **Step 8: Add the typed manifest**

Create `src/ui/itemThumbnailManifest.ts`:

```ts
import type { ItemId } from '../game/ItemState';

const thumbnailModules = import.meta.glob<string>(
  '../assets/models/item-thumbnails/*.png',
  { eager: true, query: '?url', import: 'default' },
);

export function itemThumbnailUrl(id: ItemId): string {
  const url = thumbnailModules[`../assets/models/item-thumbnails/${id}.png`];
  if (url === undefined) throw new Error(`Missing item thumbnail: ${id}`);
  return url;
}
```

- [ ] **Step 9: Run the focused checks**

Run:

```powershell
npm run thumbnails:check
npm run test -- tests/itemThumbnailManifest.test.ts
```

Expected: both commands PASS.

- [ ] **Step 10: Commit the pipeline**

Stage only the files listed in this task. Check the staged file list before commit.

```powershell
git add package.json scripts/item-thumbnail-renderer.html scripts/item-thumbnail-renderer.ts scripts/generate-item-thumbnails.mjs scripts/check-item-thumbnails.mjs src/assets/models/item-thumbnails src/ui/itemThumbnailManifest.ts tests/itemThumbnailManifest.test.ts
git diff --cached --name-only
git commit -m "feat: add scavenging item thumbnails"
```

### Task 2: Persistent Carry Slot Behavior

**Files:**

- Modify: `src/ui/GameUI.ts`
- Modify: `tests/GameUI.test.ts`

**Interfaces:**

- Consumes: `itemThumbnailUrl(id: ItemId): string`.
- Produces: three persistent `[data-weight-circle]` nodes.
- Produces: `[data-carry-full]` with polite live-region behavior.

- [ ] **Step 1: Add the failing carry tests**

Add a helper that creates a real session:

```ts
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

function runningSession(types: readonly ItemId[]): ScavengeSession {
  const items = types.map((type, index): ItemInstance => ({
    instanceId: `${type}-${index + 1}` as ItemInstanceId,
    type,
  }));
  const session = new ScavengeSession(items);
  session.start();
  items.forEach(({ instanceId }) => session.pickUp(instanceId));
  return session;
}
```

Add these tests:

```ts
it('keeps three empty carry circles', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  ui.render(runningSession([]).snapshot());
  expect(mount.querySelectorAll('[data-weight-circle]')).toHaveLength(3);
  expect(mount.querySelectorAll('[data-weight-circle].is-filled')).toHaveLength(0);
  ui.dispose();
});

it('repeats a heavy item thumbnail across its weight slots', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  ui.render(runningSession(['medicalKit']).snapshot());
  const images = [...mount.querySelectorAll<HTMLImageElement>('[data-weight-circle] img')];
  expect(images).toHaveLength(2);
  expect(images.every(
    (image) => image.getAttribute('src') === itemThumbnailUrl('medicalKit'),
  )).toBe(true);
  ui.dispose();
});

it('shows and clears the full-hand status', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  const session = runningSession(['anchor']);
  ui.render(session.snapshot());
  expect(mount.querySelector('[data-carry-full]')?.textContent)
    .toBe('HANDS FULL - RETURN TO THE BOAT');
  session.saveCarriedBundle();
  ui.render(session.snapshot());
  expect(mount.querySelector('[data-carry-full]')?.textContent).toBe('');
  ui.dispose();
});

it('reuses unchanged carry slot nodes', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  const session = runningSession(['cannedFood']);
  ui.render(session.snapshot());
  const before = [...mount.querySelectorAll('[data-weight-circle]')];
  ui.render(session.snapshot());
  expect([...mount.querySelectorAll('[data-weight-circle]')]).toEqual(before);
  ui.dispose();
});

it('keeps a filled slot when its thumbnail fails', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  ui.render(runningSession(['cannedFood']).snapshot());
  const image = mount.querySelector<HTMLImageElement>('[data-weight-circle] img')!;
  image.dispatchEvent(new Event('error'));
  expect(image.hidden).toBe(true);
  expect(image.closest('[data-weight-circle]')?.classList).toContain('is-filled');
  ui.dispose();
});
```

- [ ] **Step 2: Run the focused test and verify failures**

Run:

```powershell
npm run test -- tests/GameUI.test.ts
```

Expected: FAIL because the HUD still uses SVG item artwork and has no full-hand status.

- [ ] **Step 3: Add persistent slot ownership**

In `GameUI`:

```ts
private readonly carrySlots: readonly HTMLElement[];
private readonly carryFull: HTMLElement;
private readonly carryTypes: [ItemId | null, ItemId | null, ItemId | null] =
  [null, null, null];
private carryWasFull = false;
```

Keep the three slot spans in constructor markup. Add:

```html
<p class="carry-full ui-role-context" data-carry-full aria-live="polite"></p>
```

Read the nodes once:

```ts
this.carrySlots = [...this.root.querySelectorAll<HTMLElement>('[data-weight-circle]')];
if (this.carrySlots.length !== 3) throw new Error('Carry HUD requires three weight slots');
this.carryFull = requireElement(this.root, '[data-carry-full]');
```

- [ ] **Step 4: Replace SVG artwork with model images**

Remove the `itemArtwork` import. Add `itemThumbnailUrl`.

Implement one slot update method:

```ts
private updateCarrySlot(index: number, type: ItemId | null): void {
  if (this.carryTypes[index] === type) return;
  this.carryTypes[index] = type;
  const circle = this.carrySlots[index]!;
  circle.replaceChildren();
  circle.classList.toggle('is-filled', type !== null);
  circle.classList.remove('has-image-error');
  if (type === null) {
    delete circle.dataset.itemType;
    return;
  }
  circle.dataset.itemType = type;
  const image = document.createElement('img');
  image.className = 'weight-circle__thumbnail';
  image.src = itemThumbnailUrl(type);
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('error', () => {
    image.hidden = true;
    circle.classList.add('has-image-error');
  }, { once: true });
  circle.append(image);
}
```

Implement `renderCarry` without temporary slot arrays:

```ts
private renderCarry(snapshot: ScavengeSnapshot): void {
  let slotIndex = 0;
  for (const { type } of snapshot.carriedItems) {
    for (let unit = 0; unit < ITEM_DEFINITIONS[type].weight && slotIndex < 3; unit += 1) {
      this.updateCarrySlot(slotIndex, type);
      slotIndex += 1;
    }
  }
  while (slotIndex < 3) {
    this.updateCarrySlot(slotIndex, null);
    slotIndex += 1;
  }

  const isFull = snapshot.carriedWeight === 3;
  if (isFull !== this.carryWasFull) {
    this.carryWasFull = isFull;
    this.carryFull.textContent = isFull ? 'HANDS FULL - RETURN TO THE BOAT' : '';
  }
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```powershell
npm run test -- tests/GameUI.test.ts tests/itemThumbnailManifest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Review the shared-file diff**

`src/ui/GameUI.ts` was modified before this feature. Confirm that existing sinking-related edits remain unchanged.

```powershell
git diff -- src/ui/GameUI.ts tests/GameUI.test.ts
```

Do not stage pre-existing hunks. Commit only after the staged diff contains this task's changes.

### Task 3: Layout and Print Treatment

**Files:**

- Modify: `src/styles/main.css`
- Modify: `tests/GameUI.test.ts`

**Interfaces:**

- Consumes: `.carried`, `.weight-circles__row`, `.weight-circle__thumbnail`, `.carry-full`, and `.pocket-watch`.
- Produces: centered slots with a watch anchored to the right edge.

- [ ] **Step 1: Add failing CSS contract tests**

Read the style file:

```ts
import { readFileSync } from 'node:fs';

const mainStyles = readFileSync('src/styles/main.css', 'utf8');
```

Add:

```ts
it('anchors the watch to the right of the centered carry slots', () => {
  expect(mainStyles).toMatch(
    /\.carried\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;/s,
  );
  expect(mainStyles).toMatch(
    /\.pocket-watch\s*\{[^}]*position:\s*absolute;[^}]*left:\s*calc\(100% \+ 16px\);/s,
  );
});

it('keeps thumbnail opacity separate from the translucent circle treatment', () => {
  expect(mainStyles).toMatch(/\.weight-circle__thumbnail\s*\{[^}]*opacity:\s*1;/s);
  expect(mainStyles).not.toMatch(/\.weight-circle\s*\{[^}]*opacity:/s);
});
```

- [ ] **Step 2: Run the tests and verify failures**

Run:

```powershell
npm run test -- tests/GameUI.test.ts
```

Expected: FAIL because the watch remains in the centered flex row.

- [ ] **Step 3: Center the slots and anchor the watch**

Change `.carried` to shrink-wrap the circle row:

```css
.carried {
  position: absolute;
  top: 16px;
  left: 50%;
  display: grid;
  justify-items: center;
  transform: translateX(-50%);
}
```

Change `.pocket-watch`:

```css
.pocket-watch {
  position: absolute;
  top: 4px;
  left: calc(100% + 16px);
  width: 116px;
  height: 88px;
}
```

- [ ] **Step 4: Add the thumbnail and message treatment**

Use transparent paint values on the circle only:

```css
.weight-circle {
  border-color: #07121fcc;
  background: radial-gradient(circle at 42% 34%, #2b405580, #080d16b8 72%);
  box-shadow:
    inset 0 0 0 2px #70869a44,
    inset 5px -6px 0 #0205093d,
    3px 5px 0 #02050980;
}
.weight-circle__thumbnail {
  z-index: 1;
  width: 92%;
  height: 92%;
  object-fit: contain;
  opacity: 1;
  filter: drop-shadow(3px 4px 0 #020407b8);
}
.carry-full {
  max-width: 290px;
  margin: 8px 0 0;
  color: var(--ink-yellow);
  font-size: .78rem;
  letter-spacing: .08em;
  text-align: center;
  text-shadow: 2px 2px 0 var(--ink-outline);
}
.carry-full:empty { display: none; }
```

Remove the obsolete `.weight-circle__art` rules.

- [ ] **Step 5: Add narrow layout rules**

At `max-width: 820px`, keep the 70px slots and use:

```css
.pocket-watch {
  top: 2px;
  left: calc(100% + 10px);
}
.carry-full {
  max-width: 220px;
  margin-top: 6px;
  font-size: .68rem;
}
```

At `max-width: 430px`, add:

```css
.weight-circles__row { grid-template-columns: repeat(3, 58px); gap: 7px; }
.weight-circle { width: 58px; height: 58px; border-width: 3px; }
.pocket-watch { left: calc(100% + 6px); width: 78px; height: 62px; }
.pocket-watch__art { inset: -3px auto auto 9px; width: 62px; }
.pocket-watch [data-timer] { top: 23px; min-width: 50px; font-size: .94rem; }
.carry-full { max-width: 190px; font-size: .62rem; }
```

- [ ] **Step 6: Run focused tests and the build**

Run:

```powershell
npm run test -- tests/GameUI.test.ts
npm run typecheck
npm run build
```

Expected: all commands PASS.

- [ ] **Step 7: Review the shared-file diff**

`src/styles/main.css` was modified before this feature. Confirm that critical-vignette and post-processing-console edits remain unchanged.

```powershell
git diff -- src/styles/main.css tests/GameUI.test.ts
```

Do not stage pre-existing hunks. Commit only after the staged diff contains this task's changes.

### Task 4: Full Verification and Visual QA

**Files:**

- Verify: `src/assets/models/item-thumbnails/*.png`
- Verify: `src/ui/GameUI.ts`
- Verify: `src/styles/main.css`
- Verify: `tests/GameUI.test.ts`

**Interfaces:**

- Consumes: the complete feature from Tasks 1 through 3.
- Produces: verified desktop and narrow scavenging HUD behavior.

- [ ] **Step 1: Run all automated checks**

```powershell
npm run thumbnails:check
npm run typecheck
npm run build
npm run test
```

Expected: every command exits with code 0.

- [ ] **Step 2: Start the game**

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL.

- [ ] **Step 3: Inspect the active HUD at 1280x720**

Start scavenging. Pick up one weight-one item, one weight-two item, and one weight-three item in separate runs.

Confirm:

- Each occupied circle shows the real model thumbnail.
- Heavy items repeat their thumbnail.
- Empty circles remain visible.
- Circles remain centered.
- The watch stays to the right.
- The message appears only at weight three.
- Deposit clears the message.

- [ ] **Step 4: Inspect responsive layouts**

Repeat the full carry state at 1920x1080 and 390x844.

Confirm that the circles, message, and watch do not overlap or leave the viewport.

- [ ] **Step 5: Inspect the final diff**

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm that all prior user changes remain present. Confirm no unrelated file changed.

- [ ] **Step 6: Create a scoped feature commit when safe**

Stage only feature-owned new files and feature-owned hunks. Review the staged diff before commit.

```powershell
git diff --cached --check
git diff --cached
git commit -m "feat: show model thumbnails in carry HUD"
```

If a pre-existing hunk cannot be isolated safely, leave that file unstaged and report it.
