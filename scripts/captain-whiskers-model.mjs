import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition } from '@gltf-transform/functions';
import { Euler, Quaternion } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const CAPTAIN_WHISKERS_SOURCE = Object.freeze({
  archiveSha256: '1C32B25CDB6E359EB2F98A5C20689540096F78328ED7BE86D8770857532A4D73',
  creator: 'livingroom38',
  downloadedOn: '2026-07-30',
  license: 'Creator permission',
  licenseUrl: 'https://livingroom38.itch.io/psx-low-poly-cat',
  modelSha256: '8088349B354E9263D2AF429E28C1441122C5E356ADEBE4F8F263822B608675FF',
  pageUrl: 'https://livingroom38.itch.io/psx-low-poly-cat',
  sourceAssetId: 'itch:3163214',
  textureSha256: 'FB045E0AA7452D57A3C6A5C5F4385C40C16CAA757DEC3123D69FAB705C4A67EB',
  title: 'PSX Low Poly Cat',
});

export const CAPTAIN_WHISKERS_IDLE_CLIP = 'CaptainWhiskersIdle';

const DEFAULT_OUTPUT_PATH = resolve(
  'src',
  'assets',
  'models',
  'items',
  'captainWhiskers.glb',
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sourceHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function verifyHash(label, bytes, expected) {
  const actual = sourceHash(bytes);
  if (actual !== expected) {
    throw new Error(`Unexpected ${label} SHA-256: expected ${expected}, received ${actual}`);
  }
}

function installFbxLoaderEnvironment() {
  globalThis.window = {
    URL: {
      createObjectURL: () => 'about:blank',
      revokeObjectURL: () => {},
    },
  };
  globalThis.document = {
    createElementNS: () => ({
      addEventListener: () => {},
      removeEventListener: () => {},
      get src() {
        return '';
      },
      set src(_value) {},
    }),
  };
}

function loadSourceMesh(bytes, sourcePath) {
  installFbxLoaderEnvironment();
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const resourcePath = `${resolve(sourcePath, '..').replaceAll('\\', '/')}/`;
  const source = new FBXLoader().parse(arrayBuffer, resourcePath);
  const meshes = [];
  source.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  if (meshes.length !== 1) {
    throw new Error(`PSX cat source must contain one mesh, received ${meshes.length}`);
  }
  if (source.animations.length !== 0 || meshes[0].isSkinnedMesh) {
    throw new Error('PSX cat source structure changed; review its animation import');
  }
  return meshes[0];
}

function centerPositions(position) {
  const values = Float32Array.from(position.array);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < values.length; index += 3) {
    minX = Math.min(minX, values[index]);
    minY = Math.min(minY, values[index + 1]);
    minZ = Math.min(minZ, values[index + 2]);
    maxX = Math.max(maxX, values[index]);
    maxZ = Math.max(maxZ, values[index + 2]);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  for (let index = 0; index < values.length; index += 3) {
    values[index] -= centerX;
    values[index + 1] -= minY;
    values[index + 2] -= centerZ;
  }
  return values;
}

function createAccessor(document, buffer, type, values) {
  return document.createAccessor()
    .setType(type)
    .setArray(values)
    .setBuffer(buffer);
}

function flipTextureCoordinates(uv) {
  const values = Float32Array.from(uv.array);
  for (let index = 1; index < values.length; index += 2) {
    values[index] = 1 - values[index];
  }
  return values;
}

function createModelDocument(sourceMesh, textureBytes) {
  const geometry = sourceMesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!position || !normal || !uv) {
    throw new Error('PSX cat source is missing position, normal, or UV data');
  }
  if (position.count % 3 !== 0) {
    throw new Error('PSX cat source triangle count is invalid');
  }

  const document = new Document();
  const buffer = document.createBuffer('CaptainWhiskersBuffer');
  const texture = document.createTexture('CaptainWhiskersColor')
    .setMimeType('image/png')
    .setImage(Uint8Array.from(textureBytes));
  const material = document.createMaterial('CaptainWhiskersMaterial')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.92);
  const primitive = document.createPrimitive()
    .setAttribute(
      'POSITION',
      createAccessor(document, buffer, Accessor.Type.VEC3, centerPositions(position)),
    )
    .setAttribute(
      'NORMAL',
      createAccessor(
        document,
        buffer,
        Accessor.Type.VEC3,
        Float32Array.from(normal.array),
      ),
    )
    .setAttribute(
      'TEXCOORD_0',
      createAccessor(
        document,
        buffer,
        Accessor.Type.VEC2,
        flipTextureCoordinates(uv),
      ),
    )
    .setMaterial(material);
  const mesh = document.createMesh('CaptainWhiskersMesh').addPrimitive(primitive);
  const node = document.createNode('CaptainWhiskers').setMesh(mesh);
  const scene = document.createScene('CaptainWhiskersScene').addChild(node);
  document.getRoot().setDefaultScene(scene);
  createIdleAnimation(document, buffer, node);
  return document;
}

