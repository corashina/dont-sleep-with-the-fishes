import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPolyPizzaModels,
  createPolyPizzaSource,
} from './poly-pizza-models.mjs';

const source = ({ committedSha256, ...options }) => Object.freeze({
  ...createPolyPizzaSource({
    ...options,
    downloadedOn: options.downloadedOn ?? '2026-08-05',
  }),
  committedSha256,
});

export const POLY_PIZZA_MENU_MODEL_SOURCES = Object.freeze({
  boat: source({
    id: 'boat', publicId: 'YwdXrwbN3o',
    resourceId: '66ae3fa9-d6de-45dc-86c0-659786b865e1',
    title: 'Boat', creator: 'Pixel', license: 'CC-BY 3.0',
    sha256: 'FEE1EE45E5457D146857D064982922A378D909794E34A2FC89572BB946BA8464',
    committedSha256: 'D1B71C2F9222B93C32AA4C5764B543F7471A046D047997473CAB82364F97942A',
    sourceTriangles: 412, maxTriangles: 500,
  }),
  rockA: source({
    id: 'rockA', publicId: 'd2VWOdthtR',
    resourceId: 'd7bc2b98-2c73-4e78-b0bd-e5e24d65734a',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '76F1F4BABFEFED5FF852C97978065AC6FF1EEC5B6930BAE9E62EA095BFAE0FB5',
    committedSha256: 'DFE74B88D1E8C31C3242E151C620463858154BB32F36D3A7042BFB4A75AC78BE',
    sourceTriangles: 448, maxTriangles: 500,
  }),
  rockB: source({
    id: 'rockB', publicId: '54jZKTAt5p',
    resourceId: 'c14651f6-9ef8-41e8-8aca-cafed61d9ca2',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'C4E9F04C04419E67E919C4533DFD6044ABC5F0640AFA9D0E174CF474285D380C',
    committedSha256: '223C02346797221792B6FFFFAC3B0AEA4C8094BB854055D0D13B0F3C092F0E5F',
    sourceTriangles: 222, maxTriangles: 300,
  }),
  rockC: source({
    id: 'rockC', publicId: 'li0YBlBEMz',
    resourceId: 'a50f220b-3c4c-4226-ae97-0458ed615cd2',
    title: 'Rock Large', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'AFF6F5DF4CB5309400C9E85790D8FBAAB5EBE281402A54E7BA4308038DEFC9F3',
    committedSha256: 'B9EB2A8A48D1E99474DDAD1B7EFE438085EEB783F816E43B1608978C508D97CB',
    sourceTriangles: 432, maxTriangles: 500,
  }),
  coral: source({
    id: 'coral', publicId: '4KUXdtDdgHR',
    resourceId: '7fc1ccd0-aa82-4eff-8881-dd7a83ebf6ea',
    title: 'Coral', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '63219C5123CE4A69B2283DE514DCA9AE08E9EC2C1BCAD3094AFD2EC5043B12B7',
    committedSha256: '2ACA833051D14C22B107D14B2AE84E533B69A1EFBEC2B7F0A087416B9079D0AD',
    sourceTriangles: 817, maxTriangles: 900, downloadedOn: '2026-08-06',
  }),
  starfish: source({
    id: 'starfish', publicId: '6H-0K9IEr56',
    resourceId: 'c9c1bc97-d76e-4e87-bd3a-87ab44b78aac',
    title: 'Starfish', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '71F088AB919DBB4961532D325A04E03504910F5C4ED72FCB67A5876ADC390A4A',
    committedSha256: '7B79DB36F41814317A5888D10E5A7EA9EDEA7998DAE7F982F19608BC7F2D98A1',
    sourceTriangles: 780, maxTriangles: 800, downloadedOn: '2026-08-06',
  }),
  fishBone: source({
    id: 'fishBone', publicId: 'bU5RLZnq6v',
    resourceId: 'ed285a5f-7c35-47b0-a12d-60006f5eb74c',
    title: 'Fish Bone', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'D15FC15F86F84BA38B3A0CF18E5B23651F7541433B59D045233793B2A54FB51E',
    committedSha256: '6FCD27536B4691BD0D639055BAC1C3D84AD3978654F310A3DF0C3F157EED371E',
    sourceTriangles: 588, maxTriangles: 700,
  }),
  skull: source({
    id: 'skull', publicId: 'VGtSTNRf2O',
    resourceId: '2a686e08-5456-405f-a6ef-03274e080b2f',
    title: 'Skull', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '3A05AC7A8FE56832E988285D24F755F2D22DB51CC0E70F2BD559077F6324349B',
    committedSha256: '8E0BAC5BA9A119D70798163D744D4925487C6F8CB6155EB92585B8EEA59E9823',
    sourceTriangles: 3132, maxTriangles: 3_500,
  }),
  largeBone: source({
    id: 'largeBone', publicId: 'A67un3x9nV',
    resourceId: 'dc066333-7257-425b-bbc0-7d93403d019d',
    title: 'Large Bone', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'AD3442D1998FE6AAA27EFC585EBA2C651C80ED2BB9467A6082DC6507509F3AF9',
    committedSha256: '48DE96535E005B857ABC76BB5817062A06410B4F06DB8D32981D5999B2F3415C',
    sourceTriangles: 1680, maxTriangles: 1_800,
  }),
  shark: source({
    id: 'shark', publicId: 'AyHTK3zUSG',
    resourceId: 'd2d374ea-eb1d-4659-8cc7-816a83b82470',
    title: 'Shark', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '6D5CF3CD7EA749583B622A306CFCAE4DE85432EFCC74A1EC6F52E5430CF13AFF',
    committedSha256: '1311D6750FB737669557C45855568E8DD2D8C8D8B5C374704028C656712A4648',
    sourceTriangles: 644, maxTriangles: 700,
  }),
});

export const POLY_PIZZA_MENU_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_MENU_MODEL_SOURCES),
);

export function buildPolyPizzaMenuModels({ sourceRoot, outputRoot, verifySource = true }) {
  return buildPolyPizzaModels({
    sourceRoot,
    outputRoot,
    sources: POLY_PIZZA_MENU_MODEL_SOURCES,
    verifySource,
  });
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify(POLY_PIZZA_MENU_MODEL_SOURCES));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-menu-models.mjs --sources | <sourceRoot> <outputRoot>',
    );
  }
  await buildPolyPizzaMenuModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
