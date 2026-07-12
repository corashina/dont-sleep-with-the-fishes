export const WIKI_SOURCES = {
  home: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Don%27t_Sleep_With_The_Fishes_%28Unofficial%29_Wiki', snapshot: '2026-07-12' },
  items: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Items', snapshot: '2026-07-12' },
  fishing: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Fishing', snapshot: '2026-07-12' },
  events: { url: 'https://unoffdontsleepwiththefishes.fandom.com/wiki/Events', snapshot: '2026-07-12' },
} as const;
export type WikiSourceId = keyof typeof WIKI_SOURCES;
