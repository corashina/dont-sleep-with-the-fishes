/** High water optics. All colors and captured scene textures use linear light. */
export const OCEAN_OPTICS_UNIFORMS = /* glsl */ `
  #ifdef HIGH_QUALITY_WATER
  uniform sampler2D uWaterColor;
  uniform sampler2D uWaterDepth;
  uniform sampler2D uWaterReflection;
  uniform sampler2D uPersistentFoam;
  uniform mat4 uWaterReflectionMatrix;
  uniform mat4 uWaterInverseProjection;
  uniform mat4 uWaterViewMatrix;
  uniform vec4 uWaterViewport;
  uniform vec2 uFoamOrigin;
  uniform float uFoamExtent;
  uniform float uWaterReady;
  uniform float uVortexTangentStrength;
  uniform float uVortexPhase;
  #endif
`;

export const OCEAN_OPTICS_FUNCTIONS = /* glsl */ `
  #ifdef HIGH_QUALITY_WATER
  // Fade waves before their frequency exceeds the pixel sampling rate.
  float filteredRipple(float phase) {
    float footprint = fwidth(phase);
    return cos(phase) * (1.0 - smoothstep(1.0, 3.0, footprint));
  }

  vec2 opticalRippleSlope(vec2 p) {
    vec2 wind = vec2(0.83, 0.56);
    vec2 across = vec2(-0.56, 0.83);
    vec2 warp = p + windWarp(p) * 0.5;
    vec2 slope = wind * filteredRipple(dot(warp, wind) * 2.45 + uTime * 1.58) * 0.055;
    slope += across * filteredRipple(dot(warp, across) * 4.15 - uTime * 1.91) * 0.036;
    slope += vec2(0.24, -0.97) * filteredRipple(dot(warp, vec2(0.24, -0.97)) * 9.6 + uTime * 2.55) * 0.021;
    slope += vec2(-0.31, 0.95) * filteredRipple(dot(warp, vec2(-0.31, 0.95)) * 24.8 - uTime * 4.35) * 0.013;
    slope += across * filteredRipple(dot(warp, across) * 57.0 + uTime * 6.2) * 0.006;
    return slope * mix(0.62, 1.15, clamp((uAmplitudeScale - 0.65) / 0.8, 0.0, 1.0));
  }

  vec3 displacedWaterNormal(out float height, out float compression) {
    vec3 tangentX = vec3(1.0, 0.0, 0.0);
    vec3 tangentZ = vec3(0.0, 0.0, 1.0);
    vec2 fullDerivative = vec2(0.0);
    float geometryLod = smoothstep(55.0, 140.0, vViewDepth);
    for (int i = 0; i < 4; i++) {
      vec2 d = normalize(uDirections[i]);
      float k = 6.28318530718 / uParameters[i].y;
      float a = uParameters[i].x * uAmplitudeScale;
      float weight = mix(1.0, smoothstep(4.0, 11.0, uParameters[i].y), geometryLod);
      float phase = k * dot(d, vOceanPosition) + uParameters[i].z * uTime + uPhases[i];
      float vertical = a * k * cos(phase);
      float horizontal = uParameters[i].w * a * k * sin(phase) * weight;
      tangentX += vec3(-horizontal * d.x * d.x, vertical * d.x * weight, -horizontal * d.x * d.y);
      tangentZ += vec3(-horizontal * d.x * d.y, vertical * d.y * weight, -horizontal * d.y * d.y);
      fullDerivative += vertical * d;
    }
    vec2 waveDerivative;
    sampleSurfaceWave(vOceanPosition, height, waveDerivative);
    // The shared sample includes the vortex depression derivative.
    tangentX.y += waveDerivative.x - fullDerivative.x;
    tangentZ.y += waveDerivative.y - fullDerivative.y;
    vec2 vortexDelta = vOceanPosition - uVortexCenter;
    float radius = length(vortexDelta);
    if (radius > 0.0001 && radius < uVortexRadius && uVortexStrength > 0.0) {
      float t = 1.0 - radius / uVortexRadius;
      float envelope = t * t * (3.0 - 2.0 * t) * uVortexStrength;
      float envelopeDerivative = -6.0 * t * (1.0 - t) * uVortexStrength / uVortexRadius;
      float phase = uVortexPhase + radius * 0.65;
      float swirl = 0.78 + 0.22 * sin(phase);
      float swirlDerivative = 0.143 * cos(phase);
      float scale = uVortexTangentStrength * envelope * swirl / radius;
      float scaleDerivative = uVortexTangentStrength * (
        (envelopeDerivative * swirl + envelope * swirlDerivative) / radius
        - envelope * swirl / (radius * radius));
      vec2 gradient = scaleDerivative * vortexDelta / radius;
      tangentX.xz += vec2(-vortexDelta.y * gradient.x, scale + vortexDelta.x * gradient.x);
      tangentZ.xz += vec2(-scale - vortexDelta.y * gradient.y, vortexDelta.x * gradient.y);
    }
    compression = 1.0 - (tangentX.x * tangentZ.z - tangentX.z * tangentZ.x);
    vec3 n = normalize(cross(tangentZ, tangentX));
    vec2 ripple = opticalRippleSlope(vWorldPosition.xz);
    return normalize(n + vec3(-ripple.x, 0.0, -ripple.y));
  }

  vec3 waterViewPosition(vec2 uv, float depth) {
    vec4 p = uWaterInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  float waterHighlight(vec3 n, vec3 v, vec3 l, float roughness) {
    vec3 h = normalize(l + v);
    float nv = max(dot(n, v), 0.001);
    float nl = max(dot(n, l), 0.0);
    float nh = max(dot(n, h), 0.0);
    float vh = max(dot(v, h), 0.0);
    float alpha = roughness * roughness;
    float a2 = alpha * alpha;
    float denom = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / max(3.14159265 * denom * denom, 0.000001);
    float visibility = 0.5 / max(
      nl * sqrt(nv * nv * (1.0 - a2) + a2)
      + nv * sqrt(nl * nl * (1.0 - a2) + a2), 0.0001);
    float fresnel = 0.02037 + 0.97963 * pow(1.0 - vh, 5.0);
    return distribution * visibility * fresnel * nl;
  }

  float foamBubblePattern(vec2 p, float footprint) {
    // Resolve individual cells only where the camera can see them.
    if (footprint > 0.55) return 0.78;
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float nearest = 2.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 seed = cell + offset;
        vec2 center = vec2(hash21(seed), hash21(seed + vec2(17.3, 9.2)));
        vec2 delta = offset + center - local;
        nearest = min(nearest, dot(delta, delta));
      }
    }
    float bubbles = smoothstep(0.018, 0.11, nearest);
    return mix(bubbles, 0.78, smoothstep(0.18, 0.55, footprint));
  }

  vec3 shadeHighWater() {
    float height;
    float compression;
    vec3 n = displacedWaterNormal(height, compression);
    vec3 v = normalize(cameraPosition - vWorldPosition);
    vec3 l = normalize(uLightDirection);
    float nv = max(dot(n, v), 0.001);
    float nl = max(dot(n, l), 0.0);
    float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);
    vec3 normalDx = dFdx(n);
    vec3 normalDy = dFdy(n);
    float variance = dot(normalDx, normalDx) + dot(normalDy, normalDy);
    float roughness = clamp(sqrt(0.0144 + weather * 0.018 + min(variance, 0.12)), 0.12, 0.42);
    float fresnel = 0.02037 + 0.97963 * pow(1.0 - nv, 5.0);

    vec3 reflectionDirection = reflect(-v, n);
    vec3 reflection = mix(uHorizonColor, uSkyColor,
      smoothstep(0.0, 0.8, reflectionDirection.y));
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    vec3 scatter = uDeepColor * mix(0.16, 0.85, daylight)
      + uSkyColor * 0.035;
    float crest = smoothstep(0.0, 0.75, height) * max(compression, 0.0);
    float backLight = pow(max(dot(v, -l), 0.0), 4.0);
    scatter += uShallowColor * crest * backLight * daylight * 1.4;
    vec3 body = scatter;

    if (uWaterReady > 0.5) {
      vec2 screenUv = (gl_FragCoord.xy - uWaterViewport.xy) / uWaterViewport.zw;
      float surfaceDepth = -(uWaterViewMatrix * vec4(vWorldPosition, 1.0)).z;
      float baseDepth = texture2D(uWaterDepth, screenUv).r;
      vec3 behind = waterViewPosition(screenUv, baseDepth);
      float thickness = max(0.0, -behind.z - surfaceDepth);
      vec3 viewNormal = mat3(uWaterViewMatrix) * n;
      vec2 distortion = viewNormal.xy * min(thickness * 0.008, 0.035)
        / max(1.0, surfaceDepth * 0.045);
      vec2 refractedUv = clamp(screenUv + distortion, vec2(0.002), vec2(0.998));
      float refractedDepth = texture2D(uWaterDepth, refractedUv).r;
      vec3 refractedBehind = waterViewPosition(refractedUv, refractedDepth);
      // Foreground silhouettes must never bleed into the water refraction.
      if (-refractedBehind.z > surfaceDepth + 0.02) {
        behind = refractedBehind;
        baseDepth = refractedDepth;
      } else {
        refractedUv = screenUv;
      }
      float pathLength = max(0.0, -behind.z - surfaceDepth)
        * length(behind) / max(-behind.z, 0.01);
      pathLength = baseDepth > 0.99999 ? 80.0 : min(pathLength, 80.0);
      vec3 transmission = exp(-vec3(0.34, 0.095, 0.065) * pathLength);
      if (-behind.z > surfaceDepth + 0.02) {
        body = texture2D(uWaterColor, refractedUv).rgb * transmission
          + scatter * (1.0 - transmission);
      }

      vec4 projected = uWaterReflectionMatrix * vec4(vWorldPosition, 1.0);
      vec2 reflectedUv = projected.xy / max(projected.w, 0.001);
      reflectedUv += n.xz * 0.024 / max(1.0, vViewDepth * 0.025);
      vec2 edgeDistance = min(reflectedUv, vec2(1.0) - reflectedUv);
      float reflectionCoverage = smoothstep(0.0, 0.06, min(edgeDistance.x, edgeDistance.y))
        * step(0.001, projected.w);
      vec2 blur = vec2(0.001 + roughness * roughness * 0.009);
      vec2 safeUv = clamp(reflectedUv, vec2(0.015), vec2(0.985));
      vec3 sceneReflection = texture2D(uWaterReflection, safeUv).rgb * 0.4;
      sceneReflection += texture2D(uWaterReflection, safeUv + blur).rgb * 0.15;
      sceneReflection += texture2D(uWaterReflection, safeUv - blur).rgb * 0.15;
      sceneReflection += texture2D(uWaterReflection, safeUv + vec2(blur.x, -blur.y)).rgb * 0.15;
      sceneReflection += texture2D(uWaterReflection, safeUv + vec2(-blur.x, blur.y)).rgb * 0.15;
      reflection = mix(reflection, sceneReflection, reflectionCoverage);
    }

    vec3 color = mix(body, reflection, fresnel);
    color += uSunColor * waterHighlight(n, v, l, roughness) * daylight * 2.2;

    vec2 foamUv = (vWorldPosition.xz - uFoamOrigin) / uFoamExtent + 0.5;
    vec2 foamEdge = min(foamUv, vec2(1.0) - foamUv);
    float foamFade = smoothstep(0.0, 0.08, min(foamEdge.x, foamEdge.y));
    float density = texture2D(uPersistentFoam, clamp(foamUv, 0.0, 1.0)).r * foamFade;
    vec2 foamPosition = vWorldPosition.xz + vec2(0.83, 0.56) * uTime * 0.12;
    float erosion = valueNoise(foamPosition * 0.85) * 0.65
      + valueNoise(foamPosition * 3.1) * 0.35;
    float coverage = smoothstep(0.10 + erosion * 0.28, 0.26 + erosion * 0.42, density);
    vec2 cells = foamPosition * 16.0;
    float footprint = max(length(dFdx(cells)), length(dFdy(cells)));
    float bubbles = foamBubblePattern(cells, footprint);
    float foamDetail = mix(bubbles, 1.0, smoothstep(0.55, 0.95, density));
    float bubbleLight = mix(0.72, 1.0, foamDetail);
    vec3 foamLight = uSkyColor * 0.50 + uSunColor * daylight * (0.12 + nl * 0.52);
    vec3 foamColor = uFoamColor * foamLight * bubbleLight;
    color = mix(color, foamColor, coverage * mix(0.78, 1.0, foamDetail));
    return color;
  }
  #endif
`;
