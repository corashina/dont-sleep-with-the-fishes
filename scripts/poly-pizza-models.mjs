import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  normals,
  prune,
  simplify,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

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
  simplifyRatio,
  simplifyError = 0.01,
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
    ...(simplifyRatio === undefined ? {} : { simplifyRatio, simplifyError }),
  });
}

export const POLY_PIZZA_MODEL_SOURCES = Object.freeze({
  cannedFood: source({
    id: 'cannedFood', publicId: 'YnowJvWqxE',
    resourceId: 'e16e13cf-fbc4-48c8-9927-ae34920a498e',
    title: 'Can', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '66EA638E8C12F1C9EFCA4F6081FF864E689C5499AE654ECC86C7940256EA21EE',
    sourceTriangles: 428,
  }),
  baitTin: source({
    id: 'baitTin', publicId: '6Isq2Aqy4MR',
    resourceId: '40d525c4-6aac-4a00-88df-c7610a73f608',
    title: 'Earthworm', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '0321710FEF059296263BCE630F69B5B1E325DB29BF137414C3FE83418496FC96',
    sourceTriangles: 3_617, simplifyRatio: 0.78,
  }),
  ductTape: source({
    id: 'ductTape', publicId: 'fu49rGO7Ukc',
    resourceId: '06934616-1393-451d-bdf6-2101a5e32703',
    title: 'Tape', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'EB8D46316A7011F333F36486EBFD3961191878E44765E27D0585538166117B14',
    sourceTriangles: 20_332, simplifyRatio: 0.05, simplifyError: 0.025,
  }),
  compass: source({
    id: 'compass', publicId: 'LlnxQPETHh',
    resourceId: 'db18fada-a70e-44da-961c-0cc31dffdaa6',
    title: 'Compass', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '02B285836B276A907019DF65F51674C3975364316B58FE859863921838867C7D',
    sourceTriangles: 656,
  }),
  map: source({
    id: 'map', publicId: 'bU3B6P0ngfi',
    resourceId: 'c06cc95b-6a05-469c-aa4a-a44fdac2e9c0',
    title: 'Map', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'ACA3349080F1BDFF11AA6A7EA3C6C2854008B52ECB4624EEFC882724986087D4',
    sourceTriangles: 480,
  }),
  medicalKit: source({
    id: 'medicalKit', publicId: 'wP00rePSRD',
    resourceId: 'ac2e0be3-3279-48be-ac2b-d50077b44eab',
    title: 'First Aid Kit', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '69BA229801C2156228389BA4498F75DDC8663A768D794668E29780DE4E803B5E',
    sourceTriangles: 754,
  }),
  spyglass: source({
    id: 'spyglass', publicId: '6nj5FdUlsEW',
    resourceId: 'fffe317f-3c82-4447-a0a1-317c2972889f',
    title: 'Binoculars', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '036AE3ED3486EFEED1EE33387143A205A2AF561F3E1EDBFA8000C6E5C61DC561',
    sourceTriangles: 928,
  }),
  fishingNet: source({
    id: 'fishingNet', publicId: '6xRmXaU-L7e',
    resourceId: '9d291011-bf4c-4202-ad84-97bf9e964dae',
    title: 'Fishing net', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '676BB90BE7356794BFE07D607C1BA1AF45F4C756BD94B400FEFBCF73C5582FB5',
    sourceTriangles: 8_422, simplifyRatio: 0.025, simplifyError: 0.04,
  }),
  bucket: source({
    id: 'bucket', publicId: '5HPoa3eX0Jb',
    resourceId: 'df6131e2-b851-4482-8c78-9f5f35fbd3aa',
    title: 'Bucket', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '933973478E0F0553E799BF751C751D14BB827A5DD942CE5749B65032BD929415',
    sourceTriangles: 1_844,
  }),
  flareGun: source({
    id: 'flareGun', publicId: '44H9OBUqTC',
    resourceId: '9ec52cda-c918-43f0-b7af-354e7fe96c37',
    title: 'Flare Gun', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '0CEB763BEF74624C710A278C3415F00469AF9CBFB954781787B42615138872EC',
    sourceTriangles: 540,
  }),
  scubaSet: source({
    id: 'scubaSet', publicId: '7igrHLjaQlW',
    resourceId: 'efda7497-db5e-47e9-b317-8e8baeb1c616',
    title: 'Scuba equipment', creator: 'Steren Giannini', license: 'CC-BY 3.0',
    sha256: '510AA30856968B089D1814B43CD24F35B1444BF41E3E7D6EAA1DE9BED0B0255E',
    sourceTriangles: 4_696, simplifyRatio: 0.6,
  }),
  anchor: source({
    id: 'anchor', publicId: 'fjAwIosTQHy',
    resourceId: 'f1d42e89-af89-4276-9160-2a52c7f5368e',
    title: 'Anchor', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'C0DB06912345342FFFE764B87A7C8532644691957A885E00B268CF84BE669EE4',
    sourceTriangles: 520,
  }),
  bottledPaper: source({
    id: 'bottledPaper', publicId: '65Hf2EMEo4s',
    resourceId: 'f2918f5c-1371-440d-9968-cdcba02cfd68',
    title: 'Bottle of wine', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '8C5726CAFA144B60D2977E47AF10596D6231D42E33065ECF0B4EA9D806EA8C9F',
    sourceTriangles: 608,
  }),
  umbrella: source({
    id: 'umbrella', publicId: 'bMXCVfXHUX2',
    resourceId: 'c8acd7d5-d438-48bd-9a6d-cae61f1e6501',
    title: 'Closed umbrella', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '5069DEADA0051CC34699C759EE671137D2857538275863EBFACC05A470ED3C5E',
    sourceTriangles: 600,
  }),
  swimRing: source({
    id: 'swimRing', publicId: '7n1vrlFN0GH',
    resourceId: '6b9eb5e5-a2d9-41b8-b6b1-4db908eadd46',
    title: 'Life preserver', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'C0BB0D093A4964064330193E8F5A75B0366A31ADD63AF16FD9B6B3D99E614791',
    sourceTriangles: 3_744, simplifyRatio: 0.75,
  }),
  flashlight: source({
    id: 'flashlight', publicId: '4fbaKPvM0Ss',
    resourceId: '594e3e35-75f7-45dd-be13-cf98d731e862',
    title: 'Flashlight', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'BD2D99BC1D6C3B435EE1342E402F26FA84AF02D2A29A56E65528CCC34FDEF05B',
    sourceTriangles: 108,
  }),
  harpoonGun: source({
    id: 'harpoonGun', publicId: '3zA9NtYBEi',
    resourceId: '6a63e2ad-5260-4ace-9245-7bfffdfd9695',
    title: 'Spear', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '849DD95DB71CE13E52C2ECD53C118012B45A6EDF8B8F019F9F2EBB51BFA27BB1',
    sourceTriangles: 3_200, simplifyRatio: 0.85,
  }),
  energyBar: source({
    id: 'energyBar', publicId: 'vJsJ1EIiOO',
    resourceId: 'c2fe4825-1aed-430d-8925-4541a98d70f8',
    title: 'Chocolate Bar', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: 'D34C9AC94FDCE13CA2CB99110EB4A47451DB8F1B9D12B32EA89D12F6C0686FF2',
    sourceTriangles: 436,
  }),
  fishingRod: source({
    id: 'fishingRod', publicId: '0YAR0Lg58p',
    resourceId: '54eb8952-a61d-45c1-9e64-761376721e14',
    title: 'Fishing Rod', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '6D5BD9D93D74B61C68BD053F8B94F5D594DF998938D1A71D38119E2832F8FDB5',
    sourceTriangles: 522,
  }),
  lantern: source({
    id: 'lantern', publicId: 'CtHBJ1ufeW',
    resourceId: 'ecbc7b04-09ca-4068-bb3c-4e5ce1163c9a',
    title: 'Lantern', creator: 'Kay Lousberg', license: 'CC0 1.0',
    sha256: '24EE9E4B9E280023CBBAF9FF6284E7BA51A07753F8D5EC8690ECC61DD156981D',
    sourceTriangles: 264,
  }),
  ceilingLight: source({
    id: 'ceilingLight', publicId: 'JT44JUXU2d',
    resourceId: '2cc064fb-2b1b-4269-9007-473dfe78bffc',
    title: 'Light Ceiling Single', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '4E307B591D68D8AFF049F07B59E5AA75B81E8DA211FD48B752BF847918EDED1B',
    sourceTriangles: 232,
  }),
});

