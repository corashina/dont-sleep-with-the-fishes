import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  mergeDocuments,
  normals,
  prune,
  simplify,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';

export function createPolyPizzaSource({
  id,
  publicId,
  resourceId,
  title,
  creator,
  license,
  sha256,
  sourceTriangles,
  nodeName,
  removeNodeNames,
  translation,
  rotation,
  scale,
  downloadedOn = '2026-07-25',
  maxTriangles,
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
    downloadedOn,
    ...(nodeName === undefined ? {} : { nodeName }),
    ...(removeNodeNames === undefined ? {} : { removeNodeNames: Object.freeze(removeNodeNames) }),
    ...(translation === undefined ? {} : { translation: Object.freeze(translation) }),
    ...(rotation === undefined ? {} : { rotation: Object.freeze(rotation) }),
    ...(scale === undefined ? {} : { scale: Object.freeze(scale) }),
    ...(maxTriangles === undefined ? {} : { maxTriangles }),
    ...(simplifyRatio === undefined ? {} : { simplifyRatio, simplifyError }),
  });
}

const source = createPolyPizzaSource;

function compositeSource(primary, components) {
  return Object.freeze({
    ...primary,
    components: Object.freeze(components),
  });
}

export const POLY_PIZZA_MODEL_SOURCES = Object.freeze({
  cannedFood: source({
    id: 'cannedFood', publicId: 'onPuYPx0q7',
    resourceId: 'fd443036-3eca-46e4-8342-06fd48f93e8b',
    title: 'tin can', creator: 'bobbeh', license: 'CC-BY 3.0',
    sha256: '73EB054C04E778FE38F9AF2747AE7F9028710AA1527867FE02768A75F7E0F10A',
    sourceTriangles: 700, downloadedOn: '2026-07-26',
  }),
  baitTin: source({
    id: 'baitTin', publicId: 'ubNPKDn2yH',
    resourceId: '1246c082-49d3-45b3-86b8-bd44e49c5384',
    title: 'Jars', creator: 'Kay Lousberg', license: 'CC0 1.0',
    sha256: '3DEC909E1FFE93ABE2D274ECF81875FFDB46B7AA3E5601CFE57853A984635A31',
    sourceTriangles: 2_192, nodeName: 'jar_D_small',
  }),
  ductTape: source({
    id: 'ductTape', publicId: 'dLlslRdbHfs',
    resourceId: '0db201fd-36aa-4c36-8047-ebec79f146b8',
    title: 'Time Hotel 5.25 Painters Tape', creator: 'S. Paul Michael',
    license: 'CC-BY 3.0',
    sha256: '67CEDDF0FB84F8AC6F6B458BE6C8561B6649EEC43EA3E4C4C543B006219F4AC3',
    sourceTriangles: 2_376, downloadedOn: '2026-07-26',
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
    sourceTriangles: 8_422, maxTriangles: 9_000,
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
  scubaSet: compositeSource(source({
    id: 'scubaSet', publicId: '4GhtCNARi8c',
    resourceId: '432fff46-415f-417b-a8ce-92a52725b7c4',
    title: 'Scuba tank', creator: 'Steren Giannini', license: 'CC-BY 3.0',
    sha256: 'B2F25A9A79F7FA72BAA0D954AAD592DBBCFE975F6051B1E31E872D295FB8EC7D',
    sourceTriangles: 292, downloadedOn: '2026-07-26',
  }), [
    source({
      id: 'scubaGoggles', publicId: '4YCjSY3U6H',
      resourceId: 'd9c725b3-b39a-49c9-bc51-1159c1a747db',
      title: 'Ski Goggles', creator: 'iPoly3D', license: 'CC0 1.0',
      sha256: 'B6B77A97AA72EF36815192BFD274FC0F79422F121BD7AE736EAFDDA349450CB9',
      sourceTriangles: 636, downloadedOn: '2026-07-26',
      translation: [0.00025044, 0.185, -0.06384998],
      rotation: [1, 0, 0, 0],
      scale: [0.16, 0.16, 0.16],
    }),
  ]),
  anchor: source({
    id: 'anchor', publicId: 'fjAwIosTQHy',
    resourceId: 'f1d42e89-af89-4276-9160-2a52c7f5368e',
    title: 'Anchor', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'C0DB06912345342FFFE764B87A7C8532644691957A885E00B268CF84BE669EE4',
    sourceTriangles: 520,
  }),
  bottledPaper: source({
    id: 'bottledPaper', publicId: 'arIYNl9gMyr',
    resourceId: 'ec54b417-3509-498c-9b09-75eef6db1363',
    title: 'Scroll', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '9F9BC296790FD8B1E95E1B02BF3B92C73E488CF837F5C39E4A3CCFDC2A4A17C7',
    sourceTriangles: 796, downloadedOn: '2026-07-26',
  }),
  umbrella: source({
    id: 'umbrella', publicId: 'ez4MoDQFgXz',
    resourceId: 'f5b5e5cb-5438-4f9b-bc62-ea23e1dd89e0',
    title: 'Umbrella', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: '6A67B136D4BEBCF982599085B8BA7ACE6DFF6BD43A1FDAB2FE6E184C7848A672',
    sourceTriangles: 664, downloadedOn: '2026-07-26',
  }),
  swimRing: source({
    id: 'swimRing', publicId: '7n1vrlFN0GH',
    resourceId: '6b9eb5e5-a2d9-41b8-b6b1-4db908eadd46',
    title: 'Life preserver', creator: 'Poly by Google', license: 'CC-BY 3.0',
    sha256: 'C0BB0D093A4964064330193E8F5A75B0366A31ADD63AF16FD9B6B3D99E614791',
    sourceTriangles: 3_744, removeNodeNames: ['Rectangle_sweep'],
    downloadedOn: '2026-07-26', simplifyRatio: 0.75,
  }),
  flashlight: source({
    id: 'flashlight', publicId: '8t1DZLLvofk',
    resourceId: '82e1bb6b-c322-4663-ba6e-a44f146bcd41',
    title: 'Flashlight', creator: 'Bruno Oliveira', license: 'CC-BY 3.0',
    sha256: '4DFF38A60AA716D8E7EDD7828C5B3C4E4685DBC983B40E0D400399FBFEFB6C6E',
    sourceTriangles: 508, downloadedOn: '2026-07-26',
  }),
  harpoonGun: source({
    id: 'harpoonGun', publicId: 'neEjwx9bBJ',
    resourceId: 'da83f4f9-7a4e-4739-9033-79d688aa3b5e',
    title: 'Rifle', creator: 'Quaternius', license: 'CC0 1.0',
    sha256: '44A923B9358CA07247F125521A85BCE03654AE802984F6333B876C75AE2D0507',
    sourceTriangles: 1_534, downloadedOn: '2026-07-26',
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

function selectSourceNode(document, nodeName, id) {
  if (nodeName === undefined) return;
  const root = document.getRoot();
  const selected = root.listNodes().find((node) => node.getName() === nodeName);
  if (!selected) throw new Error(`${id}: source node ${nodeName} is missing`);
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${id}: source scene is missing`);

  selected.getParentNode()?.removeChild(selected);
  scene.addChild(selected);
  selected.setTranslation([0, 0, 0]);
  root.listNodes().filter((node) => node !== selected).forEach((node) => node.dispose());
}

function removeSourceNodes(document, nodeNames = [], id) {
  const root = document.getRoot();
  for (const nodeName of nodeNames) {
    const node = root.listNodes().find((candidate) => candidate.getName() === nodeName);
    if (!node) throw new Error(`${id}: removable source node ${nodeName} is missing`);
    node.dispose();
  }
}

async function readVerifiedSource(sourcePath, descriptor, verifySource, label) {
  const bytes = await readFile(sourcePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (verifySource && sha256 !== descriptor.sha256) {
    throw new Error(
      `${label}: expected source SHA-256 ${descriptor.sha256}, received ${sha256}`,
    );
  }

  const document = await io.read(sourcePath);
  const sourceTriangles = countDocumentTriangles(document);
  if (verifySource && sourceTriangles !== descriptor.sourceTriangles) {
    throw new Error(
      `${label}: expected ${descriptor.sourceTriangles} source triangles, received ${sourceTriangles}`,
    );
  }
  selectSourceNode(document, descriptor.nodeName, label);
  removeSourceNodes(document, descriptor.removeNodeNames, label);
  return { document, sha256, sourceTriangles };
}

function mergeComponent(target, component, descriptor, id) {
  const targetScene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0];
  const componentScene = component.getRoot().getDefaultScene()
    ?? component.getRoot().listScenes()[0];
  if (!targetScene || !componentScene) throw new Error(`${id}: source scene is missing`);

  const propertyMap = mergeDocuments(target, component);
  const mergedScene = propertyMap.get(componentScene);
  if (!mergedScene) throw new Error(`${id}: failed to merge ${descriptor.id}`);

  const componentRoot = target.createNode(descriptor.id);
  mergedScene.listChildren().forEach((node) => componentRoot.addChild(node));
  if (descriptor.translation) componentRoot.setTranslation(descriptor.translation);
  if (descriptor.rotation) componentRoot.setRotation(descriptor.rotation);
  if (descriptor.scale) componentRoot.setScale(descriptor.scale);
  targetScene.addChild(componentRoot);
  mergedScene.dispose();
}

export async function buildPolyPizzaModel({
  id,
  sourcePath,
  componentSourcePaths = {},
  outputPath,
  descriptor = POLY_PIZZA_MODEL_SOURCES[id],
  verifySource = true,
}) {
  if (!descriptor) throw new Error(`${id}: missing Poly Pizza descriptor`);
  const primary = await readVerifiedSource(sourcePath, descriptor, verifySource, id);
  const { document, sha256, sourceTriangles } = primary;

  for (const componentDescriptor of descriptor.components ?? []) {
    const componentPath = componentSourcePaths[componentDescriptor.id];
    if (!componentPath) throw new Error(`${id}: missing source path for ${componentDescriptor.id}`);
    const component = await readVerifiedSource(
      componentPath,
      componentDescriptor,
      verifySource,
      `${id}/${componentDescriptor.id}`,
    );
    mergeComponent(document, component.document, componentDescriptor, id);
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
  const maxTriangles = descriptor.maxTriangles ?? 3_000;
  if (triangles <= 0 || triangles > maxTriangles) {
    throw new Error(
      `${id}: processed triangle count ${triangles} exceeds the ${maxTriangles} limit`,
    );
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
      componentSourcePaths: Object.fromEntries((descriptor.components ?? []).map((component) => [
        component.id,
        join(sourceRoot, `${id}--${component.id}.glb`),
      ])),
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
      components: await Promise.all((descriptor.components ?? []).map(async (component) => {
        const componentPath = join(sourceRoot, `${id}--${component.id}.glb`);
        const componentBytes = await readFile(componentPath);
        const componentDocument = await io.read(componentPath);
        return {
          id: component.id,
          sha256: createHash('sha256').update(componentBytes).digest('hex').toUpperCase(),
          triangles: countDocumentTriangles(componentDocument),
          expectedSha256: component.sha256,
          expectedTriangles: component.sourceTriangles,
        };
      })),
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
