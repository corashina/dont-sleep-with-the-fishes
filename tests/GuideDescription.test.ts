// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import { renderGuideDescription } from '../src/menu/GuideDescription';

afterEach(() => initializeLanguage(null));

it('marks core mechanics without changing text or treating it as HTML', () => {
  setLanguage('en');
  const element = document.createElement('p');
  const text = 'Health, Food, Energy, Hull. Bait, pillow, toolbox, duct tape, Carlitos. Energy Bar. Health, food, energy, hull, toolbox, duct tape.\n\nUnhealthy seafood <img src="x">';
  renderGuideDescription(element, text);
  expect(element.textContent).toBe(text);
  expect([...element.querySelectorAll('strong')].map((keyword) => keyword.textContent))
    .toEqual(['Health', 'Food', 'Energy', 'Hull', 'toolbox', 'duct tape', 'Energy', 'Health', 'food', 'energy', 'hull', 'toolbox', 'duct tape']);
  expect(element.querySelector('img')).toBeNull();
});

it('matches Polish inflections and replaces earlier language highlights', () => {
  const element = document.createElement('p');
  setLanguage('en');
  renderGuideDescription(element, 'Health');
  setLanguage('pl');
  const text = 'Zdrowie, jedzenie, energia, energię, energii, kadłuba, kadłub. Przynęta, poduszki, skrzynkę z narzędziami, taśmą klejącą, Carlitosa. Głód, zapasów, łowienie ryb.';
  renderGuideDescription(element, text);
  expect(element.textContent).toBe(text);
  expect([...element.querySelectorAll('strong')].map((keyword) => keyword.textContent))
    .toEqual(['Zdrowie', 'jedzenie', 'energia', 'energię', 'energii', 'kadłuba', 'kadłub', 'skrzynkę z narzędziami', 'taśmą klejącą']);
});
