# Scavenging Weight Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scavenging phase's bottom-left carry text with three top-center circles that display one item portrait per carried weight unit.

**Architecture:** `uiArtwork.ts` owns typed inline SVG portraits for all nine item types. `GameUI` expands the carried-item snapshot into three visual cells, while CSS positions and styles the row. `ScavengeSession` remains the source of item order and weight.

**Tech Stack:** TypeScript 5.9, DOM APIs, CSS, Vitest 3, jsdom, Vite 7

## Global Constraints

- Show exactly three circles at the top center during scavenging.
- Repeat an item's portrait once per weight unit and preserve pickup order.
- Keep the indicator free of visible text, numeric text, hidden copy, item-list copy, and ARIA summaries.
- Use original inline SVG portraits based on the current Kenney item colors.
- Keep carry capacity, item weights, pickup order, drop behavior, saving, survival inventory, and 3D models unchanged.
- Preserve pre-existing worktree changes in `src/ui/GameUI.ts` and `src/styles/main.css`.

---

### Task 1: Add typed scavenging item portraits

**Files:**
- Modify: `src/ui/uiArtwork.ts:1-30`
- Test: `tests/UIArtwork.test.ts:1-33`

**Interfaces:**
- Consumes: `ItemId` from `src/game/ItemState.ts`.
- Produces: `itemArtwork(id: ItemId, className?: string): string`.

- [ ] **Step 1: Write the failing item-artwork tests**

Update the imports and add these tests to `tests/UIArtwork.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { ITEM_ARTWORK_IDS, UI_ARTWORK_IDS, itemArtwork, uiArtwork } from '../src/ui/uiArtwork';

describe('itemArtwork', () => {
  it('renders one decorative portrait for every scavenging item type', () => {
    expect(ITEM_ARTWORK_IDS).toEqual(ITEM_IDS);

    ITEM_IDS.forEach((id) => {
      const markup = itemArtwork(id, 'weight-circle__art');
      expect(markup).toContain('<svg');
      expect(markup).toContain(`data-item-artwork="${id}"`);
      expect(markup).toContain(`item-artwork--${id}`);
      expect(markup).toContain('weight-circle__art');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toContain('<title');
      expect(markup).not.toContain('<text');
      expect(markup).not.toMatch(/https?:\/\//);
    });
  });

  it('filters unsafe presentation classes from item portraits', () => {
    const markup = itemArtwork('cannedFood', 'safe-token bad" onload="alert(1)');

    expect(markup).toContain('class="item-artwork item-artwork--cannedFood safe-token"');
    expect(markup).not.toContain('onload');
  });
});
```

Keep the existing `uiArtwork` tests below this new block.

- [ ] **Step 2: Run the artwork test and verify RED**

Run: `bun run test -- tests/UIArtwork.test.ts`

Expected: FAIL because `ITEM_ARTWORK_IDS` and `itemArtwork` do not exist.

- [ ] **Step 3: Implement the item artwork API**

Replace `src/ui/uiArtwork.ts` with:

