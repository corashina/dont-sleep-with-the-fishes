import { getLanguage } from '../i18n/language';

export const GUIDE_PAGES = [
  { title: 'scavengingTitle', sections: ['collect', 'evacuate'] },
  { title: 'survivalTitle', sections: ['needs', 'catch'] },
  { title: 'dayTitle', sections: ['hullRepair', 'drifting'] },
  { title: 'nightTitle', sections: ['nightEvent', 'nightResponse'] },
] as const;

export type GuideSectionId = typeof GUIDE_PAGES[number]['sections'][number];

export function guideImage(section: GuideSectionId): string {
  const root = `${import.meta.env.BASE_URL}images/how-to-play`;
  if (section === 'collect') return `${root}/scavenging.png`;
  if (section === 'evacuate') return `${root}/scavenging-lifeboat.png`;
  return `${root}/${section}-${getLanguage()}.jpg`;
}
