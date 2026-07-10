import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WAVES,
  createWaveUniformPayload,
  sampleWaveField,
  type WaveComponent,
} from '../src/ocean/WaveField';

describe('WaveField', () => {
  it('returns deterministic height and a unit normal', () => {
    const a = sampleWaveField(DEFAULT_WAVES, 3.25, 4, -7, 1.2);
    const b = sampleWaveField(DEFAULT_WAVES, 3.25, 4, -7, 1.2);
    expect(a).toEqual(b);
    expect(Number.isFinite(a.height)).toBe(true);
    const length = Math.hypot(a.normal.x, a.normal.y, a.normal.z);
    expect(length).toBeCloseTo(1, 6);
  });

  it('matches an analytic single-wave sample with a non-unit direction', () => {
    const wave: WaveComponent = {
      direction: [3, 4],
      amplitude: 0.6,
      wavelength: 8,
      speed: 0.7,
      steepness: 0.45,
      phase: 0.35,
    };
    const timeSeconds = 1.75;
    const x = 2.5;
    const z = -1.25;
    const amplitudeScale = 1.3;

    const sample = sampleWaveField([wave], timeSeconds, x, z, amplitudeScale);

    const directionX = 3 / 5;
    const directionZ = 4 / 5;
    const scaledAmplitude = 0.6 * amplitudeScale;
    const waveNumber = (Math.PI * 2) / 8;
    const theta = waveNumber * (directionX * x + directionZ * z) + 0.7 * timeSeconds + 0.35;
    const expectedHeight = scaledAmplitude * Math.sin(theta);
    const expectedDisplacementX = 0.45 * scaledAmplitude * directionX * Math.cos(theta);
    const expectedDisplacementZ = 0.45 * scaledAmplitude * directionZ * Math.cos(theta);
    const derivativeX = scaledAmplitude * waveNumber * directionX * Math.cos(theta);
    const derivativeZ = scaledAmplitude * waveNumber * directionZ * Math.cos(theta);
    const normalLength = Math.hypot(-derivativeX, 1, -derivativeZ);
    const expectedNormalX = -derivativeX / normalLength;
    const expectedNormalY = 1 / normalLength;
    const expectedNormalZ = -derivativeZ / normalLength;

    expect(sample.height).toBeCloseTo(expectedHeight, 10);
    expect(sample.displacementX).toBeCloseTo(expectedDisplacementX, 10);
    expect(sample.displacementZ).toBeCloseTo(expectedDisplacementZ, 10);
    expect(sample.normal.x).toBeCloseTo(expectedNormalX, 10);
    expect(sample.normal.y).toBeCloseTo(expectedNormalY, 10);
    expect(sample.normal.z).toBeCloseTo(expectedNormalZ, 10);
  });

  it('scales height and displacement with amplitude', () => {
    const base = sampleWaveField(DEFAULT_WAVES, 2, 3, 5, 1);
    const stronger = sampleWaveField(DEFAULT_WAVES, 2, 3, 5, 1.35);
    expect(stronger.height).toBeCloseTo(base.height * 1.35, 6);
    expect(stronger.displacementX).toBeCloseTo(base.displacementX * 1.35, 6);
    expect(stronger.displacementZ).toBeCloseTo(base.displacementZ * 1.35, 6);
  });

  it('serializes exactly four waves for the shader', () => {
    const payload = createWaveUniformPayload(DEFAULT_WAVES);
    expect(payload.directions).toHaveLength(4);
    expect(payload.parameters).toHaveLength(4);
    expect(payload.phases).toHaveLength(4);
    expect(payload.directions).toEqual(DEFAULT_WAVES.map((wave) => [...wave.direction]));
    expect(payload.parameters).toEqual(
      DEFAULT_WAVES.map((wave) => [wave.amplitude, wave.wavelength, wave.speed, wave.steepness]),
    );
    expect(payload.phases).toEqual(DEFAULT_WAVES.map((wave) => wave.phase));
  });

  it('rejects wave counts that cannot match the four-wave shader', () => {
    const extraWave: WaveComponent = {
      direction: [1, 0],
      amplitude: 0.1,
      wavelength: 1,
      speed: 1,
      steepness: 0.1,
      phase: 0,
    };

    expect(() => createWaveUniformPayload(DEFAULT_WAVES.slice(0, 3))).toThrow(
      'Expected exactly four waves, received 3',
    );
    expect(() => createWaveUniformPayload([...DEFAULT_WAVES, extraWave])).toThrow(
      'Expected exactly four waves, received 5',
    );
  });
});
