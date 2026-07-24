# UI Role and Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a consistent, locally hosted display, narrative/contextual, and numeral language from renderer-free startup through scavenging and survival.

**Architecture:** Vendor four Latin-subset WOFF2 files and expose their families through semantic CSS role classes. Extract renderer-free loading and error markup into a safe `SystemScreen` presenter, then annotate the existing `GameUI` and `SurvivalUI` markup without changing their state, focus, interaction, or disposal responsibilities.

**Tech Stack:** TypeScript 5.9, DOM APIs, CSS, Vite 7, Vitest 3 with JSDOM.

## Global Constraints

- Execute this plan in an isolated `codex/ui-role-typography` worktree created from committed `master`; do not edit or stage the unrelated dirty ship-texture work in the primary checkout.
- Keep gameplay rules deterministic and testable without a renderer.
- Keep phase lifecycle, game state, input, UI, rendering, and world construction in separate modules.
- Preserve keyboard operation and existing `prefers-reduced-motion` behavior.
- Do not add saves, touch controls, crewmates, multiplayer, or persistent progression.
- Do not add a visual-state harness, screenshot automation, pixel-diff tests, debug routes, or a general UI component framework.
- Bundle fonts locally; make no runtime requests to Google Fonts, Fontsource, or another font CDN.
- Use `font-display: swap`; startup and failure reporting must not wait for fonts.
- Preserve hostile-markup safety by assigning diagnostic strings through `textContent`.
- Preserve all existing focus, modal, live-region, short-height, semantic-state, cleanup, and asset-failure contracts.

---

## File Map

### New files

- `src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2` — display font asset.
- `src/assets/fonts/alegreya-sans-latin-400-normal.woff2` — narrative/context regular font asset.
- `src/assets/fonts/alegreya-sans-latin-700-normal.woff2` — narrative/context bold font asset.
- `src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2` — stable numeral font asset.
- `src/styles/fonts.css` — `@font-face` ownership, font-stack variables, and semantic role classes.
- `src/ui/SystemScreen.ts` — renderer-free loading and error DOM construction.
- `tests/UIFontAssets.test.ts` — local font, declaration, import, and provenance contract.
- `tests/SystemScreen.test.ts` — system-screen structure, roles, and hostile-text safety.

### Modified files

- `src/main.ts` — import font declarations before the main component stylesheet.
- `THIRD_PARTY_ASSETS.md` — record font source, runtime files, and OFL-1.1 provenance.
- `src/app/launchGame.ts` — delegate loading and failure DOM construction to `SystemScreen`.
- `src/ui/GameUI.ts` — assign explicit roles to scavenging content.
- `src/ui/SurvivalUI.ts` — assign explicit roles to survival, journal, and pause content.
- `src/styles/main.css` — replace legacy phase-wide font assignments with semantic stack variables.
- `tests/launchGame.test.ts` — verify startup surfaces use the shared presenter without changing failure behavior.
- `tests/GameUI.test.ts` — verify scavenging role coverage.
- `tests/SurvivalUI.test.ts` — verify survival role coverage, including dynamic tooltips.

---

### Task 1: Vendor Font Assets and Define Semantic Roles

**Files:**
- Create: `src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2`
- Create: `src/assets/fonts/alegreya-sans-latin-400-normal.woff2`
- Create: `src/assets/fonts/alegreya-sans-latin-700-normal.woff2`
- Create: `src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2`
- Create: `src/styles/fonts.css`
- Create: `tests/UIFontAssets.test.ts`
- Modify: `src/main.ts:1`
- Modify: `THIRD_PARTY_ASSETS.md` after the introductory asset summary

**Interfaces:**
- Consumes: Vite CSS imports from `src/main.ts`.
- Produces: `--font-display`, `--font-narrative`, `--font-context`, and `--font-numeral`; `.ui-role-display`, `.ui-role-narrative`, `.ui-role-context`, and `.ui-role-numeral`.

- [ ] **Step 1: Write the failing font-asset contract**

