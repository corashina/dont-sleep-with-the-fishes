// A wave-conforming underwater creature. All limb motion stays on the GPU.
export const UNDER_US_MONSTER_FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float time;
  varying vec2 vUv;
  varying vec2 vWaterPosition;

  float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    return length(p - a - ab * t);
  }

  vec2 limbPoint(float limb, float t) {
    float angle = limb * 0.785398 + 0.22;
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 side = vec2(-direction.y, direction.x);
    float reach = 0.86 + 0.14 * sin(limb * 2.3);
    float curl = sin(t * 5.5 - time * 1.15 + limb * 1.7) * 0.15 * t;
    curl += sin(t * 9.0 - time * 0.8 + limb) * 0.05 * t * t;
    vec2 point = direction * (0.24 + t * reach) + side * curl;
    point.y *= 0.76;
    return point;
  }

  void main() {
    if (length(vWaterPosition) < 5.0) discard;
    vec2 p = (vUv * 2.0 - 1.0) * vec2(1.25, 1.0);
    float limbDistance = 10.0;
    for (int arm = 0; arm < 8; arm++) {
      float limb = float(arm);
      vec2 a = limbPoint(limb, 0.0);
      for (int joint = 1; joint <= 9; joint++) {
        float t = float(joint) / 9.0;
        vec2 b = limbPoint(limb, t);
        float width = mix(0.09, 0.006, t);
        limbDistance = min(limbDistance, segmentDistance(p, a, b) - width);
        a = b;
      }
    }
    vec2 head = p / vec2(0.35, 0.4 + 0.015 * sin(time * 1.4));
    float headDistance = (length(head) - 1.0) * 0.35;
    float distanceToSkin = min(headDistance, limbDistance);
    float shape = 1.0 - smoothstep(-0.005, 0.025, distanceToSkin);
    if (shape < 0.005) discard;

    // Keep only a near-black outline; surface waves remain visible through it.
    gl_FragColor = vec4(vec3(0.0005, 0.001, 0.002), shape * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
