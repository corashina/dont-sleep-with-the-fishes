import { getLanguage, type Language } from '../i18n/language';
import { flowText } from '../i18n/flowMessages';

const TERMS = {
  health: {
    en: 'health',
    pl: 'zdrowie',
    'es-AR': 'salud',
  },
  food: {
    en: 'food',
    pl: 'jedzenie|jedzenia',
    'es-AR': 'comida',
  },
  energy: {
    en: 'energy',
    pl: 'energi[aię]',
    'es-AR': 'energía',
  },
  hull: {
    en: 'hull',
    pl: 'kadłub(?:a|u)?',
    'es-AR': 'casco',
  },
  toolbox: {
    en: 'toolbox',
    pl: 'skrzynk[aię] z narzędziami',
    'es-AR': 'caja de herramientas',
  },
  ductTape: {
    en: 'duct tape',
    pl: 'taśm[ayąę] klejąc[ayąę]',
    'es-AR': 'cinta adhesiva',
  },
} as const;

type Mechanic = keyof typeof TERMS;

function keywordPattern(language: Language): RegExp {
  const groups = Object.entries(TERMS)
    .map(([mechanic, terms]) => `(?<${mechanic}>${terms[language]})`)
    .join('|');
  return new RegExp(`(?<energyAmount>⚡[1-3])|(?<![\\p{L}\\p{N}])(?:${groups})(?![\\p{L}\\p{N}])`, 'giu');
}

const PATTERNS = { en: keywordPattern('en'), pl: keywordPattern('pl'), 'es-AR': keywordPattern('es-AR') };

export function renderGuideDescription(element: HTMLElement, description: string): void {
  const content = document.createDocumentFragment();
  const highlighted = new Set<Mechanic>();
  let offset = 0;
  for (const match of description.matchAll(PATTERNS[getLanguage()])) {
    if (match.groups?.energyAmount !== undefined) {
      content.append(document.createTextNode(description.slice(offset, match.index)));
      const amount = document.createElement('span');
      amount.className = 'how-to-play-energy';
      amount.setAttribute('role', 'img');
      amount.setAttribute('aria-label', `${match[0].slice(1)} ${flowText('energy')}`);
      const number = document.createElement('sup');
      number.textContent = match[0].slice(1);
      amount.append('⚡', number);
      content.append(amount);
      offset = match.index + match[0].length;
      continue;
    }
    const mechanic = Object.keys(TERMS).find((key) => match.groups?.[key] !== undefined) as Mechanic;
    if (highlighted.has(mechanic)) continue;
    highlighted.add(mechanic);
    content.append(document.createTextNode(description.slice(offset, match.index)));
    const keyword = document.createElement('strong');
    keyword.className = `how-to-play-keyword how-to-play-keyword--${mechanic}`;
    keyword.textContent = match[0];
    content.append(keyword);
    offset = match.index + match[0].length;
  }
  content.append(document.createTextNode(description.slice(offset)));
  element.replaceChildren(content);
}