export const POLY_PIZZA_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_MODEL_SOURCES),
);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

export function countDocumentTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      total += count / 3;
    }
  }
  return total;
}

function removeSplitNormals(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const normal = primitive.getAttribute('NORMAL');
      primitive.setAttribute('NORMAL', null);
      normal?.dispose();
    }
  }
}

export async function buildPolyPizzaModel({
  id,
  sourcePath,
  outputPath,
  descriptor = POLY_PIZZA_MODEL_SOURCES[id],
  verifySource = true,
}) {
  if (!descriptor) throw new Error(`${id}: missing Poly Pizza descriptor`);
  const bytes = await readFile(sourcePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (verifySource && sha256 !== descriptor.sha256) {
    throw new Error(`${id}: expected source SHA-256 ${descriptor.sha256}, received ${sha256}`);
  }

  const document = await io.read(sourcePath);
  const sourceTriangles = countDocumentTriangles(document);
  if (verifySource && sourceTriangles !== descriptor.sourceTriangles) {
    throw new Error(
      `${id}: expected ${descriptor.sourceTriangles} source triangles, received ${sourceTriangles}`,
    );
  }

  if (descriptor.simplifyRatio !== undefined) {
    removeSplitNormals(document);
    await document.transform(
      weld(),
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: descriptor.simplifyRatio,
        error: descriptor.simplifyError,
        lockBorder: false,
      }),
      normals({ overwrite: true }),
    );
  }
  await document.transform(prune(), dedup(), unpartition());

  const scene = document.getRoot().getDefaultScene()
    ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${id}: source scene is missing`);
  scene.setName(id);
  scene.listChildren().forEach((node, index) => {
    node.setName(`${id}:${node.getName() || `source-${index + 1}`}`);
  });

  const triangles = countDocumentTriangles(document);
  if (triangles <= 0 || triangles > 3_000) {
    throw new Error(`${id}: processed triangle count ${triangles} exceeds the 3,000 limit`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await io.write(outputPath, document);
  return { sha256, sourceTriangles, triangles };
}

export async function buildPolyPizzaModels({
  sourceRoot,
  outputRoot,
  sources = POLY_PIZZA_MODEL_SOURCES,
  verifySource = true,
}) {
  const results = {};
  for (const [id, descriptor] of Object.entries(sources)) {
    results[id] = await buildPolyPizzaModel({
      id,
      descriptor,
      sourcePath: join(sourceRoot, `${id}.glb`),
      outputPath: join(outputRoot, `${id}.glb`),
      verifySource,
    });
  }
  return results;
}

async function inspectPolyPizzaSources(sourceRoot) {
  const result = {};
  for (const [id, descriptor] of Object.entries(POLY_PIZZA_MODEL_SOURCES)) {
    const sourcePath = join(sourceRoot, `${id}.glb`);
    const bytes = await readFile(sourcePath);
    const document = await io.read(sourcePath);
    result[id] = {
      sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
      triangles: countDocumentTriangles(document),
      expectedSha256: descriptor.sha256,
      expectedTriangles: descriptor.sourceTriangles,
    };
  }
  return result;
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--sources') {
    console.log(JSON.stringify(POLY_PIZZA_MODEL_SOURCES));
    return;
  }
  if (args.length === 2 && args[0] === '--inspect-sources') {
    console.log(JSON.stringify(await inspectPolyPizzaSources(args[1]), null, 2));
    return;
  }
  if (args.length !== 2) {
    throw new Error(
      'Usage: node scripts/poly-pizza-models.mjs --sources | --inspect-sources <sourceRoot> | <sourceRoot> <outputRoot>',
    );
  }
  await buildPolyPizzaModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
