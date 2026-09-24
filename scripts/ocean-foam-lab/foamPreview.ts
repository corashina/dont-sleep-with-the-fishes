import type { DataTexture } from 'three';
import type { OceanRenderer } from '../../src/ocean/OceanRenderer';
import type { OceanFoamSimulation } from '../../src/ocean/OceanFoamSimulation';
import { OCEAN_FOAM_FUNCTIONS, PERSISTENT_OCEAN_FOAM_FUNCTIONS } from '../../src/ocean/oceanFoam';
export function installFoamPreview(ocean: OceanRenderer, simulation: OceanFoamSimulation, detail: DataTexture): void {
  if (ocean.material.fragmentShader.split(OCEAN_FOAM_FUNCTIONS).length !== 2)
    throw new Error('Expected one foam shader block');
  ocean.material.fragmentShader = ocean.material.fragmentShader.replace(OCEAN_FOAM_FUNCTIONS,
    PERSISTENT_OCEAN_FOAM_FUNCTIONS.replace('const vec2 foamVisibility = vec2(1.0);', 'vec2 foamVisibility = uFoamPreviewMask;'));
  Object.assign(ocean.material.uniforms, simulation.uniforms, { uFoamDetail: { value: detail } });
  ocean.material.needsUpdate = true;
}
