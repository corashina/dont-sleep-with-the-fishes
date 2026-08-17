import { MeshStandardMaterial } from 'three';
import type { MenuSandAssets } from './MenuSandAssets';

const MENU_SAND_VERTEX_MARKER = '#include <worldpos_vertex>';
const MENU_SAND_FRAGMENT_MARKER = '#include <map_fragment>';

export function createMenuSeabedMaterial(
  sand: MenuSandAssets,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0x756d54,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    map: sand.smooth,
  });
  material.name = 'menu:seabed-material';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMenuCoarseSand = { value: sand.coarse };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vMenuWorldZ;',
      )
      .replace(
        MENU_SAND_VERTEX_MARKER,
        `${MENU_SAND_VERTEX_MARKER}
vMenuWorldZ = (modelMatrix * vec4(transformed, 1.0)).z;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMenuCoarseSand;
varying float vMenuWorldZ;`,
      )
      .replace(
        MENU_SAND_FRAGMENT_MARKER,
        `#ifdef USE_MAP
vec4 smoothSand = texture2D(map, vMapUv);
vec4 coarseSand = texture2D(uMenuCoarseSand, vMapUv);
float menuDepth = -vMenuWorldZ;
float coarseBlend = smoothstep(25.0, 32.0, menuDepth);
vec3 menuSandColor = mix(smoothSand.rgb, coarseSand.rgb, coarseBlend);
diffuseColor.rgb *= mix(vec3(1.0), menuSandColor, 0.35);
diffuseColor.a *= smoothSand.a;
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'menu-seabed-two-terrain-zones-v2';
  return material;
}
