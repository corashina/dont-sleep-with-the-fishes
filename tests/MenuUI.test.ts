// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MenuUI } from '../src/menu/MenuUI';

afterEach(() => { document.body.innerHTML = ''; });

const mainStyles = readFileSync('src/styles/main.css', 'utf8');

it('exposes the approved title actions', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new MenuUI(mount);
  expect(mount.querySelector('.ui-treatment')).toBeNull();
  expect(mainStyles).toMatch(/\.underwater-menu-screen\s*\{[^}]*background:\s*none/s);

  const title = mount.querySelector<HTMLHeadingElement>('h1')!;
  expect(title.textContent).toBe("DON'T SLEEP WITH THE FISHES");
  expect(title.classList).toContain('menu-title-accessible');
  expect(mainStyles).toMatch(/\.menu-title-accessible\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
  expect(mainStyles).toMatch(/\.underwater-menu-screen__content::before\s*\{[^}]*grid-row:\s*1/s);
  const startTrigger = mount.querySelector('[data-menu-start]')!;
  expect(startTrigger.textContent).toContain('START');
  expect(startTrigger.classList).toContain('menu-action-accessible');
  const guideTrigger = mount.querySelector('[data-menu-guide-open]')!;
  expect(guideTrigger.textContent).toContain('HOW TO PLAY');
  expect(guideTrigger.classList).toContain('menu-action-accessible');
  expect(mainStyles).toMatch(/\.menu-action-accessible\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
  expect(mainStyles).not.toMatch(/\.underwater-menu-screen \[data-menu-guide-open\]\s*\{[^}]*top:/s);
  expect(mainStyles).toMatch(/\.underwater-menu-screen\.is-visible\s*\{[^}]*pointer-events:\s*none/s);
  expect(mainStyles).not.toMatch(/\.underwater-menu-screen \[data-menu-start\]\s*\{[^}]*pointer-events:\s*auto/s);
  ui.dispose();
});

it('presents the emergency briefing as two action stages', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  const guide = mount.querySelector<HTMLElement>('[data-menu-guide]')!;
  const intro = guide.querySelector<HTMLElement>('#menu-how-to-play-intro')!;
  const stages = [...guide.querySelectorAll<HTMLElement>('.how-to-play-step')];
  const labels = [...guide.querySelectorAll<HTMLElement>('.how-to-play-action__label')]
    .map((label) => label.textContent?.trim());
  const art = [...guide.querySelectorAll<SVGElement>('[data-ui-artwork^="guide"]')];

  expect(intro.textContent?.trim()).toBe(
    'Save what you can. Reach the lifeboat. Survive until rescue.',
  );
  expect(stages).toHaveLength(2);
  expect(stages[0]!.textContent).toContain('ESCAPE DOROTHY');
  expect(stages[0]!.textContent).toContain('Dorothy sinks in 60 seconds.');
  expect(stages[1]!.textContent).toContain('SURVIVE THE SEA');
  expect(stages[1]!.textContent).toContain('Stay alive and keep the hull intact until rescue.');
  expect(labels).toEqual(['SEARCH', 'CARRY', 'SAVE', 'PREPARE', 'WATCH', 'END DAY']);
  expect(guide.textContent).toContain('RESCUE CHANCE RISES EACH DAY');
  expect(art.map((icon) => icon.dataset.uiArtwork)).toEqual([
    'guideSearch', 'guideCarry', 'guideSave',
    'guidePrepare', 'guideWatch', 'guideEndDay',
  ]);
  expect(art.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  expect(art.every((icon) => icon.getAttribute('focusable') === 'false')).toBe(true);
  ui.dispose();
});

it('locks focus inside the guide and restores its opener', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new MenuUI(mount);
  const open = mount.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;
  const close = mount.querySelector<HTMLButtonElement>('[data-menu-guide-close]')!;

  open.click();
  expect(document.activeElement).toBe(close);
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.activeElement).toBe(open);
  ui.dispose();
});

