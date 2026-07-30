import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition } from '@gltf-transform/functions';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';
const DOWNLOADED_ON = '2026-07-30';

function signature(
  sceneRootCount,
  sceneRootNamesSha256,
  nodeCount,
  nodeNamesSha256,
  meshCount,
  meshNamesSha256,
) {
  return Object.freeze({
    sceneRoots: Object.freeze({
      count: sceneRootCount,
      namesSha256: sceneRootNamesSha256,
    }),
    nodes: Object.freeze({ count: nodeCount, namesSha256: nodeNamesSha256 }),
    meshes: Object.freeze({ count: meshCount, namesSha256: meshNamesSha256 }),
  });
}

function source({
  id,
  publicId,
  resourceId,
  title,
  creator,
  license,
  sourceSha256,
  sourceSignature,
  sourceTriangles,
  targetLongestDimension,
  maxTriangles,
  translation,
  rotation,
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
    sourceSha256,
    sourceSignature,
    sourceTriangles,
    targetLongestDimension,
    maxTriangles,
    translation: Object.freeze(translation),
    rotation: Object.freeze(rotation),
    downloadedOn: DOWNLOADED_ON,
  });
}

export const POLY_PIZZA_EVENT_MODEL_SOURCES = Object.freeze({
  chestClosed: source({
    id: 'chestClosed',
    publicId: 'AngpV0HxD8',
    resourceId: '0ae3f497-8628-4864-b5d4-e81ab14704f8',
    title: 'Chest Closed',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sourceSha256: '1E018BAAB333027683C867357180B25F4228B878116CE5A69220161543A2A057',
    sourceSignature: signature(
      1,
      '57A304DA5C5FBB0DF28DAAE1BE357439E857281A3A5BE3822B1FD78FE488B6F9',
      2,
      '520CA2294470AD351F1734AFBE9C9531363961A39D4D4661D2844312DCC0A586',
      1,
      'F98004224DE3C1F1C1CA6EA59FA142BD40DA210CDAD23E098EBA833D87DDC2A4',
    ),
    sourceTriangles: 1_636,
    targetLongestDimension: 1.1,
    maxTriangles: 2_000,
    translation: [0, 0.55, 0],
    rotation: [0, 0, 0],
  }),
  midnightIsland: source({
    id: 'midnightIsland',
    publicId: 'C03O8OQq6O',
    resourceId: '1fda6a0b-6228-4c16-9a3f-8ca36d9af6b6',
    title: 'Island',
    creator: 'J-Toastie',
    license: 'CC-BY 3.0',
    sourceSha256: 'F2CA3A8EE6856FD312C8B6E5B1F2AA1D5234CB220FB441F836942CF4125274E6',
    sourceSignature: signature(
      1,
      '401D8C5F943FECE8C7E22F770EF9D4932056A0B27E5D5E92501BB07AAF1A0837',
      1,
      '401D8C5F943FECE8C7E22F770EF9D4932056A0B27E5D5E92501BB07AAF1A0837',
      1,
      'A0B3D803E2B7FA4DD50798B8C9B4550E33F5B02E604671A76B8F39604D9F240B',
    ),
    sourceTriangles: 84,
    targetLongestDimension: 18,
    maxTriangles: 200,
    translation: [0, -0.35, 0],
    rotation: [0, 0, 0],
  }),
  deadTree: source({
    id: 'deadTree',
    publicId: 'CD4edbPSGm',
    resourceId: '4db29f97-8e10-413d-be54-39ecda1a7c8d',
    title: 'Dead Tree',
    creator: 'Quaternius',
    license: 'CC0 1.0',
    sourceSha256: 'C6A2B34DE53EA610D4DCF20785340B12B023BD3B648A8F3DB3DCDB962008B9D3',
    sourceSignature: signature(
      1,
      '57A304DA5C5FBB0DF28DAAE1BE357439E857281A3A5BE3822B1FD78FE488B6F9',
      2,
      '4BF46E5806787957A5A5D586C8BD9DE1DD5886A89E2DD36E7E90B2A07B23AABF',
      1,
      '404458B24CC4F514C1CC4177B8D407F83FBCD30B93B792755C8325E854FB530C',
    ),
    sourceTriangles: 5_648,
    targetLongestDimension: 5.5,
    maxTriangles: 6_000,
    translation: [0, 2.75, 0],
    rotation: [0, 0, 0],
  }),
  traderRowboat: source({
    id: 'traderRowboat',
    publicId: 'dt1yhb5AYXD',
    resourceId: '0c76d378-c3fb-4a1c-aa5f-a25f09bd3ea4',
    title: 'Rowboat',
    creator: 'Poly by Google',
    license: 'CC-BY 3.0',
    sourceSha256: 'D044E98D9C87D65CD650D6F054940A5F3C62C06457F32BB864D24615E71906FA',
    sourceSignature: signature(
      1,
      'E93372533F323B2F12783AA3A586135CF421486439C2CDCDE47411B78F9839EC',
      1,
      'E93372533F323B2F12783AA3A586135CF421486439C2CDCDE47411B78F9839EC',
      1,
      '7E6CC40BD4B7D2937DCC7B1FD68BAA1A86027DD1321306F10BAD6CB47B78C475',
    ),
    sourceTriangles: 1_898,
    targetLongestDimension: 4.2,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  }),
  riggedHand: source({
    id: 'riggedHand',
    publicId: 'BEy8jbxm6A',
    resourceId: 'a36ea2d8-8437-4215-98d3-2fa53be67d85',
    title: 'Rigged Hand',
    creator: 'J-Toastie',
    license: 'CC-BY 3.0',
    sourceSha256: '32705E2EE2BADC9DF04886CC0705545D6640C34E927D4DB67AFFF2802AEC945E',
    sourceSignature: signature(
      1,
      '57A304DA5C5FBB0DF28DAAE1BE357439E857281A3A5BE3822B1FD78FE488B6F9',
      28,
      '4FFFC9F6264D79A3C52E70A93EF8F813363CE899D34AAF827AEAF62740150FCC',
      1,
      'FA18C06733FBBF4138EA8591D50949C1ECD653D0FBF13278A3439EE5AFA14C49',
    ),
    sourceTriangles: 1_518,
    targetLongestDimension: 1.2,
    maxTriangles: 2_000,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  }),
  containerShip: source({
    id: 'containerShip',
    publicId: '3AmDGcCu6Ll',
    resourceId: 'df197d9f-5d8c-4744-bc03-75ee514e8df3',
    title: 'Container Ship',
    creator: 'Alex Safayan',
    license: 'CC-BY 3.0',
    sourceSha256: 'A6F5E74082C8DFE8D251B7D70AF5C2BD8570D108B3CA2A97C3D55F38871FCB4B',
    sourceSignature: signature(
      88,
      'AB237DC15D22F6C8F5A2DD8936AF43466FCCBE20B4C8DDABBD9FEBCD3D1280D8',
      88,
      'AB237DC15D22F6C8F5A2DD8936AF43466FCCBE20B4C8DDABBD9FEBCD3D1280D8',
      88,
      '6E12DFD132322B686EABFBBE6D6915BD065E344B99073935B08FA287194E2A99',
    ),
    sourceTriangles: 1_620,
    targetLongestDimension: 36,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  }),
});

