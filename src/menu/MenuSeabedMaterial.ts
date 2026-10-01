import { MeshStandardMaterial } from 'three';
import type { MenuCaustics } from './MenuCaustics';
import type { MenuSandAssets } from './MenuSandAssets';

const SAND_NOISE = `
  float sandHash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float sandNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(sandHash(cell), sandHash(cell + vec2(1.0, 0.0)), local.x),
      mix(sandHash(cell + vec2(0.0, 1.0)), sandHash(cell + vec2(1.0)), local.x),
      local.y
    );
  }
`;

// Current-built ripples, grain, and silt patches give the sand real relief.
export function createMenuSeabedMaterial(
  sand: MenuSandAssets,
  caustics: MenuCaustics,
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
    shader.fragmentShader = 'varying vec3 vSandPosition;\n' + SAND_NOISE + shader.fragmentShader;
    caustics.inject(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec2 sandPoint = vSandPosition.xz;
        float sandWarp = sandNoise(sandPoint * 0.35) * 2.6 + sandNoise(sandPoint * 1.1) * 0.6;
        float ripplePhase = sandPoint.y * 6.2 + sandPoint.x * 1.4 + sandWarp * 2.4;
        float rippleFade = 1.0 - smoothstep(0.6, 2.4, fwidth(ripplePhase));
        float rippleWave = sin(ripplePhase);
        // Ripples have a steep lee side and a long, soft stoss side.
        float ripple = (rippleWave + 0.35 * sin(ripplePhase * 2.0 + 0.8)) * rippleFade;
        float rippleStrength = mix(0.35, 1.0, sandNoise(sandPoint * 0.18 + 4.0));
        float grain = sandNoise(sandPoint * 38.0) * (1.0 - smoothstep(0.2, 1.0, fwidth(sandPoint.x * 38.0)));
        float sediment = sin(sandPoint.x * 0.7 + sin(sandPoint.y * 0.41))
          * cos(sandPoint.y * 0.58 - sandPoint.x * 0.22);
        float silt = smoothstep(0.1, 0.65, sediment)
          * (1.0 - smoothstep(-0.55, -0.12, vSandPosition.y));
        float patches = smoothstep(0.35, 0.75, sandNoise(sandPoint * 0.09 + 2.0));
        vec3 sandShade = vec3(1.08 + ripple * rippleStrength * 0.07 + (grain - 0.5) * 0.08);
        sandShade *= mix(1.0, 0.86, patches * 0.6);
        diffuseColor.rgb *= mix(sandShade, vec3(0.62, 0.70, 0.65), silt * 0.55);
        float sandHeight = ripple * rippleStrength * 0.035 + grain * 0.006;
        // Ripple crests focus a little more of the caustic light.
        float sandCaustic = menuCaustic(sandPoint) * (0.8 + ripple * rippleStrength * 0.25);
      `)
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.6, 2.3, 2.1) * sandCaustic;
      `)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        {
          vec3 surfacePosition = -vViewPosition;
          vec3 sigmaX = dFdx(surfacePosition);
          vec3 sigmaY = dFdy(surfacePosition);
          vec3 rightX = cross(sigmaY, normal);
          vec3 rightY = cross(normal, sigmaX);
          float determinant = dot(sigmaX, rightX) * faceDirection;
          vec2 heightSlope = vec2(dFdx(sandHeight), dFdy(sandHeight));
          vec3 gradient = sign(determinant) * (heightSlope.x * rightX + heightSlope.y * rightY);
          normal = normalize(abs(determinant) * normal - gradient);
        }
      `);
  };
  material.customProgramCacheKey = () => 'menu:rippled-sand';
  return material;
}
