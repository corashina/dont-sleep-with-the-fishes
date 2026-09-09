import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPolyPizzaModels,
  createPolyPizzaSource,
} from './poly-pizza-models.mjs';

const source = (options) => createPolyPizzaSource({
  ...options,
  downloadedOn: options.downloadedOn ?? '2026-07-26',
  maxTriangles: 2_000,
});

export const POLY_PIZZA_FISHING_MODEL_SOURCES = Object.freeze({
  cod: source({
    id: 'cod', publicId: 'etCg5GTESNY',
    resourceId: 'e1f17180-0416-4297-8471-b8f2fbe71b99',
    title: 'Fish', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'BC9026922C020B7CEC66C72EFFB0E7F43B30E0A592091826F93EFF0891BF4408',
    sourceTriangles: 162,
  }),
  salmon: source({
    id: 'salmon', publicId: '0HCLwTdxvz5',
    resourceId: '6eac34d9-f6f3-4d08-bbf8-162709a89797',
    title: 'Trout', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '1D770869650A3B6F5135CBD0E71B7B8E1B7EA6D854367EB64266318C2DA69B0F',
    sourceTriangles: 876,
  }),
  tuna: source({
    id: 'tuna', publicId: 'Ymu8ftrmuT',
    resourceId: '8410757e-6594-4011-817a-633730fbcaf8',
    title: 'Fish', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '6E04C645836F1AD6CABF1B999976FA74D50FD7DD23F504154EE03427EB194D51',
    sourceTriangles: 502,
  }),
  crab: source({
    id: 'crab', publicId: '1O5Q4pE8X6e',
    resourceId: '15379421-a6c9-4266-913b-7d6a46c4a2f0',
    title: 'Crab', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '436B13AFA9C2FC4A99402C4F23D5813CAF9936702FB99EB0727792013000C569',
    sourceTriangles: 1_340,
  }),
  squid: source({
    id: 'squid', publicId: '6ar_2XbrzCp',
    resourceId: '3bc4b003-d0b1-455b-aa66-c2c4c79bbd9f',
    title: 'Squid', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'C940CA6AFAF19988237A2577D67AD868E3311DE08D1F9DAE3F206E638FEA2FD8',
    sourceTriangles: 616,
  }),
  sardine: source({
    id: 'sardine', publicId: 'HkUAXudvBt',
    resourceId: '401cad25-1cb8-4842-8f3a-ad4c3440ed2a',
    title: 'Fish', creator: 'Kenney', license: 'CC0 1.0',
    sha256: '26893FFED61079A4A045D050631C2B59EFDAF7119BBFBA8BD134FB2A8754E1F3',
    sourceTriangles: 233,
  }),
  bass: source({
    id: 'bass', publicId: 'aEyLrUMMoUK',
    resourceId: '55537d5f-d9f2-45f0-8740-6357ca7784df',
    title: 'Fish', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '1F91914D26C1680EBB73A9BE87B7936528ADB5F2DDB32CC787EF4E73C32F8BDF',
    sourceTriangles: 506,
  }),
  redSnapper: source({
    id: 'redSnapper', publicId: 'XWl86YFtpF',
    resourceId: '311a79f6-ba3e-47aa-80ce-04185fc76b2a',
    title: 'Fish', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'BFEA34878B92EB05D9B2C584C3A9E97ABE2B402141B9C7B4B3F1ECB55A29DF02',
    sourceTriangles: 544,
  }),
  clownfish: source({
    id: 'clownfish', publicId: 'bJs4f0SFlO',
    resourceId: '72d5414c-2748-4862-b7ae-d4192be9e806',
    title: 'Fish', creator: 'Kenney', license: 'CC0 1.0',
    sha256: '78A8C5ABCF26C698E2C51AF21312455928AA7B9D9A531FAD508327DBE1567143',
    sourceTriangles: 233,
  }),
  seaweed: source({
    id: 'seaweed', publicId: '4cFllH6Iazk',
    resourceId: '8c51572a-1938-4c61-b971-63c3b69f3ea7',
    title: 'Kelp', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '3D8E3071C69E6F701A7061AB820293F63E96023CED132C559CC0CDB12542C7C6',
    sourceTriangles: 784, downloadedOn: '2026-07-27',
  }),
  boot: source({
    id: 'boot', publicId: '7HbqG8RwRcA',
    resourceId: '888317ad-20f0-4b0d-ba01-0bdd017adfd8',
    title: 'Boots', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '4FA4372D9AF01C2CD0E67462C9AFDD3EBA86FECCDB8FE3FEF3F71FB51B7CCA94',
    sourceTriangles: 154, downloadedOn: '2026-07-27',
  }),
  plasticBottle: source({
    id: 'plasticBottle', publicId: 'dha06wFxUwA',
    resourceId: '31674c92-502a-453a-a484-6da95ae4f13c',
    title: 'Water bottle', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '926B58E4B9E5EFFBCB330DD708D7BA0BBF05D61DCC3294C1FA546E4567AA8211',
    sourceTriangles: 480, downloadedOn: '2026-07-27',
  }),
  fishBones: source({
    id: 'fishBones', publicId: 'NZg3APPfF8',
    resourceId: '79359761-c093-48ca-a32e-e1703aadb582',
    title: 'Fish Bones', creator: 'Kenney', license: 'CC0 1.0',
    sha256: 'CA78E2970A6E8FEFA5498F71B664B90A4C2DD8F87B31861BFCAAA2EC037E1FC9',
    sourceTriangles: 384, downloadedOn: '2026-08-01',
  }),
  blowfish: source({
    "id": "blowfish",
    "publicId": "8DXeKkgTS_s",
    "resourceId": "e71133d3-e059-4a30-ae81-454200ff0f0f",
    "title": "Blowfish",
    "creator": "jeremy",
    "license": "CC-BY 3.0",
    "sha256": "19A8A2A3A29E04506176EFA3798707368BAF48626C6BDB56DB6741E390F556EE",
    "sourceTriangles": 926,
    "downloadedOn": "2026-09-09"
}),
  fish: source({
    "id": "fish",
    "publicId": "BEcU9rjiAq",
    "resourceId": "6805b99c-5fd7-4aab-bf57-3bb645e1108a",
    "title": "Fish",
    "creator": "Quaternius",
    "license": "CC0 1.0",
    "sha256": "9607DE8DE8A0AC2D857F271272E70E6D8D3FD19852D979C2CFBE9EAFE1E4FCC5",
    "sourceTriangles": 686,
    "downloadedOn": "2026-09-09"
}),
  goldfish: source({
    "id": "goldfish",
    "publicId": "3GPUntjwqCa",
    "resourceId": "26d7ba78-70bf-4f8b-b958-996a461737b2",
    "title": "Goldfish",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "96E32AB858F6711F02DABF02BE97C393F6DF349F531EAEFED138C67C6E225F88",
    "sourceTriangles": 508,
    "downloadedOn": "2026-09-09"
}),
  trout: source({
    "id": "trout",
    "publicId": "2W2sKWYvk8k",
    "resourceId": "1dfba885-5874-4e3f-8926-0ded89b0894f",
    "title": "Trout",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "7F0F98A67B31C5AD46B2669C78E3C6288571C7D5776DEBD67C9CD898E1ABD260",
    "sourceTriangles": 268,
    "downloadedOn": "2026-09-09"
}),
  kingfish: source({
    "id": "kingfish",
    "publicId": "e_Lkl7E-Tc8",
    "resourceId": "242614ac-6eac-49a5-b36a-0fb11456e484",
    "title": "Kingfish",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "D2988E36166A17A77CBC0AEAA437F2485B968385566C6F89C01D704CED434A43",
    "sourceTriangles": 576,
    "downloadedOn": "2026-09-09"
}),
  piranha: source({
    "id": "piranha",
    "publicId": "c307K4BlGr2",
    "resourceId": "067a4a0d-9adc-4190-9a9a-9abd9f7df32c",
    "title": "Piranha",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "D71501C50F6CF9099364C69DE29967169F78D688FA7E21D8EA9ED7F30A0B4E70",
    "sourceTriangles": 532,
    "downloadedOn": "2026-09-09"
}),
  crayfish: source({
    "id": "crayfish",
    "publicId": "3Y2cocX0ILR",
    "resourceId": "8af8f956-40b6-40d4-8cb1-7953d1bfda81",
    "title": "Crayfish",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "CBF53BD1B341817D76840FB5A41AAA4630DA629BB0B587F39F35C348A9836418",
    "sourceTriangles": 848,
    "downloadedOn": "2026-09-09"
}),
  halibut: source({
    "id": "halibut",
    "publicId": "653otKgnnpx",
    "resourceId": "e27ca3f2-8d05-4066-b85f-fdf00f9e20f8",
    "title": "Halibut",
    "creator": "Poly by Google",
    "license": "CC-BY 3.0",
    "sha256": "4427926DC0DB95629AB5E96C25E3FEFE197CE9A399C5CE592855B23EABC1CF33",
    "sourceTriangles": 372,
    "downloadedOn": "2026-09-09"
}),
  brokenCan: source({
    "id": "brokenCan",
    "publicId": "JjC5l1gXMo",
    "resourceId": "98cc5a4e-9ea3-4650-808b-55fb3ccb8aa9",
    "title": "Can Broken",
    "creator": "Quaternius",
    "license": "CC0 1.0",
    "sha256": "017E37B32959E82AAD954514BCC3B658B9E501D5B5F433CCCE35A20A0FAA6A0A",
    "sourceTriangles": 428,
    "downloadedOn": "2026-09-09"
}),
  crushedCan: source({
    "id": "crushedCan",
    "publicId": "MWvBbxYzjJ",
    "resourceId": "614bdcc3-3dd3-4216-b963-53aaefe6bbce",
    "title": "Soda Can Crushed",
    "creator": "Kenney",
    "license": "CC0 1.0",
    "sha256": "95D21A24B72E37FD3FA43792CFA0D07B9AA37EEDF115A7C33E6DB3FFC01D48F1",
    "sourceTriangles": 198,
    "downloadedOn": "2026-09-09"
}),
  backpack: source({
    "id": "backpack",
    "publicId": "vF7TuXCPDH",
    "resourceId": "2eb5178b-0c98-4a0d-b0ea-ad8925525d1e",
    "title": "Backpack",
    "creator": "Quaternius",
    "license": "CC0 1.0",
    "sha256": "404AF15A4BC0A955D9D8133D16DE7A4B900663F3A11F5364624AB8E7E9B6F68A",
    "sourceTriangles": 3960,
    "downloadedOn": "2026-09-09",
    "simplifyRatio": 0.45
}),
});

export const POLY_PIZZA_FISHING_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_FISHING_MODEL_SOURCES),
);

export async function buildPolyPizzaFishingModels({
  sourceRoot,
  outputRoot,
  verifySource = true,
}) {
  return buildPolyPizzaModels({
    sourceRoot,
    outputRoot,
    sources: POLY_PIZZA_FISHING_MODEL_SOURCES,
    verifySource,
  });
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify(POLY_PIZZA_FISHING_MODEL_SOURCES));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-fishing-models.mjs --sources | <sourceRoot> <outputRoot>',
    );
  }
  await buildPolyPizzaFishingModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
