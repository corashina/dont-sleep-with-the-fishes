import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';

function source({
  id,
  publicId,
  resourceId,
  title,
  creator,
  license,
  sha256,
  sourceTriangles,
  rawBounds,
}) {
  return Object.freeze({
    id,
    pageUrl: `https://poly.pizza/m/${publicId}`,
    downloadUrl: `https://static.poly.pizza/${resourceId}.glb`,
    sourceAssetId: `poly-pizza:${resourceId}`,
    publicId,
    resourceId,
    title,
    creator,
    license,
    licenseUrl: license === 'CC0 1.0' ? CC0 : CC_BY_3,
    sha256,
    sourceTriangles,
    rawBounds,
    downloadedOn: '2026-07-30',
    maxTriangles: 2_000,
  });
}

export const POLY_PIZZA_EVENT_MODEL_SOURCES = Object.freeze({
  driftingLootBarrel: source({
    id: 'driftingLootBarrel',
    publicId: 'cu9GJ0j13fj',
    resourceId: '2244f3ae-5583-4ea0-b980-6fdd0084cee7',
    title: 'Barrel',
    creator: 'Don Carson',
    license: 'CC-BY 3.0',
    sha256: '89031BAAA180FD8040C8C2A27F56AC479BD6FE8A7C4EC5495D1433D185840EF5',
    sourceTriangles: 282,
    rawBounds: {
      min: [-0.1558050960302353, -0.10138289630413055, -0.11685319989919662],
      max: [0.1601828932762146, 0.15143689513206482, 0.1332416981458664],
    },
  }),
  driftingLootCrate: source({
    id: 'driftingLootCrate',
    publicId: '3VGWnZPXmG',
    resourceId: '720097e2-63ed-4e5f-9b66-eb416942eea0',
    title: 'Crate',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '4FB00BA01EEFEA3F1A335A6D3ACC67E8F4E093B9FC227673B82F67E12E098D6E',
    sourceTriangles: 784,
    rawBounds: {
      min: [-0.4119724858223675, -0.010161532882865146, -0.4120703385973515],
      max: [0.41197694567342663, 0.8137905468445634, 0.4119462826859072],
    },
  }),
  driftingBottle: source({
    id: 'driftingBottle',
    publicId: '13g9ucgxbHV',
    resourceId: 'b1a8f402-de55-4e49-b63e-1439e5851c13',
    title: 'Bottle of Wine',
    creator: 'Jeremy',
    license: 'CC-BY 3.0',
    sha256: '5C1169A709CF2B897E9037771BC8B33EDE3C546A2CA872F33BF8A9348F112D54',
    sourceTriangles: 304,
    rawBounds: {
      min: [-1.3387809991836548, 0.004215000197291374, -1.3387809991836548],
      max: [1.3387809991836548, 9.951152801513672, 1.3387809991836548],
    },
  }),
  mysteryChest: source({
    id: 'mysteryChest',
    publicId: 'O72u4Drp8k',
    resourceId: '803af4ae-433f-4b05-b1f1-c6a2da02d768',
    title: 'Chest',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '07193221A749D5DCF2B0A3D82D4EE9831DA2E2C4CA71B395050A88BB2BABE75B',
    sourceTriangles: 1_676,
    rawBounds: {
      min: [-0.590267411316745, -0.0013262077843175972, -0.39044927677546604],
      max: [0.5890504858689383, 0.8971703973006975, 0.43332122828381514],
    },
  }),
  flowers: source({
    id: 'flowers',
    publicId: '0-_GjMekeob',
    resourceId: '856b7c36-4bd0-48f1-a308-529366b6a7fd',
    title: 'Lily Pad',
    creator: 'Poly by Google',
    license: 'CC-BY 3.0',
    sha256: 'CC4BA073B2CC94B4CADA9BB25C15C3832052E2F3A018B3E2EB7F9429E6D2384B',
    sourceTriangles: 728,
    rawBounds: {
      min: [-5.180932998657227, 0, -5.438858985900879],
      max: [5.531528949737549, 2.9948410987854004, 5.438858985900879],
    },
  }),
});

export const POLY_PIZZA_EVENT_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_EVENT_MODEL_SOURCES),
);

async function runCli(args) {
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify(POLY_PIZZA_EVENT_MODEL_SOURCES));
    return;
  }
  if (args.length === 1 && args[0] === '--metadata') {
    console.log(JSON.stringify(Object.fromEntries(
      POLY_PIZZA_EVENT_MODEL_IDS.map((id) => {
        const entry = POLY_PIZZA_EVENT_MODEL_SOURCES[id];
        return [id, { triangles: entry.sourceTriangles, rawBounds: entry.rawBounds }];
      }),
    ), null, 2));
    return;
  }
  throw new Error('Usage: node scripts/poly-pizza-event-models.mjs --sources | --metadata');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