function idleRotations() {
  const turns = [
    [0, 0, 0],
    [0.002, 0, -0.004],
    [0.004, 0, 0],
    [0.001, 0, 0.003],
    [-0.001, 0, 0],
    [0, 0, 0],
  ];
  return new Float32Array(turns.flatMap((turn) => {
    return new Quaternion()
      .setFromEuler(new Euler(...turn))
      .normalize()
      .toArray();
  }));
}

function createIdleAnimation(document, buffer, node) {
  const times = new Float32Array([0, 0.8, 1.6, 2.8, 4, 4.8]);
  const tracks = [
    {
      path: 'translation',
      type: Accessor.Type.VEC3,
      values: new Float32Array([
        0, 0, 0,
        0, 0.008, 0,
        0, 0.014, 0,
        0, 0.006, 0,
        0, -0.003, 0,
        0, 0, 0,
      ]),
    },
    {
      path: 'rotation',
      type: Accessor.Type.VEC4,
      values: idleRotations(),
    },
    {
      path: 'scale',
      type: Accessor.Type.VEC3,
      values: new Float32Array([
        1, 1, 1,
        0.999, 1.002, 0.999,
        0.998, 1.004, 0.998,
        0.999, 1.002, 0.999,
        1.001, 0.999, 1.001,
        1, 1, 1,
      ]),
    },
  ];
  const animation = document.createAnimation(CAPTAIN_WHISKERS_IDLE_CLIP);
  for (const track of tracks) {
    const input = createAccessor(document, buffer, Accessor.Type.SCALAR, times);
    const output = createAccessor(document, buffer, track.type, track.values);
    const sampler = document.createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation('LINEAR');
    const channel = document.createAnimationChannel()
      .setSampler(sampler)
      .setTargetNode(node)
      .setTargetPath(track.path);
    animation.addSampler(sampler).addChannel(channel);
  }
}

export async function buildCaptainWhiskers(
  modelPath,
  texturePath,
  outputPath = DEFAULT_OUTPUT_PATH,
) {
  const [modelBytes, textureBytes] = await Promise.all([
    readFile(modelPath),
    readFile(texturePath),
  ]);
  verifyHash('PSX cat model', modelBytes, CAPTAIN_WHISKERS_SOURCE.modelSha256);
  verifyHash('PSX cat texture', textureBytes, CAPTAIN_WHISKERS_SOURCE.textureSha256);
  const sourceMesh = loadSourceMesh(modelBytes, modelPath);
  const document = createModelDocument(sourceMesh, textureBytes);
  await document.transform(prune(), dedup(), unpartition());
  await io.write(outputPath, document);
}

async function runCli(args) {
  if (args.length < 2 || args.length > 3) {
    throw new Error(
      'Usage: node scripts/captain-whiskers-model.mjs <source.fbx> '
      + '<texture.png> [output.glb]',
    );
  }
  const modelPath = resolve(args[0]);
  const texturePath = resolve(args[1]);
  const outputPath = args[2] ? resolve(args[2]) : DEFAULT_OUTPUT_PATH;
  await buildCaptainWhiskers(modelPath, texturePath, outputPath);
  console.log(`Wrote ${outputPath} with animation ${CAPTAIN_WHISKERS_IDLE_CLIP}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
