import { getLanguage, type Language } from '../i18n/language';

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
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${groups})(?![\\p{L}\\p{N}])`, 'giu');
}

const PATTERNS = { en: keywordPattern('en'), pl: keywordPattern('pl'), 'es-AR': keywordPattern('es-AR') };

export function renderGuideDescription(element: HTMLElement, description: string): void {
  const content = document.createDocumentFragment();
  let offset = 0;
  for (const match of description.matchAll(PATTERNS[getLanguage()])) {
    const mechanic = Object.keys(TERMS).find((key) => match.groups?.[key] !== undefined) as Mechanic;
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
