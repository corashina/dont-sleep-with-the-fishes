import { Color } from 'three';

export const PrintShader = {
  name: 'RestrainedPrintShader',
  uniforms: {
    tDiffuse: { value: null },
    uPixelRatio: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uHighlightCompression: { value: 0 },
    uShadowLift: { value: 0 },
    uShadowTint: { value: new Color(0xffffff) },
    uShadowTintStrength: { value: 0 },
    uHighlightTint: { value: new Color(0xffffff) },
    uHighlightTintStrength: { value: 0 },
    uPosterizationLevels: { value: 40 },
    uHalftoneStrength: { value: 0 },
    uHalftoneSizeCssPixels: { value: 5 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uPixelRatio;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uHighlightCompression;
    uniform float uShadowLift;
    uniform vec3 uShadowTint;
    uniform float uShadowTintStrength;
    uniform vec3 uHighlightTint;
    uniform float uHighlightTintStrength;
    uniform float uPosterizationLevels;
    uniform float uHalftoneStrength;
    uniform float uHalftoneSizeCssPixels;
    varying vec2 vUv;

    float printLuminance(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      color = color / (vec3(1.0) + color * uHighlightCompression);
      color = max((color - vec3(0.18)) * uContrast + vec3(0.18), vec3(0.0));
      float liftWeight = 1.0 - smoothstep(0.02, 0.38, printLuminance(color));
      vec3 openedShadows = sqrt(max(color, vec3(0.0)));
      color = mix(color, openedShadows, uShadowLift * liftWeight);

      float gray = printLuminance(color);
      color = mix(vec3(gray), color, uSaturation);
      float shadowWeight = 1.0 - smoothstep(0.12, 0.52, gray);
      float highlightWeight = smoothstep(0.38, 0.9, gray);
      color = mix(
        color,
        color * (vec3(0.65) + uShadowTint),
        shadowWeight * uShadowTintStrength
      );
      color = mix(
        color,
        color * (vec3(0.65) + uHighlightTint),
        highlightWeight * uHighlightTintStrength
      );

      float levels = max(32.0, uPosterizationLevels);
      color = floor(color * levels + 0.5) / levels;

      vec2 cssPixel = gl_FragCoord.xy / uPixelRatio;
      vec2 cell = fract(cssPixel / max(2.0, uHalftoneSizeCssPixels)) - 0.5;
      float dotInk = 1.0 - smoothstep(0.2, 0.42, length(cell));
      float midtone = smoothstep(0.1, 0.34, gray) * (1.0 - smoothstep(0.66, 0.92, gray));
      color *= 1.0 - dotInk * midtone * uHalftoneStrength;

      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
} as const;
