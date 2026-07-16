# Survival HUD Corner Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the condition indicators at the top-left and the End Day button at the top-right while keeping journal and day status centered.

**Architecture:** Keep the existing `SurvivalUI` markup and event wiring. Add a CSS layout contract test, then change the final survival HUD style rules and their narrow-screen override.

**Tech Stack:** TypeScript, Vitest, jsdom, CSS, Bun

## Global Constraints

- Keep the journal marker and day, phase, and weather status at the top-center.
- Preserve game state, labels, keyboard shortcuts, meter values, journal behavior, and End Day behavior.
- Do not add dependencies or third-party assets.

---

### Task 1: Reposition the survival HUD corner controls

**Files:**
- Modify: `tests/SurvivalUI.test.ts:1232`
- Modify: `src/styles/main.css:599`

**Interfaces:**
- Consumes: existing `.survival-meters`, `.survival-top`, and `.end-day-button` selectors
- Produces: a CSS layout contract with top-left meters, centered status controls, and a top-right End Day button

- [ ] **Step 1: Write the failing CSS layout test**

Add this test after `separates journal, status, and stable End Day controls` in `tests/SurvivalUI.test.ts`:

```ts
it('places condition meters at top-left and End Day at top-right', () => {
  expect(mainStyles).toMatch(/\.survival-meters\s*\{[^}]*left:\s*22px;[^}]*right:\s*auto;[^}]*transform-origin:\s*top left;/s);
  expect(mainStyles).toMatch(/\.end-day-button\s*\{[^}]*position:\s*fixed;[^}]*top:\s*18px;[^}]*right:\s*22px;/s);
  expect(mainStyles).toMatch(/@media \(max-width:\s*980px\)[\s\S]*?\.survival-meters\s*\{[^}]*transform-origin:\s*top left;/s);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun run test -- tests/SurvivalUI.test.ts -t "places condition meters"`

Expected: FAIL because `.survival-meters` uses `right: 22px`, `.end-day-button` has no fixed corner position, and the narrow-screen transform origin uses `top right`.

- [ ] **Step 3: Add the corner layout rules**

Change the final `.survival-meters` rule in `src/styles/main.css` to:

```css
.survival-meters {
  top: 18px;
  right: auto;
  left: 22px;
  display: flex;
  width: auto;
  gap: 12px;
  padding: 0;
  border: 0;
  transform-origin: top left;
}
```

Expand the final `.end-day-button` rule to:

```css
.end-day-button {
  position: fixed;
  top: 18px;
  right: 22px;
  min-width: 190px;
  min-height: 48px;
  padding: 10px 28px;
  color: var(--ink-bone);
}
```

Change the `.survival-meters` declaration inside `@media (max-width: 980px)` to use:

```css
transform-origin: top left;
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bun run test -- tests/SurvivalUI.test.ts -t "places condition meters"`

Expected: PASS.

- [ ] **Step 5: Run the full verification set**

Run: `bun run test`

Expected: all Vitest tests pass.

Run: `bun run typecheck`

Expected: TypeScript exits with code 0.

Run: `bun run build`

Expected: Vite build exits with code 0.

- [ ] **Step 6: Inspect the diff and commit**

Run: `git diff --check`

Expected: no whitespace errors.

```bash
git add tests/SurvivalUI.test.ts src/styles/main.css docs/superpowers/plans/2026-07-16-survival-hud-corner-layout.md
git commit -m "feat: reposition survival HUD controls"
```
