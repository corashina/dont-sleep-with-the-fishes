// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { initializeLanguage, setLanguage, type Language } from '../src/i18n/language';
import { renderGuideDescription } from '../src/menu/GuideDescription';

afterEach(() => initializeLanguage(null));

it.each<[Language, string]>([['en', 'energy'], ['pl', 'energia'], ['es-AR', 'energía']])(
  'renders numbered energy amounts with accessible labels in %s', (language, energy) => {
    setLanguage(language);
    const element = document.createElement('p');
    const text = `${energy}: ⚡1, ⚡2, ${energy}, ⚡3. <img src="x">`;
    renderGuideDescription(element, text);
    expect(element.textContent).toBe(text);
    const amounts = [...element.querySelectorAll('.how-to-play-energy')];
    expect(amounts.map(amount => amount.querySelector('sup')?.textContent)).toEqual(['1', '2', '3']);
    expect(amounts.map(amount => amount.getAttribute('aria-label')))
      .toEqual([`1 ${energy}`, `2 ${energy}`, `3 ${energy}`]);
    expect(amounts.every(amount => amount.getAttribute('role') === 'img')).toBe(true);
    expect(element.querySelectorAll('strong')).toHaveLength(1);
    expect(element.querySelector('img')).toBeNull();
  },
);

it('highlights Argentine Spanish mechanics without matching parts of other words', () => {
  setLanguage('es-AR');
  const element = document.createElement('p');
  const text = 'Salud, Comida, Energía, Casco, caja de herramientas, cinta adhesiva. Saludos, comidas.';
  renderGuideDescription(element, text);
  expect(element.textContent).toBe(text);
  expect([...element.querySelectorAll('strong')].map(keyword => keyword.textContent))
    .toEqual(['Salud', 'Comida', 'Energía', 'Casco', 'caja de herramientas', 'cinta adhesiva']);
});

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

it('matches Polish inflections and replaces earlier language highlights', () => {
  const element = document.createElement('p');
  setLanguage('en');
  renderGuideDescription(element, 'Health');
  setLanguage('pl');
  const text = 'Zdrowie, jedzenie, energia, energię, energii, kadłuba, kadłub. Przynęta, poduszki, skrzynkę z narzędziami, taśmą klejącą, Carlitosa. Głód, zapasów, łowienie ryb.';
  renderGuideDescription(element, text);
  expect(element.textContent).toBe(text);
  expect([...element.querySelectorAll('strong')].map((keyword) => keyword.textContent))
    .toEqual(['Zdrowie', 'jedzenie', 'energia', 'kadłuba', 'skrzynkę z narzędziami', 'taśmą klejącą']);
});