export const POLY_PIZZA_EVENT_MODEL_IDS = Object.freeze(
  Object.keys(POLY_PIZZA_EVENT_MODEL_SOURCES),
);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function namesSha256(names) {
  return sha256(Buffer.from([...names].sort().join('\n'), 'utf8'));
}

function documentSourceSignature(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('source signature: active scene is missing');
  const sceneRoots = scene.listChildren().map((node) => node.getName());
  const nodes = root.listNodes().map((node) => node.getName());
  const meshes = root.listMeshes().map((mesh) => mesh.getName());
  return {
    sceneRoots: { count: sceneRoots.length, namesSha256: namesSha256(sceneRoots) },
    nodes: { count: nodes.length, namesSha256: namesSha256(nodes) },
    meshes: { count: meshes.length, namesSha256: namesSha256(meshes) },
  };
}

function validateSourceSignature(document, descriptor) {
  const actual = documentSourceSignature(document);
  for (const category of ['sceneRoots', 'nodes', 'meshes']) {
    const expectedPart = descriptor.sourceSignature[category];
    const actualPart = actual[category];
    if (
      actualPart.count !== expectedPart.count
      || actualPart.namesSha256 !== expectedPart.namesSha256
    ) {
      throw new Error(
        `${descriptor.id}: approved source ${category} signature does not match`,
      );
    }
  }
}

