// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { GameUI } from '../src/ui/GameUI';

it('shows only the skip strip during the intro', () => {
  const mount = document.createElement('main');
  const ui = new GameUI(mount);

  ui.setPresentation('intro');

  expect(mount.querySelector('[data-intro-skip]')).toHaveProperty('hidden', false);
  expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);

  ui.setPresentation('playing');

  expect(mount.querySelector('[data-intro-skip]')).toHaveProperty('hidden', true);
  expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', false);
  ui.dispose();
});
