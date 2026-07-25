import {
  createRuntimeModelSpec,
  type RuntimeModelSpec,
} from './itemModelManifest';

export const PRACTICAL_LIGHT_MODEL_IDS = ['lantern', 'ceilingLight'] as const;
export type PracticalLightModelId = typeof PRACTICAL_LIGHT_MODEL_IDS[number];

export const PRACTICAL_LIGHT_MODEL_SPECS: Readonly<
  Record<PracticalLightModelId, RuntimeModelSpec>
> = Object.freeze({
  lantern: createRuntimeModelSpec(
    'lantern',
    {
      targetLongestDimension: 0.48,
      rotation: [0, 0, 0],
      offset: [0, 0.24, 0],
    },
  ),
  ceilingLight: createRuntimeModelSpec(
    'ceilingLight',
    {
      targetLongestDimension: 0.52,
      rotation: [0, 0, 0],
      offset: [0, -0.26, 0],
    },
  ),
});