function assertInjectedPackRejected(document, descriptor) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const sourceMesh = root.listMeshes()[0];
  if (!scene || !sourceMesh) throw new Error(`${descriptor.id}: negative fixture setup failed`);
  const injected = document.createNode('InjectedPackModel').setMesh(sourceMesh);
  scene.addChild(injected);
  let rejected = false;
  try {
    validateSourceSignature(document, descriptor);
  } catch {
    rejected = true;
  } finally {
    scene.removeChild(injected);
    injected.dispose();
  }
  if (!rejected) {
    throw new Error(`${descriptor.id}: injected multi-model pack was accepted`);
  }
}

function countDocumentTriangles(document) {
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

function validateSingleModel(document, descriptor) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  if (scenes.length !== 1) {
    throw new Error(`${descriptor.id}: expected one model scene, received ${scenes.length}`);
  }
  if (root.listCameras().length > 0) {
    throw new Error(`${descriptor.id}: source contains a camera`);
  }
  if (
    root.listExtensionsUsed()
      .some((extension) => extension.extensionName === 'KHR_lights_punctual')
  ) {
    throw new Error(`${descriptor.id}: source contains a light`);
  }
  if (root.listMeshes().length === 0) {
    throw new Error(`${descriptor.id}: source contains no model mesh`);
  }
}