```ts
import { ITEM_IDS, type ItemId } from '../game/ItemState';

export const UI_ARTWORK_IDS = [
  'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning',
] as const;

export const ITEM_ARTWORK_IDS = ITEM_IDS;

export type UiArtworkId = typeof UI_ARTWORK_IDS[number];

const ARTWORK: Record<UiArtworkId, string> = {
  health: '<path d="M32 57C9 42 5 23 17 13c8-7 18-3 23 5 6-8 17-12 25-4 12 12 2 31-20 45l-6 4z"/><path class="ui-artwork__shine" d="M18 25c2-7 8-10 14-7"/>',
  hunger: '<path d="M20 13c10 2 10 13 8 21-2 9 2 23 15 24 11 1 22-7 22-20 0-7-4-11-10-12-5-1-8 4-12 2-4-2-1-11-4-17z"/><path class="ui-artwork__shine" d="M23 18c4 2 5 7 4 12"/>',
  energy: '<path d="M37 5 15 37h18l-5 28 25-36H35z"/><path class="ui-artwork__shine" d="m34 14-10 17"/>',
  hull: '<path d="M10 27h60l-8 24c-12 12-40 12-51 0z"/><path d="M22 27V16h35v11M14 45c14 7 37 7 52 0"/><path class="ui-artwork__shine" d="M25 20h12"/>',
  watch: '<circle cx="40" cy="43" r="27"/><path d="M32 8h16v8H32zM40 16V4M40 43V26M40 43l12 8"/><circle class="ui-artwork__shine" cx="40" cy="43" r="21"/>',
  journal: '<path d="M16 9h39c7 0 11 4 11 11v45H27c-7 0-11-4-11-11z"/><path d="M27 9v56M34 23h22M34 34h18"/><path class="ui-artwork__shine" d="M20 14h5"/>',
  warning: '<path d="M40 7 73 65H7z"/><path d="M40 25v21M40 55v2"/><path class="ui-artwork__shine" d="m20 56 20-35"/>',
};

const ITEM_ARTWORK: Readonly<Record<ItemId, string>> = {
  flareGun: '<g transform="rotate(-8 40 36)"><path class="item-artwork__primary" d="M11 28h48l10 8-10 8H40l-3 17H24l2-18H11z"/><path class="item-artwork__secondary" d="M45 44h13l-2 10H43z"/><path class="item-artwork__light" d="M18 31h34v6H18z"/></g>',
  ductTape: '<circle class="item-artwork__secondary" cx="40" cy="36" r="27"/><circle class="item-artwork__primary" cx="40" cy="36" r="16"/><circle class="item-artwork__cutout" cx="40" cy="36" r="9"/><path class="item-artwork__light" d="M23 20c9-8 24-9 34-1l-5 6c-7-5-17-4-24 1z"/>',
  fishingRod: '<path class="item-artwork__primary item-artwork__stroke" d="M16 61 62 10"/><path class="item-artwork__secondary item-artwork__stroke" d="m20 56-7 8"/><circle class="item-artwork__secondary" cx="31" cy="47" r="9"/><circle class="item-artwork__cutout" cx="31" cy="47" r="4"/><path class="item-artwork__light item-artwork__stroke-thin" d="M61 11c8 10 7 23-2 31"/>',
  baitTin: '<path class="item-artwork__secondary" d="M17 20c0-8 46-8 46 0v34c0 9-46 9-46 0z"/><ellipse class="item-artwork__light" cx="40" cy="20" rx="23" ry="8"/><path class="item-artwork__primary" d="M23 32h34v17H23z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="M30 43c7-10 13 6 21-5m-3-5 5 5-6 4"/>',
  medicalKit: '<path class="item-artwork__primary" d="M13 22h54v40H13z"/><path class="item-artwork__secondary" d="M27 13h26v12H27z"/><path class="item-artwork__light" d="M34 29h12v9h9v12h-9v9H34v-9h-9V38h9z"/>',
  waterJug: '<path class="item-artwork__primary" d="M28 9h20v10c10 5 14 15 14 29 0 12-8 18-22 18s-22-6-22-18c0-14 4-24 14-29z"/><path class="item-artwork__cutout item-artwork__stroke-thin" d="M43 24c11 0 13 17 3 19"/><path class="item-artwork__light" d="M27 44h27v13H27z"/><path class="item-artwork__secondary" d="M27 8h22v8H27z"/>',
  cannedFood: '<path class="item-artwork__secondary" d="M19 18c0-9 42-9 42 0v38c0 9-42 9-42 0z"/><ellipse class="item-artwork__light" cx="40" cy="18" rx="21" ry="8"/><path class="item-artwork__primary" d="M24 31h32v21H24z"/><path class="item-artwork__ink" d="M29 42c6-8 12-8 18-2l6-4-2 7 2 7-7-4c-6 5-12 4-17-4z"/>',
  flashlight: '<g transform="rotate(-34 40 36)"><path class="item-artwork__secondary" d="M31 25h18v39H31z"/><path class="item-artwork__primary" d="M25 12h30l-5 17H30z"/><path class="item-artwork__light" d="M31 13h18l-3 9H34z"/><path class="item-artwork__primary" d="M34 40h12v8H34z"/></g>',
  scubaSet: '<path class="item-artwork__secondary" d="M26 12h14v48c0 8-21 8-21 0V22c0-6 2-10 7-10zm28 0H40v48c0 8 21 8 21 0V22c0-6-2-10-7-10z"/><path class="item-artwork__primary" d="M26 8h10v9H26zm18 0h10v9H44z"/><path class="item-artwork__ink" d="M27 31h26v21H27z"/><path class="item-artwork__light item-artwork__stroke-thin" d="M29 27C23 17 12 22 15 36m36-9c6-10 17-5 14 9"/>',
};

const CSS_IDENTIFIER = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

function classes(base: readonly string[], className: string): string {
  return [...base, ...className.split(/\s+/).filter((token) => CSS_IDENTIFIER.test(token))].join(' ');
}

export function uiArtwork(id: UiArtworkId, className = ''): string {
  const classNames = classes(['ui-artwork', `ui-artwork--${id}`], className);
  return `<svg class="${classNames}" data-ui-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ARTWORK[id]}</svg>`;
}

export function itemArtwork(id: ItemId, className = ''): string {
  const classNames = classes(['item-artwork', `item-artwork--${id}`], className);
  return `<svg class="${classNames}" data-item-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ITEM_ARTWORK[id]}</svg>`;
}
```

