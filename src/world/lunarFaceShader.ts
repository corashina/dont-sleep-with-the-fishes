// Sloping brow ridges and a clenched snarl keep the threat readable at sea distance.
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

  float lunarFaceRelief(vec2 facePoint, float moonTextureLuma) {
    vec2 wear = vec2(
      cloudValueNoise3D(vec3(facePoint * 13.0, 4.7)),
      cloudValueNoise3D(vec3(facePoint.yx * 17.0, 8.3))
    ) - 0.5;
    vec2 p = facePoint + wear * 0.025;

    float sockets = max(
      softReliefEllipse(p, vec2(-0.178, 0.12), vec2(0.134, 0.074), 0.48, 0.18),
      softReliefEllipse(p, vec2(0.177, 0.115), vec2(0.127, 0.079), -0.43, 0.18)
    ) * (1.0 - smoothstep(0.064, 0.083, p.y - abs(p.x) * 0.48));
    float brows = max(
      softReliefEllipse(p, vec2(-0.18, 0.223), vec2(0.171, 0.054), 0.48, 0.35),
      softReliefEllipse(p, vec2(0.18, 0.215), vec2(0.159, 0.058), -0.43, 0.35)
    );
    float browFurrow = max(
      softReliefEllipse(p, vec2(-0.016, 0.237), vec2(0.009, 0.06), -0.22, 0.4),
      softReliefEllipse(p, vec2(0.018, 0.25), vec2(0.007, 0.05), 0.27, 0.4)
    );
    float cheekbones = max(
      softReliefEllipse(p, vec2(-0.285, -0.055), vec2(0.055, 0.128), -0.48, 0.5),
      softReliefEllipse(p, vec2(0.282, -0.077), vec2(0.049, 0.119), 0.36, 0.5)
    );
    float hollowCheeks = max(
      softReliefEllipse(p, vec2(-0.245, -0.135), vec2(0.071, 0.118), -0.3, 0.6),
      softReliefEllipse(p, vec2(0.246, -0.15), vec2(0.062, 0.132), 0.29, 0.6)
    );
    float noseBridge = softReliefEllipse(
      p, vec2(-0.018, 0.018), vec2(0.03, 0.12), -0.08, 0.5
    );
    float noseCavity = softReliefEllipse(
      p, vec2(0.008, -0.07), vec2(0.031, 0.059), 0.12, 0.23
    );

    // The upper lip arches over clenched fangs; low corners remove the skull's grin.
    vec2 mouth = p;
    mouth.y += 0.215 + 0.8 * p.x * p.x + p.x * 0.045;
    float jawDepth = mix(0.073, 0.104, uMoonDread);
    float mouthDistance = length(mouth / vec2(0.303, jawDepth));
    float mouthCavity = 1.0 - smoothstep(0.84, 1.08, mouthDistance);
    float mouthRim = smoothstep(0.8, 1.0, mouthDistance)
      * (1.0 - smoothstep(1.0, 1.2, mouthDistance));

    // Unequal chipped teeth grow from both edges, with a dark gap between them.
    float toothIndex = floor((p.x + 0.3) / 0.074);
    float toothSeed = hash21(vec2(toothIndex, 7.3));
    float toothX = abs(fract((p.x + 0.3) / 0.074) - 0.5);
    float canine = 1.0 - smoothstep(0.025, 0.058, abs(abs(p.x) - 0.19));
    float toothLength = mix(0.043, 0.093, toothSeed) + canine * 0.05;
    float toothWidth = mix(0.33, 0.43, toothSeed)
      * mix(0.22, 1.0, smoothstep(jawDepth - toothLength, jawDepth, mouth.y));
    float upperTeeth = (1.0 - smoothstep(toothWidth - 0.07, toothWidth, toothX))
      * smoothstep(jawDepth - toothLength, jawDepth - toothLength + 0.017, mouth.y);
    float lowerWidth = mix(0.12, 0.39, 1.0 - smoothstep(-jawDepth, -jawDepth + toothLength * 0.6, mouth.y));
    float lowerTeeth = (1.0 - smoothstep(lowerWidth - 0.07, lowerWidth, abs(fract((p.x + 0.335) / 0.074) - 0.5)))
      * (1.0 - smoothstep(-jawDepth + toothLength * 0.52, -jawDepth + toothLength * 0.52 + 0.014, mouth.y));
    float teeth = max(upperTeeth, lowerTeeth) * mouthCavity
      * (1.0 - smoothstep(0.22, 0.28, abs(p.x)));

    // Eroded streaks tie the sockets to the cheek hollows.
    float fissureX = abs(p.x + 0.012) - (0.18 + (0.1 - p.y) * 0.13);
    float fissures = (1.0 - smoothstep(0.003, 0.014, abs(fissureX + wear.x * 0.016)))
      * smoothstep(-0.23, -0.13, p.y) * (1.0 - smoothstep(0.05, 0.14, p.y));
    float surfaceWear = mix(0.87, 1.07, cloudValueNoise3D(vec3(p * 29.0, 12.6)))
      * mix(0.94, 1.06, moonTextureLuma);
    return (
      brows * 0.38 + cheekbones * 0.2 + noseBridge * 0.18 + mouthRim * 0.16
      + teeth * 1.2 - sockets * 0.95 - hollowCheeks * 0.25 - browFurrow * 0.32
      - noseCavity * 0.57 - mouthCavity * 0.94 - fissures * 0.21
    ) * surfaceWear;
  }

  float lunarFaceStare(vec2 p) {
    float eyes = max(
      softReliefEllipse(p, vec2(-0.174, 0.123), vec2(0.048, 0.015), 0.48, 0.2),
      softReliefEllipse(p, vec2(0.173, 0.119), vec2(0.043, 0.014), -0.43, 0.2)
    );
    float pupils = max(
      softReliefEllipse(p, vec2(-0.164, 0.119), vec2(0.006, 0.019), 0.0, 0.2),
      softReliefEllipse(p, vec2(0.163, 0.115), vec2(0.006, 0.018), 0.0, 0.2)
    );
    return eyes * (1.0 - pupils);
  }
`;
