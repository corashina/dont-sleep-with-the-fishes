import { getLanguage } from '../i18n/language';

const TERMS = {
  health: {
    en: 'health',
    pl: 'zdrowie',
  },
  food: {
    en: 'food',
    pl: 'jedzenie|jedzenia',
  },
  energy: {
    en: 'energy(?! bar)',
    pl: 'energi[aię]',
  },
  hull: {
    en: 'hull',
    pl: 'kadłub(?:a|u)?',
  },
  bait: {
    en: 'bait',
    pl: 'przynęt[ayę]',
  },
  pillow: {
    en: 'pillow',
    pl: 'poduszk[aię]',
  },
  toolbox: {
    en: 'toolbox',
    pl: 'skrzynk[aię] z narzędziami',
  },
  ductTape: {
    en: 'duct tape',
    pl: 'taśm[ayąę] klejąc[ayąę]',
  },
  carlitos: {
    en: 'Carlitos',
    pl: 'Carlitos(?:a)?',
  },
} as const;

type Mechanic = keyof typeof TERMS;

function keywordPattern(language: 'en' | 'pl'): RegExp {
  const groups = Object.entries(TERMS)
    .map(([mechanic, terms]) => `(?<${mechanic}>${terms[language]})`)
    .join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${groups})(?![\\p{L}\\p{N}])`, 'giu');
}

const PATTERNS = { en: keywordPattern('en'), pl: keywordPattern('pl') };

export function renderGuideDescription(element: HTMLElement, description: string): void {
  const content = document.createDocumentFragment();
  const highlighted = new Set<Mechanic>();
  let offset = 0;
  for (const match of description.matchAll(PATTERNS[getLanguage()])) {
    const mechanic = Object.keys(TERMS).find((key) => match.groups?.[key] !== undefined) as Mechanic;
    if (highlighted.has(mechanic)) continue;
    highlighted.add(mechanic);
    content.append(document.createTextNode(description.slice(offset, match.index)));
    const keyword = document.createElement('strong');
    keyword.className = 'how-to-play-keyword';
    keyword.textContent = match[0];
    content.append(keyword);
    offset = match.index + match[0].length;
  }
  content.append(document.createTextNode(description.slice(offset)));
  element.replaceChildren(content);
}
