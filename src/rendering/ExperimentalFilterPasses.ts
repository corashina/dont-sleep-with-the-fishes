import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BleachBypassShader } from 'three/addons/shaders/BleachBypassShader.js';
import { FilmShader } from 'three/addons/shaders/FilmShader.js';
import { SepiaShader } from 'three/addons/shaders/SepiaShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import type { PostProcessingFilterState } from './postProcessingFilters';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function createColorPass(body: string): ShaderPass {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
    vertexShader,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        ${body}
        gl_FragColor = color;
      }
    `,
  });
}

/** Display-space filters run after tone mapping. Disabled passes do no render work. */
export class ExperimentalFilterPasses {
  private readonly sea = createColorPass(`
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = mix(vec3(0.78, 1.02, 1.12), vec3(1.09, 1.015, 0.89), smoothstep(0.2, 0.8, luma));
    color.rgb = mix(color.rgb, color.rgb * tint, strength);
  `);
  private readonly bleach = new ShaderPass(BleachBypassShader);
  private readonly sepia = new ShaderPass(SepiaShader);
  private readonly posterization = createColorPass(`
    float levels = mix(24.0, 5.0, strength);
    vec3 bands = floor(color.rgb * levels + 0.5) / levels;
    color.rgb = mix(color.rgb, bands, strength);
  `);
  private readonly chromatic = createColorPass(`
    vec2 radial = vUv - 0.5;
    vec2 offset = radial * dot(radial, radial) * strength * 0.018;
    color.r = texture2D(tDiffuse, clamp(vUv + offset, 0.0, 1.0)).r;
    color.b = texture2D(tDiffuse, clamp(vUv - offset, 0.0, 1.0)).b;
  `);
  private readonly vignette = new ShaderPass(VignetteShader);
  private readonly grain = new ShaderPass(FilmShader);

  readonly passes = [
    this.sea, this.bleach, this.sepia, this.posterization,
    this.chromatic, this.vignette, this.grain,
  ] as const;

  constructor() {
    for (const pass of this.passes) pass.enabled = false;
    this.vignette.uniforms.darkness!.value = 1;
    this.grain.uniforms.grayscale!.value = false;
  }

  setState(state: PostProcessingFilterState): void {
    this.configure(this.sea, state.sea, 'strength', state.sea.strength);
    this.configure(this.bleach, state.bleach, 'opacity', state.bleach.strength);
    this.configure(this.sepia, state.sepia, 'amount', state.sepia.strength);
    this.configure(this.posterization, state.posterization, 'strength', state.posterization.strength);
    this.configure(this.chromatic, state.chromatic, 'strength', state.chromatic.strength);
    this.configure(this.vignette, state.vignette, 'offset', Math.sqrt(state.vignette.strength * 1.6));
    this.configure(this.grain, state.grain, 'intensity', state.grain.strength * 0.18);
  }

  setTime(seconds: number): void {
    if (this.grain.enabled) this.grain.uniforms.time!.value = Math.floor(seconds * 24) / 24;
  }

  dispose(): void {
    for (const pass of this.passes) pass.dispose();
  }

  private configure(
    pass: ShaderPass,
    setting: PostProcessingFilterState['sea'],
    uniform: string,
    value: number,
  ): void {
    pass.enabled = setting.enabled && setting.strength > 0;
    pass.uniforms[uniform]!.value = value;
  }
}
