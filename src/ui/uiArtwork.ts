import { ITEM_IDS, type ItemId } from '../game/ItemState';

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

const ITEM_ARTWORK: Readonly<Record<ItemId, string>> = {
  flareGun: '<g transform="rotate(-8 40 36)"><path class="item-artwork__primary" d="M11 28h48l10 8-10 8H40l-3 17H24l2-18H11z"/><path class="item-artwork__secondary" d="M45 44h13l-2 10H43z"/><path class="item-artwork__light" d="M18 31h34v6H18z"/></g>',
  ductTape: '<circle class="item-artwork__secondary" cx="40" cy="36" r="27"/><circle class="item-artwork__primary" cx="40" cy="36" r="16"/><circle class="item-artwork__cutout" cx="40" cy="36" r="9"/><path class="item-artwork__light" d="M23 20c9-8 24-9 34-1l-5 6c-7-5-17-4-24 1z"/>',
  fishingRod: '<path class="item-artwork__primary item-artwork__stroke" d="M16 61 62 10"/><path class="item-artwork__secondary item-artwork__stroke" d="m20 56-7 8"/><circle class="item-artwork__secondary" cx="31" cy="47" r="9"/><circle class="item-artwork__cutout" cx="31" cy="47" r="4"/><path class="item-artwork__light item-artwork__stroke-thin" d="M61 11c8 10 7 23-2 31"/>',
  baitTin: '<path class="item-artwork__secondary" d="M17 20c0-8 46-8 46 0v34c0 9-46 9-46 0z"/><ellipse class="item-artwork__light" cx="40" cy="20" rx="23" ry="8"/><path class="item-artwork__primary" d="M23 32h34v17H23z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="M30 43c7-10 13 6 21-5m-3-5 5 5-6 4"/>',
  medicalKit: '<path class="item-artwork__primary" d="M13 22h54v40H13z"/><path class="item-artwork__secondary" d="M27 13h26v12H27z"/><path class="item-artwork__light" d="M34 29h12v9h9v12h-9v9H34v-9h-9V38h9z"/>',
  waterJug: '<path class="item-artwork__primary" d="M28 9h20v10c10 5 14 15 14 29 0 12-8 18-22 18s-22-6-22-18c0-14 4-24 14-29z"/><path class="item-artwork__cutout item-artwork__stroke-thin" d="M43 24c11 0 13 17 3 19"/><path class="item-artwork__light" d="M27 44h27v13H27z"/><path class="item-artwork__secondary" d="M27 8h22v8H27z"/>',
  cannedFood: '<path class="item-artwork__secondary" d="M19 18c0-9 42-9 42 0v38c0 9-42 9-42 0z"/><ellipse class="item-artwork__light" cx="40" cy="18" rx="21" ry="8"/><path class="item-artwork__primary" d="M24 31h32v21H24z"/><path class="item-artwork__ink" d="M29 42c6-8 12-8 18-2l6-4-2 7 2 7-7-4c-6 5-12 4-17-4z"/>',
  flashlight: '<g transform="rotate(-34 40 36)"><path class="item-artwork__secondary" d="M31 25h18v39H31z"/><path class="item-artwork__primary" d="M25 12h30l-5 17H30z"/><path class="item-artwork__light" d="M31 13h18l-3 9H34z"/><path class="item-artwork__primary" d="M34 40h12v8H34z"/></g>',
  scubaSet: '<path class="item-artwork__secondary" d="M26 12h14v48c0 8-21 8-21 0V22c0-6 2-10 7-10zm28 0H40v48c0 8 21 8 21 0V22c0-6-2-10-7-10z"/><path class="item-artwork__primary" d="M26 8h10v9H26zm18 0h10v9H44z"/><path class="item-artwork__ink" d="M27 31h26v21H27z"/><path class="item-artwork__light item-artwork__stroke-thin" d="M29 27C23 17 12 22 15 36m36-9c6-10 17-5 14 9"/>',
};

const CSS_IDENTIFIER = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

function classes(base: readonly string[], className: string): string {
  return [...base, ...className.split(/\s+/).filter((token) => CSS_IDENTIFIER.test(token))].join(' ');
}

export function uiArtwork(id: UiArtworkId, className = ''): string {
  const classNames = classes(['ui-artwork', `ui-artwork--${id}`], className);
  return `<svg class="${classNames}" data-ui-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ARTWORK[id]}</svg>`;
}

export function itemArtwork(id: ItemId, className = ''): string {
  const classNames = classes(['item-artwork', `item-artwork--${id}`], className);
  return `<svg class="${classNames}" data-item-artwork="${id}" viewBox="0 0 80 72" aria-hidden="true" focusable="false">${ITEM_ARTWORK[id]}</svg>`;
}