function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function measureBounds(document, id) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${id}: source scene is missing`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visited = new Set();
  for (const child of scene.listChildren()) {
    child.traverse((node) => {
      if (visited.has(node)) return;
      visited.add(node);
      const mesh = node.getMesh();
      if (!mesh) return;
      const matrix = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const point = [0, 0, 0];
        for (let index = 0; index < position.getCount(); index += 1) {
          position.getElement(index, point);
          const worldPoint = transformPoint(matrix, point);
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], worldPoint[axis]);
            max[axis] = Math.max(max[axis], worldPoint[axis]);
          }
        }
      }
    });
  }
  if (![...min, ...max].every(Number.isFinite)) {
    throw new Error(`${id}: model bounds are invalid`);
  }
  if (!max.some((value, axis) => value > min[axis])) {
    throw new Error(`${id}: model bounds have no positive extent`);
  }
  return { min, max };
}

function animationMetadata(document) {
  return document.getRoot().listAnimations().map((animation) => ({
    name: animation.getName(),
    duration: Math.max(
      0,
      ...animation.listSamplers().map((sampler) => sampler.getInput()?.getMax([])[0] ?? 0),
    ),
    channels: animation.listChannels().length,
  }));
}

function nodeMetadata(document) {
  return document.getRoot().listNodes().map((node) => node.getName()).filter(Boolean);
}

function rigMetadata(document) {
  return document.getRoot().listSkins().map((skin) => ({
    name: skin.getName(),
    joints: skin.listJoints().map((joint) => joint.getName()).filter(Boolean),
  }));
}

function createPrimitiveFromTriangles(document, sourcePrimitive, triangleIndices, name) {
  if (sourcePrimitive.listTargets().length > 0) {
    throw new Error('chestClosed: morph targets are not supported');
  }
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer('chestClosed:buffer');
  const primitive = document.createPrimitive()
    .setMode(sourcePrimitive.getMode())
    .setMaterial(sourcePrimitive.getMaterial());
  const sourceIndices = sourcePrimitive.getIndices();
  const sourceAttributes = sourcePrimitive.listSemantics().map((semantic) => [
    semantic,
    sourcePrimitive.getAttribute(semantic),
  ]);

  for (const [semantic, sourceAccessor] of sourceAttributes) {
    const element = [];
    const values = [];
    for (const triangleIndex of triangleIndices) {
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceElement = triangleIndex * 3 + corner;
        const vertexIndex = sourceIndices?.getScalar(sourceElement) ?? sourceElement;
        sourceAccessor.getElement(vertexIndex, element);
        values.push(...element);
      }
    }
    const SourceArray = sourceAccessor.getArray().constructor;
    const accessor = document.createAccessor(`${name}:${semantic}`)
      .setType(sourceAccessor.getType())
      .setArray(new SourceArray(values))
      .setNormalized(sourceAccessor.getNormalized())
      .setBuffer(buffer);
    primitive.setAttribute(semantic, accessor);
  }
  return primitive;
}

function addUsableChestLid(document) {
  const root = document.getRoot();
  const sourceNode = root.listNodes().find((node) => node.getName() === 'Prop_Chest_Closed');
  const sourceMesh = sourceNode?.getMesh();
  if (!sourceNode || !sourceMesh || sourceMesh.listPrimitives().length !== 1) {
    throw new Error('chestClosed: expected the approved single-mesh chest');
  }
  const sourcePrimitive = sourceMesh.listPrimitives()[0];
  const position = sourcePrimitive.getAttribute('POSITION');
  if (!position) throw new Error('chestClosed: source position data is missing');
  const indices = sourcePrimitive.getIndices();
  const elementCount = indices?.getCount() ?? position.getCount();
  const sourceMin = position.getMin([]);
  const sourceMax = position.getMax([]);
  const lidThreshold = sourceMin[1] + (sourceMax[1] - sourceMin[1]) * 0.48;
  const baseTriangles = [];
  const lidTriangles = [];
  const point = [];
  for (let triangleIndex = 0; triangleIndex < elementCount / 3; triangleIndex += 1) {
    let centroidY = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceElement = triangleIndex * 3 + corner;
      const vertexIndex = indices?.getScalar(sourceElement) ?? sourceElement;
      position.getElement(vertexIndex, point);
      centroidY += point[1] / 3;
    }
    (centroidY >= lidThreshold ? lidTriangles : baseTriangles).push(triangleIndex);
  }
  if (baseTriangles.length === 0 || lidTriangles.length === 0) {
    throw new Error('chestClosed: could not separate the approved chest lid');
  }

  const baseMesh = document.createMesh('chestClosed:base')
    .addPrimitive(createPrimitiveFromTriangles(
      document,
      sourcePrimitive,
      baseTriangles,
      'chestClosed:base',
    ));
  const lidMesh = document.createMesh('chestClosed:lid-mesh')
    .addPrimitive(createPrimitiveFromTriangles(
      document,
      sourcePrimitive,
      lidTriangles,
      'chestClosed:lid',
    ));
  const pivot = [0, lidThreshold, sourceMin[2]];
  const lidPivot = document.createNode('chestClosed:lid').setTranslation(pivot);
  const lidModel = document.createNode('chestClosed:lid-model')
    .setTranslation(pivot.map((value) => -value))
    .setMesh(lidMesh);
  lidPivot.addChild(lidModel);
  sourceNode.setMesh(baseMesh).addChild(lidPivot);
  sourceMesh.dispose();
}

function meshMetadata(document) {
  return document.getRoot().listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((primitive) => ({
      material: primitive.getMaterial()?.getName() ?? '',
      vertices: primitive.getAttribute('POSITION')?.getCount() ?? 0,
      triangles: (primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0) / 3,
      positionMin: primitive.getAttribute('POSITION')?.getMin([]) ?? [],
      positionMax: primitive.getAttribute('POSITION')?.getMax([]) ?? [],
    })),
  }));
}

async function downloadSource(descriptor, targetPath) {
  const response = await fetch(descriptor.downloadUrl);
  if (!response.ok) {
    throw new Error(`${descriptor.id}: download failed with HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes);
  return bytes;
}

async function inspectSource(descriptor, targetPath, verifyHash) {
  const bytes = await downloadSource(descriptor, targetPath);
  const sourceSha256 = sha256(bytes);
  if (verifyHash && sourceSha256 !== descriptor.sourceSha256) {
    throw new Error(
      `${descriptor.id}: expected source SHA-256 ${descriptor.sourceSha256}, received ${sourceSha256}`,
    );
  }
  const document = await io.read(targetPath);
  validateSingleModel(document, descriptor);
  validateSourceSignature(document, descriptor);
  const sourceTriangles = countDocumentTriangles(document);
  if (sourceTriangles !== descriptor.sourceTriangles) {
    throw new Error(
      `${descriptor.id}: expected ${descriptor.sourceTriangles} source triangles, received ${sourceTriangles}`,
    );
  }
  return {
    document,
    sourceSha256,
    sourceTriangles,
    nodes: nodeMetadata(document),
    animations: animationMetadata(document),
    rigs: rigMetadata(document),
  };
}

