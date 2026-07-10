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
