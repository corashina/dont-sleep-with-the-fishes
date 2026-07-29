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
  it('uses the lightweight Stripe model without viewer presentation nodes', async () => {
    const document = await new NodeIO().read(MODEL_PATH);
    const root = document.getRoot();
    const nodeNames = root.listNodes().map((node) => node.getName());
    const metadata = metadataJson.captainWhiskers;

    expect(metadata.triangles).toBe(1_960);
    expect(metadata.triangles).toBeLessThanOrEqual(3_000);
    expect(nodeNames).toEqual(expect.arrayContaining([
      'Sketchfab_model',
      'CatArmature',
      'Head_CatArmature',
      'StripeCat_LOD0_0',
    ]));
    expect(nodeNames).not.toContain('Camera');
    expect(nodeNames).not.toContain('Lamp');
  });

  it('contains the required restrained idle animation', async () => {
    const document = await new NodeIO().read(MODEL_PATH);
    const animation = document.getRoot().listAnimations()
      .find((candidate) => candidate.getName() === 'CaptainWhiskersIdle');

    expect(animation).toBeDefined();
    expect(animation!.listChannels()).toHaveLength(37);
    expect(animation!.listChannels().map((channel) => channel.getTargetNode()?.getName()))
      .toEqual(expect.arrayContaining([
        'Head_CatArmature',
        'SpineIK_CatArmature',
        'Tail1.003_CatArmature',
      ]));
    expect(metadataJson.captainWhiskers.animations).toEqual([{
      name: 'CaptainWhiskersIdle',
      duration: 4.5,
      channels: 37,
    }]);
  });
});
