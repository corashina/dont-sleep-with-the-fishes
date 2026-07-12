# Official-Inspired UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every player-facing scavenging and survival interface with an original illustrated survival-horror visual system validated against the current official *Don't Sleep With The Fishes* screenshots.

**Architecture:** Add one pure UI-artwork module that returns decorative inline SVG, then consume it from the two existing DOM UI classes without changing gameplay callbacks or data hooks. Apply the visual language through a final CSS override layer so existing interaction, accessibility, projection, and lifecycle logic remain isolated from presentation.

**Tech Stack:** TypeScript 5.9, DOM APIs, inline SVG, CSS, Vitest 3.2 with jsdom, Three.js/Vite 7 for browser verification.

## Global Constraints

- Cover every player-facing screen in scavenging and survival, including HUDs, projected tooltips, start, pause, fishing choice, events, outcomes, failures, results, and endings.
- Do not change gameplay rules, controls, Three.js world behavior, phase flow, callbacks, shortcuts, focus traps, live regions, or existing data attributes.
- Do not copy official images, fonts, textures, logos, or other proprietary assets.
- Add no third-party UI library, remote runtime dependency, network request, or runtime asset loader.
- Use original inline SVG and CSS-generated texture only.
- Decorative SVG must use `aria-hidden="true"`; existing text and ARIA labels remain the accessible source of truth.
- Preserve desktop-first support and verify 1280x720 and 1920x1080 at 100% zoom.
- `prefers-reduced-motion: reduce` must remove shaking, drifting texture, pulsing, and animated tooltip movement.
- Preserve the unrelated untracked `dev-server.err` file.

## File Structure

- Create `src/ui/uiArtwork.ts`: typed, pure inline-SVG factory with no DOM or runtime dependencies.
- Create `tests/UIArtwork.test.ts`: artwork contract and accessibility tests.
- Modify `src/ui/GameUI.ts`: illustrated scavenging HUD and poster-style terminal-screen markup.
- Modify `tests/GameUI.test.ts`: scavenging artwork and preserved-hook regression tests.
- Modify `src/ui/SurvivalUI.ts`: illustrated status symbols, journal marker, and semantic dialog classes.
- Modify `tests/SurvivalUI.test.ts`: survival artwork, meter, journal, overlay, and interaction regressions.
- Modify `src/styles/main.css`: shared palette, texture, scavenging, survival, overlay, interaction, responsive, and reduced-motion presentation.

---

### Task 1: Original Inline SVG Artwork Primitives

**Files:**
- Create: `src/ui/uiArtwork.ts`
- Create: `tests/UIArtwork.test.ts`

**Interfaces:**
- Consumes: no application state or DOM globals.
- Produces: `UiArtworkId` and `uiArtwork(id: UiArtworkId, className?: string): string` for Tasks 2 and 3.

- [ ] **Step 1: Write the failing artwork contract test**

Create `tests/UIArtwork.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UI_ARTWORK_IDS, uiArtwork } from '../src/ui/uiArtwork';

describe('uiArtwork', () => {
  it('renders every original symbol as decorative inline SVG', () => {
    expect(UI_ARTWORK_IDS).toEqual([
      'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning',
    ]);

    UI_ARTWORK_IDS.forEach((id) => {
      const markup = uiArtwork(id);
      expect(markup).toContain('<svg');
      expect(markup).toContain(`data-ui-artwork="${id}"`);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain(`ui-artwork--${id}`);
      expect(markup).not.toContain('<img');
      expect(markup).not.toMatch(/https?:\/\//);
    });
  });

  it('escapes no dynamic content because callers may only supply a fixed class token', () => {
    expect(uiArtwork('watch', 'hud-watch')).toContain('class="ui-artwork ui-artwork--watch hud-watch"');
  });
});
```

- [ ] **Step 2: Run the artwork test to verify RED**

Run: `bun run test -- tests/UIArtwork.test.ts`

Expected: FAIL because `../src/ui/uiArtwork` does not exist.

