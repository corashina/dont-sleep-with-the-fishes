export interface WaveComponent {
  direction: readonly [number, number];
  amplitude: number;
  wavelength: number;
  speed: number;
  steepness: number;
  phase: number;
}

export interface WaveSample {
  height: number;
  displacementX: number;
  displacementZ: number;
  normal: { x: number; y: number; z: number };
}

export interface WaveUniformPayload {
  directions: Array<[number, number]>;
  parameters: Array<[number, number, number, number]>;
  phases: number[];
}

export const DEFAULT_WAVES: readonly WaveComponent[] = [
  { direction: [0.92, 0.39], amplitude: 0.42, wavelength: 12, speed: 0.82, steepness: 0.42, phase: 0.2 },
  { direction: [-0.35, 0.94], amplitude: 0.24, wavelength: 7.4, speed: 1.08, steepness: 0.34, phase: 1.7 },
  { direction: [0.18, -0.98], amplitude: 0.13, wavelength: 4.1, speed: 1.42, steepness: 0.25, phase: 3.1 },
  { direction: [-0.81, -0.59], amplitude: 0.08, wavelength: 2.6, speed: 1.88, steepness: 0.18, phase: 4.6 },
] as const;

export function sampleWaveField(
  waves: readonly WaveComponent[],
  timeSeconds: number,
  x: number,
  z: number,
  amplitudeScale = 1,
): WaveSample {
  let height = 0;
  let displacementX = 0;
  let displacementZ = 0;
  let derivativeX = 0;
  let derivativeZ = 0;

  for (const wave of waves) {
    const directionLength = Math.hypot(wave.direction[0], wave.direction[1]) || 1;
    const dx = wave.direction[0] / directionLength;
    const dz = wave.direction[1] / directionLength;
    const waveNumber = (Math.PI * 2) / wave.wavelength;
    const amplitude = wave.amplitude * amplitudeScale;
    const theta = waveNumber * (dx * x + dz * z) + wave.speed * timeSeconds + wave.phase;
    const sine = Math.sin(theta);
    const cosine = Math.cos(theta);

    height += amplitude * sine;
    displacementX += wave.steepness * amplitude * dx * cosine;
    displacementZ += wave.steepness * amplitude * dz * cosine;
    derivativeX += amplitude * waveNumber * dx * cosine;
    derivativeZ += amplitude * waveNumber * dz * cosine;
  }

  const nx = -derivativeX;
  const ny = 1;
  const nz = -derivativeZ;
  const normalLength = Math.hypot(nx, ny, nz) || 1;

  return {
    height,
    displacementX,
    displacementZ,
    normal: { x: nx / normalLength, y: ny / normalLength, z: nz / normalLength },
  };
}

export function createWaveUniformPayload(waves: readonly WaveComponent[]): WaveUniformPayload {
  if (waves.length !== 4) throw new Error(`Expected exactly four waves, received ${waves.length}`);
  return {
    directions: waves.map((wave) => [wave.direction[0], wave.direction[1]]),
    parameters: waves.map((wave) => [wave.amplitude, wave.wavelength, wave.speed, wave.steepness]),
    phases: waves.map((wave) => wave.phase),
  };
}