- [ ] **Step 4: Run the artwork test and verify GREEN**

Run: `bun run test -- tests/UIArtwork.test.ts`

Expected: PASS with all artwork tests green.

- [ ] **Step 5: Commit the isolated artwork change**

These two files have no pre-existing worktree changes, so commit them as one isolated unit:

```powershell
git add -- src/ui/uiArtwork.ts tests/UIArtwork.test.ts
git commit -m "feat: add scavenging item portraits"
```

---

### Task 2: Render and style the three weight circles

**Files:**
- Modify: `src/ui/GameUI.ts:1-4, 30-34, 48-65, 116-123, 230-239`
- Modify: `src/styles/main.css:30-33, 57-59, 491-508, 681-683`
- Test: `tests/GameUI.test.ts:124-142, 300-315`

**Interfaces:**
- Consumes: `itemArtwork(id: ItemId, className?: string): string`, `ScavengeSnapshot.carriedItems`, and `ITEM_DEFINITIONS[id].weight`.
- Produces: three `[data-weight-circle]` cells inside `[data-carried-items]`, with filled cells marked by `.is-filled` and `data-item-type`.

- [ ] **Step 1: Replace the old carry-list test with failing circle tests**

Replace the test named `renders carry weight, items, and save feedback without slot markers` with:

```ts
  it('starts with three empty visual weight circles and no capacity text', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const indicator = mount.querySelector<HTMLElement>('[data-carried-items]')!;
    const circles = [...indicator.querySelectorAll<HTMLElement>('[data-weight-circle]')];

    expect(circles).toHaveLength(3);
    expect(circles.every((circle) => !circle.classList.contains('is-filled'))).toBe(true);
    expect(indicator.textContent).toBe('');
    expect(indicator.getAttribute('aria-label')).toBeNull();
    expect(indicator.getAttribute('role')).toBeNull();
    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    expect(mount.querySelector('[data-carry-weight]')?.textContent).toBe('');
    ui.dispose();
  });

  it('fills one circle for one canned food item', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 1,
      carriedItems: [{ instanceId: 'cannedFood-1', type: 'cannedFood' }],
    }), getSinkingState(0, 120));
    const circles = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')];

    expect(circles.map((circle) => circle.dataset.itemType ?? null)).toEqual([
      'cannedFood', null, null,
    ]);
    expect(circles[0]?.querySelector('[data-item-artwork="cannedFood"]')).not.toBeNull();
    expect(mount.querySelectorAll('.weight-circle.is-filled')).toHaveLength(1);
    ui.dispose();
  });

  it('keeps mixed weight-one items in pickup order', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 2,
      carriedItems: [
        { instanceId: 'cannedFood-1', type: 'cannedFood' },
        { instanceId: 'ductTape-1', type: 'ductTape' },
      ],
    }), getSinkingState(0, 120));
    const itemTypes = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType ?? null);

    expect(itemTypes).toEqual(['cannedFood', 'ductTape', null]);
    ui.dispose();
  });

  it('repeats a medical kit portrait for both weight units', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 2,
      carriedItems: [{ instanceId: 'medicalKit-1', type: 'medicalKit' }],
    }), getSinkingState(0, 120));
    const itemTypes = [...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType ?? null);

    expect(itemTypes).toEqual(['medicalKit', 'medicalKit', null]);
    ui.dispose();
  });

  it('fills all three circles with a scuba set and clears them after release', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    ui.render(snapshot({
      carriedWeight: 3,
      carriedItems: [{ instanceId: 'scubaSet-1', type: 'scubaSet' }],
    }), getSinkingState(0, 120));
    expect([...mount.querySelectorAll<HTMLElement>('[data-weight-circle]')]
      .map((circle) => circle.dataset.itemType)).toEqual([
      'scubaSet', 'scubaSet', 'scubaSet',
    ]);

    ui.render(snapshot({ carriedWeight: 0, carriedItems: [] }), getSinkingState(0, 120));
    expect(mount.querySelectorAll('.weight-circle.is-filled')).toHaveLength(0);
    expect(mount.querySelector('[data-carried-items]')?.textContent).toBe('');
    ui.dispose();
  });

  it('defines the original-style top-center circle layout at desktop and narrow widths', () => {
    expect(mainStyles).toMatch(/\.carried\s*\{[^}]*top:\s*16px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s);
    expect(mainStyles).toMatch(/\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*70px\);[^}]*gap:\s*10px;/s);
    expect(mainStyles).toMatch(/\.weight-circle\s*\{[^}]*border-radius:\s*50%;[^}]*overflow:\s*hidden;/s);
    expect(mainStyles).toMatch(/@media \(max-width:\s*820px\)\s*\{[^}]*\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*54px\);/s);
  });
```