- [ ] **Step 3: Implement the typed artwork factory**

Create `src/ui/uiArtwork.ts`:

```ts
export const UI_ARTWORK_IDS = [
  'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning',
] as const;

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

export function uiArtwork(id: UiArtworkId, className = ''): string {
  const classes = ['ui-artwork', `ui-artwork--${id}`, className].filter(Boolean).join(' ');
  return `<svg class="${classes}" data-ui-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ARTWORK[id]}</svg>`;
}
```

- [ ] **Step 4: Run the artwork test to verify GREEN**

Run: `bun run test -- tests/UIArtwork.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the artwork primitive**

```bash
git add src/ui/uiArtwork.ts tests/UIArtwork.test.ts
git commit -m "feat: add illustrated UI artwork primitives"
```

---

### Task 2: Illustrated Scavenging HUD and Terminal Screens

**Files:**
- Modify: `src/ui/GameUI.ts:1-91`
- Modify: `tests/GameUI.test.ts`

**Interfaces:**
- Consumes: `uiArtwork('watch' | 'warning')` from Task 1 and all existing `GameUI` callbacks/data hooks.
- Produces: `.illustrated-hud`, `.pocket-watch`, `.ink-label`, `.poster-screen`, `.timber-action`, and `.ui-treatment` markup contracts consumed by Task 4.

- [ ] **Step 1: Write the failing scavenging artwork regression test**

Append inside `describe('GameUI', ...)` in `tests/GameUI.test.ts`:

```ts
it('renders the illustrated scavenging hierarchy without losing state hooks', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);

  expect(mount.querySelector('.hud')?.classList).toContain('illustrated-hud');
  expect(mount.querySelector('[data-ui-artwork="watch"]')).not.toBeNull();
  expect(mount.querySelector('.timer-block')?.classList).toContain('pocket-watch');
  expect(mount.querySelector('[data-timer]')?.textContent).toBe('02:00');
  expect(mount.querySelector('[data-capacity]')).not.toBeNull();
  expect(mount.querySelector('[data-carry-weight]')).not.toBeNull();
  expect(mount.querySelector('[data-prompt]')).not.toBeNull();
  expect(mount.querySelector('[data-feedback]')).not.toBeNull();
  expect(mount.querySelector('[data-start]')?.classList).toContain('poster-screen');
  expect(mount.querySelector('[data-start-button]')?.classList).toContain('timber-action');
  expect(mount.querySelector('[data-ui-artwork="warning"]')).not.toBeNull();

  ui.dispose();
});
```

- [ ] **Step 2: Run the GameUI test to verify RED**

Run: `bun run test -- tests/GameUI.test.ts`

Expected: FAIL because the illustrated classes and artwork do not exist in `GameUI` markup.

- [ ] **Step 3: Replace only the GameUI presentation markup**

Add the import:

```ts
import { uiArtwork } from './uiArtwork';
```

Replace the `this.root.innerHTML` template with the following structure while keeping all existing data attributes:

```ts
this.root.innerHTML = `
  <div class="ui-treatment" aria-hidden="true"></div>
  <div class="hud illustrated-hud">
    <div class="objective ink-label"><span class="eyebrow">CAPTAIN'S ORDER</span><strong>LOAD THE LIFEBOAT</strong></div>
    <div class="timer-block pocket-watch">
      ${uiArtwork('watch', 'pocket-watch__art')}
      <span class="eyebrow" data-sinking>SHIP LISTING</span>
      <strong data-timer>02:00</strong>
    </div>
    <div class="capacity ink-label"><span class="eyebrow">IN THE BOAT</span><strong data-capacity aria-label="0 supplies saved">0 SAVED</strong></div>
    <div class="crosshair" aria-hidden="true"></div>
    <div class="prompt brush-label" data-prompt aria-live="polite"></div>
    <div class="carried ink-label" data-carried>
      <span class="eyebrow">IN YOUR ARMS</span>
      <strong data-carry-weight>0 / 3</strong>
      <div class="carried-list" data-carried-items></div>
      <div class="feedback brush-label" data-feedback aria-live="polite"></div>
    </div>
  </div>
  <section class="screen is-visible start-screen poster-screen" data-start>
    <p class="kicker">THE HULL HAS BEEN BREACHED</p>
    <h1>LAST BOAT<br>OUT</h1>
    <p class="lead">The ship has two minutes left. Save what you can, then get to the lifeboat.</p>
    <dl class="controls"><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>LOOK</dt><dd>MOUSE</dd></div><div><dt>SPRINT</dt><dd>SHIFT</dd></div><div><dt>ACT</dt><dd>E</dd></div></dl>
    <button type="button" class="primary-action timber-action" data-start-button>BEGIN EVACUATION</button>
    <p class="input-error" data-pointer-lock-error aria-live="polite"></p>
    <p class="fine-print">Desktop keyboard and mouse required. Click to enable mouse look.</p>
  </section>
  <section class="screen pause-screen poster-screen" data-pause>
    <p class="kicker">THE CLOCK IS STILL</p>
    <h2>Back to the deck?</h2>
    <p class="lead">The countdown is stopped while the mouse is released.</p>
    <button type="button" class="primary-action timber-action" data-resume-button>RESUME</button>
    <p class="input-error" data-pointer-lock-error aria-live="polite"></p>
  </section>
  <section class="screen failure-screen poster-screen" data-failure aria-live="assertive">
    ${uiArtwork('warning', 'failure-mark')}
    <p class="kicker">EVACUATION FAILED</p>
    <h2>The ship is going under.</h2>
    <p class="lead">Hold on...</p>
  </section>
  <section class="screen result-screen poster-screen" data-result>
    <p class="kicker">THE SEA KEEPS SCORE</p>
    <h2 data-result-title></h2>
    <p class="lead" data-result-body></p>
    <p class="result-items" data-result-items></p>
    <button type="button" class="primary-action timber-action" data-replay-button>TRY ANOTHER ROUTE</button>
  </section>
`;
```

- [ ] **Step 4: Run the GameUI test to verify GREEN**

Run: `bun run test -- tests/GameUI.test.ts`

Expected: PASS with the existing GameUI tests plus the illustrated-hierarchy test.

- [ ] **Step 5: Commit the scavenging markup**

```bash
git add src/ui/GameUI.ts tests/GameUI.test.ts
git commit -m "feat: restyle scavenging UI structure"
```

---

### Task 3: Illustrated Survival Status and Dialog Structure

**Files:**
- Modify: `src/ui/SurvivalUI.ts:1-235`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: `uiArtwork` and `UiArtworkId` from Task 1; existing `SurvivalSnapshot`, projected-anchor, focus, keyboard, and dialog contracts.
- Produces: `.survival-condition`, `.journal-marker`, `.survival-tallies`, `.cinematic-overlay`, and `data-ui-artwork` markup contracts consumed by Task 4.

- [ ] **Step 1: Write the failing survival artwork regression test**

Append inside `describe('SurvivalUI', ...)` in `tests/SurvivalUI.test.ts`:

```ts
it('renders illustrated conditions, journal status, tallies, and cinematic overlays', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);

  expect(mount.querySelector('[data-meter="health"] [data-ui-artwork="health"]')).not.toBeNull();
  expect(mount.querySelector('[data-meter="hunger"] [data-ui-artwork="hunger"]')).not.toBeNull();
  expect(mount.querySelector('[data-meter="energy"] [data-ui-artwork="energy"]')).not.toBeNull();
  expect(mount.querySelector('[data-meter="hull"] [data-ui-artwork="hull"]')).not.toBeNull();
  expect(mount.querySelector('.journal-marker [data-ui-artwork="journal"]')).not.toBeNull();
  expect(mount.querySelector('.survival-stores')?.classList).toContain('survival-tallies');
  expect(mount.querySelector('[data-event]')?.classList).toContain('cinematic-overlay');
  expect(mount.querySelector('[data-outcome]')?.classList).toContain('cinematic-overlay');
  expect(mount.querySelector('[data-pause]')?.classList).toContain('cinematic-overlay');
  expect(mount.querySelector('[data-ending]')?.classList).toContain('cinematic-overlay');

  ui.dispose();
});
```

- [ ] **Step 2: Run the SurvivalUI test to verify RED**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: FAIL because condition artwork, journal markup, and cinematic classes are absent.

- [ ] **Step 3: Add typed condition artwork to meter markup**

Add the import and map:

```ts
import { uiArtwork, type UiArtworkId } from './uiArtwork';