Create `tests/UIFontAssets.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FONT_FILES = [
  'bowlby-one-sc-latin-400-normal.woff2',
  'alegreya-sans-latin-400-normal.woff2',
  'alegreya-sans-latin-700-normal.woff2',
  'ibm-plex-mono-latin-600-normal.woff2',
] as const;

describe('UI font assets', () => {
  it('commits local WOFF2 files with no runtime CDN dependency', async () => {
    for (const filename of FONT_FILES) {
      const contents = await readFile(`src/assets/fonts/${filename}`);
      expect(contents.subarray(0, 4).toString('ascii')).toBe('wOF2');
      expect(contents.byteLength).toBeGreaterThan(4_000);
    }

    const [styles, entry] = await Promise.all([
      readFile('src/styles/fonts.css', 'utf8'),
      readFile('src/main.ts', 'utf8'),
    ]);
    expect(styles).toContain("font-family: 'Bowlby One SC'");
    expect(styles).toContain("font-family: 'Alegreya Sans'");
    expect(styles).toContain("font-family: 'IBM Plex Mono'");
    expect(styles.match(/font-display:\s*swap/g)).toHaveLength(4);
    expect(styles).not.toMatch(/https?:\/\//);
    expect(entry.indexOf("import './styles/fonts.css'"))
      .toBeLessThan(entry.indexOf("import './styles/main.css'"));
  });

  it('records permanent source and OFL provenance for every font family', async () => {
    const ledger = await readFile('THIRD_PARTY_ASSETS.md', 'utf8');
    expect(ledger).toContain('## Runtime font asset ledger');
    expect(ledger).toContain('google/fonts/tree/main/ofl/bowlbyonesc');
    expect(ledger).toContain('google/fonts/tree/main/ofl/alegreyasans');
    expect(ledger).toContain('IBM/plex');
    expect(ledger.match(/OFL 1\.1/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing assets fail**

Run:

```powershell
npm test -- tests/UIFontAssets.test.ts
```

Expected: FAIL with `ENOENT` for `src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2`.

- [ ] **Step 3: Download the pinned Latin WOFF2 assets**

Create `src/assets/fonts`, then download the Fontsource-built files from the
public `fontsource/font-files` repository:

```powershell
New-Item -ItemType Directory -Force 'src/assets/fonts'
Invoke-WebRequest 'https://raw.githubusercontent.com/fontsource/font-files/main/fonts/google/bowlby-one-sc/files/bowlby-one-sc-latin-400-normal.woff2' -OutFile 'src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2'
Invoke-WebRequest 'https://raw.githubusercontent.com/fontsource/font-files/main/fonts/google/alegreya-sans/files/alegreya-sans-latin-400-normal.woff2' -OutFile 'src/assets/fonts/alegreya-sans-latin-400-normal.woff2'
Invoke-WebRequest 'https://raw.githubusercontent.com/fontsource/font-files/main/fonts/google/alegreya-sans/files/alegreya-sans-latin-700-normal.woff2' -OutFile 'src/assets/fonts/alegreya-sans-latin-700-normal.woff2'
Invoke-WebRequest 'https://raw.githubusercontent.com/fontsource/font-files/main/fonts/google/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2' -OutFile 'src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2'
```

Expected: all four files begin with the ASCII signature `wOF2`.

- [ ] **Step 4: Add font declarations and semantic role classes**

Create `src/styles/fonts.css`:

```css
@font-face {
  font-family: 'Bowlby One SC';
  src: url('../assets/fonts/bowlby-one-sc-latin-400-normal.woff2') format('woff2');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Alegreya Sans';
  src: url('../assets/fonts/alegreya-sans-latin-400-normal.woff2') format('woff2');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Alegreya Sans';
  src: url('../assets/fonts/alegreya-sans-latin-700-normal.woff2') format('woff2');
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}

@font-face {
  font-family: 'IBM Plex Mono';
  src: url('../assets/fonts/ibm-plex-mono-latin-600-normal.woff2') format('woff2');
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}

:root {
  --font-display: 'Bowlby One SC', Impact, 'Arial Black', sans-serif;
  --font-narrative: 'Alegreya Sans', 'Trebuchet MS', 'Arial Narrow', system-ui, sans-serif;
  --font-context: 'Alegreya Sans', 'Trebuchet MS', 'Arial Narrow', system-ui, sans-serif;
  --font-numeral: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace;
}

.ui-role-display {
  font-family: var(--font-display);
  font-weight: 400;
}

.ui-role-narrative {
  font-family: var(--font-narrative);
  font-weight: 400;
}

.ui-role-context {
  font-family: var(--font-context);
  font-weight: 700;
}

