import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition } from '@gltf-transform/functions';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

export const QUATERNIUS_PACKS = Object.freeze({
  survival: {
    version: '2020-09',
    pageUrl: 'https://quaternius.com/packs/survival.html',
    sha256: 'DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5',
    licenseUrl: CC0,
    requiredEntries: ['Compass_Open.obj', 'Compass_Open.mtl', 'FlareGun.obj', 'FlareGun.mtl'],
  },
  pirate: {
    version: '2023-11',
    pageUrl: 'https://quaternius.com/packs/piratekit.html',
    sha256: 'ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36',
    licenseUrl: CC0,
    requiredEntries: ['Prop_Anchor.obj', 'Prop_Anchor.mtl'],
  },
});

export const QUATERNIUS_ITEM_RECIPES = Object.freeze({
  compass: { pack: 'survival', obj: 'Compass_Open.obj', mtl: 'Compass_Open.mtl', expectedTriangles: 656 },
  flareGun: { pack: 'survival', obj: 'FlareGun.obj', mtl: 'FlareGun.mtl', expectedTriangles: 540 },
  anchor: {
    pack: 'pirate',
    obj: 'Prop_Anchor.obj',
    mtl: 'Prop_Anchor.mtl',
    expectedTriangles: 544,
    materialOverrides: {
      Atlas: {
        baseColorFactor: [0.1329, 0.1714, 0.2051, 1],
        metallicFactor: 0.85,
        roughnessFactor: 0.42,
      },
    },
  },
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function sourceError(itemId, filename, message) {
  return new Error(`${itemId}: ${filename}: ${message}`);
}

function sourceLines(source) {
  return source.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim());
}

function splitRecord(line) {
  const divider = line.search(/\s/);
  return divider === -1
    ? [line, '']
    : [line.slice(0, divider), line.slice(divider).trim()];
}

function parseFiniteValues(payload, count, itemId, filename, record) {
  const values = payload.split(/\s+/).filter(Boolean);
  if (values.length !== count) {
    throw sourceError(itemId, filename, `${record} requires exactly ${count} numeric values`);
  }
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw sourceError(itemId, filename, `${record} requires finite numeric values`);
  }
  return numbers;
}

function parseUnitIntervalValues(payload, count, itemId, filename, record) {
  const values = parseFiniteValues(payload, count, itemId, filename, record);
  if (values.some((value) => value < 0 || value > 1)) {
    throw sourceError(itemId, filename, `${record} values must be within [0, 1]`);
  }
  return values;
}

function parseMtl(source, itemId, filename) {
  const materials = new Map();
  let current = null;

  for (const [index, line] of sourceLines(source).entries()) {
    if (!line) continue;
    const [record, payload] = splitRecord(line);
    const location = `line ${index + 1}: ${record}`;
    if (record === 'newmtl') {
      if (!payload) throw sourceError(itemId, filename, `${location} requires a material name`);
      if (materials.has(payload)) {
        throw sourceError(itemId, filename, `${location} repeats material ${payload}`);
      }
      current = { color: null, opacity: null };
      materials.set(payload, current);
      continue;
    }
    if (record === 'Kd') {
      if (!current) throw sourceError(itemId, filename, `${location} appears before newmtl`);
      if (current.color) throw sourceError(itemId, filename, `${location} repeats Kd`);
      current.color = parseUnitIntervalValues(payload, 3, itemId, filename, location);
      continue;
    }
    if (record === 'd') {
      if (!current) throw sourceError(itemId, filename, `${location} appears before newmtl`);
      if (current.opacity !== null) throw sourceError(itemId, filename, `${location} repeats d`);
      current.opacity = parseUnitIntervalValues(payload, 1, itemId, filename, location)[0];
    }
  }

  if (materials.size === 0) {
    throw sourceError(itemId, filename, 'does not declare a material');
  }
  for (const [name, material] of materials) {
    if (!material.color || material.opacity === null) {
      throw sourceError(itemId, filename, `material ${name} requires both Kd and d`);
    }
  }
  return materials;
}

