# Larger Scavenging Weight Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge the three scavenging weight circles and remove all feedback copy beneath them.

**Architecture:** Keep the existing weight-to-circle rendering in `GameUI`. Change only the circle dimensions and remove the separate feedback path from `GameUI`, `ScavengePhase`, and scavenging CSS. Preserve interaction prompts and saved-item result summaries.

**Tech Stack:** TypeScript, DOM APIs, CSS, Vitest, Vite

## Global Constraints

- Desktop circles must be 88px with a 12px gap.
- At widths up to 820px, circles must be 64px with an 8px gap.
- The HUD must not retain `SAVED`, `DROPPED`, or `LOST` feedback as visible, hidden, or accessible text beneath the circles.
- Keep item weights, portrait artwork, pickup order, interaction prompts, and survival UI unchanged.
- Preserve unrelated dirty-worktree changes and stage only isolated feature hunks.

---

### Task 1: Resize the indicator and remove scavenging feedback

**Files:**
- Modify: `tests/GameUI.test.ts:203-207,256-264,367-385`
- Modify: `src/ui/GameUI.ts:30-31,59-62,117-119,160-166`
- Modify: `src/phases/ScavengePhase.ts:233-237,250-264`
- Modify: `src/styles/main.css:85-108,534-537,553-567,714-743`

**Interfaces:**
- Consumes: `GameUI.render(snapshot: ScavengeSnapshot, sinking: SinkingState): void`
- Produces: the same `GameUI` public rendering interface without `showFeedback(text: string): void`

- [ ] **Step 1: Write the failing HUD tests**

Replace the layout assertions with the approved sizes and add a DOM assertion that the feedback element does not exist:

```ts
it('defines larger top-center circles at desktop and narrow widths', () => {
  expect(mainStyles).toMatch(/\.carried\s*\{[^}]*top:\s*16px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s);
  expect(mainStyles).toMatch(/\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*88px\);[^}]*gap:\s*12px;/s);
  expect(mainStyles).toMatch(/\.weight-circle\s*\{[^}]*width:\s*88px;[^}]*height:\s*88px;[^}]*border-radius:\s*50%;/s);
  expect(mainStyles).toMatch(/@media \(max-width:\s*820px\)\s*\{[^}]*\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*64px\);[^}]*gap:\s*8px;/s);
});

it('does not render scavenging feedback beneath the weight circles', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);

  expect(mount.querySelector('[data-feedback]')).toBeNull();
  expect(mount.querySelector('[data-carried]')?.textContent).toBe('');

  ui.dispose();
});
```

Delete the old `versions repeated feedback so identical saves remain observable` test and change the illustrated-hierarchy assertion to:

```ts
expect(mount.querySelector('[data-feedback]')).toBeNull();
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
bun run test -- tests/GameUI.test.ts
```

Expected: FAIL because CSS still uses 70px/10px and 54px/6px, and `[data-feedback]` still exists.

- [ ] **Step 3: Remove the feedback DOM and API**

In `src/ui/GameUI.ts`, remove:

```ts
private readonly feedback: HTMLElement;
```

Remove this constructor markup and field initialization:

```html
<div class="feedback brush-label" data-feedback aria-live="polite"></div>
```

```ts
this.feedback = requireElement(this.root, '[data-feedback]');
```

Remove the complete method:

```ts
showFeedback(text: string): void {
  if (this.feedback.textContent === text) {
    this.feedback.dataset.version = String(Number(this.feedback.dataset.version ?? 0) + 1);
  }
  this.feedback.textContent = text;
  this.feedback.classList.toggle('is-visible', text.length > 0);
}
```

- [ ] **Step 4: Remove scavenging-phase feedback calls**

In `src/phases/ScavengePhase.ts`, keep the gameplay state and world mutations but remove these calls:

```ts
this.ui.showFeedback(action.prompt);
this.ui.showFeedback(`SAVED — ${ITEM_LABELS[instance.type]}`);
this.ui.showFeedback(`LOST — ${ITEM_LABELS[instance.type]}`);
this.ui.showFeedback(`DROPPED — ${ITEM_LABELS[instance.type]}`);
```

Remove `ITEM_LABELS` from the import if no other code in the file uses it. Leave `capacityFull` as a handled no-op branch so the action does not fall through:

```ts
} else if (action.type === 'capacityFull') {
  return;
}
```

- [ ] **Step 5: Enlarge the circles and remove feedback CSS**

Set the desktop dimensions in `src/styles/main.css`:

```css
.weight-circles__row { display: grid; grid-template-columns: repeat(3, 88px); gap: 12px; }
.weight-circle {
  position: relative;
  display: grid;
  width: 88px;
  height: 88px;
  place-items: center;
  border: 5px solid #07121f;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(circle at 44% 36%, #243346aa, #080d16e8 72%);
  box-shadow: inset 0 0 0 2px #31435c88, 3px 4px 0 #02050999;
}
```

Set the narrow dimensions:

```css
@media (max-width: 820px) {
  .weight-circles__row { grid-template-columns: repeat(3, 64px); gap: 8px; }
  .weight-circle { width: 64px; height: 64px; border-width: 4px; }
}
```

Delete the scavenging `.feedback` rule and remove `.feedback` from reduced-motion selectors. Do not change `.prompt`.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run:

```powershell
bun run test -- tests/GameUI.test.ts tests/GameLifecycle.test.ts
```

Expected: both files pass, including the new 88px/64px and no-feedback assertions.

- [ ] **Step 7: Run full verification**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: all commands exit 0. Existing GLTF loader messages and the Vite chunk-size advisory may remain non-failing warnings.

- [ ] **Step 8: Commit only the isolated feature change**

Confirm the staged diff contains only the approved circle resizing and feedback removal, then commit:

```powershell
git add src/ui/GameUI.ts src/phases/ScavengePhase.ts src/styles/main.css tests/GameUI.test.ts
git diff --cached --check
git commit -m "style: enlarge scavenging weight circles"
```

If those files contain unrelated unstaged changes, build the commit in a clean temporary worktree from the intended branch tip instead of staging whole files from the shared worktree.