.ui-role-numeral {
  font-family: var(--font-numeral);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
```

Modify the first two lines of `src/main.ts`:

```ts
import './styles/fonts.css';
import './styles/main.css';
```

- [ ] **Step 5: Record font provenance**

Add this section to `THIRD_PARTY_ASSETS.md`:

```markdown
## Runtime font asset ledger

| Runtime files | Family | Permanent source | Webfont source | License |
|---|---|---|---|---|
| `src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2` | Bowlby One SC | https://github.com/google/fonts/tree/main/ofl/bowlbyonesc | https://github.com/fontsource/font-files/tree/main/fonts/google/bowlby-one-sc | [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/bowlbyonesc/OFL.txt) |
| `src/assets/fonts/alegreya-sans-latin-{400,700}-normal.woff2` | Alegreya Sans | https://github.com/google/fonts/tree/main/ofl/alegreyasans | https://github.com/fontsource/font-files/tree/main/fonts/google/alegreya-sans | [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/alegreyasans/OFL.txt) |
| `src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2` | IBM Plex Mono | https://github.com/IBM/plex | https://github.com/fontsource/font-files/tree/main/fonts/google/ibm-plex-mono | [SIL OFL 1.1](https://github.com/IBM/plex/blob/master/LICENSE.txt) |
```

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
npm test -- tests/UIFontAssets.test.ts
npm run build
```

Expected: the focused test passes; TypeScript and Vite build pass; the build
emits four local hashed font assets and no remote font URL.

- [ ] **Step 7: Commit the font foundation**

```powershell
git add src/assets/fonts src/styles/fonts.css src/main.ts THIRD_PARTY_ASSETS.md tests/UIFontAssets.test.ts
git commit -m "feat: add local UI typography roles"
```

---

### Task 2: Extract the Renderer-Free System Screen

**Files:**
- Create: `src/ui/SystemScreen.ts`
- Create: `tests/SystemScreen.test.ts`
- Modify: `src/app/launchGame.ts:132-250`
- Modify: `tests/launchGame.test.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: semantic role classes from Task 1.
- Produces:

```ts
export type SystemScreenKind = 'loading' | 'error';

export interface SystemScreenDescription {
  readonly kind: SystemScreenKind;
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly detail?: string;
}

export function createSystemScreen(description: SystemScreenDescription): HTMLElement;
```

- [ ] **Step 1: Write failing presenter tests**

Create `tests/SystemScreen.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createSystemScreen } from '../src/ui/SystemScreen';

describe('SystemScreen', () => {
  it('builds the shared poster hierarchy with explicit typography roles', () => {
    const screen = createSystemScreen({
      kind: 'loading',
      kicker: 'RECOVERING SUPPLIES',
      title: 'Preparing the ship',
      lead: 'Loading the equipment you will need to survive.',
    });

    expect(screen.classList).toContain('system-screen');
    expect(screen.classList).toContain('system-screen--loading');
    expect(screen.querySelector('.kicker')?.classList).toContain('ui-role-context');
    expect(screen.querySelector('h1')?.classList).toContain('ui-role-display');
    expect(screen.querySelector('.lead')?.classList).toContain('ui-role-narrative');
    expect(screen.querySelector('.fine-print')).toBeNull();
  });

  it('renders diagnostic text literally instead of creating markup', () => {
    const screen = createSystemScreen({
      kind: 'error',
      kicker: 'WEBGL UNAVAILABLE',
      title: 'Unable to launch',
      lead: 'This demo needs WebGL 2.',
      detail: '<script>globalThis.compromised = true</script> & missing',
    });

    expect(screen.querySelector('script')).toBeNull();
    expect(screen.querySelector('.fine-print')?.textContent)
      .toBe('<script>globalThis.compromised = true</script> & missing');
    expect(screen.querySelector('.fine-print')?.classList).toContain('ui-role-narrative');
  });
});
```

- [ ] **Step 2: Run the presenter test and confirm the missing module fails**

Run:

```powershell
npm test -- tests/SystemScreen.test.ts
```

Expected: FAIL because `../src/ui/SystemScreen` does not exist.

- [ ] **Step 3: Implement the safe presenter**

Create `src/ui/SystemScreen.ts`:

```ts
export type SystemScreenKind = 'loading' | 'error';

export interface SystemScreenDescription {
  readonly kind: SystemScreenKind;
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly detail?: string;
}