async function processSource(descriptor, sourcePath, outputPath) {
  const source = await inspectSource(descriptor, sourcePath, true);
  const { document } = source;
  if (descriptor.id === 'chestClosed') addUsableChestLid(document);
  await document.transform(prune(), dedup(), unpartition());
  validateSingleModel(document, descriptor);

  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  scene.setName(descriptor.id);
  scene.listChildren().forEach((node, index) => {
    node.setName(`${descriptor.id}:${node.getName() || `source-${index + 1}`}`);
  });

  const triangles = countDocumentTriangles(document);
  if (triangles <= 0 || triangles > descriptor.maxTriangles) {
    throw new Error(
      `${descriptor.id}: processed triangle count ${triangles} exceeds ${descriptor.maxTriangles}`,
    );
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await io.write(outputPath, document);
  const outputBytes = await readFile(outputPath);
  const outputDocument = await io.read(outputPath);
  validateSingleModel(outputDocument, descriptor);
  return {
    sourceSha256: source.sourceSha256,
    outputSha256: sha256(outputBytes),
    sourceTriangles: source.sourceTriangles,
    triangles,
    rawBounds: measureBounds(outputDocument, descriptor.id),
    animations: animationMetadata(outputDocument),
    nodes: nodeMetadata(outputDocument),
    rigs: rigMetadata(outputDocument),
  };
}

function metadataEntry(descriptor, measurement) {
  return {
    title: descriptor.title,
    creator: descriptor.creator,
    sourceUrl: descriptor.pageUrl,
    sourceModelId: descriptor.sourceAssetId,
    license: descriptor.license,
    licenseUrl: descriptor.licenseUrl,
    downloadedOn: descriptor.downloadedOn,
    sourceSha256: measurement.sourceSha256,
    outputSha256: measurement.outputSha256,
    sourceTriangles: measurement.sourceTriangles,
    triangles: measurement.triangles,
    rawBounds: measurement.rawBounds,
    animations: measurement.animations,
    nodes: measurement.nodes,
    rigs: measurement.rigs,
  };
}

async function inspectSources() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'five-night-event-models-'));
  try {
    for (const descriptor of Object.values(POLY_PIZZA_EVENT_MODEL_SOURCES)) {
      const sourcePath = join(temporaryRoot, `${descriptor.id}.glb`);
      const inspection = await inspectSource(descriptor, sourcePath, false);
      assertInjectedPackRejected(inspection.document, descriptor);
      console.log(JSON.stringify({
        id: descriptor.id,
        sourceSha256: inspection.sourceSha256,
        sourceTriangles: inspection.sourceTriangles,
        nodes: inspection.nodes,
        animations: inspection.animations,
        rigs: inspection.rigs,
        meshes: meshMetadata(inspection.document),
        sourceSignature: documentSourceSignature(inspection.document),
        injectedPackFixture: 'rejected',
      }));
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function buildModels() {
  const outputRoot = resolve('src', 'assets', 'models', 'events');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'five-night-event-models-'));
  const temporaryOutputRoot = join(temporaryRoot, 'output');
  const metadata = {};
  try {
    for (const descriptor of Object.values(POLY_PIZZA_EVENT_MODEL_SOURCES)) {
      const sourcePath = join(temporaryRoot, 'source', `${descriptor.id}.glb`);
      const outputPath = join(temporaryOutputRoot, `${descriptor.id}.glb`);
      const measurement = await processSource(descriptor, sourcePath, outputPath);
      metadata[descriptor.id] = metadataEntry(descriptor, measurement);
      console.log(
        `${descriptor.id}.glb: ${measurement.triangles} / ${descriptor.maxTriangles} triangles`,
      );
    }

    await mkdir(outputRoot, { recursive: true });
    for (const id of POLY_PIZZA_EVENT_MODEL_IDS) {
      await copyFile(join(temporaryOutputRoot, `${id}.glb`), join(outputRoot, `${id}.glb`));
    }
    await writeFile(
      join(outputRoot, 'event-model-metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--inspect-sources') {
    await inspectSources();
    return;
  }
  if (args.length !== 0) {
    throw new Error('Usage: node scripts/poly-pizza-event-models.mjs [--inspect-sources]');
  }
  await buildModels();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
