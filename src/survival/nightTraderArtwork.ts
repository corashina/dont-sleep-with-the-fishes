import type { ItemId } from '../game/ItemState';

// Broad paint shapes survive the sign's small size and warm night lighting.
const INK = '#28251f';
const IVORY = '#f0dfb7';
const METAL = '#b8cbc8';
const SHADE = '#788f89';
const BRASS = '#d2ac65';
const RUST = '#bd694c';

const DRAWINGS: Readonly<Record<ItemId, string>> = {
  cannedFood: `
    <path fill="${METAL}" d="M18 18h44v37c0 12-44 12-44 0z"/>
    <path fill="${RUST}" d="M19 30h42v21H19z"/>
    <ellipse fill="${IVORY}" cx="40" cy="18" rx="22" ry="8"/>
    <ellipse fill="${METAL}" cx="40" cy="18" rx="8" ry="3"/>
    <path fill="${IVORY}" d="M26 41c7-9 16-9 23-2l7-5v14l-7-5c-7 7-16 7-23-2z"/>
    <path fill="none" d="M23 56c10 4 24 4 34 0"/>`,
  baitTin: `
    <ellipse fill="${BRASS}" cx="40" cy="24" rx="24" ry="9"/>
    <path fill="${METAL}" d="M16 25c12 9 36 9 48 0l-4 32c-10 8-30 8-40 0z"/>
    <path fill="none" stroke="${IVORY}" stroke-width="6" d="M28 44c-6-12 14-13 10-1s17 11 15-1"/>
    <path fill="none" stroke-width="3" d="M28 44c-6-12 14-13 10-1s17 11 15-1"/>
    <path fill="none" stroke="${IVORY}" stroke-width="3" d="M24 24c7 3 25 3 32 0"/>`,
  ductTape: `
    <path fill="${METAL}" d="M57 37h12v22L49 63l-4-12 12-3z"/>
    <ellipse fill="${SHADE}" cx="35" cy="38" rx="24" ry="24"/>
    <ellipse fill="${METAL}" cx="35" cy="30" rx="24" ry="20"/>
    <ellipse fill="${BRASS}" cx="35" cy="30" rx="12" ry="10"/>
    <ellipse fill="${INK}" cx="35" cy="32" rx="8" ry="6"/>
    <path fill="none" stroke="${IVORY}" stroke-width="3" d="M17 24c4-8 18-11 28-7"/>`,
  compass: `
    <circle fill="${BRASS}" cx="40" cy="11" r="6"/>
    <circle fill="${BRASS}" cx="40" cy="39" r="26"/>
    <circle fill="${IVORY}" cx="40" cy="39" r="20"/>
    <path fill="none" d="M40 20v5m0 28v5M21 39h5m28 0h5"/>
    <path fill="${RUST}" d="m49 25-5 17-13 11 5-18z"/>
    <path fill="${INK}" d="m40 39-9 14 5-18z"/>
    <circle fill="${BRASS}" cx="40" cy="39" r="3"/>`,
  map: `
    <path fill="${IVORY}" d="m10 17 20-7 20 8 20-7v44l-20 7-20-8-20 7z"/>
    <path fill="${BRASS}" d="m30 10 20 8v44l-20-8z"/>
    <path fill="${SHADE}" stroke="none" d="m14 26 9-5 4 8-7 5 4 13-9 5zm40-2 11-5v12l-7 4 6 9-8 6-3-10z"/>
    <path fill="none" stroke-width="3" d="m20 46 8-7 10 4 7-12 13 5"/>
    <path fill="none" stroke="${RUST}" stroke-width="4" d="m53 31 10 10m0-10L53 41"/>`,
  medicalKit: `
    <path fill="${METAL}" d="M27 22v-8c0-7 26-7 26 0v8h-7v-7H34v7z"/>
    <rect fill="${RUST}" x="12" y="22" width="56" height="40" rx="5"/>
    <path fill="none" d="M13 34h54"/>
    <rect fill="${BRASS}" x="21" y="29" width="6" height="10" rx="1"/>
    <rect fill="${BRASS}" x="53" y="29" width="6" height="10" rx="1"/>
    <path fill="${IVORY}" stroke="none" d="M35 38h10v7h8v9h-8v7H35v-7h-8v-9h8z"/>`,
  spyglass: `
    <g transform="rotate(-24 40 36)">
      <path fill="${BRASS}" d="M9 30h21v13H9zM27 27h22v19H27zM46 23h19v27H46z"/>
      <path fill="${IVORY}" d="M8 28h7v17H8zM59 21h8v31h-8z"/>
      <ellipse fill="${SHADE}" cx="67" cy="36.5" rx="6" ry="15.5"/>
      <path fill="none" stroke="${IVORY}" stroke-width="3" d="m21 33 32-3m13-3v8"/>
    </g>`,
  fishingNet: `
    <path fill="none" stroke="${BRASS}" stroke-width="8" d="m28 42-17 21"/>
    <path fill="none" stroke-width="3" d="m28 42-17 21"/>
    <path fill="${SHADE}" d="M22 23c-6 39 37 41 40 1z"/>
    <path fill="none" stroke="${IVORY}" stroke-width="2.6" d="m25 28 28 18m-30-8 21 15m-10-35 25 20m-33 6 17-29m-8 36 17-32m-8 34 14-27"/>
    <ellipse fill="none" stroke="${BRASS}" stroke-width="5" cx="42" cy="25" rx="24" ry="16"/>
    <path fill="none" stroke="${IVORY}" stroke-width="2.5" d="M21 25c0-17 41-17 42 0"/>`,
  knife: `
    <path fill="${METAL}" d="m29 41 35-29c2 14-8 27-26 38z"/>
    <path fill="${IVORY}" stroke="none" d="m35 44 26-27c-2 11-11 20-23 29z"/>
    <path fill="${BRASS}" d="m25 37 16 16-5 5-16-16z"/>
    <path fill="${RUST}" d="m23 44 11 11-17 14-9-9z"/>
    <path fill="none" stroke="${IVORY}" stroke-width="3" d="m20 54 3 3m-8 2 3 3"/>`,
  bucket: `
    <path fill="none" stroke="${IVORY}" stroke-width="5" d="M20 28C18 0 62 0 60 28"/>
    <path fill="none" stroke-width="2.5" d="M20 28C18 0 62 0 60 28"/>
    <path fill="${METAL}" d="m17 27 7 33c7 7 25 7 32 0l7-33z"/>
    <path fill="${SHADE}" stroke="none" d="m47 32-3 30 11-3 6-30z"/>
    <ellipse fill="${INK}" cx="40" cy="27" rx="23" ry="7"/>
    <ellipse fill="none" stroke="${IVORY}" stroke-width="3" cx="40" cy="27" rx="23" ry="7"/>
    <path fill="none" stroke="${IVORY}" stroke-width="3" d="m25 37 4 18"/>`,
  flareGun: `
    <g transform="rotate(-10 40 36)">
      <path fill="${RUST}" d="M12 19h52l5 5v15H38l-5 25H19l5-26H12z"/>
      <path fill="${METAL}" d="M13 19h52v11H13z"/>
      <path fill="${INK}" d="M60 19h8v12h-8zM23 40h11l-4 19H20z"/>
      <path fill="none" stroke="${IVORY}" stroke-width="3" d="M40 39v13h8l4-13"/>
      <circle fill="${BRASS}" cx="36" cy="34" r="4"/>
    </g>`,
  flashlight: `
    <g transform="rotate(32 40 36)">
      <rect fill="${SHADE}" x="30" y="28" width="20" height="36" rx="3"/>
      <path fill="${BRASS}" d="m25 16 5 15h20l5-15z"/>
      <ellipse fill="${IVORY}" cx="40" cy="16" rx="15" ry="7"/>
      <ellipse fill="${METAL}" cx="40" cy="16" rx="8" ry="3"/>
      <rect fill="${RUST}" x="36" y="36" width="8" height="11" rx="2"/>
      <path fill="none" stroke="${IVORY}" stroke-width="3" d="M31 57h18"/>
    </g>`,
  scubaSet: `
    <rect fill="${BRASS}" x="20" y="11" width="21" height="54" rx="10"/>
    <path fill="${METAL}" d="M26 8h9v9h-9z"/>
    <path fill="none" stroke-width="5" d="M20 33h21m-21 19h21"/>
    <path fill="none" stroke="${IVORY}" stroke-width="4" d="M35 13c30-17 42 44 22 49"/>
    <path fill="${SHADE}" d="M39 28h32l-3 17-8 3-6-6-6 6-8-3z"/>
    <path fill="${METAL}" d="M42 31h10v9l-4 4-5-2zm15 0h11l-2 11-5 2-4-4z"/>
    <circle fill="${METAL}" cx="56" cy="60" r="6"/>`,
  anchor: `
    <circle fill="none" stroke="${IVORY}" stroke-width="5" cx="40" cy="13" r="7"/>
    <path fill="${METAL}" d="M36 20h8v35c7-3 12-9 14-17l-7 3 6-16 14 10h-8c-1 16-10 26-23 32-13-6-22-16-23-32H9l14-10 6 16-7-3c2 8 7 14 14 17z"/>
    <path fill="${BRASS}" d="M25 24h30v6H25z"/>
    <path fill="none" stroke="${IVORY}" stroke-width="2.5" d="M40 33v24"/>`,
  radio: `
    <path fill="none" stroke="${IVORY}" stroke-width="4" d="m58 23 9-17M25 25V15h27v10"/>
    <rect fill="${SHADE}" x="11" y="24" width="58" height="40" rx="4"/>
    <rect fill="${BRASS}" x="17" y="29" width="45" height="8" rx="1"/>
    <circle fill="${INK}" cx="31" cy="50" r="12"/>
    <path fill="none" stroke="${METAL}" stroke-width="2.5" d="M24 43h14m-17 6h20m-17 6h14"/>
    <circle fill="${IVORY}" cx="56" cy="47" r="6"/>
    <circle fill="${BRASS}" cx="56" cy="59" r="3"/>`,
  umbrella: `
    <path fill="none" stroke="${IVORY}" stroke-width="5" d="M40 12v43c0 14 16 14 16 1"/>
    <path fill="${RUST}" d="M8 35C13 3 65 3 72 35c-8-6-15-6-21 0-8-6-15-6-22 0-7-6-14-6-21 0z"/>
    <path fill="${BRASS}" d="M40 11c-8 7-11 16-11 24 7-6 14-6 22 0-1-10-4-18-11-24z"/>
    <path fill="none" stroke-width="3" d="M40 6v6"/>`,
  swimRing: `
    <circle fill="none" stroke="${BRASS}" stroke-width="3" cx="40" cy="36" r="31"/>
    <circle fill="${IVORY}" cx="40" cy="36" r="26"/>
    <path fill="${RUST}" stroke="none" d="m19 17 14 12-7 9-12-12zm42 0L47 29l7 9 12-12zM19 55l14-12-7-9-12 12zm42 0L47 43l7-9 12 12z"/>
    <circle fill="${INK}" cx="40" cy="36" r="13"/>
    <path fill="none" stroke="${BRASS}" stroke-width="3" d="m17 17 6 6m34-6-6 6M17 55l6-6m34 6-6-6"/>`,
  shotgun: `
    <g transform="rotate(-24 40 36)">
      <path fill="${METAL}" d="M30 27h43v7H30z"/>
      <path fill="${SHADE}" d="M31 34h42v5H31z"/>
      <path fill="${BRASS}" d="M36 34h21v8H36z"/>
      <path fill="${METAL}" d="M23 30h14v13H23z"/>
      <path fill="${RUST}" d="m4 39 15-2 7-5 7 8-11 5-15 7z"/>
      <path fill="none" stroke="${IVORY}" stroke-width="3" d="M26 44c1 11 14 9 15-2"/>
      <path fill="none" d="M69 25v15"/>
    </g>`,
  energyBar: `
    <g transform="rotate(-12 40 36)">
      <path fill="${BRASS}" d="m11 23 5-4 5 4 4-4h38l6 4-3 5v24l3 4-6 4H25l-4-4-5 4-5-4 3-5V28z"/>
      <path fill="${RUST}" d="M25 22h29v35H25z"/>
      <path fill="none" stroke="${IVORY}" stroke-width="2.5" d="M18 28v22m44-22v22"/>
      <path fill="${IVORY}" stroke="none" d="m41 26-12 16h10l-3 11 15-18H40z"/>
    </g>`,
  carlitos: `
    <path fill="${BRASS}" d="m18 31-2-21 18 11h12l18-11-2 21c14 32-58 41-44 0z"/>
    <path fill="${IVORY}" d="M28 42c5-7 19-7 24 0l-2 15H30z"/>
    <path fill="none" stroke-width="4" d="M27 33h6m14 0h6M35 44l5 4 5-4M24 45 8 41m16 11L8 55m48-10 16-4M56 52l16 3"/>`,
};

export function nightTraderArtwork(id: ItemId): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 72">
    <g stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${DRAWINGS[id]}
    </g>
  </svg>`;
}
