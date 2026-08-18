import type { ItemId } from '../game/ItemState';

export const UI_ARTWORK_IDS = [
  'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning', 'howToPlay',
  'guideSearch', 'guideCarry', 'guideSave',
  'guidePrepare', 'guideWatch', 'guideEndDay',
] as const;

export type UiArtworkId = typeof UI_ARTWORK_IDS[number];

const ARTWORK: Record<UiArtworkId, string> = {
  health: '<path d="M32 57C9 42 5 23 17 13c8-7 18-3 23 5 6-8 17-12 25-4 12 12 2 31-20 45l-6 4z"/><path class="ui-artwork__shine" d="M18 25c2-7 8-10 14-7"/>',
  hunger: '<g data-hunger-scale transform="translate(40 36) scale(.8) translate(-40 -36)"><path data-hunger-part="body" d="M22 5h12c-1 11 0 20 5 25 4 4 8 4 14 0 10-6 19-3 23 7 6 13 1 25-10 31-10 6-23 4-31-5-4-4-6-6-10-5-5 2-9 7-11 14L4 67c3-9 8-15 14-18 7-3 10-6 9-13-1-8-5-16-5-24z"/><path class="ui-artwork__shine" data-hunger-part="shine" d="M41 58c7 4 16 4 24 0"/></g>',
  energy: '<g data-energy-scale transform="translate(40 36) scale(1.12 1) translate(-40 -36)"><path d="M37 5 15 37h18l-5 28 25-36H35z"/><path class="ui-artwork__shine" d="m34 14-10 17"/></g>',
  hull: '<g data-hull-scale transform="translate(40 36) scale(1.12) translate(-40 -36)"><path data-hull-part="body" d="M7 30h66l-2 20-11 8H20L9 50z"/><path data-hull-part="rim" fill="none" d="M9 33h62"/><path class="ui-artwork__shine" d="M18 40h16"/></g>',
  watch: '<circle cx="40" cy="43" r="27"/><path d="M32 8h16v8H32zM40 16V4M40 43V26M40 43l12 8"/><circle class="ui-artwork__shine" cx="40" cy="43" r="21"/>',
  journal: '<path d="M16 9h39c7 0 11 4 11 11v45H27c-7 0-11-4-11-11z"/><path d="M27 9v56M34 23h22M34 34h18"/><path class="ui-artwork__shine" d="M20 14h5"/>',
  warning: '<path d="M40 7 73 65H7z"/><path d="M40 25v21M40 55v2"/><path class="ui-artwork__shine" d="m20 56 20-35"/>',
  howToPlay: '<path d="M8 38c9-17 29-23 47-12l15-9-3 19 4 18-16-7C39 59 18 56 8 38z"/><path d="m23 28-8-10 15 7M24 48l-7 9 14-5"/><circle cx="47" cy="34" r="3"/><path class="ui-artwork__shine" d="M34 35c0-6 4-10 10-10 5 0 9 3 9 7 0 6-8 6-8 12m0 7v1"/>',
  guideSearch: '<circle cx="32" cy="29" r="18"/><path d="m46 43 20 20"/><path class="ui-artwork__shine" d="M21 27c1-7 6-12 13-13"/>',
  guideCarry: '<path d="M16 25h48l-5 38H21z"/><path d="M25 25c0-17 30-17 30 0M28 40h24M31 52h18"/><path class="ui-artwork__shine" d="M25 31h25"/>',
  guideSave: '<path d="M10 45h60L59 62H21zM40 8v31m-12-11 12 11 12-11"/><path class="ui-artwork__shine" d="M20 50h34"/>',
  guidePrepare: '<path d="M18 9v35c0 18 24 22 30 7 3-8-6-14-13-8"/><path d="m45 18 17 17M51 10l18 18-9 9-18-18z"/><path class="ui-artwork__shine" d="M22 13v25"/>',
  guideWatch: '<path d="M12 60V37h12v23zm22 0V24h12v36zm22 0V12h12v48z"/><path class="ui-artwork__shine" d="M16 42h4m18-12h4m18-12h4"/>',
  guideEndDay: '<path d="M26 20h28l7 43H19zM31 20c0-13 18-13 18 0M28 33h24v20H28z"/><path class="ui-artwork__shine" d="M33 37h8"/>',
};

const ITEM_ARTWORK: Readonly<Record<ItemId, string>> = {
  cannedFood: '<path class="item-artwork__secondary" d="M19 18c0-9 42-9 42 0v38c0 9-42 9-42 0z"/><ellipse class="item-artwork__light" cx="40" cy="18" rx="21" ry="8"/><path class="item-artwork__primary" d="M24 31h32v21H24z"/><path class="item-artwork__ink" d="M29 42c6-8 12-8 18-2l6-4-2 7 2 7-7-4c-6 5-12 4-17-4z"/>',
  baitTin: '<path class="item-artwork__secondary" d="M20 24h40l-3 34c-1 8-33 8-34 0z"/><path class="item-artwork__primary" d="M18 17h44v12H18z"/><path class="item-artwork__light" d="M26 31h28l-2 24c-1 5-23 5-24 0z"/><path class="item-artwork__ink item-artwork__stroke-thin" d="M30 45c7-10 13 6 21-5m-3-5 5 5-6 4"/>',
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
  shotgun: '<g transform="rotate(-11 40 36)"><path class="item-artwork__secondary" d="M9 25h50v13H9z"/><path class="item-artwork__primary" d="M27 36h18l-4 23H26z"/><path class="item-artwork__light" d="M7 20h55v6H7z"/><path class="item-artwork__ink" d="m62 17 12 6-12 6z"/></g>',
  energyBar: '<path class="item-artwork__primary" d="m12 22 7-8h42l7 8v30l-7 8H19l-7-8z"/><path class="item-artwork__secondary" d="M19 14h8v46h-8zm34 0h8v46h-8z"/><path class="item-artwork__light" d="M29 28h22v18H29z"/><path class="item-artwork__ink" d="m38 29-7 11h8l-2 9 12-15h-8l3-5z"/>',
  carlitos: '<path class="item-artwork__secondary" d="M24 29 18 13l13 8c6-4 13-4 19 0l13-8-6 18c4 5 6 11 6 18 0 13-10 19-23 19S17 62 17 49c0-8 2-14 7-20z"/><path class="item-artwork__light" d="M31 39c4-4 14-4 18 0l4 18c-7 6-20 6-27-1z"/><path class="item-artwork__primary" d="M24 28 20 18l10 7zm32 0 4-10-10 7zM23 56c-8 1-12-5-8-11 2 8 7 4 10 2z"/><path class="item-artwork__ink" d="M29 35h5v5h-5zm17 0h5v5h-5zm-9 8h6l-3 4z"/><path class="item-artwork__primary item-artwork__stroke-thin" d="M22 45 8 41m14 9L7 52m51-7 14-4m-14 9 15 2"/>',
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
