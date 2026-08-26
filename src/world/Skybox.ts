import {
  BackSide,
  Color,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import {
  cloneSkyPalette,
  lerpSkyPalette,
  skyPaletteFor,
  type SkyPalette,
  type SkyState,
} from './skyPalette';
import {
  SUN_DIRECTION,
  type CelestialDirection,
} from './celestialLight';

const TRANSITION_SECONDS = 1.5;
const MOON_DIRECTION: CelestialDirection = [0.46, 0.52, -0.72];

export interface SkyboxCelestialDirections {
  readonly sun: CelestialDirection;
  readonly moon: CelestialDirection;
}

export interface MoonFacePresentation {
  readonly reveal: number;
  readonly grin: number;
  readonly starScale: number;
  readonly dim: number;
  readonly scale: number;
}

export interface StarryNightSkyPresentation {
  readonly strength: number;
  readonly time: number;
  readonly constellationStrength: number;
}

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.min(1, Math.max(0, value))
  : 0;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : minimum;
const smoothstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const vertexShader = `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uZenithColor;
  uniform vec3 uUpperColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uStarColor;
  uniform vec3 uSunDirection;
  uniform vec3 uMoonDirection;
  uniform vec3 uTintColor;
  uniform sampler2D uMoonMap;
  uniform float uSunVisibility;
  uniform float uMoonVisibility;
  uniform float uStarVisibility;
  uniform float uHaze;
  uniform float uCloudCoverage;
  uniform float uCloudContrast;
  uniform float uHorizonBandStrength;
  uniform float uHorizonBandWidth;
  uniform float uExposure;
  uniform float uTintAmount;
  uniform float uMoonFaceReveal;
  uniform float uMoonGrin;
  uniform float uMoonStarScale;
  uniform float uMoonEventDim;
  uniform float uMoonScale;
  uniform float uStarryNightStrength;
  uniform float uStarryNightTime;
  uniform float uConstellationStrength;
  varying vec3 vSkyDirection;

  float hash31(vec3 value) {
    value = fract(value * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float hash21(vec2 value) {
    vec3 value3 = fract(vec3(value.xyx) * 0.1031);
    value3 += dot(value3, value3.yzx + 33.33);
    return fract((value3.x + value3.y) * value3.z);
  }

  float cloudValueNoise3D(vec3 position) {
    vec3 cell = floor(position);
    vec3 fractional = fract(position);
    vec3 blend = fractional * fractional * (3.0 - 2.0 * fractional);
    float c000 = hash31(cell);
    float c100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float c010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float c110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float c001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float c101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float c011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float c111 = hash31(cell + vec3(1.0));
    float lower = mix(mix(c000, c100, blend.x), mix(c010, c110, blend.x), blend.y);
    float upper = mix(mix(c001, c101, blend.x), mix(c011, c111, blend.x), blend.y);
    return mix(lower, upper, blend.z);
  }

  float cloudFbm(vec3 position) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      sum += cloudValueNoise3D(position) * amplitude;
      position = position * 2.03 + vec3(11.3, -8.2, 5.4);
      amplitude *= 0.5;
    }
    return sum / 0.9375;
  }

  vec2 cloudLayer(vec3 direction) {
    if (uCloudCoverage <= 0.0) return vec2(0.0);
    float visibleSky = smoothstep(-0.02, 0.14, direction.y);
    vec3 domain = direction * 3.1;
    vec3 warp = vec3(
      cloudValueNoise3D(domain * 0.62 + vec3(3.7, -2.1, 4.8)),
      cloudValueNoise3D(domain * 0.62 + vec3(-5.4, 6.2, -1.7)),
      cloudValueNoise3D(domain * 0.62 + vec3(8.1, 1.4, -6.6))
    ) - 0.5;
    float field = cloudFbm(domain + warp * 0.72);
    float threshold = 1.0 - uCloudCoverage;
    float mask = smoothstep(
      threshold - uCloudContrast,
      threshold + uCloudContrast,
      field
    ) * visibleSky;
    return vec2(mask, field);
  }

  vec3 starLayer(vec3 direction, float scale, float threshold) {
    vec3 grid = direction * scale;
    vec3 cell = floor(grid);
    vec3 local = fract(grid) - 0.5;
    vec3 offset = (vec3(
      hash31(cell + 1.7),
      hash31(cell + 4.1),
      hash31(cell + 8.3)
    ) - 0.5) * 0.52;
    float seed = hash31(cell);
    float exists = step(threshold, seed);
    float radius = mix(0.025, 0.075, hash31(cell + 12.8));
    float point = 1.0 - smoothstep(radius, radius * 2.4, length(local - offset));
    float brightness = mix(0.32, 1.0, hash31(cell + 19.4));
    vec3 warm = vec3(1.04, 0.98, 0.9);
    vec3 cool = vec3(0.88, 0.96, 1.08);
    vec3 tint = mix(warm, cool, hash31(cell + 25.6));
    return tint * point * exists * brightness;
  }

  vec3 starryNightLayer(vec3 direction, float scale, float threshold) {
    vec3 grid = direction * scale;
    vec3 cell = floor(grid);
    vec3 local = fract(grid) - 0.5;
    vec3 offset = (vec3(
      hash31(cell + 1.7),
      hash31(cell + 4.1),
      hash31(cell + 8.3)
    ) - 0.5) * 0.52;
    float seed = hash31(cell);
    float exists = step(threshold, seed);
    float radius = mix(0.040, 0.092, hash31(cell + 12.8));
    float distanceToStar = length(local - offset);
    float distanceToBoundary = 0.5 - max(
      max(abs(offset.x), abs(offset.y)),
      abs(offset.z)
    );
    float haloRadius = min(radius * 7.5, distanceToBoundary * 0.96);
    float core = 1.0 - smoothstep(radius, radius * 2.1, distanceToStar);
    float halo = 1.0 - smoothstep(radius * 1.8, haloRadius, distanceToStar);
    float speed = mix(0.42, 1.08, hash31(cell + 19.4));
    float phase = hash31(cell + 25.6) * 6.2831853;
    float twinkle = mix(0.68, 1.32,
      sin(uStarryNightTime * speed + phase) * 0.5 + 0.5);
    vec3 cool = mix(
      vec3(0.72, 0.86, 1.22),
      vec3(1.04, 1.08, 1.18),
      hash31(cell + 31.2)
    );
    float brightness = mix(0.65, 1.0, hash31(cell + 37.8));
    return cool * exists * brightness * twinkle * (core * 2.1 + halo * 0.52);
  }

  float constellationStar(vec2 point, vec2 position, float size, float phase) {
    vec2 starDelta = point - position;
    float distanceToStar = length(starDelta);
    float core = 1.0 - smoothstep(size * 0.18, size * 0.9, distanceToStar);
    float halo = 1.0 - smoothstep(size * 0.8, size * 3.2, distanceToStar);
    float horizontalRay = (1.0 - smoothstep(
      size * 0.1,
      size * 0.42,
      abs(starDelta.y)
    )) * (1.0 - smoothstep(size * 0.7, size * 4.6, abs(starDelta.x)));
    float verticalRay = (1.0 - smoothstep(
      size * 0.1,
      size * 0.42,
      abs(starDelta.x)
    )) * (1.0 - smoothstep(size * 0.7, size * 6.0, abs(starDelta.y)));
    float rays = max(horizontalRay, verticalRay);
    float twinkle = mix(0.9, 1.1,
      sin(uStarryNightTime * 0.58 + phase) * 0.5 + 0.5);
    return (core * 1.15 + halo * 0.08 + rays * 0.82) * twinkle;
  }

  vec3 orionLayer(vec3 direction) {
    vec3 center = normalize(vec3(0.52, 0.38, -1.0));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), center));
    vec3 up = normalize(cross(center, right));
    float facing = dot(direction, center);
    if (facing <= 0.0) return vec3(0.0);
    vec2 point = vec2(dot(direction, right), dot(direction, up)) / facing;

    vec2 meissa = vec2(0.0, 0.185);
    vec2 betelgeuse = vec2(-0.09, 0.085);
    vec2 bellatrix = vec2(0.082, 0.095);
    vec2 alnitak = vec2(-0.047, 0.006);
    vec2 alnilam = vec2(0.0, 0.0);
    vec2 mintaka = vec2(0.048, 0.009);
    vec2 saiph = vec2(-0.082, -0.145);
    vec2 rigel = vec2(0.09, -0.155);

    float stars = 0.0;
    stars += constellationStar(point, meissa, 0.0024, 0.3);
    stars += constellationStar(point, betelgeuse, 0.0032, 1.2);
    stars += constellationStar(point, bellatrix, 0.0028, 2.1);
    stars += constellationStar(point, alnitak, 0.0025, 2.8);
    stars += constellationStar(point, alnilam, 0.0028, 3.5);
    stars += constellationStar(point, mintaka, 0.0024, 4.0);
    stars += constellationStar(point, saiph, 0.0027, 4.8);
    stars += constellationStar(point, rigel, 0.0034, 5.6);

    vec3 starColor = vec3(0.84, 0.96, 1.24) * stars * 0.72;
    return starColor;
  }

  float eyeShape(vec2 uv, vec2 center, vec2 scale, float skew) {
    vec2 p = (uv - center) / scale;
    p.x += p.y * skew;
    return 1.0 - smoothstep(0.72, 1.0, dot(p, p));
  }

  float curvedFaceStroke(
    vec2 uv,
    vec2 center,
    vec2 scale,
    float skew,
    float upperHalf
  ) {
    vec2 p = (uv - center) / scale;
    p.x += p.y * skew;
    float ring = 1.0 - smoothstep(0.055, 0.115, abs(length(p) - 0.84));
    float halfMask = upperHalf > 0.5
      ? smoothstep(-0.08, 0.16, p.y)
      : smoothstep(-0.08, 0.16, -p.y);
    return ring * halfMask;
  }

  float referenceGrinShape(vec2 uv, float grin) {
    vec2 p = uv - vec2(0.505 + grin * 0.008, 0.27);
    p.y += p.x * 0.025;
    float normalizedX = abs(p.x) / mix(0.335, 0.39, grin);
    float grinWidth = 1.0 - smoothstep(0.93, 1.0, normalizedX);
    float edgeRise = pow(clamp(normalizedX, 0.0, 1.0), 2.4);
    float upperEdge = 0.025 + edgeRise * 0.17;
    float lowerEdge = -0.105 + edgeRise * 0.07
      + sin((p.x + 0.43) * 38.0) * 0.008;
    float aboveLower = smoothstep(lowerEdge - 0.008, lowerEdge + 0.008, p.y);
    float belowUpper = 1.0 - smoothstep(upperEdge - 0.008, upperEdge + 0.008, p.y);
    return grinWidth * aboveLower * belowUpper;
  }

  vec4 sampleMoon(
    vec3 direction,
    vec3 moonDirection,
    out float radialDistance,
    out vec2 moonUv
  ) {
    vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDirection));
    vec3 moonUp = normalize(cross(moonDirection, moonRight));
    float facing = dot(direction, moonDirection);
    vec2 tangent = vec2(
      dot(direction, moonRight),
      dot(direction, moonUp)
    ) / max(facing, 0.0001);
    float moonRadius = 0.027 * uMoonScale;
    moonUv = tangent / (moonRadius * 2.0) + 0.5;
    radialDistance = length(tangent) / moonRadius;
    float inside = step(0.0, facing)
      * step(abs(tangent.x), moonRadius)
      * step(abs(tangent.y), moonRadius);
    return texture2D(uMoonMap, moonUv) * inside;
  }

  void main() {
    vec3 direction = normalize(vSkyDirection);
    float elevation = max(direction.y, 0.0);
    float opticalPath = 1.0 / max(direction.y + 0.12, 0.12);
    float upperWeight = smoothstep(-0.025, 0.52, direction.y);
    float zenithWeight = pow(elevation, 0.58);
    vec3 color = mix(uHorizonColor, uUpperColor, upperWeight);
    color = mix(color, uZenithColor, zenithWeight);

    float pathHaze = clamp((opticalPath - 1.0) * 0.09, 0.0, 1.0);
    float horizonHaze = uHaze * pathHaze;
    color = mix(color, uHorizonColor, clamp(horizonHaze * 0.42, 0.0, 0.55));
    float horizonLift = exp(-abs(direction.y) * 28.0) * (0.03 + uHaze * 0.08);
    color += uHorizonColor * horizonLift;

    vec2 cloud = cloudLayer(direction);
    float clouds = cloud.x;
    float cloudLight = 1.0 - smoothstep(0.42, 0.86, cloud.y);
    vec3 cloudUnderside = mix(uUpperColor * 0.58, vec3(0.34, 0.40, 0.42), uHaze * 0.56);
    vec3 cloudTop = mix(vec3(0.86, 0.89, 0.88), vec3(0.66, 0.71, 0.71), uHaze);
    vec3 cloudColor = mix(cloudUnderside, cloudTop, cloudLight);
    cloudColor = mix(cloudColor, uHorizonColor, uHaze * 0.48);
    color = mix(color, cloudColor, clouds);

    float horizonBand = smoothstep(-0.005, 0.012, direction.y)
      * exp(-max(direction.y, 0.0) * uHorizonBandWidth)
      * uHorizonBandStrength;
    color = mix(color, vec3(1.0), clamp(horizonBand, 0.0, 1.0));

    vec3 sunDirection = normalize(uSunDirection);
    float sunSeparation = 1.0 - clamp(dot(direction, sunDirection), 0.0, 1.0);
    float sunDisc = 1.0 - smoothstep(0.00003, 0.00022, sunSeparation);
    float sunBloom = exp(-sunSeparation * 720.0);
    float sunHalo = exp(-sunSeparation * 44.0);
    float sunClarity = 1.0 - uHaze * 0.74;
    color += uSunColor * uSunVisibility * (
      sunDisc * sunClarity
      + sunBloom * mix(0.16, 0.28, sunClarity)
      + sunHalo * mix(0.035, 0.075, uHaze)
    );

    vec3 moonDirection = normalize(uMoonDirection);
    float moonRadialDistance;
    vec2 moonUv;
    vec4 moonSample = sampleMoon(
      direction,
      moonDirection,
      moonRadialDistance,
      moonUv
    );
    float moonClarity = 1.0 - uHaze * 0.72;
    float faceReveal = smoothstep(0.08, 0.28, uMoonFaceReveal);
    vec2 faceUv = moonUv;
    float leftBrow = curvedFaceStroke(
      faceUv,
      vec2(0.3, 0.7),
      vec2(0.17, 0.18),
      0.22,
      1.0
    );
    float rightBrow = curvedFaceStroke(
      faceUv,
      vec2(0.705, 0.7),
      vec2(0.17, 0.18),
      -0.22,
      1.0
    );
    float archedBrowShape = max(leftBrow, rightBrow);
    float leftEyeSocket = eyeShape(
      faceUv,
      vec2(0.305, 0.565),
      vec2(0.17, 0.125),
      0.82
    );
    leftEyeSocket = max(leftEyeSocket, eyeShape(
      faceUv,
      vec2(0.39, 0.535),
      vec2(0.085, 0.065),
      0.92
    ));
    float rightEyeSocket = eyeShape(
      faceUv,
      vec2(0.7, 0.565),
      vec2(0.17, 0.125),
      -0.82
    );
    rightEyeSocket = max(rightEyeSocket, eyeShape(
      faceUv,
      vec2(0.615, 0.535),
      vec2(0.085, 0.065),
      -0.92
    ));
    float slantedEyeSockets = max(leftEyeSocket, rightEyeSocket);
    float leftLowerLid = curvedFaceStroke(
      faceUv,
      vec2(0.31, 0.505),
      vec2(0.145, 0.065),
      0.08,
      0.0
    );
    float rightLowerLid = curvedFaceStroke(
      faceUv,
      vec2(0.695, 0.505),
      vec2(0.145, 0.065),
      -0.08,
      0.0
    );
    float lowerEyeArcs = max(leftLowerLid, rightLowerLid);
    float splitNose = max(
      eyeShape(faceUv, vec2(0.489, 0.43), vec2(0.032, 0.052), -0.45),
      eyeShape(faceUv, vec2(0.521, 0.43), vec2(0.032, 0.052), 0.45)
    );
    float wideJaggedGrin = referenceGrinShape(faceUv, uMoonGrin);
    float faceInk = clamp(
      max(
        max(archedBrowShape, slantedEyeSockets),
        max(max(lowerEyeArcs, splitNose), wideJaggedGrin)
      ) * faceReveal,
      0.0,
      1.0
    );
    vec3 moonDisc = mix(
      uMoonColor * moonSample.rgb,
      vec3(0.002, 0.003, 0.004),
      faceInk * 0.997
    );
    color += moonDisc
      * moonSample.a
      * uMoonVisibility
      * moonClarity;
    float moonHalo = exp(
      -moonRadialDistance * moonRadialDistance * 1.65
    )
      * (1.0 - moonSample.a)
      * uMoonVisibility
      * mix(0.025, 0.07, moonClarity);
    color += uMoonColor * moonHalo;
    float moonStarOcclusion = 1.0 - moonSample.a;

    float starHorizon = smoothstep(0.04, 0.24, direction.y);
    float starClarity = max(0.0, 1.0 - uHaze * 0.94);
    vec3 stars = starLayer(direction, 210.0, 0.9972)
      + starLayer(direction, 390.0, 0.9986) * 0.7;
    color += uStarColor
      * stars
      * uStarVisibility
      * starHorizon
      * starClarity
      * uMoonStarScale
      * moonStarOcclusion;

    if (uStarryNightStrength > 0.0) {
      vec3 starryNightStars = starryNightLayer(direction, 145.0, 0.9948)
        + starryNightLayer(direction, 285.0, 0.9975) * 0.72;
      color += starryNightStars
        * starHorizon
        * starClarity
        * uMoonStarScale
        * uStarryNightStrength
        * moonStarOcclusion;
    }
    if (uConstellationStrength > 0.0) {
      color += orionLayer(direction)
        * starClarity
        * uMoonStarScale
        * uConstellationStrength
        * moonStarOcclusion;
    }

    float atmosphericVariation = mix(0.992, 1.008,
      hash31(direction * 173.0));
    color *= atmosphericVariation;
    color *= uExposure;
    color = mix(color, uTintColor, clamp(uTintAmount, 0.0, 1.0));
    color *= 1.0 - uMoonEventDim;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor.rgb += dither;
  }
`;

export class Skybox {
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly current: SkyPalette;
  private readonly blendFrom: SkyPalette;
  private readonly target: SkyPalette;
  private blendKey: string;
  private blendElapsed = TRANSITION_SECONDS;
  private disposed = false;

  get palette(): Readonly<SkyPalette> { return this.current; }

  constructor(
    private readonly scene: Scene,
    initialState: SkyState,
    moonTexture: Texture,
    celestialDirections: SkyboxCelestialDirections = {
      sun: SUN_DIRECTION,
      moon: MOON_DIRECTION,
    },
  ) {
    this.current = skyPaletteFor(initialState);
    this.blendFrom = cloneSkyPalette(this.current);
    this.target = cloneSkyPalette(this.current);
    this.blendKey = `${initialState.weather}:${initialState.phase}`;
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uZenithColor: { value: this.current.zenithColor.clone() },
        uUpperColor: { value: this.current.upperColor.clone() },
        uHorizonColor: { value: this.current.horizonColor.clone() },
        uSunColor: { value: this.current.sunColor.clone() },
        uMoonColor: { value: this.current.moonColor.clone() },
        uMoonMap: { value: moonTexture },
        uStarColor: { value: this.current.starColor.clone() },
        uSunDirection: {
          value: new Vector3(...celestialDirections.sun).normalize(),
        },
        uMoonDirection: {
          value: new Vector3(...celestialDirections.moon).normalize(),
        },
        uTintColor: { value: new Color() },
        uSunVisibility: { value: this.current.sunVisibility },
        uMoonVisibility: { value: this.current.moonVisibility },
        uStarVisibility: { value: this.current.starVisibility },
        uHaze: { value: this.current.haze },
        uCloudCoverage: { value: this.current.cloudCoverage },
        uCloudContrast: { value: this.current.cloudContrast },
        uHorizonBandStrength: { value: this.current.horizonBandStrength },
        uHorizonBandWidth: { value: this.current.horizonBandWidth },
        uExposure: { value: this.current.exposure },
        uTintAmount: { value: 0 },
        uMoonFaceReveal: { value: 0 },
        uMoonGrin: { value: 0 },
        uMoonStarScale: { value: 1 },
        uMoonEventDim: { value: 0 },
        uMoonScale: { value: 1 },
        uStarryNightStrength: { value: 0 },
        uStarryNightTime: { value: 0 },
        uConstellationStrength: { value: 0 },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(80, 48, 24), this.material);
    this.mesh.name = 'procedural-skybox';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(delta: number, state: SkyState, cameraPosition: Vector3): Readonly<SkyPalette> {
    if (this.disposed) return this.current;
    const key = `${state.weather}:${state.phase}`;
    if (key !== this.blendKey) {
      this.blendKey = key;
      lerpSkyPalette(this.blendFrom, this.current, this.current, 0);
      this.blendElapsed = 0;
    }
    skyPaletteFor(state, this.target);
    this.blendElapsed = Math.min(
      TRANSITION_SECONDS,
      this.blendElapsed + Math.max(0, Number.isFinite(delta) ? delta : 0),
    );
    const alpha = smoothstep(this.blendElapsed / TRANSITION_SECONDS);
    lerpSkyPalette(this.current, this.blendFrom, this.target, alpha);
    this.mesh.position.copy(cameraPosition);
    this.uploadPalette();
    return this.current;
  }

  resetTransient(): void {
    if (this.disposed) return;
    const uniforms = this.material.uniforms;
    uniforms.uTintAmount!.value = 0;
    uniforms.uMoonFaceReveal!.value = 0;
    uniforms.uMoonGrin!.value = 0;
    uniforms.uMoonStarScale!.value = 1;
    uniforms.uMoonEventDim!.value = 0;
    uniforms.uMoonScale!.value = 1;
    uniforms.uStarryNightStrength!.value = 0;
    uniforms.uStarryNightTime!.value = 0;
    uniforms.uConstellationStrength!.value = 0;
  }

  setStarryNight(value: StarryNightSkyPresentation): void {
    if (this.disposed) return;
    const uniforms = this.material.uniforms;
    uniforms.uStarryNightStrength!.value = clamp01(value.strength);
    uniforms.uStarryNightTime!.value = Number.isFinite(value.time)
      ? Math.max(0, value.time)
      : 0;
    uniforms.uConstellationStrength!.value = clamp01(value.constellationStrength);
  }

  setMoonFace(value: MoonFacePresentation): void {
    if (this.disposed) return;
    const uniforms = this.material.uniforms;
    uniforms.uMoonFaceReveal!.value = clamp01(value.reveal);
    uniforms.uMoonGrin!.value = clamp01(value.grin);
    uniforms.uMoonStarScale!.value = clamp01(value.starScale);
    uniforms.uMoonEventDim!.value = clamp01(value.dim);
    uniforms.uMoonScale!.value = clamp(value.scale, 1, 5.5);
  }

  setTint(color: Color, amount: number): void {
    if (this.disposed) return;
    (this.material.uniforms.uTintColor!.value as Color).copy(color);
    this.material.uniforms.uTintAmount!.value = clamp01(amount);
  }

  dispose(): void {
    if (this.disposed) return;
    this.resetTransient();
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private uploadPalette(): void {
    const uniforms = this.material.uniforms;
    (uniforms.uZenithColor!.value as Color).copy(this.current.zenithColor);
    (uniforms.uUpperColor!.value as Color).copy(this.current.upperColor);
    (uniforms.uHorizonColor!.value as Color).copy(this.current.horizonColor);
    (uniforms.uSunColor!.value as Color).copy(this.current.sunColor);
    (uniforms.uMoonColor!.value as Color).copy(this.current.moonColor);
    (uniforms.uStarColor!.value as Color).copy(this.current.starColor);
    uniforms.uSunVisibility!.value = this.current.sunVisibility;
    uniforms.uMoonVisibility!.value = this.current.moonVisibility;
    uniforms.uStarVisibility!.value = this.current.starVisibility;
    uniforms.uHaze!.value = this.current.haze;
    uniforms.uCloudCoverage!.value = this.current.cloudCoverage;
    uniforms.uCloudContrast!.value = this.current.cloudContrast;
    uniforms.uHorizonBandStrength!.value = this.current.horizonBandStrength;
    uniforms.uHorizonBandWidth!.value = this.current.horizonBandWidth;
    uniforms.uExposure!.value = this.current.exposure;
  }
}
