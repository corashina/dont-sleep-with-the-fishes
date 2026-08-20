import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { VisualQuality } from './visualQuality';

export interface MenuAtmosphereSettings {
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  readonly gradeStrength: number;
  readonly vignetteStrength: number;
  readonly grainStrength: number;
}

export const MENU_ATMOSPHERE_QUALITY: Readonly<
  Record<VisualQuality, Readonly<MenuAtmosphereSettings>>
> = {
  low: {
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    gradeStrength: 0,
    vignetteStrength: 0,
    grainStrength: 0,
  },
  medium: {
    bloomStrength: 0.28,
    bloomRadius: 0.3,
    bloomThreshold: 0.72,
    gradeStrength: 0.7,
    vignetteStrength: 0.22,
    grainStrength: 0.012,
  },
  high: {
    bloomStrength: 0.42,
    bloomRadius: 0.44,
    bloomThreshold: 0.68,
    gradeStrength: 1,
    vignetteStrength: 0.32,
    grainStrength: 0.016,
  },
};

const MENU_ATMOSPHERE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    gradeStrength: { value: 0 },
    vignetteStrength: { value: 0 },
    grainStrength: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float gradeStrength;
    uniform float vignetteStrength;
    uniform float grainStrength;
    varying vec2 vUv;

    float noise(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      vec3 graded = sceneColor.rgb * vec3(0.92, 1.025, 1.065);
      float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      graded = mix(vec3(luma), graded, 1.08);
      graded = (graded - 0.5) * 1.075 + 0.5;
      sceneColor.rgb = mix(sceneColor.rgb, graded, gradeStrength);

      vec2 centered = (vUv - 0.5) * vec2(0.86, 1.0);
      float edge = smoothstep(0.12, 0.48, dot(centered, centered));
      sceneColor.rgb *= 1.0 - edge * vignetteStrength;

      float frame = floor(time * 12.0);
      float grain = noise(gl_FragCoord.xy + frame) - 0.5;
      sceneColor.rgb += grain * grainStrength;
      gl_FragColor = sceneColor;
    }
  `,
};

export class MenuAtmospherePass extends ShaderPass {
  constructor() {
    super(MENU_ATMOSPHERE_SHADER);
    this.enabled = false;
  }

  setProfile(active: boolean, quality: VisualQuality): void {
    const settings = MENU_ATMOSPHERE_QUALITY[quality];
    this.enabled = active && settings.gradeStrength > 0;
    this.uniforms.gradeStrength!.value = active ? settings.gradeStrength : 0;
    this.uniforms.vignetteStrength!.value = active
      ? settings.vignetteStrength
      : 0;
    this.uniforms.grainStrength!.value = active ? settings.grainStrength : 0;
  }

  setTime(value: number): void {
    this.uniforms.time!.value = Number.isFinite(value) ? value : 0;
  }
}
