import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPolyPizzaModels,
  createPolyPizzaSource,
} from './poly-pizza-models.mjs';

const source = (options) => createPolyPizzaSource({
  creator: 'Poly by Google',
  license: 'CC-BY 3.0',
  downloadedOn: '2026-07-26',
  maxTriangles: 1_000,
  ...options,
});

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
  crewNightStand: source({
    id: 'crewNightStand',
    publicId: '9LI73c5uFA',
    resourceId: 'deb08e3b-cd54-4252-b5b2-53f86f1c1d04',
    title: 'Night Stand',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '1C08A98905EA18850FC91932FAE9976A556AA30A564F7C45845C2F4F1BC5289A',
    sourceTriangles: 184,
    downloadedOn: '2026-07-28',
  }),
  crewDesk: source({
    id: 'crewDesk',
    publicId: 'YJyJam67hJ',
    resourceId: 'b8d0347a-c711-4eb4-8b8b-cda390d3840f',
    title: 'Desk',
    creator: 'CreativeTrio',
    license: 'CC0 1.0',
    sha256: 'C3C85D0A0848030DF3E6A5AA810066FCD8329E719726D1DBEF14C9A33CEF9717',
    sourceTriangles: 166,
    downloadedOn: '2026-07-28',
  }),
  crewCabinet: source({
    id: 'crewCabinet',
    publicId: 'wOiMrnUuhe',
    resourceId: '57d9a5e8-3130-42eb-b436-28e1586facc0',
    title: 'Cabinet',
    creator: 'CreativeTrio',
    license: 'CC0 1.0',
    sha256: 'E5226312183A51C5027F6E6C2E46873C0B0A7B3C9B4FF334C02CB03954B1B944',
    sourceTriangles: 324,
    downloadedOn: '2026-07-28',
  }),
  crewCeilingLight: source({
    id: 'crewCeilingLight',
    publicId: 'sRNcgQFbLB',
    resourceId: '7f5240a6-e02a-4084-b899-8b84784cd76d',
    title: 'Ceiling Light',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '5A429947D77AB820605844864C4E4C3177407CAACB373BC47359CAFD45812DD4',
    sourceTriangles: 196,
    downloadedOn: '2026-07-28',
  }),
  crewWallPainting: source({
    id: 'crewWallPainting',
    publicId: '3dycV-ViQH-',
    resourceId: '4ef69f1e-f03d-4e04-904c-0037b875306b',
    title: 'Wall painting',
    sha256: 'A5657C57B3406EB340E002B0E25419E46EAC0EAA703F42D6819E61311747B19D',
    sourceTriangles: 100,
    downloadedOn: '2026-07-28',
  }),
  crewWallArt: source({
    id: 'crewWallArt',
    publicId: '1U5roiXQZAM',
    resourceId: 'bcefd659-a484-47b4-a385-d35cefd55804',
    title: 'Wall Art 06',
    creator: 'Jarlan Perez',
    sha256: '7D1D99021EC630FA1E6174DF92F7CEA59887702D89CED823F7BDAF14A17082B2',
    sourceTriangles: 70,
    downloadedOn: '2026-07-28',
  }),
  crewTable: source({
    id: 'crewTable',
    publicId: 'dwmBkQTulc',
    resourceId: '7a32e3e5-316e-479a-a6cc-d6aab490be50',
    title: 'Table',
    creator: 'Zsky',
    sha256: '33B58D3359CDC343AEB663534CBACE19EEB5BFB21D7CF93E33D13F9C2E57236E',
    sourceTriangles: 220,
    downloadedOn: '2026-07-28',
  }),
  wheelhouseCorkboard: source({
    id: 'wheelhouseCorkboard',
    publicId: 'U8yQZ9l0HZ',
    resourceId: '09cf2ec1-8b2c-4543-b773-962fba13aac5',
    title: 'Wall Corkboard',
    creator: 'CreativeTrio',
    license: 'CC0 1.0',
    sha256: '251EF29E18DFAFF8D5ACA202AE21BB8DDD6D4D6CD601CC2AA09D394CF41ACA05',
    sourceTriangles: 218,
    downloadedOn: '2026-07-28',
  }),
  workroomCardboardBox: source({
    id: 'workroomCardboardBox',
    publicId: 'j2u0dWIebu',
    resourceId: '12b9bc45-0581-474d-87ad-0869c28e69ac',
    title: 'Cardboard Box',
    creator: 'Nick Slough',
    sha256: '81982A2F0CF2D04CB60B5194897D9CB76E688E01DB5A7F8FA757E5B55679D7C2',
    sourceTriangles: 144,
    downloadedOn: '2026-07-28',
  }),
  workroomStorageShelf: source({
    id: 'workroomStorageShelf',
    publicId: '6gKdASmfB9U',
    resourceId: '9badb54d-f687-45cb-a5cd-0dde270d76ab',
    title: 'Storage Shelf',
    creator: 'Jarlan Perez',
    sha256: '5AB0C13CC921F63C16F07C63AD4D29B5FDE0E8E7F150114D406728B12DA9C667',
    sourceTriangles: 96,
    downloadedOn: '2026-07-28',
  }),
  workroomPallet: source({
    id: 'workroomPallet',
    publicId: 'J6bhnc2wFP',
    resourceId: '40dc910f-3ee1-4dde-a692-41ec82a9ae1f',
    title: 'Pallet',
    creator: 'Kenney',
    license: 'CC0 1.0',
    sha256: '6EF862AC5F278117164D6CDDD3EA98CE3495C27FF06A6D6CF377A06B1E710952',
    sourceTriangles: 108,
    downloadedOn: '2026-07-28',
  }),
  pumpkin: source({
    id: 'pumpkin',
    publicId: 'bvLvqnU1jX',
    resourceId: '49202ae4-62ac-4035-9726-1834228e7d08',
    title: 'Pumpkin',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: 'AF4AE31BA704F8B05B69BEC18726468FEAF527A221E929BBFDF11D6B4C26BD0B',
    sourceTriangles: 644,
    downloadedOn: '2026-08-05',
  }),
  propaneTank: source({
    id: 'propaneTank',
    publicId: '3revwBHxDC',
    resourceId: 'd694382c-fd11-4ed0-a300-e5e7891a842b',
    title: 'Propane Tank',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: 'D38FA01373FFB00C255A877BC59686BBF7AB89BA63752A556C6E440483381BEA',
    sourceTriangles: 516,
    downloadedOn: '2026-08-05',
  }),
  redCan: source({
    id: 'redCan',
    publicId: 'IuoYedcdXQ',
    resourceId: 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45',
    title: 'Can Red',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: '233A200BEB5FF9E36B0E6AC52415D64DB506A2600CC7F8B0B0C83376A9F7B642',
    sourceTriangles: 332,
    downloadedOn: '2026-08-05',
  }),
  shippingBox: source({
    id: 'shippingBox',
    publicId: 'HvjissDrdr',
    resourceId: 'abf06b96-4a0c-466b-b091-919cfad7a478',
    title: 'Box',
    creator: 'Kenney',
    license: 'CC0 1.0',
    sha256: '83D88C4C255F868B8FD77C6DC80B666AEFD17B07223B12644AC046EBE32727A8',
    sourceTriangles: 124,
    downloadedOn: '2026-08-05',
  }),
  package: source({
    id: 'package',
    publicId: 'mWkgWyrCfM',
    resourceId: '8ee025af-e6cf-46d8-879b-62befe03ae9d',
    title: 'Package',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sha256: 'B8DE8103D8CA412129F4E55CA6942B7496DCFE271F832C600B4A3F62CEADE3BC',
    sourceTriangles: 464,
    downloadedOn: '2026-08-05',
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
