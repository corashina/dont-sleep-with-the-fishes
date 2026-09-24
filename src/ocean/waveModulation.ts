// Shared tuning for CPU buoyancy and GPU surface sampling.
// Smooth wave groups alternate small ripples with taller, concentrated crests.
// Squaring the group envelope widens the height range without raising average energy substantially.
export const WAVE_MODULATION = Object.freeze({
  bendAlong: 0.11,
  bendAcross: 0.37,
  bendSpeed: -0.23,
  bendPhase: 1.7,
  bendStrength: 0.9,
  groupAlong: 0.27,
  groupAcross: -0.17,
  groupSpeed: -0.11,
  groupPhase: 2.3,
  groupMinimum: 0.25,
  groupRange: 1.6,
});

const m = WAVE_MODULATION;

// Included in both shader stages. Derivatives include crest bending and wave groups.
export const MODULATED_WAVE_GLSL = /* glsl */ `
  struct OceanWaveSample {
    float height;
    vec2 displacement;
    vec2 slope;
    vec2 horizontalSlope;
    vec3 velocity;
  };

  OceanWaveSample sampleOceanWave(int index, vec2 position) {
    vec2 direction = normalize(uDirections[index]);
    vec2 across = vec2(-direction.y, direction.x);
    vec4 parameters = uParameters[index];
    float k = 6.28318530718 / parameters.y;
    float baseAmplitude = parameters.x * uAmplitudeScale;
    float phase = uPhases[index];
    vec2 bendGradient = k * (direction * ${m.bendAlong} + across * ${m.bendAcross});
    vec2 groupGradient = k * (direction * ${m.groupAlong} + across * ${m.groupAcross});
    float bend = dot(bendGradient, position)
      + parameters.z * uTime * ${m.bendSpeed} + phase * ${m.bendPhase};
    float group = dot(groupGradient, position)
      + parameters.z * uTime * ${m.groupSpeed} + phase * ${m.groupPhase};
    float theta = k * dot(direction, position) + parameters.z * uTime + phase
      + ${m.bendStrength} * sin(bend);
    vec2 phaseGradient = k * direction + ${m.bendStrength} * cos(bend) * bendGradient;
    float packet = 0.5 + 0.5 * sin(group);
    float amplitude = baseAmplitude * (${m.groupMinimum} + ${m.groupRange} * packet * packet);
    vec2 amplitudeGradient = baseAmplitude * ${m.groupRange} * packet * cos(group) * groupGradient;
    float waveSin = sin(theta);
    float waveCos = cos(theta);
    OceanWaveSample wave;
    wave.height = amplitude * waveSin;
    wave.displacement = parameters.w * amplitude * direction * waveCos;
    wave.slope = amplitudeGradient * waveSin + amplitude * waveCos * phaseGradient;
    wave.horizontalSlope = parameters.w
      * (amplitudeGradient * waveCos - amplitude * waveSin * phaseGradient);
    float thetaRate = parameters.z + ${m.bendStrength} * cos(bend) * parameters.z * ${m.bendSpeed};
    float amplitudeRate = baseAmplitude * ${m.groupRange} * packet * cos(group) * parameters.z * ${m.groupSpeed};
    vec2 horizontalVelocity = parameters.w * direction
      * (amplitudeRate * waveCos - amplitude * waveSin * thetaRate);
    wave.velocity = vec3(horizontalVelocity.x,
      amplitudeRate * waveSin + amplitude * waveCos * thetaRate, horizontalVelocity.y);
    return wave;
  }
`;