Update the hierarchy test near the end of `tests/GameUI.test.ts` by replacing the `data-carry-weight` assertion with:

```ts
    expect(mount.querySelectorAll('[data-weight-circle]')).toHaveLength(3);
    expect(mount.querySelector('[data-carried-items]')?.getAttribute('aria-hidden')).toBe('true');
```

- [ ] **Step 2: Run the GameUI tests and verify RED**

Run: `bun run test -- tests/GameUI.test.ts`

Expected: FAIL because the DOM still contains the numeric carry weight and item list, item artwork is absent, and the circle CSS does not exist.

- [ ] **Step 3: Replace the carry markup and renderer**

In `src/ui/GameUI.ts`, change the imports to:

```ts
import { ITEM_DEFINITIONS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { SinkingState } from '../game/sinking';
import { itemArtwork, uiArtwork } from './uiArtwork';
```

Remove the `carryWeight` field. Replace the old carried block in the constructor template with:

```html
        <div class="carried" data-carried>
          <div class="weight-circles__row" data-carried-items data-carry-weight aria-hidden="true">
            <span class="weight-circle" data-weight-circle></span>
            <span class="weight-circle" data-weight-circle></span>
            <span class="weight-circle" data-weight-circle></span>
          </div>
          <div class="feedback brush-label" data-feedback aria-live="polite"></div>
        </div>
```

Remove this constructor assignment:

```ts
    this.carryWeight = requireElement(this.root, '[data-carry-weight]');
```

Replace `renderCarry` with:

```ts
  private renderCarry(snapshot: ScavengeSnapshot): void {
    const filled = snapshot.carriedItems.flatMap(({ type }) => (
      Array.from({ length: ITEM_DEFINITIONS[type].weight }, () => type)
    )).slice(0, 3);
    const slots: Array<ItemId | null> = [...filled];
    while (slots.length < 3) slots.push(null);

    this.carriedItems.replaceChildren(...slots.map((type) => {
      const circle = document.createElement('span');
      circle.className = 'weight-circle';
      circle.dataset.weightCircle = '';
      if (type !== null) {
        circle.classList.add('is-filled');
        circle.dataset.itemType = type;
        circle.innerHTML = itemArtwork(type, 'weight-circle__art');
      }
      return circle;
    }));
  }
```

The fixed `ItemId` map and typed snapshot make the assigned SVG markup trusted source code. The renderer caps the visual row at three cells even if a malformed snapshot exceeds capacity.

- [ ] **Step 4: Replace the old carry CSS with circle and portrait styling**

In the base HUD section of `src/styles/main.css`, replace `.carried`, `.carried-list`, and `.carried-row` with:

```css
.carried { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); }
.weight-circles__row { display: grid; grid-template-columns: repeat(3, 70px); gap: 10px; }
.weight-circle {
  position: relative;
  display: grid;
  width: 70px;
  height: 70px;
  place-items: center;
  overflow: hidden;
  border: 5px solid #07121f;
  border-radius: 50%;
  background: radial-gradient(circle at 44% 36%, #243346aa, #080d16e8 72%);
  box-shadow: inset 0 0 0 2px #31435c88, 3px 4px 0 #02050999;
}
.weight-circle::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(8deg, transparent 0 5px, #d7e4ef0a 6px 7px);
  content: '';
  pointer-events: none;
}
.weight-circle.is-filled { background: radial-gradient(circle at 45% 38%, #334458, #111925 76%); }
.weight-circle__art { z-index: 1; width: 88%; height: 88%; }
```

After the existing `.ui-artwork__shine` rule, add:

```css
.item-artwork { overflow: visible; filter: drop-shadow(2px 3px 0 #020407cc); }
.item-artwork__primary,
.item-artwork__secondary,
.item-artwork__light,
.item-artwork__ink,
.item-artwork__cutout {
  stroke: #080b10;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
  paint-order: stroke fill;
}
.item-artwork__primary { fill: var(--item-primary); }
.item-artwork__secondary { fill: var(--item-secondary); }
.item-artwork__light { fill: var(--item-light); }
.item-artwork__ink { fill: #111820; }
.item-artwork__cutout { fill: #172230; }
.item-artwork__stroke { fill: none; stroke: var(--item-primary); stroke-width: 7; }
.item-artwork__stroke-thin { fill: none; stroke-width: 3; }
.item-artwork--flareGun { --item-primary: #e14f2d; --item-secondary: #39414a; --item-light: #f3c94b; }
.item-artwork--ductTape { --item-primary: #30343b; --item-secondary: #8d969d; --item-light: #d8dde0; }
.item-artwork--fishingRod { --item-primary: #e65b2f; --item-secondary: #343b47; --item-light: #dbe9ef; }
.item-artwork--baitTin { --item-primary: #d37a2c; --item-secondary: #79858e; --item-light: #d9e0e2; }
.item-artwork--medicalKit { --item-primary: #c7372e; --item-secondary: #6d211e; --item-light: #f1eadb; }
.item-artwork--waterJug { --item-primary: #4f9dc2; --item-secondary: #244d6c; --item-light: #d9f3f7; }
.item-artwork--cannedFood { --item-primary: #3d7ca2; --item-secondary: #89949a; --item-light: #e7ece8; }
.item-artwork--flashlight { --item-primary: #ed6f2f; --item-secondary: #313a43; --item-light: #f4f1c8; }
.item-artwork--scubaSet { --item-primary: #ef6b2e; --item-secondary: #697681; --item-light: #d7edf3; }
```

In the illustrated scavenging section, change:

```css
.objective strong, .capacity strong { font-size: 1rem; letter-spacing: .04em; }
```

Delete the illustrated `.carried` and `.carried-list` overrides. Replace the existing `.feedback` rule with:

```css
.feedback {
  position: absolute;
  top: calc(100% + 9px);
  left: 50%;
  bottom: auto;
  width: max-content;
  max-width: 360px;
  color: var(--ink-yellow);
  text-align: center;
  transform: translateX(-50%);
}
```

Extend the final `@media (max-width: 820px)` block with:

```css
@media (max-width: 820px) {
  .weight-circles__row { grid-template-columns: repeat(3, 54px); gap: 6px; }
  .weight-circle { width: 54px; height: 54px; border-width: 4px; }
  .feedback { max-width: min(300px, calc(100vw - 32px)); }
  .performance-stats { right: 16px; }
}
```

- [ ] **Step 5: Run the focused UI tests and verify GREEN**

Run: `bun run test -- tests/UIArtwork.test.ts tests/GameUI.test.ts`

Expected: PASS. The output reports both test files green and no warnings.

- [ ] **Step 6: Inspect the overlapping file diff without staging it**

Run:

```powershell
git diff --check
git diff -- src/ui/GameUI.ts src/styles/main.css tests/GameUI.test.ts
```

Expected: `git diff --check` exits with code 0. The diff contains the pre-existing control and presentation work plus the new circle HUD changes. Leave these files unstaged so the implementation does not absorb unrelated user work into a commit.

---

### Task 3: Run complete verification

**Files:**
- Verify: `src/ui/uiArtwork.ts`
- Verify: `src/ui/GameUI.ts`
- Verify: `src/styles/main.css`
- Verify: `tests/UIArtwork.test.ts`
- Verify: `tests/GameUI.test.ts`

**Interfaces:**
- Consumes: the completed portrait and weight-circle implementation.
- Produces: fresh test, type-check, build, and worktree evidence for handoff.

- [ ] **Step 1: Run TypeScript checking**

Run: `bun run typecheck`

Expected: exit code 0 with no TypeScript diagnostics.

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`

Expected: all Vitest files and tests pass with zero failures.

- [ ] **Step 3: Run the production build**

Run: `bun run build`

Expected: TypeScript exits cleanly and Vite writes a production bundle to `dist/`.

- [ ] **Step 4: Review requirements against the rendered DOM and CSS**

Run:

```powershell
rg -n "IN YOUR ARMS|carried-row|carried-list|[0-9] / 3" src/ui/GameUI.ts src/styles/main.css tests/GameUI.test.ts
rg -n "weight-circles__row|data-weight-circle|data-item-artwork" src/ui/GameUI.ts src/ui/uiArtwork.ts src/styles/main.css tests/GameUI.test.ts tests/UIArtwork.test.ts
```

Expected: the first command finds no old carry display. The second command finds the three-circle markup, portrait API, styling, and tests.

- [ ] **Step 5: Record final worktree state**

Run: `git status --short`

Expected: the status retains all pre-existing worktree changes. Task 1 may appear as its isolated commit; Task 2 files remain unstaged alongside their pre-existing edits.
