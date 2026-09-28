// A calm, too-wide grin under dead eyes reads as a person, not a mask, at sea distance.
export const lunarFaceShader = `
  float softReliefEllipse(
    vec2 point, vec2 center, vec2 radius, float angle, float softness
  ) {
    vec2 offset = point - center;
    float c = cos(angle);
    float s = sin(angle);
    vec2 rotated = vec2(offset.x * c - offset.y * s, offset.x * s + offset.y * c);
    return 1.0 - smoothstep(1.0 - softness, 1.0 + softness, length(rotated / radius));
  }

  // The grin curve rises to the cheeks, far past where a human mouth ends.
  float lunarGrinCenter(float x) {
    return -0.2 + 1.35 * x * x;
  }

  float lunarFaceRelief(vec2 facePoint, float moonTextureLuma) {
    vec2 wear = vec2(
      cloudValueNoise3D(vec3(facePoint * 13.0, 4.7)),
      cloudValueNoise3D(vec3(facePoint.yx * 17.0, 8.3))
    ) - 0.5;
    vec2 p = facePoint + wear * 0.02;

    // Unequal sockets: the left one sags lower and wider.
    float sockets = max(
      softReliefEllipse(p, vec2(-0.172, 0.128), vec2(0.118, 0.092), -0.12, 0.3),
      softReliefEllipse(p, vec2(0.165, 0.14), vec2(0.105, 0.082), 0.08, 0.3)
    );
    float lids = max(
      softReliefEllipse(p, vec2(-0.172, 0.2), vec2(0.13, 0.034), -0.1, 0.5),
      softReliefEllipse(p, vec2(0.165, 0.206), vec2(0.116, 0.03), 0.1, 0.5)
    );
    // Raised cheeks push up under the eyes, as in a real smile.
    float cheeks = max(
      softReliefEllipse(p, vec2(-0.21, -0.02), vec2(0.12, 0.075), 0.35, 0.7),
      softReliefEllipse(p, vec2(0.205, -0.01), vec2(0.115, 0.072), -0.35, 0.7)
    );
    float nostrils = max(
      softReliefEllipse(p, vec2(-0.022, -0.055), vec2(0.007, 0.026), 0.45, 0.35),
      softReliefEllipse(p, vec2(0.02, -0.053), vec2(0.006, 0.024), -0.45, 0.35)
    );
    float noseTip = softReliefEllipse(p, vec2(0.0, -0.025), vec2(0.045, 0.05), 0.0, 0.7);

    // Dark stains run down from the lower lids and thin toward the grin.
    float stainWander = cloudValueNoise3D(vec3(p.y * 11.0, p.x * 2.0, 6.1)) - 0.5;
    float stainX = min(
      abs(p.x + 0.19 + stainWander * 0.06),
      abs(p.x - 0.142 + stainWander * 0.06)
    );
    float stainWidth = mix(0.003, 0.011, smoothstep(-0.16, 0.06, p.y));
    float stains = (1.0 - smoothstep(stainWidth, stainWidth + 0.008, stainX))
      * smoothstep(-0.17, 0.02, p.y) * (1.0 - smoothstep(0.03, 0.07, p.y));

    // The lips part further as dread grows.
    float grinReach = 0.36;
    float grinSlope = 2.0 * 1.35 * p.x;
    float grinOffset = (p.y - lunarGrinCenter(p.x)) / sqrt(1.0 + grinSlope * grinSlope);
    float grinSpan = max(0.0, 1.0 - pow(abs(p.x) / grinReach, 2.0));
    float grinOpening = mix(0.022, 0.05, uMoonDread) * pow(grinSpan, 0.6);
    float mouthCavity = (1.0 - smoothstep(grinOpening - 0.005, grinOpening + 0.003, abs(grinOffset)))
      * step(abs(p.x), grinReach);
    float lips = (1.0 - smoothstep(0.004, 0.018, abs(abs(grinOffset) - grinOpening - 0.012)))
      * grinSpan;

    // Many narrow, pointed teeth fill the grin to its corners.
    float toothCell = (p.x + 0.4) / 0.03;
    float toothSeed = hash21(vec2(floor(toothCell), 3.1));
    float toothX = abs(fract(toothCell) - 0.5);
    float upperTip = clamp(
      (grinOpening - grinOffset) / (grinOpening * mix(0.95, 1.25, toothSeed)), 0.0, 1.0
    );
    float lowerTip = clamp(
      (grinOffset + grinOpening) / (grinOpening * mix(0.7, 0.95, 1.0 - toothSeed)), 0.0, 1.0
    );
    float upperTeeth = (1.0 - smoothstep(0.0, 0.08, toothX - mix(0.4, 0.04, upperTip)))
      * (1.0 - step(1.0, upperTip));
    float lowerTeeth = (1.0 - smoothstep(0.0, 0.08, toothX - mix(0.38, 0.04, lowerTip)))
      * (1.0 - step(1.0, lowerTip));
    float teeth = max(upperTeeth, lowerTeeth) * mouthCavity;

    float chin = softReliefEllipse(p, vec2(0.0, -0.33), vec2(0.13, 0.05), 0.0, 0.8);
    float surfaceWear = mix(0.87, 1.07, cloudValueNoise3D(vec3(p * 29.0, 12.6)))
      * mix(0.94, 1.06, moonTextureLuma);
    return (
      lids * 0.3 + cheeks * 0.34 + noseTip * 0.16 + lips * 0.22 + chin * 0.12
      + teeth * 1.05 - sockets * 1.1 - nostrils * 0.7
      - stains * 0.28 - mouthCavity * 1.05
    ) * surfaceWear;
  }

  // Small pale irises drift, then settle on the viewer.
  float lunarFaceStare(vec2 p) {
    vec2 drift = vec2(sin(uStarTime * 0.23), sin(uStarTime * 0.17 + 1.3))
      * vec2(0.012, 0.006) * (1.0 - uMoonDread);
    float irises = max(
      softReliefEllipse(p, vec2(-0.166, 0.118) + drift, vec2(0.015, 0.015), 0.0, 0.25),
      softReliefEllipse(p, vec2(0.16, 0.13) + drift, vec2(0.013, 0.013), 0.0, 0.25)
    );
    float pupils = max(
      softReliefEllipse(p, vec2(-0.166, 0.118) + drift, vec2(0.0035, 0.0035), 0.0, 0.3),
      softReliefEllipse(p, vec2(0.16, 0.13) + drift, vec2(0.003, 0.003), 0.0, 0.3)
    );
    return irises * (1.0 - pupils);
  }
`;
