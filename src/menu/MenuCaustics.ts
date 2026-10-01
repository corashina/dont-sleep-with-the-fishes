import type { WebGLProgramParametersWithUniforms } from 'three';

/** Shared time and strength for the caustic light on the sand, wreck, and rocks. */
export class MenuCaustics {
  readonly time = { value: 0 };
  readonly strength = { value: 0.86 };

  /** Adds the uniforms and the `menuCaustic(worldXZ)` function to a fragment shader. */
  inject(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uCausticTime = this.time;
    shader.uniforms.uCausticStrength = this.strength;
    shader.fragmentShader = CAUSTIC_GLSL + shader.fragmentShader;
  }
}

// Light focused by the surface waves forms a moving net on everything that faces up.
// Two drifting layers at different scales keep the net from looking tiled.
const CAUSTIC_GLSL = `
  uniform float uCausticTime;
  uniform float uCausticStrength;

  float menuCausticLayer(vec2 point, float time) {
    vec2 warped = point;
    float light = 1.0;
    for (int index = 0; index < 4; index += 1) {
      float phase = time * (1.0 - 3.5 / float(index + 1));
      warped = point + vec2(
        cos(phase - warped.x) + sin(phase + warped.y),
        sin(phase - warped.y) + cos(phase + warped.x)
      );
      light += 1.0 / length(vec2(
        point.x / (sin(warped.x + phase) / 0.005),
        point.y / (cos(warped.y + phase) / 0.005)
      ));
    }
    light = 1.17 - pow(light * 0.25, 1.4);
    return pow(abs(light), 8.0);
  }

  float menuCaustic(vec2 worldPoint) {
    vec2 point = worldPoint * 1.5;
    float fade = 1.0 - smoothstep(0.15, 0.6, length(fwidth(point)));
    if (fade <= 0.0) return 0.0;
    float time = uCausticTime * 0.32;
    float first = menuCausticLayer(point - 250.0, time);
    float second = menuCausticLayer(point * 0.71 - 246.0, time * 0.8 + 3.0);
    return clamp(first * 0.75 + second * 0.45, 0.0, 1.4) * fade * uCausticStrength;
  }
`;