it('forwards keyboard focus to both interactive signs', () => {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new MenuUI(mount);
  const onGuideFocusChange = vi.fn();
  const onStartFocusChange = vi.fn();
  ui.onGuideFocusChange = onGuideFocusChange;
  ui.onStartFocusChange = onStartFocusChange;
  const start = mount.querySelector<HTMLButtonElement>('[data-menu-start]')!;
  const open = mount.querySelector<HTMLButtonElement>('[data-menu-guide-open]')!;

  start.focus();
  start.blur();
  open.focus();
  open.blur();

  expect(onStartFocusChange).toHaveBeenNthCalledWith(1, true);
  expect(onStartFocusChange).toHaveBeenNthCalledWith(2, false);
  expect(onGuideFocusChange).toHaveBeenNthCalledWith(1, true);
  expect(onGuideFocusChange).toHaveBeenNthCalledWith(2, false);
  ui.dispose();
});

it('fires start once while transitioning', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  ui.onStart = vi.fn();
  const start = mount.querySelector<HTMLButtonElement>('[data-menu-start]')!;
  start.click();
  ui.setTransitioning(true);
  start.click();
  expect(ui.onStart).toHaveBeenCalledOnce();
  ui.dispose();
});

it('shows and clears the pointer lock guidance', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  const error = mount.querySelector<HTMLElement>('[data-menu-pointer-lock-error]')!;

  ui.showPointerLockError();
  expect(error.textContent).toBe('Mouse look was blocked. Click the button and allow pointer lock to continue.');
  expect(error.classList).toContain('is-visible');

  ui.clearPointerLockError();
  expect(error.textContent).toBe('');
  expect(error.classList).not.toContain('is-visible');
  ui.dispose();
});

it('clamps the fade progress and removes its controls on disposal', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  const start = mount.querySelector<HTMLButtonElement>('[data-menu-start]')!;
  const onStart = vi.fn();
  ui.onStart = onStart;

  ui.setFadeProgress(-1);
  expect(mount.querySelector<HTMLElement>('.menu-ui')!.style.getPropertyValue('--menu-fade')).toBe('0');
  ui.setFadeProgress(2);
  expect(mount.querySelector<HTMLElement>('.menu-ui')!.style.getPropertyValue('--menu-fade')).toBe('1');

  ui.dispose();
  start.click();
  expect(onStart).not.toHaveBeenCalled();
  expect(mount.children).toHaveLength(0);
});

it('uses the viewport height for the title and start layout', () => {
  expect(mainStyles).toMatch(/\.underwater-menu-screen\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s);
  expect(mainStyles).toMatch(/\.underwater-menu-screen__content\s*\{[^}]*height:\s*100%/s);
  expect(mainStyles).toMatch(/\.how-to-play-board\s*\[data-menu-guide-close\]\s*\{[^}]*justify-self:\s*center/s);
  expect(mainStyles).toMatch(/@media \(max-height: 760px\) and \(min-width: 821px\)\s*\{[\s\S]*?\.how-to-play-board\s*\{[^}]*padding:\s*12px 24px/s);
  expect(mainStyles).toMatch(/\.how-to-play-board\s*\[data-menu-guide-close\]\s*\{[^}]*min-height:\s*44px/s);
  expect(mainStyles).toMatch(/\.menu-title-accessible\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
  expect(mainStyles).toMatch(/\.menu-action-accessible\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
  expect(mainStyles).toMatch(/\.underwater-menu-screen__content::before\s*\{[^}]*grid-row:\s*1/s);
});

it('defines the emergency briefing layout contracts', () => {
  expect(mainStyles).toMatch(
    /\.how-to-play-board\s*\{[^}]*width:\s*min\(1060px,\s*calc\(100vw - 36px\)\)[^}]*max-height:\s*calc\(100dvh - 28px\)/s,
  );
  expect(mainStyles).toMatch(
    /\.how-to-play-route\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  expect(mainStyles).toMatch(
    /\.how-to-play-action\s*\{[^}]*grid-template-columns:\s*34px 72px minmax\(0,\s*1fr\)/s,
  );
  expect(mainStyles).toMatch(
    /@media \(max-width: 820px\)\s*\{[\s\S]*?\.how-to-play-route\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});
