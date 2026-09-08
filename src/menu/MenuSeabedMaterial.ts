import { MeshStandardMaterial } from 'three';
import type { MenuSandAssets } from './MenuSandAssets';

export function createMenuSeabedMaterial(
  sand: MenuSandAssets,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    map: sand.smooth,
  });
  material.name = 'menu:seabed-material';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vSandPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSandPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
    );
    shader.fragmentShader = 'varying vec3 vSandPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 sandPoint = vSandPosition.xz;
      float ripplePhase = sandPoint.y * 15.0 + sin(sandPoint.x * 1.2) * 1.3;
      float rippleVisibility = 1.0 - smoothstep(0.4, 2.0, fwidth(ripplePhase));
      float ripple = sin(ripplePhase) * 0.045 * rippleVisibility;
      float sediment = sin(sandPoint.x * 0.7 + sin(sandPoint.y * 0.41))
        * cos(sandPoint.y * 0.58 - sandPoint.x * 0.22);
      float silt = smoothstep(0.1, 0.65, sediment)
        * (1.0 - smoothstep(-0.55, -0.12, vSandPosition.y));
      diffuseColor.rgb *= mix(vec3(1.12 + ripple), vec3(0.62, 0.70, 0.65), silt * 0.55);
    `);
  };
  material.customProgramCacheKey = () => 'menu:sediment-sand';
  return material;
}