const METER_ARTWORK: Record<MeterId, UiArtworkId> = {
  health: 'health',
  hunger: 'hunger',
  energy: 'energy',
  hull: 'hull',
};
```

Replace `meterMarkup` with:

```ts
function meterMarkup(meter: MeterDefinition): string {
  return `
    <div class="survival-meter survival-condition survival-meter--${meter.id}" data-meter="${meter.id}" role="meter"
      aria-label="${meter.label}" aria-valuemin="${meter.min}" aria-valuemax="${meter.max}" aria-valuenow="${meter.min}">
      ${uiArtwork(METER_ARTWORK[meter.id], 'survival-condition__art')}
      <span class="survival-meter__label">${meter.label}<span class="survival-meter__danger" data-meter-danger aria-hidden="true" hidden>${meter.dangerLabel}</span></span>
      <div class="survival-meter__track" aria-hidden="true"><div class="survival-meter__fill"></div></div>
      <span class="survival-meter__value" data-meter-value>0</span>
    </div>`;
}
```

- [ ] **Step 4: Update the survival status and overlay presentation classes**

Replace the status/store portion of the constructor template with:

```ts
<div class="ui-treatment" aria-hidden="true"></div>
<div class="survival-announcer" data-survival-announcer aria-live="polite" aria-atomic="true"></div>
<header class="survival-status journal-marker" aria-label="Survival status">
  ${uiArtwork('journal', 'journal-marker__art')}
  <div class="survival-status__time"><span data-day>DAY 1</span><span data-phase>DAYLIGHT</span></div>
  <div class="survival-status__weather"><span class="eyebrow">WEATHER</span><strong data-weather>CALM</strong></div>
