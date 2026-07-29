import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Accessor, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition } from '@gltf-transform/functions';
import { Quaternion } from 'three';

export const CAPTAIN_WHISKERS_SOURCE = Object.freeze({
  creator: 'DreamNoms',
  downloadedOn: '2026-07-29',
  idleEnd: 10 + 5 / 30,
  idleStart: 5 + 20 / 30,
  license: 'CC-BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  pageUrl:
    'https://sketchfab.com/3d-models/stripe-the-cat-rigged-and-animated-2e3030b71a6d4b219fdc7304f8e58013',
  sha256: '424048674AFB86D67186029B1EC4F450178CB1510C35BD415490E8152F8708FE',
  sourceAssetId: 'sketchfab:2e3030b71a6d4b219fdc7304f8e58013',
  title: 'Stripe the Cat Rigged and Animated',
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

function findUpperKey(times, time) {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (times[middle] < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function sampleTrack(times, values, elementSize, time, path) {
  if (times.length === 1 || time <= times[0]) {
    return Array.from(values.slice(0, elementSize));
  }
  if (time >= times[times.length - 1]) {
    return Array.from(values.slice(values.length - elementSize));
  }

  const upper = findUpperKey(times, time);
  if (times[upper] === time) {
    return Array.from(values.slice(upper * elementSize, (upper + 1) * elementSize));
  }
  const lower = upper - 1;
  const alpha = (time - times[lower]) / (times[upper] - times[lower]);
  const lowerValue = Array.from(
    values.slice(lower * elementSize, (lower + 1) * elementSize),
  );
  const upperValue = Array.from(
    values.slice(upper * elementSize, (upper + 1) * elementSize),
  );
  if (path === 'rotation') {
    return new Quaternion(...lowerValue)
      .slerp(new Quaternion(...upperValue), alpha)
      .normalize()
      .toArray();
  }
  return lowerValue.map((value, index) => {
    return value + (upperValue[index] - value) * alpha;
  });
}

function cropTrack(channel, start, end) {
  const sampler = channel.getSampler();
  const input = sampler.getInput();
  const output = sampler.getOutput();
  const sourceTimes = input.getArray();
  const sourceValues = output.getArray();
  if (!sourceTimes || !sourceValues) {
    throw new Error('Captain Whiskers animation contains an empty sampler');
  }
  const path = channel.getTargetPath();
  const elementSize = output.getElementSize();
  const sourceInteriorTimes = Array.from(sourceTimes).filter((time) => {
    return time > start && time < end;
  });
  const times = [start, ...sourceInteriorTimes, end];
  const values = times.flatMap((time) => {
    return sampleTrack(sourceTimes, sourceValues, elementSize, time, path);
  });
  return {
    inputType: input.getType(),
    outputType: output.getType(),
    times: new Float32Array(times.map((time) => time - start)),
    values: new Float32Array(values),
  };
}

function removePresentationNodes(document) {
  for (const node of document.getRoot().listNodes()) {
    if (node.getName() === 'Camera' || node.getName() === 'Lamp') node.dispose();
  }
}

function buildIdleAnimation(document) {
  const sourceAnimation = document.getRoot().listAnimations()
    .find((animation) => animation.getName() === 'All Animations');
  if (!sourceAnimation) throw new Error('Stripe source is missing All Animations');
  const buffer = document.getRoot().listBuffers()[0];
  if (!buffer) throw new Error('Stripe source has no binary buffer');

  const idle = document.createAnimation(CAPTAIN_WHISKERS_IDLE_CLIP);
  for (const channel of sourceAnimation.listChannels()) {
    const target = channel.getTargetNode();
    if (!target || target.getName() === 'Camera') continue;
    const cropped = cropTrack(
      channel,
      CAPTAIN_WHISKERS_SOURCE.idleStart,
      CAPTAIN_WHISKERS_SOURCE.idleEnd,
    );
    const input = document.createAccessor()
      .setType(Accessor.Type.SCALAR)
      .setArray(cropped.times)
      .setBuffer(buffer);
    const output = document.createAccessor()
      .setType(cropped.outputType)
      .setArray(cropped.values)
      .setBuffer(buffer);
    const sampler = document.createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation('LINEAR');
    const idleChannel = document.createAnimationChannel()
      .setSampler(sampler)
      .setTargetNode(target)
      .setTargetPath(channel.getTargetPath());
    idle.addSampler(sampler).addChannel(idleChannel);
  }
  sourceAnimation.dispose();
}

export async function buildCaptainWhiskers(sourcePath, outputPath = DEFAULT_OUTPUT_PATH) {
  const bytes = await readFile(sourcePath);
  const actualHash = sourceHash(bytes);
  if (actualHash !== CAPTAIN_WHISKERS_SOURCE.sha256) {
    throw new Error(
      `Unexpected Stripe source SHA-256: expected ${CAPTAIN_WHISKERS_SOURCE.sha256}, received ${actualHash}`,
    );
  }

  const document = await io.read(sourcePath);
  buildIdleAnimation(document);
  removePresentationNodes(document);
  const scene = document.getRoot().getDefaultScene()
    ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error('Stripe source has no scene');
  scene.setName('CaptainWhiskers');
  await document.transform(prune(), dedup(), unpartition());
  await io.write(outputPath, document);
}

async function runCli(args) {
  if (args.length < 1 || args.length > 2) {
    throw new Error(
      'Usage: node scripts/captain-whiskers-model.mjs <source.glb> [output.glb]',
    );
  }
  const sourcePath = resolve(args[0]);
  const outputPath = args[1] ? resolve(args[1]) : DEFAULT_OUTPUT_PATH;
  await buildCaptainWhiskers(sourcePath, outputPath);
  console.log(`Wrote ${outputPath} with animation ${CAPTAIN_WHISKERS_IDLE_CLIP}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
