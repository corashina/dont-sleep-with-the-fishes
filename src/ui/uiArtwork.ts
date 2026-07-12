export const UI_ARTWORK_IDS = [
  'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning',
] as const;

export type UiArtworkId = typeof UI_ARTWORK_IDS[number];

const ARTWORK: Record<UiArtworkId, string> = {
  health: '<path d="M32 57C9 42 5 23 17 13c8-7 18-3 23 5 6-8 17-12 25-4 12 12 2 31-20 45l-6 4z"/><path class="ui-artwork__shine" d="M18 25c2-7 8-10 14-7"/>',
  hunger: '<path d="M20 13c10 2 10 13 8 21-2 9 2 23 15 24 11 1 22-7 22-20 0-7-4-11-10-12-5-1-8 4-12 2-4-2-1-11-4-17z"/><path class="ui-artwork__shine" d="M23 18c4 2 5 7 4 12"/>',
  energy: '<path d="M37 5 15 37h18l-5 28 25-36H35z"/><path class="ui-artwork__shine" d="m34 14-10 17"/>',
  hull: '<path d="M10 27h60l-8 24c-12 12-40 12-51 0z"/><path d="M22 27V16h35v11M14 45c14 7 37 7 52 0"/><path class="ui-artwork__shine" d="M25 20h12"/>',
  watch: '<circle cx="40" cy="43" r="27"/><path d="M32 8h16v8H32zM40 16V4M40 43V26M40 43l12 8"/><circle class="ui-artwork__shine" cx="40" cy="43" r="21"/>',
  journal: '<path d="M16 9h39c7 0 11 4 11 11v45H27c-7 0-11-4-11-11z"/><path d="M27 9v56M34 23h22M34 34h18"/><path class="ui-artwork__shine" d="M20 14h5"/>',
  warning: '<path d="M40 7 73 65H7z"/><path d="M40 25v21M40 55v2"/><path class="ui-artwork__shine" d="m20 56 20-35"/>',
};

const CSS_IDENTIFIER = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

export function uiArtwork(id: UiArtworkId, className = ''): string {
  const optionalClasses = className.split(/\s+/).filter((token) => CSS_IDENTIFIER.test(token));
  const classes = ['ui-artwork', `ui-artwork--${id}`, ...optionalClasses].join(' ');
  return `<svg class="${classes}" data-ui-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ARTWORK[id]}</svg>`;
}