function parsePositiveIndex(value, count, itemId, filename, kind, line) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw sourceError(itemId, filename, `line ${line}: ${kind} index must be a positive integer`);
  }
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index > count) {
    throw sourceError(itemId, filename, `line ${line}: ${kind} index ${value} is out of range`);
  }
  return index - 1;
}

function parseFaceVertex(value, positions, textureCoordinateCount, normals, itemId, filename, line) {
  const parts = value.split('/');
  if (parts.length !== 3 || !parts[0] || !parts[2]) {
    throw sourceError(itemId, filename, `line ${line}: face vertex ${value} requires position and normal indices`);
  }
  if (parts[1]) {
    parsePositiveIndex(parts[1], textureCoordinateCount, itemId, filename, 'texture coordinate', line);
  }
  return {
    positionIndex: parsePositiveIndex(parts[0], positions.length, itemId, filename, 'position', line),
    normalIndex: parsePositiveIndex(parts[2], normals.length, itemId, filename, 'normal', line),
  };
}

function parseObj(source, materials, itemId, filename) {
  const positions = [];
  let textureCoordinateCount = 0;
  const normals = [];
  const trianglesByMaterial = new Map();
  let activeMaterial = null;

  for (const [index, line] of sourceLines(source).entries()) {
    if (!line) continue;
    const lineNumber = index + 1;
    const [record, payload] = splitRecord(line);
    if (record === 'v') {
      positions.push(parseFiniteValues(payload, 3, itemId, filename, `line ${lineNumber}: v`));
      continue;
    }
    if (record === 'vn') {
      normals.push(parseFiniteValues(payload, 3, itemId, filename, `line ${lineNumber}: vn`));
      continue;
    }
    if (record === 'o') {
      if (!payload) throw sourceError(itemId, filename, `line ${lineNumber}: o requires a name`);
      continue;
    }
    if (record === 'usemtl') {
      if (!payload) throw sourceError(itemId, filename, `line ${lineNumber}: usemtl requires a material name`);
      if (!materials.has(payload)) {
        throw sourceError(itemId, filename, `line ${lineNumber}: usemtl references missing material ${payload}`);
      }
      activeMaterial = payload;
      continue;
    }
    if (record === 'f') {
      if (!activeMaterial) {
        throw sourceError(itemId, filename, `line ${lineNumber}: f requires an active usemtl material`);
      }
      const vertices = payload.split(/\s+/).filter(Boolean);
      if (vertices.length < 3) {
        throw sourceError(itemId, filename, `line ${lineNumber}: f requires at least three vertices`);
      }
      const face = vertices.map((vertex) => (
        parseFaceVertex(vertex, positions, textureCoordinateCount, normals, itemId, filename, lineNumber)
      ));
      const triangles = trianglesByMaterial.get(activeMaterial) ?? [];
      for (let vertex = 1; vertex < face.length - 1; vertex += 1) {
        triangles.push([face[0], face[vertex], face[vertex + 1]]);
      }
      trianglesByMaterial.set(activeMaterial, triangles);
      continue;
    }
    if (record === 'vt') {
      textureCoordinateCount += 1;
      continue;
    }
    if (record === 'mtllib' || record === 's') continue;
    throw sourceError(itemId, filename, `line ${lineNumber}: unsupported OBJ record ${record}`);
  }

  if (trianglesByMaterial.size === 0) {
    throw sourceError(itemId, filename, 'does not contain a face');
  }
  return { positions, normals, trianglesByMaterial };
}