</header>
<section class="survival-meters" aria-label="Condition meters">
  ${METERS.map(meterMarkup).join('')}
</section>
<section class="survival-stores survival-tallies" aria-label="Loose supplies">
  <span>FOOD <strong data-store="food">0</strong></span>
  <span>BAIT <strong data-store="bait">0</strong></span>
  <span>REPAIR <strong data-store="repairMaterial">0</strong></span>
  <span>RESCUE <strong data-store="rescueProgress">0</strong></span>
</section>
```

Add `cinematic-overlay` to every `.survival-overlay` section and add `timber-action` to `.primary-action` and `.secondary-action` buttons. Keep every existing `data-*`, `role`, `aria-*`, `inert`, and `tabindex` attribute unchanged.

- [ ] **Step 5: Run the SurvivalUI test to verify GREEN**

Run: `bun run test -- tests/SurvivalUI.test.ts`

Expected: PASS with all existing interaction/focus tests plus the illustrated-structure test.

- [ ] **Step 6: Commit the survival markup**

```bash
git add src/ui/SurvivalUI.ts tests/SurvivalUI.test.ts
git commit -m "feat: restyle survival UI structure"
```

---

### Task 4: Shared Horror-Illustration Styles and Full Verification

**Files:**
- Modify: `src/styles/main.css:1-418`
- Modify: `tests/GameUI.test.ts`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: all presentation classes created in Tasks 2 and 3.
- Produces: final palette, texture, icon, layout, interaction, responsive, critical, and reduced-motion behavior.

- [ ] **Step 1: Write failing stylesheet-contract tests**

Append to the existing stylesheet test area in `tests/GameUI.test.ts`:

```ts
it('defines the illustrated global and scavenging presentation contracts', () => {
  expect(mainStyles).toContain('--ink-bone: #f2ead7');
  expect(mainStyles).toContain('.ui-treatment::after');
  expect(mainStyles).toContain('.pocket-watch__art');
  expect(mainStyles).toContain('.timber-action::before');
  expect(mainStyles).toContain('.poster-screen');
  expect(mainStyles).toContain('@media (prefers-reduced-motion: reduce)');
});
```

Append to `tests/SurvivalUI.test.ts`, using its existing `mainStyles` fixture:

```ts
it('defines illustrated survival, tooltip, and cinematic overlay contracts', () => {
  expect(mainStyles).toContain('.survival-condition__art');
  expect(mainStyles).toContain('.journal-marker__art');
  expect(mainStyles).toContain('.survival-tallies');
  expect(mainStyles).toContain('.boat-anchor[data-action="endDay"] .boat-tooltip');
  expect(mainStyles).toContain('.cinematic-overlay::before');
  expect(mainStyles).toContain('.event-overlay[data-danger="dangerous"]');
});
```

- [ ] **Step 2: Run focused UI tests to verify RED**

Run: `bun run test -- tests/GameUI.test.ts tests/SurvivalUI.test.ts`

Expected: FAIL because the new stylesheet contracts are not present.

- [ ] **Step 3: Add the shared palette, texture, artwork, and control treatment**

At the start of `src/styles/main.css`, extend `:root` with:

```css
--ink-black: #090b0c;
--ink-charcoal: #171b1d;
--ink-bone: #f2ead7;
--ink-faded: #bdb29d;
--ink-red: #b72f2b;
--ink-red-bright: #e14a3f;
--ink-yellow: #e0a72f;
--ink-green: #6da83e;
--ink-blue: #607f8a;
--wood-dark: #3b2115;
--wood-mid: #67432b;
--ink-outline: #050606;
```

Add these shared rules after `canvas`:

```css
.game-ui, .survival-ui { isolation: isolate; }
.ui-treatment { position: absolute; inset: 0; z-index: 20; overflow: hidden; pointer-events: none; }
.ui-treatment::before { content: ''; position: absolute; inset: -8%; background: radial-gradient(circle at 50% 44%, transparent 42%, #0506074d 72%, #020303e8 108%); }
.ui-treatment::after { content: ''; position: absolute; inset: 0; opacity: .16; background-image: repeating-radial-gradient(circle at 20% 30%, #f2ead71f 0 1px, transparent 1px 4px), repeating-linear-gradient(8deg, transparent 0 3px, #05060633 4px); mix-blend-mode: soft-light; }
.ui-artwork { overflow: visible; fill: currentColor; stroke: var(--ink-outline); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round; paint-order: stroke fill; filter: drop-shadow(2px 3px 0 #05060699); }
.ui-artwork__shine { fill: none; stroke: #fff8; stroke-width: 3; paint-order: normal; }
.ink-label, .brush-label { color: var(--ink-bone); text-shadow: 2px 2px 0 var(--ink-outline), -1px 1px 0 var(--ink-outline); }
.brush-label { padding: 10px 18px; border: 0; background: linear-gradient(95deg, transparent, #080a0be8 8% 91%, transparent); }
.timber-action { position: relative; isolation: isolate; border: 3px solid #26150f; background: linear-gradient(174deg, #795338, #4d2d1e 54%, #6c472f); color: var(--ink-bone); box-shadow: inset 0 2px #b4865d55, 3px 5px 0 #050606aa; clip-path: polygon(2% 8%, 96% 0, 100% 89%, 4% 100%, 0 52%); }
.timber-action::before { content: ''; position: absolute; inset: 3px; z-index: -1; opacity: .32; background: repeating-linear-gradient(4deg, transparent 0 7px, #1f110c 8px 9px); }
.timber-action:hover { filter: brightness(1.14); transform: translateY(-2px) rotate(-.25deg); }
.timber-action:active { transform: translateY(2px) scale(.98); }
.timber-action:focus-visible, .survival-ui button:focus-visible { outline: 3px solid var(--ink-bone); outline-offset: 4px; }
```

- [ ] **Step 4: Replace scavenging dashboard presentation with sparse illustrated placement**

Override the existing scavenging selectors with:

```css
.illustrated-hud { padding: 24px 30px; font-family: 'Segoe Print', 'Bradley Hand', 'Trebuchet MS', sans-serif; }
.objective { top: 24px; left: 28px; transform: rotate(-1deg); }
.capacity { top: 24px; right: 28px; transform: rotate(1deg); }
.objective strong, .capacity strong, .carried strong { font-size: 1rem; letter-spacing: .04em; }
.pocket-watch { top: 12px; right: 120px; left: auto; width: 116px; height: 118px; transform: rotate(2deg); }
.pocket-watch__art { position: absolute; inset: -5px auto auto 14px; width: 88px; color: #d2a24f; }
.pocket-watch .eyebrow { position: absolute; top: 91px; width: 100%; text-align: center; color: var(--ink-faded); }
.pocket-watch [data-timer] { position: absolute; top: 39px; width: 100%; z-index: 1; color: var(--ink-black); font: 800 1.28rem/1 ui-monospace, monospace; text-align: center; text-shadow: none; }
.pocket-watch [data-timer].is-critical { color: var(--ink-red); animation: watch-jolt .65s steps(2, end) infinite; }
.carried { left: 28px; bottom: 30px; transform: rotate(-.6deg); }
.carried-list { padding-top: 5px; border-top: 2px solid #f2ead755; }
.crosshair { width: 12px; height: 12px; border-color: #f2ead799; box-shadow: 0 0 12px var(--ink-outline); }
.prompt { bottom: 82px; max-width: min(520px, calc(100vw - 48px)); font-family: 'Segoe Print', 'Trebuchet MS', sans-serif; text-align: center; }
.feedback { position: absolute; bottom: 100%; left: 0; width: max-content; max-width: 360px; margin-bottom: 8px; color: var(--ink-yellow); }
.poster-screen { justify-items: start; background: linear-gradient(90deg, #07090aef 0 34%, #07090ac4 52%, transparent 78%); }
.poster-screen h1, .poster-screen h2 { color: var(--ink-bone); font-family: Impact, 'Arial Black', sans-serif; letter-spacing: -.045em; text-transform: uppercase; text-shadow: 3px 4px 0 var(--ink-outline), -2px 1px 0 var(--ink-outline); transform: rotate(-1deg); }
.poster-screen .kicker { color: var(--ink-yellow); font-family: 'Segoe Print', 'Trebuchet MS', sans-serif; }
.poster-screen .controls div { border: 0; background: linear-gradient(95deg, #111d, #1118); clip-path: polygon(0 8%, 96% 0, 100% 90%, 4% 100%); }
.failure-mark { width: 88px; color: var(--ink-red-bright); }
.input-error.is-visible { padding: 8px 12px; background: #2b0808dd; color: #ffb4a7; }
@keyframes watch-jolt { 50% { transform: rotate(-2deg) scale(1.06); } }
```

- [ ] **Step 5: Restyle survival conditions, journal, tallies, tooltips, and End Day**

Add or override:

```css
.survival-ui { color: var(--ink-bone); font-family: 'Segoe Print', 'Trebuchet MS', sans-serif; }
.survival-meters { top: 18px; right: auto; left: 22px; display: flex; width: auto; gap: 12px; padding: 0; border: 0; }
.survival-condition { position: relative; display: grid; grid-template: 'art value' 54px 'label label' auto / 60px auto; gap: 0 4px; min-width: 76px; color: var(--meter-accent); transform: rotate(var(--condition-tilt, 0deg)); }
.survival-condition:nth-child(1) { --condition-tilt: -2deg; }
.survival-condition:nth-child(2) { --condition-tilt: 2deg; }
.survival-condition:nth-child(3) { --condition-tilt: -1deg; }
.survival-condition:nth-child(4) { --condition-tilt: 1.5deg; }
.survival-condition__art { grid-area: art; width: 58px; height: 54px; }
.survival-meter--health { --meter-accent: var(--ink-red-bright); }
.survival-meter--hunger { --meter-accent: #d77362; }
.survival-meter--energy { --meter-accent: var(--ink-yellow); }
.survival-meter--hull { --meter-accent: var(--ink-blue); }
.survival-meter__label { grid-area: label; color: var(--ink-bone); font-size: .62rem; text-align: center; }
.survival-meter__value { grid-area: value; align-self: center; color: var(--ink-bone); font: 800 1rem/1 ui-monospace, monospace; text-shadow: 2px 2px 0 var(--ink-outline); }
.survival-meter__track { position: absolute; left: 6px; right: 4px; bottom: -7px; height: 4px; border: 0; background: #070808cc; transform: skewX(-12deg); }
.survival-meter__fill { background: currentColor; }
.survival-meter.is-danger { animation: condition-jolt .75s steps(2, end) infinite; }
.journal-marker { inset: 18px 22px auto auto; min-width: 180px; padding: 8px 12px 8px 58px; border: 0; transform: rotate(1.2deg); }
.journal-marker__art { position: absolute; left: 0; top: -5px; width: 64px; color: #8d5d37; }
.survival-status__time [data-day] { color: var(--ink-bone); font-size: 1.15rem; text-shadow: 2px 2px 0 var(--ink-outline); }
.survival-tallies { top: 112px; right: auto; left: 24px; display: flex; width: auto; max-width: 390px; gap: 6px; border: 0; }
.survival-tallies span { gap: 6px; padding: 5px 8px; background: #090b0cb8; color: var(--ink-faded); clip-path: polygon(2% 0, 100% 8%, 97% 100%, 0 92%); }
.boat-anchor::before { width: 12px; height: 12px; border: 3px solid #090b0c; background: var(--anchor-accent); box-shadow: 0 0 0 2px #f2ead799; }
.boat-tooltip { max-width: min(290px, calc(100vw - 32px)); padding: 10px 14px; border: 0; background: #090b0cf2; color: var(--ink-bone); font-family: 'Segoe Print', 'Trebuchet MS', sans-serif; clip-path: polygon(2% 2%, 98% 0, 100% 92%, 5% 100%, 0 54%); }
.boat-anchor[data-action="endDay"] .boat-tooltip { min-width: 130px; background: linear-gradient(174deg, #795338, #4d2d1e 60%, #6c472f); font-size: .76rem; text-align: center; }
@keyframes condition-jolt { 50% { transform: rotate(calc(var(--condition-tilt) - 2deg)) translateY(-2px); } }
```

- [ ] **Step 6: Restyle cinematic overlays and semantic states**

Add or override:

```css
.cinematic-overlay { place-content: start center; padding-top: clamp(68px, 12vh, 150px); background: radial-gradient(circle at 50% 38%, #090b0cbb, #030404f2 72%); text-align: center; }
.cinematic-overlay::before { width: min(720px, calc(100vw - 48px)); min-height: 300px; border: 0; background: linear-gradient(95deg, transparent, #090b0cf2 10% 90%, transparent); clip-path: polygon(4% 0, 98% 5%, 100% 92%, 3% 100%, 0 48%); }
.cinematic-overlay > * { width: min(620px, calc(100vw - 96px)); text-align: center; }
.cinematic-overlay h2 { font-family: Impact, 'Arial Black', sans-serif; letter-spacing: .015em; text-transform: uppercase; text-shadow: 3px 4px 0 var(--ink-outline); transform: rotate(-.5deg); }
.event-danger { color: var(--ink-yellow); }
.event-overlay[data-danger="dangerous"] .event-danger, .event-overlay[data-danger="dangerous"] h2 { color: var(--ink-red-bright); }
.event-overlay[data-danger="safe"] .event-danger { color: var(--ink-green); }
.event-item, .secondary-action { border: 2px solid #28170f; background: linear-gradient(174deg, #68442d, #3e2519); color: var(--ink-bone); }
.action-options [data-action-option="fish"] { color: #f0b0a7; }
.action-options [data-action-option="useBait"] { color: #d3efb6; }
.event-items__empty { color: var(--ink-faded); }
.outcome-deltas .is-positive { color: #b9dd9c; border-color: #6da83e99; }
.outcome-deltas .is-negative { color: #f0a099; border-color: #b72f2b99; }
```

- [ ] **Step 7: Add desktop responsive and reduced-motion safeguards**

Update media rules with:

```css
@media (max-width: 980px) {
  .survival-meters { gap: 5px; transform: scale(.86); transform-origin: top left; }
  .journal-marker { transform: scale(.88) rotate(1.2deg); transform-origin: top right; }
  .survival-tallies { top: 96px; max-width: 330px; flex-wrap: wrap; }
  .pocket-watch { right: 82px; }
}
@media (max-height: 760px) and (min-width: 761px) {
  .cinematic-overlay { padding-top: 44px; gap: 8px; }
  .cinematic-overlay::before { min-height: 270px; }
  .event-items { max-height: 126px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  .ui-treatment::after { transform: none !important; }
  .boat-tooltip, .feedback, .survival-meter__fill { transition: none !important; }
}
```

- [ ] **Step 8: Run focused UI tests to verify GREEN**

Run: `bun run test -- tests/UIArtwork.test.ts tests/GameUI.test.ts tests/SurvivalUI.test.ts`

Expected: PASS with no failures or warnings.

- [ ] **Step 9: Run the complete automated verification suite**

Run: `bun run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `bun run test`

Expected: all test files pass with 0 failures.

Run: `bun run build`

Expected: exit 0 and Vite writes the production bundle to `dist/`.

- [ ] **Step 10: Perform browser visual and interaction verification**

Use the existing Vite server at `http://127.0.0.1:4173` or start `bun run dev -- --host 127.0.0.1 --port 4173 --strictPort` if it is not running.

Verify at 1280x720 and 1920x1080:

1. Start screen: asymmetric poster layout, legible title and controls, timber primary action, no clipping.
2. Active scavenging: watch timer, saved label, carry label/list, crosshair, prompt, and feedback remain readable without covering the center view.
3. Scavenging pause, pointer-lock error, failure, and result screens retain their actions and live copy.
4. Survival: four illustrated conditions at upper left, journal at upper right, tallies below, and unobstructed physical boat objects.
5. Hover/focus projected items: tooltip stays inside the viewport and exposes the existing action description.
6. Horizon/End Day: timber tooltip treatment and action still work.
7. Fishing, event, outcome, pause, and ending overlays are cinematic, legible, keyboard reachable, and dismiss correctly.
8. Critical/depleted/unavailable states use icon/text treatment and do not rely on color alone.
9. Tab, Shift+Tab, Enter, Escape, and number shortcuts preserve existing behavior.
10. Emulated reduced motion removes pulse/jolt and tooltip movement while preserving state changes.

- [ ] **Step 11: Inspect final diff and commit the visual system**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the planned UI/test/CSS files plus the pre-existing untracked `dev-server.err`; do not stage `dev-server.err`.

```bash
git add src/styles/main.css tests/GameUI.test.ts tests/SurvivalUI.test.ts
git commit -m "feat: apply illustrated survival-horror UI"
```

## Final Requirements Audit

Before reporting completion, compare the implementation against every acceptance criterion in `docs/superpowers/specs/2026-07-12-official-inspired-ui-restyle-design.md`. Report any deviation instead of claiming completion. Fresh `typecheck`, full test, build, and browser evidence are required by `superpowers:verification-before-completion`.