function textElement(
  tagName: 'p' | 'h1',
  className: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

export function createSystemScreen(
  description: SystemScreenDescription,
): HTMLElement {
  const section = document.createElement('section');
  section.className = [
    'screen',
    'is-visible',
    'system-screen',
    'poster-screen',
    `system-screen--${description.kind}`,
  ].join(' ');

  const content = document.createElement('div');
  content.className = 'screen__content';
  content.append(
    textElement('p', 'kicker ui-role-context', description.kicker),
    textElement('h1', 'ui-role-display', description.title),
    textElement('p', 'lead ui-role-narrative', description.lead),
  );
  if (description.detail !== undefined) {
    content.append(textElement(
      'p',
      'fine-print ui-role-narrative',
      description.detail,
    ));
  }
  section.append(content);
  return section;
}
```

- [ ] **Step 4: Replace the private launcher builder**

Import the presenter in `src/app/launchGame.ts`:

```ts
import {
  createSystemScreen,
  type SystemScreenDescription,
} from '../ui/SystemScreen';
```

Delete the private `screen()` function. Add:

```ts
function renderSystemScreen(
  mount: HTMLElement,
  description: SystemScreenDescription,
): HTMLElement {
  const element = createSystemScreen(description);
  mount.replaceChildren(element);
  return element;
}
```

Rewrite `renderLoading`, `renderWebGlFailure`, and each branch of
`renderPreloadFailure` to pass the same existing strings as a descriptor. For
example:

```ts
function renderLoading(mount: HTMLElement): HTMLElement {
  return renderSystemScreen(mount, {
    kind: 'loading',
    kicker: 'RECOVERING SUPPLIES',
    title: 'Preparing the ship',
    lead: 'Loading the equipment you will need to survive.',
  });
}

function renderWebGlFailure(mount: HTMLElement, error: unknown): void {
  renderSystemScreen(mount, {
    kind: 'error',
    kicker: 'WEBGL UNAVAILABLE',
    title: 'Unable to launch',
    lead: 'This demo needs WebGL 2 in a current desktop browser.',
    detail: errorMessage(error),
  });
}
```

Do not change asset loading, error precedence, cancellation, or disposal.

- [ ] **Step 5: Add launcher integration assertions**

Extend the existing loading test in `tests/launchGame.test.ts`:

```ts
expect(mount.querySelector('[data-start]')).toBeNull();
expect(mount.querySelector('.system-screen--loading')).not.toBeNull();
expect(mount.querySelector('.system-screen h1')?.classList).toContain('ui-role-display');
```

Extend the existing WebGL failure test:

```ts
expect(mount.querySelector('.system-screen--error')).not.toBeNull();
expect(mount.querySelector('.system-screen .fine-print')?.textContent)
  .toBe('renderer failed');
```

- [ ] **Step 6: Add bounded renderer-free surface styling**

Add to `src/styles/main.css` near the shared screen rules:

```css
.system-screen {
  justify-content: flex-start;
  background:
    linear-gradient(90deg, #11191ee8 0 42%, #11191e99 64%, #11191e 100%),
    #1b292f;
}

.system-screen .screen__content {
  width: min(620px, calc(100vw - 64px));
}

.system-screen--error .kicker {
  color: var(--ink-red-bright);
}
```

Keep the existing short-height screen rules authoritative.

- [ ] **Step 7: Run presenter and launcher regression tests**

Run:

```powershell
npm test -- tests/SystemScreen.test.ts tests/launchGame.test.ts
```

Expected: all focused tests pass, including asset failure precedence,
cancellation, hostile text, and exactly-once disposal tests.

- [ ] **Step 8: Commit the system-screen extraction**

```powershell
git add src/ui/SystemScreen.ts src/app/launchGame.ts src/styles/main.css tests/SystemScreen.test.ts tests/launchGame.test.ts
git commit -m "refactor: unify startup system screens"
```

---

### Task 3: Apply Roles to Scavenging UI

**Files:**
- Modify: `src/ui/GameUI.ts:41-95`
- Modify: `src/styles/main.css:77,180,685-740`
- Modify: `tests/GameUI.test.ts`

**Interfaces:**
- Consumes: Task 1 role classes and stack variables.
- Produces: explicit role coverage for scavenging start, HUD, pause, failure,
  and result surfaces.

- [ ] **Step 1: Write the failing role-coverage test**

Add to `tests/GameUI.test.ts`:

```ts
it('assigns display, narrative, contextual, and numeral roles explicitly', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);

  expect(mount.querySelector('[data-start] h1')?.classList).toContain('ui-role-display');
  expect(mount.querySelector('[data-start] .lead')?.classList).toContain('ui-role-narrative');
  expect(mount.querySelector('[data-start] .kicker')?.classList).toContain('ui-role-context');
  expect(mount.querySelector('[data-start] .controls')?.classList).toContain('ui-role-context');
  expect(mount.querySelector('[data-start-button]')?.classList).toContain('ui-role-context');
  expect(mount.querySelector('[data-timer]')?.classList).toContain('ui-role-numeral');
  expect(mount.querySelector('[data-prompt]')?.classList).toContain('ui-role-context');
  expect(mount.querySelector('[data-result-items]')?.classList).toContain('ui-role-numeral');

  ui.dispose();
});
```

- [ ] **Step 2: Run the focused test and confirm missing classes fail**

Run:

```powershell
npm test -- tests/GameUI.test.ts
```

Expected: the new test fails because the start heading does not yet contain
`ui-role-display`.

- [ ] **Step 3: Annotate scavenging markup**

Update `GameUI` markup with these assignments:

```html
<div class="hud illustrated-hud ui-role-context">
<div class="prompt brush-label ui-role-context" data-prompt aria-live="polite"></div>
<strong class="ui-role-numeral" data-timer>02:00</strong>