function buildDocument(itemId, filename, parsed, materials, materialOverrides = {}) {
  const document = new Document();
  const buffer = document.createBuffer('buffer');
  const vertexIndices = new Map();
  const positions = [];
  const normals = [];
  const materialIndices = new Map();

  function vertexIndex(vertex) {
    const key = `${vertex.positionIndex}/${vertex.normalIndex}`;
    const existing = vertexIndices.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    vertexIndices.set(key, index);
    positions.push(...parsed.positions[vertex.positionIndex]);
    normals.push(...parsed.normals[vertex.normalIndex]);
    return index;
  }

  for (const [name, triangles] of parsed.trianglesByMaterial) {
    const indices = [];
    for (const triangle of triangles) {
      indices.push(...triangle.map(vertexIndex));
    }
    materialIndices.set(name, indices);
  }

  if (positions.length === 0) {
    throw sourceError(itemId, filename, 'does not contain indexed geometry');
  }
  const position = document.createAccessor('POSITION', buffer)
    .setType('VEC3')
    .setArray(new Float32Array(positions));
  const normal = document.createAccessor('NORMAL', buffer)
    .setType('VEC3')
    .setArray(new Float32Array(normals));
  const mesh = document.createMesh(itemId);
  for (const [name, indices] of materialIndices) {
    const materialSpec = materials.get(name);
    const override = materialOverrides[name];
    const material = document.createMaterial(name)
      .setBaseColorFactor(override?.baseColorFactor ?? [...materialSpec.color, materialSpec.opacity])
      .setMetallicFactor(override?.metallicFactor ?? 0)
      .setRoughnessFactor(override?.roughnessFactor ?? 1);
    const primitive = document.createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(document.createAccessor(`${name}:indices`, buffer)
        .setType('SCALAR')
        .setArray(new Uint32Array(indices)))
      .setMaterial(material);
    mesh.addPrimitive(primitive);
  }
  document.createScene(itemId).addChild(document.createNode(itemId).setMesh(mesh));
  return document;
}

async function readSource(sourceRoot, itemId, recipe, entry) {
  const path = join(sourceRoot, recipe.pack, entry);
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw sourceError(itemId, entry, `failed to read source (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function buildObjDocument(sourceRoot, itemId, recipe) {
  const [objSource, mtlSource] = await Promise.all([
    readSource(sourceRoot, itemId, recipe, recipe.obj),
    readSource(sourceRoot, itemId, recipe, recipe.mtl),
  ]);
  const materials = parseMtl(mtlSource, itemId, recipe.mtl);
  for (const name of Object.keys(recipe.materialOverrides ?? {})) {
    if (!materials.has(name)) {
      throw sourceError(itemId, recipe.mtl, `material override ${name} does not match a parsed material`);
    }
  }
  const parsed = parseObj(objSource, materials, itemId, recipe.obj);
  const document = buildDocument(itemId, recipe.obj, parsed, materials, recipe.materialOverrides);
  await document.transform(prune(), dedup(), unpartition());
  return document;
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const vertexCount = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      total += vertexCount / 3;
    }
  }
  return total;
}

export async function buildQuaterniusItemModels({ sourceRoot, outputRoot, recipes = QUATERNIUS_ITEM_RECIPES }) {
  await mkdir(outputRoot, { recursive: true });
  for (const [itemId, recipe] of Object.entries(recipes)) {
    const document = await buildObjDocument(sourceRoot, itemId, recipe);
    const triangles = countTriangles(document);
    if (triangles !== recipe.expectedTriangles) {
      throw new Error(`${itemId}: expected ${recipe.expectedTriangles} triangles, received ${triangles}`);
    }
    await io.write(join(outputRoot, `${itemId}.glb`), document);
  }
}

async function runCli(args) {
  if (args.length === 1 && args[0] === '--packs') {
    console.log(JSON.stringify(QUATERNIUS_PACKS));
    return;
  }
  if (args.length !== 2) {
    throw new Error('Usage: node scripts/quaternius-item-models.mjs --packs | <sourceRoot> <outputRoot>');
  }
  await buildQuaterniusItemModels({ sourceRoot: args[0], outputRoot: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
