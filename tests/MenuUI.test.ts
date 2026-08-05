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

  expect(mount.querySelector('h1')?.textContent).toBe("DON'T SLEEP WITH THE FISHES");
  expect(mount.querySelector('[data-menu-start]')?.textContent).toContain('START');
  expect(mount.querySelector('[data-menu-guide-open]')?.textContent).toContain('HOW TO PLAY');
  ui.dispose();
});

it('states the sixty-second ship search duration', () => {
  const mount = document.createElement('main');
  const ui = new MenuUI(mount);
  const guide = mount.querySelector<HTMLElement>('[data-menu-guide]')!;

  expect(guide.textContent).toContain('You have 60 seconds before Dorothy sinks.');
  expect(guide.textContent).not.toContain('two minutes');
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
});