<p class="kicker ui-role-context">...</p>
<h1 class="ui-role-display">...</h1>
<h2 class="ui-role-display">...</h2>
<p class="lead ui-role-narrative">...</p>
<dl class="controls ui-role-context">...</dl>
<button class="primary-action timber-action ui-role-context" ...>...</button>
<p class="input-error illustrated-warning ui-role-narrative" ...>...</p>
<p class="fine-print ui-role-narrative">...</p>
<p class="result-items ui-role-numeral" data-result-items></p>
```

Apply the same role to every repeated kicker, heading, lead, and primary action
in start, pause, failure, and result sections.

- [ ] **Step 4: Remove scavenging-specific legacy font stacks**

In `src/styles/main.css`:

- remove the monospace `font-family` declaration from `.hud`;
- remove the `font-family` declaration from `.illustrated-hud`;
- remove the handwritten `font-family` declaration from `.prompt`;
- replace the Impact stack in `.poster-screen h1, .poster-screen h2` with
  `font-family: var(--font-display)`;
- replace the handwritten stack in `.poster-screen .kicker` with
  `font-family: var(--font-context)`;
- change `.fine-print, .result-items` so `.fine-print` inherits narrative while
  `.result-items` keeps its existing size and spacing but uses
  `var(--font-numeral)`.

Do not change layout, transition, focus, danger, or responsive declarations.

- [ ] **Step 5: Run scavenging tests**

Run:

```powershell
npm test -- tests/GameUI.test.ts tests/launchGame.test.ts
```

Expected: all tests pass; existing prompt mutation, pointer-lock error,
compatibility, failure, result, and disposal contracts remain unchanged.

- [ ] **Step 6: Commit the scavenging migration**

```powershell
git add src/ui/GameUI.ts src/styles/main.css tests/GameUI.test.ts
git commit -m "feat: apply typography roles to scavenging UI"
```

---

### Task 4: Apply Roles to Survival, Journal, and Pause UI

**Files:**
- Modify: `src/ui/SurvivalUI.ts:143-369,837-850,1153`
- Modify: `src/styles/main.css:409,565,752,765-1027`
- Modify: `tests/SurvivalUI.test.ts`

**Interfaces:**
- Consumes: Task 1 role classes and stack variables.
- Produces: explicit role coverage for survival HUD, projected tooltips,
  representative journal, and shared pause treatment.

- [ ] **Step 1: Write the failing survival role test**

Add to `tests/SurvivalUI.test.ts`:

```ts
it('assigns explicit roles across survival, projected context, journal, and pause', () => {
  const mount = document.createElement('main');
  const ui = createUI(mount);

  expect(mount.querySelector('[data-day]')?.classList).toContain('ui-role-numeral');
  expect(mount.querySelector('[data-meter-value]')?.classList).toContain('ui-role-numeral');
  expect(mount.querySelector('[data-meter] .survival-meter__label')?.classList)
    .toContain('ui-role-context');
  expect(mount.querySelector('[data-anchor-id="repair-tools"] [role="tooltip"]')?.classList)
    .toContain('ui-role-context');
  expect(mount.querySelector('[data-action="endDay"]')?.classList).toContain('ui-role-context');
  expect(mount.querySelector('[data-journal] h2')?.classList).toContain('ui-role-display');
  expect(mount.querySelector('.journal-page__story')?.classList).toContain('ui-role-narrative');
  expect(mount.querySelector('.journal-page__folio')?.classList).toContain('ui-role-numeral');
  expect(mount.querySelector('[data-pause] h2')?.classList).toContain('ui-role-display');
  expect(mount.querySelector('[data-pause] p:not(.eyebrow)')?.classList)
    .toContain('ui-role-narrative');

  ui.dispose();
});
```

- [ ] **Step 2: Run the focused test and confirm missing classes fail**

Run:

```powershell
npm test -- tests/SurvivalUI.test.ts
```

Expected: the new test fails because `[data-day]` lacks `ui-role-numeral`.

- [ ] **Step 3: Annotate static survival markup**

Apply these role assignments in `SurvivalUI`:

```html
<strong class="ui-role-numeral" data-day>DAY 1</strong>
<span class="survival-status__detail ui-role-context">...</span>
<button class="end-day-button timber-action ui-role-context" ...>END DAY</button>

