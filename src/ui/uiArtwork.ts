import type { ItemId } from '../game/ItemState';

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
  cannedFood: '<path class="item-artwork__secondary" d="M19 18c0-9 42-9 42 0v38c0 9-42 9-42 0z"/><ellipse class="item-artwork__light" cx="40" cy="18" rx="21" ry="8"/><path class="item-artwork__primary" d="M24 31h32v21H24z"/><path class="item-artwork__ink" d="M29 42c6-8 12-8 18-2l6-4-2 7 2 7-7-4c-6 5-12 4-17-4z"/>',
  baitTin: '<path class="item-artwork__secondary" d="M17 20c0-8 46-8 46 0v34c0 9-46 9-46 0z"/><ellipse class="item-artwork__light" cx="40" cy="20" rx="23" ry="8"/><path class="item-artwork__primary" d="M23 32h34v17H23z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="M30 43c7-10 13 6 21-5m-3-5 5 5-6 4"/>',
  ductTape: '<circle class="item-artwork__secondary" cx="40" cy="36" r="27"/><circle class="item-artwork__primary" cx="40" cy="36" r="16"/><circle class="item-artwork__cutout" cx="40" cy="36" r="9"/><path class="item-artwork__light" d="M23 20c9-8 24-9 34-1l-5 6c-7-5-17-4-24 1z"/>',
  compass: '<circle class="item-artwork__secondary" cx="40" cy="36" r="28"/><circle class="item-artwork__light" cx="40" cy="36" r="21"/><path class="item-artwork__primary" d="m47 20-4 19-18 13 11-20z"/><circle class="item-artwork__ink" cx="40" cy="36" r="4"/>',
  map: '<path class="item-artwork__light" d="m12 17 18-7 20 8 18-7v44l-18 7-20-8-18 7z"/><path class="item-artwork__secondary" d="M30 10v44m20-36v44"/><path class="item-artwork__primary item-artwork__stroke-thin" d="M18 42c9-16 18 7 28-8s12-3 16-13"/><circle class="item-artwork__ink" cx="47" cy="33" r="4"/>',
  medicalKit: '<path class="item-artwork__primary" d="M13 22h54v40H13z"/><path class="item-artwork__secondary" d="M27 13h26v12H27z"/><path class="item-artwork__light" d="M34 29h12v9h9v12h-9v9H34v-9h-9V38h9z"/>',
  spyglass: '<g transform="rotate(-24 40 36)"><path class="item-artwork__secondary" d="M12 28h48v17H12z"/><path class="item-artwork__primary" d="M23 24h24v25H23z"/><path class="item-artwork__light" d="M8 24h12v25H8zm52-3h11v31H60z"/><path class="item-artwork__ink" d="M47 28h5v17h-5z"/></g>',
  fishingNet: '<ellipse class="item-artwork__primary item-artwork__stroke" cx="43" cy="28" rx="24" ry="19"/><path class="item-artwork__light item-artwork__stroke-thin" d="M24 20h38M20 28h46M24 36h38M32 11v34m12-36v38m12-32v27"/><path class="item-artwork__secondary item-artwork__stroke" d="m27 43-16 22"/>',
  bucket: '<path class="item-artwork__primary" d="m18 26 5 37h34l5-37z"/><path class="item-artwork__secondary" d="M17 21h46v9H17z"/><path class="item-artwork__light item-artwork__stroke-thin" d="M24 25c0-25 32-25 32 0"/>',
  flareGun: '<g data-flare-silhouette="signal-pistol" transform="rotate(-8 40 36)"><path class="item-artwork__primary" d="M12 24h43l12 8-12 9H39l-3 20H22l3-21H12z"/><path class="item-artwork__secondary" d="M23 40h18l-4 22H20z"/><path class="item-artwork__light" d="M16 27h37v6H16z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="M40 41c10 0 12 12 3 15"/></g>',
  flashlight: '<g transform="rotate(-34 40 36)"><path class="item-artwork__secondary" d="M31 25h18v39H31z"/><path class="item-artwork__primary" d="M25 12h30l-5 17H30z"/><path class="item-artwork__light" d="M31 13h18l-3 9H34z"/><path class="item-artwork__primary" d="M34 40h12v8H34z"/></g>',
  scubaSet: '<path class="item-artwork__secondary" d="M26 12h14v48c0 8-21 8-21 0V22c0-6 2-10 7-10zm28 0H40v48c0 8 21 8 21 0V22c0-6-2-10-7-10z"/><path class="item-artwork__primary" d="M26 8h10v9H26zm18 0h10v9H44z"/><path class="item-artwork__ink" d="M27 31h26v21H27z"/><path class="item-artwork__light item-artwork__stroke-thin" d="M29 27C23 17 12 22 15 36m36-9c6-10 17-5 14 9"/>',
  anchor: '<path class="item-artwork__secondary" d="M35 20h10v31H35z"/><circle class="item-artwork__light item-artwork__stroke" cx="40" cy="14" r="8"/><path class="item-artwork__primary" d="M13 37h16c-1 13 5 20 11 22 6-2 12-9 11-22h16c1 19-11 30-27 32-16-2-28-13-27-32z"/><path class="item-artwork__light" d="m13 37 9-9 9 9zm54 0-9-9-9 9z"/>',
  bottledPaper: '<path class="item-artwork__secondary" d="M30 8h20v10c8 4 12 13 12 29 0 13-8 19-22 19s-22-6-22-19c0-16 4-25 12-29z"/><path class="item-artwork__light" d="m27 35 28-6 4 20-28 6z"/><path class="item-artwork__primary" d="M29 8h22v10H29z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="m31 36 14 8 9-13"/>',
  umbrella: '<path class="item-artwork__primary" d="M8 34C12 16 25 7 40 7s28 9 32 27c-10-7-17-7-24 0-6-7-13-7-20 0-7-7-13-7-20 0z"/><path class="item-artwork__secondary item-artwork__stroke" d="M40 8v46c0 12 15 12 15 1"/><path class="item-artwork__light" d="M33 12c-7 5-11 12-12 20h12z"/>',
  swimRing: '<circle class="item-artwork__primary" cx="40" cy="36" r="29"/><circle class="item-artwork__cutout" cx="40" cy="36" r="14"/><path class="item-artwork__secondary" d="m18 15 11 12-8 10L9 26zm44 0L51 27l8 10 12-11zM18 57l11-12-8-10L9 46zm44 0L51 45l8-10 12 11z"/>',
  harpoonGun: '<g transform="rotate(-11 40 36)"><path class="item-artwork__secondary" d="M9 25h50v13H9z"/><path class="item-artwork__primary" d="M27 36h18l-4 23H26z"/><path class="item-artwork__light" d="M7 20h55v6H7z"/><path class="item-artwork__ink" d="m62 17 12 6-12 6z"/></g>',
  energyBar: '<path class="item-artwork__primary" d="m12 22 7-8h42l7 8v30l-7 8H19l-7-8z"/><path class="item-artwork__secondary" d="M19 14h8v46h-8zm34 0h8v46h-8z"/><path class="item-artwork__light" d="M29 28h22v18H29z"/><path class="item-artwork__ink" d="m38 29-7 11h8l-2 9 12-15h-8l3-5z"/>',
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
