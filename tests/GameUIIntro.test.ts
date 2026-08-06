// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { GameUI } from '../src/ui/GameUI';

it('shows only the skip strip during the intro', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);
  const fade = mount.querySelector<HTMLElement>('[data-intro-fade]')!;

  expect(mount.querySelector('[data-start]')).toBeNull();
  expect(mount.querySelector('[data-how-to-play]')).toBeNull();
  expect(fade.style.opacity).toBe('1');

  ui.setIntroFadeProgress(0.4);
  expect(fade.style.opacity).toBe('0.4');
  ui.setIntroFadeProgress(-1);
  expect(fade.style.opacity).toBe('0');
  ui.setIntroFadeProgress(2);
  expect(fade.style.opacity).toBe('1');

  ui.setPresentation('intro');

  expect(mount.querySelector('[data-intro-skip]')).toHaveProperty('hidden', false);
  expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);

  ui.setPresentation('playing');

  expect(mount.querySelector('[data-intro-skip]')).toHaveProperty('hidden', true);
  expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', false);
  ui.dispose();
});
