import { DynamicDrawUsage, Matrix4, type InstancedMesh, type BufferGeometry, type ShaderMaterial } from 'three';
import type { WaveSample } from '../ocean/WaveField';
import type { DriftingWater } from './DriftingWaveMotion';
import type { JellyfishModels } from './JellyfishModels';

const ROWS = 24;
const COLUMNS = 48;

export class JellyfishBackground {
  readonly root: InstancedMesh<BufferGeometry, ShaderMaterial>;
  private readonly positions = new Float32Array(ROWS * COLUMNS * 3);
  private readonly matrix = new Matrix4();
  private readonly wave: WaveSample = {
    height: 0, displacementX: 0, displacementZ: 0, normal: { x: 0, y: 1, z: 0 },
  };

  constructor(models: JellyfishModels, private readonly water: DriftingWater) {
    this.root = models.createBackground(ROWS * COLUMNS);
    this.root.instanceMatrix.setUsage(DynamicDrawUsage);
    // Surround the boat, including the net camera. Match the polar field in oceanShader.
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const index = row * COLUMNS + column;
        const angle = (column + (row % 2) * 0.5) * Math.PI * 2 / COLUMNS;
        const radius = 6 + row * 9.5 + Math.sin(index * 2.39996) * 1.2;
        this.positions[index * 3] = Math.cos(angle) * radius;
        this.positions[index * 3 + 1] = Math.sin(angle) * radius;
        this.positions[index * 3 + 2] = 0.6 + ((index * 7) % 11) * 0.045;
      }
    }
    this.update(0);
    this.root.computeBoundingSphere();
    this.root.boundingSphere!.radius += 2;
  }

  update(time: number): void {
    this.root.material.uniforms.uTime!.value = time;
    const amplitude = this.water.readAmplitudeScale();
    for (let index = 0; index < ROWS * COLUMNS; index += 1) {
      const x = this.positions[index * 3]!;
      const z = this.positions[index * 3 + 1]!;
      const size = this.positions[index * 3 + 2]!;
      this.water.sampleWaveInto(this.wave, time, x, z, amplitude);
      this.matrix.makeScale(size, size, size);
      this.matrix.setPosition(x, this.wave.height - size * 0.35, z);
      this.root.setMatrixAt(index, this.matrix);
    }
    this.root.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.dispose();
  }
}
