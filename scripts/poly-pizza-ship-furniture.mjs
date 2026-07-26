import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPolyPizzaModels } from './poly-pizza-models.mjs';

const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

function source({
  id,
  publicId,
  resourceId,
  title,
  creator = 'Poly by Google',
  license = 'CC-BY 3.0',
  sha256,
  sourceTriangles,
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
    downloadedOn: '2026-07-26',
    maxTriangles: 1_000,
  });
}

export const POLY_PIZZA_SHIP_FURNITURE_SOURCES = Object.freeze({
  barrel: source({
    id: 'barrel',
    publicId: '22QmtJi62zQ',
    resourceId: '25991bc2-a56c-446d-86c4-03e406cc4a40',
    title: 'Barrel',
    sha256: '452B5BDC6C7A07B37B95D38D942ADB7CEB2B07B240AAFF93646A6AE3E4B535C7',
    sourceTriangles: 700,
  }),
  bookcaseOpen: source({
    id: 'bookcaseOpen',
    publicId: 'fAfJzZmQpgY',
    resourceId: 'e9ed133e-cf29-4c63-b8dd-9e3e0503fa95',
    title: 'Shelf',
    sha256: 'FDA303ACFD2B118ED163735E10D04E2DF7A6745552CA4A2BC57183D76D576B39',
    sourceTriangles: 84,
  }),
  cargoCrate: source({
    id: 'cargoCrate',
    publicId: 'NlXe0ZJGUd',
    resourceId: '56f2385f-285a-4df8-a00f-6837a711f5cc',
    title: 'Crate',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '30604302C679A2A9A2C83A28CD54EC8A5664989EC32A75C1F78299B3ABFAD669',
    sourceTriangles: 264,
  }),
  cargoBox: source({
    id: 'cargoBox',
    publicId: 'ykZ23x9d6p',
    resourceId: 'f54e45d1-81ed-4323-9e35-8acd46533702',
    title: 'Box',
    creator: 'Kay Lousberg',
    license: 'CC0 1.0',
    sha256: '4B6F7B2D17997F75192C706B28E2F894B6DFF691BCED17963470D2B2CEDDBFF9',
    sourceTriangles: 32,
  }),
});

async function runCli(args) {
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify(POLY_PIZZA_SHIP_FURNITURE_SOURCES));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-ship-furniture.mjs --sources | <sourceRoot> <outputRoot>',
    );
  }
  await buildPolyPizzaModels({
    sourceRoot: args[0],
    outputRoot: args[1],
    sources: POLY_PIZZA_SHIP_FURNITURE_SOURCES,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
