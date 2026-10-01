import { Color, type MeshStandardMaterial } from 'three';
import type { MenuCaustics } from './MenuCaustics';

export interface MenuSurfaceDetailOptions {
  /** World units per noise cell. Smaller values give finer wear. */
  readonly cellSize: number;
  /** Strength of the noise relief that breaks up flat faces. */
  readonly bump: number;
  /** Amount of algae and silt that settles on upward faces. */
  readonly growth: number;
  /** Darkening close to the seabed, where silt stains everything. */
  readonly grime: number;
}

const DETAIL_NOISE = `
  float menuDetailHash(vec3 point) {
    point = fract(point * 0.3183099 + 0.1);
    point *= 17.0;
    return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
  }

  float menuDetailNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(
        mix(menuDetailHash(cell), menuDetailHash(cell + vec3(1.0, 0.0, 0.0)), local.x),
        mix(menuDetailHash(cell + vec3(0.0, 1.0, 0.0)), menuDetailHash(cell + vec3(1.0, 1.0, 0.0)), local.x),
        local.y
      ),
      mix(
        mix(menuDetailHash(cell + vec3(0.0, 0.0, 1.0)), menuDetailHash(cell + vec3(1.0, 0.0, 1.0)), local.x),
        mix(menuDetailHash(cell + vec3(0.0, 1.0, 1.0)), menuDetailHash(cell + vec3(1.0)), local.x),
        local.y
      ),
      local.z
    );
  }

  float menuDetailFbm(vec3 point) {
    return menuDetailNoise(point) * 0.55
      + menuDetailNoise(point * 2.07 + 11.3) * 0.3
      + menuDetailNoise(point * 4.31 - 5.7) * 0.15;
  }
`;

const GROWTH_COLOR = new Color(0x40624b);
const SILT_COLOR = new Color(0x8f9581);

// Adds world-space wear and caustic light to menu props without UVs or textures.
// The pattern stays fixed in the world, so batched pieces share one look.
export function applyMenuSurfaceDetail(
  material: MeshStandardMaterial,
  options: MenuSurfaceDetailOptions,
  caustics: MenuCaustics,
): void {
  const key = `menu:surface-detail:${options.cellSize}:${options.bump}:${options.growth}:${options.grime}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailScale = { value: 1 / options.cellSize };
    shader.uniforms.uDetailBump = { value: options.bump };
    shader.uniforms.uDetailGrowth = { value: options.growth };
    shader.uniforms.uDetailGrime = { value: options.grime };
    shader.uniforms.uDetailGrowthColor = { value: GROWTH_COLOR };
    shader.uniforms.uDetailSiltColor = { value: SILT_COLOR };

    shader.vertexShader = `
      varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
    ${shader.vertexShader}`.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 detailWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        detailWorldPosition = instanceMatrix * detailWorldPosition;
      #endif
      vDetailPosition = (modelMatrix * detailWorldPosition).xyz;
      vDetailNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    `);

    shader.fragmentShader = `
      uniform float uDetailScale;
      uniform float uDetailBump;
      uniform float uDetailGrowth;
      uniform float uDetailGrime;
      uniform vec3 uDetailGrowthColor;
      uniform vec3 uDetailSiltColor;
      varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
      ${DETAIL_NOISE}
    ${shader.fragmentShader}`;
    caustics.inject(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 detailPoint = vDetailPosition * uDetailScale;
        float detailHeight = menuDetailFbm(detailPoint);
        float detailFine = menuDetailNoise(detailPoint * 3.1 + 3.1);
        diffuseColor.rgb *= 0.82 + detailHeight * 0.3 + (detailFine - 0.5) * 0.06;
        float detailUp = smoothstep(0.3, 0.85, normalize(vDetailNormal).y);
        float detailPatches = smoothstep(0.4, 0.62, menuDetailFbm(detailPoint * 0.3 + 7.0));
        float detailGrowth = detailUp * detailPatches * uDetailGrowth;
        vec3 detailCover = mix(uDetailSiltColor, uDetailGrowthColor, smoothstep(0.35, 0.65, detailFine));
        diffuseColor.rgb = mix(diffuseColor.rgb, detailCover * (0.75 + detailHeight * 0.4), detailGrowth);
        float detailLow = 1.0 - smoothstep(-0.6, 1.6, vDetailPosition.y);
        diffuseColor.rgb *= 1.0 - detailLow * uDetailGrime * 0.4;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDetailSiltColor * 0.55, detailLow * uDetailGrime * 0.25);
        float detailCaustic = menuCaustic(vDetailPosition.xz) * smoothstep(0.0, 0.7, normalize(vDetailNormal).y);
      `)
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.2, 1.7, 1.6) * detailCaustic;
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (detailFine - 0.5) * 0.2 + detailGrowth * 0.15, 0.0, 1.0);
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
          float bumpHeight = detailHeight * uDetailBump;
          vec2 heightSlope = vec2(dFdx(bumpHeight), dFdy(bumpHeight));
          vec3 gradient = sign(determinant) * (heightSlope.x * rightX + heightSlope.y * rightY);
          normal = normalize(abs(determinant) * normal - gradient);
        }
      `);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}
