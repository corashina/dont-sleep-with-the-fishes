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
    map: sand.near,
  });
  material.name = 'menu:seabed-material';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMenuMiddleSand = { value: sand.middle };
    shader.uniforms.uMenuFarSand = { value: sand.far };
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
uniform sampler2D uMenuMiddleSand;
uniform sampler2D uMenuFarSand;
varying float vMenuWorldZ;`,
      )
      .replace(
        MENU_SAND_FRAGMENT_MARKER,
        `#ifdef USE_MAP
vec4 nearSand = texture2D(map, vMapUv);
vec4 middleSand = texture2D(uMenuMiddleSand, vMapUv);
vec4 farSand = texture2D(uMenuFarSand, vMapUv);
float menuDepth = -vMenuWorldZ;
float nearToMiddle = smoothstep(8.0, 14.0, menuDepth);
float middleToFar = smoothstep(25.0, 32.0, menuDepth);
vec3 menuSandColor = mix(nearSand.rgb, middleSand.rgb, nearToMiddle);
menuSandColor = mix(menuSandColor, farSand.rgb, middleToFar);
diffuseColor.rgb *= mix(vec3(1.0), menuSandColor, 0.35);
diffuseColor.a *= nearSand.a;
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'menu-seabed-three-sand-zones-v1';
  return material;
}
