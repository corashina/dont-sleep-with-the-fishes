import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import metadataJson from '../src/assets/models/items/item-model-metadata.json';

const MODEL_PATH = resolve(
  'src',
  'assets',
  'models',
  'items',
  'captainWhiskers.glb',
);

describe('Captain Whiskers model', () => {
  it('is an authored seated item model within the normal geometry budget', async () => {
    const document = await new NodeIO().read(MODEL_PATH);
    const root = document.getRoot();
    const nodeNames = root.listNodes().map((node) => node.getName());
    const metadata = metadataJson.captainWhiskers;

    expect(metadata.triangles).toBeGreaterThan(1_000);
    expect(metadata.triangles).toBeLessThanOrEqual(3_000);
    expect(nodeNames).toEqual(expect.arrayContaining([
      'CaptainWhiskers',
      'Body',
      'WhiteBib',
      'WhiskersHead',
      'Collar',
      'CaptainTag',
      'WhiteTailTip',
    ]));
  });

  it('contains the required restrained idle animation', async () => {
    const document = await new NodeIO().read(MODEL_PATH);
    const animation = document.getRoot().listAnimations()
      .find((candidate) => candidate.getName() === 'CaptainWhiskersIdle');

    expect(animation).toBeDefined();
    expect(animation!.listChannels()).toHaveLength(4);
    expect(animation!.listChannels().map((channel) => channel.getTargetNode()?.getName()))
      .toEqual(expect.arrayContaining([
        'WhiskersBreath',
        'WhiskersHead',
        'WhiskersLeftEar',
        'WhiskersTailTip',
      ]));
    expect(metadataJson.captainWhiskers.animations).toEqual([{
      name: 'CaptainWhiskersIdle',
      duration: 6,
      channels: 4,
    }]);
  });
});