<p class="eyebrow ui-role-context">...</p>
<h2 class="ui-role-display" ...>...</h2>
<p class="ui-role-narrative">...</p>
<button class="... ui-role-context" ...>...</button>

<p class="journal-page__weather ui-role-context" ...></p>
<h2 class="ui-role-display" ...></h2>
<div class="journal-page__story ui-role-narrative" ...>...</div>
<nav class="journal-page__navigation ui-role-context" ...>
<span class="journal-page__folio ui-role-numeral" ...>PAGE 0 OF 0</span>
```

Update `meterMarkup`:

```html
<span class="survival-meter__label ui-role-context">...</span>
<span class="survival-meter__value ui-role-numeral" data-meter-value>0</span>
```

Assign display to every cinematic heading, narrative to prose, contextual to
eyebrows and buttons, and numerals to ending stats and other scan-heavy values.
Do not restructure overlays or change their modal behavior.

- [ ] **Step 4: Annotate dynamic projected and repair controls**

In `createAnchorButton`, use:

```ts
tooltip.className = 'boat-tooltip ui-role-context';
energy.className = 'boat-tooltip__energy ui-role-numeral';
```

When creating each repair target button, use:

```ts
button.className = 'event-item repair-target ui-role-context';
```

Do not change tooltip text, quantities, energy calculation, aria labels,
unavailable reasons, focus publication, or repair selection.

- [ ] **Step 5: Replace survival-wide legacy font stacks**

In `src/styles/main.css`:

- replace `.survival-ui`'s handwritten stack with
  `font-family: var(--font-narrative)`;
- replace `.boat-tooltip`'s handwritten stack with
  `font-family: var(--font-context)`;
- replace journal heading and cinematic heading stacks with
  `var(--font-display)`;
- replace the fishing-result display stack with `var(--font-display)`;
- replace generic survival-overlay narrative stack with
  `var(--font-narrative)`;
- keep existing font sizes, letter spacing, value contrast, transforms,
  material styling, focus styling, and responsive rules.

After these changes, search `src/styles/main.css` for `Segoe Print`,
`Bradley Hand`, `Impact`, `Arial Black`, and raw `ui-monospace`. Each remaining
occurrence must be inside a fallback variable in `src/styles/fonts.css`, not a
phase-wide rule.

- [ ] **Step 6: Run survival and UI regression tests**

Run:

```powershell
npm test -- tests/SurvivalUI.test.ts tests/GameUI.test.ts tests/SystemScreen.test.ts tests/launchGame.test.ts tests/AssetPolicy.test.ts tests/UIFontAssets.test.ts
```

Expected: all focused tests pass. Existing modal order, focus trapping,
projected anchor, journal navigation, pointer-lock, hostile-text, asset
precedence, and cleanup tests remain green.

- [ ] **Step 7: Run the full verification suite**

Run:

```powershell
npm run typecheck
npm test
npm run build
```

Expected: TypeScript reports no errors, the full Vitest suite passes, and Vite
builds the game with four local hashed WOFF2 assets.

- [ ] **Step 8: Commit the survival migration**

```powershell
git add src/ui/SurvivalUI.ts src/styles/main.css tests/SurvivalUI.test.ts
git commit -m "feat: apply typography roles to survival UI"
```

---

## Implementation Completion Check

Before claiming completion:

1. Confirm `git status --short` contains only intentional implementation-plan
   files in the isolated worktree.
2. Confirm no runtime source contains `fonts.googleapis.com`,
   `fonts.gstatic.com`, `cdn.jsdelivr.net`, or
   `raw.githubusercontent.com/fontsource`.
3. Confirm every committed `.woff2` starts with `wOF2`.
4. Confirm loading and every failure branch still renders without constructing
   `Game`.
5. Confirm all three commands from Task 4 Step 7 succeeded in the current
   worktree.
6. Summarize the four task commits and any visual judgment that still requires
   live browser review; do not claim unobserved states were visually verified.
