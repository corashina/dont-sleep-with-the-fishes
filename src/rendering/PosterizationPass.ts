import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DEFAULT_POSTERIZATION, type PosterizationSetting } from './posterization';

/** Quantize display colors after tone mapping. */
export class PosterizationPass extends ShaderPass {
  constructor() {
    super({
      uniforms: { tDiffuse: { value: null }, strength: { value: DEFAULT_POSTERIZATION.strength } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float levels = mix(24.0, 5.0, strength);
          vec3 bands = floor(color.rgb * levels + 0.5) / levels;
          color.rgb = mix(color.rgb, bands, strength);
          gl_FragColor = color;
        }
      `,
    });
    this.setState(DEFAULT_POSTERIZATION);
  }

  setState(setting: PosterizationSetting): void {
    this.enabled = setting.enabled && setting.strength > 0;
    this.uniforms.strength!.value = setting.strength;
  }
}
