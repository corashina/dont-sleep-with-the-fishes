import type { Object3D, Quaternion, Vector3 } from 'three';
import type { WaveSampleIntoProvider } from '../ocean/BoatBuoyancy';
import type { WaveSample } from '../ocean/WaveField';

const DRIFT_LIMIT = 0.35;
const DRIFT_RESPONSE = 0.3;
const TILT_RESPONSE = 0.3;

export interface DriftingWater {
  readonly sampleWaveInto: WaveSampleIntoProvider;
  readonly readAmplitudeScale: () => number;
}

export function applyDriftingWavePose(
  subject: Object3D,
  basePosition: Readonly<Vector3>,
  baseQuaternion: Readonly<Quaternion>,
  wave: WaveSample,
  time: number,
  water: DriftingWater,
): void {
  water.sampleWaveInto(
    wave,
    time,
    basePosition.x,
    basePosition.z,
    water.readAmplitudeScale(),
  );
  subject.position.set(
    basePosition.x + Math.max(
      -DRIFT_LIMIT,
      Math.min(DRIFT_LIMIT, -wave.normal.x * DRIFT_RESPONSE),
    ),
    basePosition.y + wave.height,
    basePosition.z + Math.max(
      -DRIFT_LIMIT,
      Math.min(DRIFT_LIMIT, -wave.normal.z * DRIFT_RESPONSE),
    ),
  );
  subject.quaternion.copy(baseQuaternion);
  subject.rotateX(Math.atan2(wave.normal.z, wave.normal.y) * TILT_RESPONSE);
  subject.rotateZ(-Math.atan2(wave.normal.x, wave.normal.y) * TILT_RESPONSE);
}
