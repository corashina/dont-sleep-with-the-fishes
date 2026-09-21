// @vitest-environment jsdom
import { afterEach,expect,it } from 'vitest';
import { initializeLanguage,setLanguage } from '../src/i18n/language';
import { renderGuideDescription } from '../src/menu/GuideDescription';

afterEach(() => initializeLanguage(null));

it('marks core mechanics without changing text or treating it as HTML', () => {
  setLanguage('en');
  const element = document.createElement('p');
  const text = 'Health, Food, Energy, Hull. Bait, pillow, toolbox, duct tape, Carlitos. Energy Bar. Health, food, energy, hull, toolbox, duct tape.\n\nUnhealthy seafood <img src="x">';
  renderGuideDescription(element, text);
  expect(element.textContent).toBe(text);
  expect([...element.querySelectorAll('strong')].map((keyword) => keyword.textContent))
    .toEqual(['Health', 'Food', 'Energy', 'Hull', 'toolbox', 'duct tape']);
  expect(element.querySelector('img')).toBeNull();
});
