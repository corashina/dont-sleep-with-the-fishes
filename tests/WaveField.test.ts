// Importance: 10/10 (scaled from 5/5). Protects the shared deterministic wave field.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WAVES,
  createInactiveVortexWaveState,
  createWaveUniformPayload,
  sampleWaveField,
  sampleWaveFieldInto,
  type WaveComponent,
  type VortexWaveState,
} from '../src/ocean/WaveField';

describe('WaveField', () => {
  it('writes a wave sample into a caller-owned reusable record', () => {
    const output = {
      height: 0,
      displacementX: 0,
      displacementZ: 0,
      normal: { x: 0, y: 0, z: 0 },
    };
    const firstReference = output;

    sampleWaveFieldInto(output, DEFAULT_WAVES, 3.25, 4, -7, 1.2);

    expect(output).toBe(firstReference);
    expect(output).toEqual(sampleWaveField(DEFAULT_WAVES, 3.25, 4, -7, 1.2));

    sampleWaveFieldInto(output, DEFAULT_WAVES, 1.5, -2, 6, 0.78);

    expect(output).toBe(firstReference);
    expect(output).toEqual(sampleWaveField(DEFAULT_WAVES, 1.5, -2, 6, 0.78));
  });

  it('adds a deterministic vortex disturbance without replacing the output', () => {
    const base = {
      height: 0,
      displacementX: 0,
      displacementZ: 0,
      normal: { x: 0, y: 0, z: 0 },
    };
    const disturbed = {
      height: 0,
      displacementX: 0,
      displacementZ: 0,
      normal: { x: 0, y: 0, z: 0 },
    };
    const inactive = createInactiveVortexWaveState();
    const active: VortexWaveState = {
      centerX: 0,
      centerZ: -7,
      radius: 8,
      depression: 1.1,
      tangentStrength: 0.8,
      phase: 0.4,
      strength: 1,
    };
    const disturbedReference = disturbed;

    sampleWaveFieldInto(base, DEFAULT_WAVES, 2, 1, -6, 1, inactive);
    sampleWaveFieldInto(disturbed, DEFAULT_WAVES, 2, 1, -6, 1, active);

    expect(disturbed).toBe(disturbedReference);
    expect(disturbed).not.toEqual(base);
    expect(Object.values(disturbed.normal).every(Number.isFinite)).toBe(true);
  });

  it('includes the vortex depression derivative in the normal', () => {
    const sample = sampleWaveField(
      [],
      0,
      1,
      0,
      1,
      {
        centerX: 0,
        centerZ: 0,
        radius: 8,
        depression: 1.1,
        tangentStrength: 0,
        phase: 0,
        strength: 1,
      },
    );
    const envelopeT = 1 - 1 / 8;
    const derivativeX = 1.1 * 6 * envelopeT * (1 - envelopeT) / 8;
    const normalLength = Math.hypot(-derivativeX, 1, 0);

    expect(sample.normal.x).toBeCloseTo(-derivativeX / normalLength, 10);
    expect(sample.normal.y).toBeCloseTo(1 / normalLength, 10);
    expect(sample.normal.z).toBeCloseTo(0, 10);
  });

  // Importance: 95/100. Boat tilt must follow the changing water slope.
  it('matches height derivatives across positions, times, and weather strengths', () => {
    const epsilon = 0.0001;
    for (const time of [0, 8.25, 73]) {
      for (const [x, z] of [[0, 0], [7, -11], [-38, 62]]) {
        for (const scale of [0, 0.65, 1, 1.8]) {
          const sample = sampleWaveField(DEFAULT_WAVES, time, x!, z!, scale);
          const slopeX = (
            sampleWaveField(DEFAULT_WAVES, time, x! + epsilon, z!, scale).height
            - sampleWaveField(DEFAULT_WAVES, time, x! - epsilon, z!, scale).height
          ) / (2 * epsilon);
          const slopeZ = (
            sampleWaveField(DEFAULT_WAVES, time, x!, z! + epsilon, scale).height
            - sampleWaveField(DEFAULT_WAVES, time, x!, z! - epsilon, scale).height
          ) / (2 * epsilon);
          expect(-sample.normal.x / sample.normal.y).toBeCloseTo(slopeX, 7);
          expect(-sample.normal.z / sample.normal.y).toBeCloseTo(slopeZ, 7);
        }
      }
    }
  });

  // Importance: 95/100. Wave direction length must not change buoyancy.
  it('normalizes non-unit wave directions', () => {
    const wave: WaveComponent = {
      direction: [3, 4], amplitude: 0.6, wavelength: 8,
      speed: 0.7, steepness: 0.45, phase: 0.35,
    };
    const normalized = { ...wave, direction: [0.6, 0.8] as const };
    expect(sampleWaveField([wave], 1.75, 2.5, -1.25, 1.3))
      .toEqual(sampleWaveField([normalized], 1.75, 2.5, -1.25, 1.3));
  });

  // Importance: 90/100. Prevent the evenly spaced wave pattern from returning.
  it('breaks repeated crests along and across each wave without changing average energy substantially', () => {
    for (const wave of DEFAULT_WAVES) {
      const length = Math.hypot(...wave.direction);
      const dx = wave.direction[0] / length;
      const dz = wave.direction[1] / length;
      let acrossDifference = 0;
      let repeatDifference = 0;
      let energy = 0;
      let smallWaves = 0;
      let largeWaves = 0;
      const samples = 1024;
      for (let i = 0; i < samples; i += 1) {
        const x = (i % 32) * 3.71;
        const z = Math.floor(i / 32) * 4.13;
        const sample = sampleWaveField([wave], 17, x, z);
        const across = sampleWaveField([wave], 17, x - dz * 9, z + dx * 9);
        const repeat = sampleWaveField([wave], 17, x + dx * wave.wavelength, z + dz * wave.wavelength);
        acrossDifference += (sample.height - across.height) ** 2;
        repeatDifference += (sample.height - repeat.height) ** 2;
        energy += sample.height ** 2;
        const relativeAmplitude = Math.hypot(
          sample.height,
          Math.hypot(sample.displacementX, sample.displacementZ) / wave.steepness,
        ) / wave.amplitude;
        if (relativeAmplitude < 0.4) smallWaves += 1;
        if (relativeAmplitude > 1.65) largeWaves += 1;
        expect(relativeAmplitude).toBeGreaterThanOrEqual(0.25 - 1e-10);
        expect(relativeAmplitude).toBeLessThanOrEqual(1.85 + 1e-10);
      }
      expect(Math.sqrt(acrossDifference / samples)).toBeGreaterThan(wave.amplitude * 0.15);
      expect(Math.sqrt(repeatDifference / samples)).toBeGreaterThan(wave.amplitude * 0.15);
      expect(smallWaves).toBeGreaterThan(samples * 0.15);
      expect(largeWaves).toBeGreaterThan(samples * 0.1);
      const relativeEnergy = energy / samples / (wave.amplitude ** 2 / 2);
      expect(relativeEnergy).toBeGreaterThan(0.8);
      expect(relativeEnergy).toBeLessThan(1.2);
    }
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
