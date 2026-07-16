import { Color, Vector2 } from 'three';

export const PrintShader = {
  name: 'RestrainedPrintShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uHighlightCompression: { value: 0 },
    uShadowLift: { value: 0 },
    uShadowTint: { value: new Color(0xffffff) },
    uShadowTintStrength: { value: 0 },
    uHighlightTint: { value: new Color(0xffffff) },
    uHighlightTintStrength: { value: 0 },
    uHalftoneStrength: { value: 0 },
    uHalftoneSizeCssPixels: { value: 5 },
    uVignetteStrength: { value: 0 },
    uChromaticAberrationCssPixels: { value: 0 },
    uGrainStrength: { value: 0 },
    uGrainTime: { value: 0 },
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
    uniform vec2 uResolution;
    uniform float uPixelRatio;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uHighlightCompression;
    uniform float uShadowLift;
    uniform vec3 uShadowTint;
    uniform float uShadowTintStrength;
    uniform vec3 uHighlightTint;
    uniform float uHighlightTintStrength;
    uniform float uHalftoneStrength;
    uniform float uHalftoneSizeCssPixels;
    uniform float uVignetteStrength;
    uniform float uChromaticAberrationCssPixels;
    uniform float uGrainStrength;
    uniform float uGrainTime;
    varying vec2 vUv;

    float printLuminance(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    float hash21(vec2 point) {
      vec3 p3 = fract(vec3(point.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float edgeDistance = length(centered * vec2(1.0, 1.25));
      float edgeMask = smoothstep(0.38, 0.72, edgeDistance);
      vec2 edgeDirection = normalize(centered + vec2(0.00001));
      vec2 colorOffset = edgeDirection
        * edgeMask
        * ((uChromaticAberrationCssPixels * uPixelRatio) / uResolution);

      vec3 color;
      color.r = texture2D(tDiffuse, vUv + colorOffset).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - colorOffset).b;

      color = color / (vec3(1.0) + color * uHighlightCompression);
      color = max((color - vec3(0.18)) * uContrast + vec3(0.18), vec3(0.0));
      float liftWeight = 1.0 - smoothstep(0.02, 0.38, printLuminance(color));
      color += vec3(uShadowLift * liftWeight);

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

      vec2 cssPixel = gl_FragCoord.xy / uPixelRatio;
      vec2 cell = fract(cssPixel / max(2.0, uHalftoneSizeCssPixels)) - 0.5;
      float dotInk = 1.0 - smoothstep(0.2, 0.42, length(cell));
      float midtone = smoothstep(0.1, 0.34, gray) * (1.0 - smoothstep(0.66, 0.92, gray));
      float centerRelief = mix(0.35, 1.0, smoothstep(0.12, 0.58, edgeDistance));
      color *= 1.0 - dotInk * midtone * centerRelief * uHalftoneStrength;

      float vignette = smoothstep(0.42, 0.78, edgeDistance);
      color *= 1.0 - vignette * uVignetteStrength;

      float grain = hash21(floor(cssPixel) + vec2(uGrainTime * 37.0, uGrainTime * 17.0)) - 0.5;
      color += vec3(grain * uGrainStrength);

      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
} as const;
