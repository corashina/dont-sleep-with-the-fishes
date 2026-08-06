import type { Scene } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const SCENE_BINOCULAR_MASK = Symbol('scene-binocular-mask');

type BinocularMaskScene = Scene & {
  userData: {
    [SCENE_BINOCULAR_MASK]?: number;
  };
};

const BINOCULAR_MASK_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    maskStrength: { value: 0 },
    aspect: { value: 1 },
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
    uniform float maskStrength;
    uniform float aspect;
    varying vec2 vUv;

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      vec2 point = vUv * 2.0 - 1.0;
      point.x *= aspect;
      float leftLens = length(point - vec2(-0.58, 0.0));
      float rightLens = length(point - vec2(0.58, 0.0));
      float lensDistance = min(leftLens, rightLens);
      float frame = smoothstep(0.70, 0.735, lensDistance);
      sceneColor.rgb = mix(sceneColor.rgb, vec3(0.0), frame * maskStrength);
      gl_FragColor = sceneColor;
    }
  `,
};

function clampStrength(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value);
}

export function setSceneBinocularMaskStrength(scene: Scene, value: number): void {
  (scene as BinocularMaskScene).userData[SCENE_BINOCULAR_MASK] = clampStrength(value);
}

export function sceneBinocularMaskStrength(scene: Scene): number {
  return clampStrength(
    (scene as BinocularMaskScene).userData[SCENE_BINOCULAR_MASK] ?? 0,
  );
}

export class BinocularMaskPass extends ShaderPass {
  constructor() {
    super(BINOCULAR_MASK_SHADER);
    this.enabled = false;
  }

  setStrength(value: number): void {
    const strength = clampStrength(value);
    this.uniforms.maskStrength!.value = strength;
    this.enabled = strength > 0;
  }

  setSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return;
    this.uniforms.aspect!.value = Math.max(0.01, width / height);
  }
}
