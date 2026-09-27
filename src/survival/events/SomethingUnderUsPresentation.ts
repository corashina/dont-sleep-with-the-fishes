import { BufferAttribute, DoubleSide, DynamicDrawUsage, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample } from '../../ocean/WaveField';
import { eventItemUseDurationForItem } from '../eventItemUseChoreography';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { UNDER_US_MONSTER_FRAGMENT_SHADER } from './underUsMonsterShader';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  createUnderUsPose, sampleUnderUsReaction, sampleUnderUsReveal,
  UNDER_US_REACTION_SECONDS, UNDER_US_REVEAL_SECONDS,
  UNDER_US_RADIUS, underUsHeading,
} from './underUsChoreography';

const BODY_SEGMENTS = 80;

export class SomethingUnderUsPresentation implements DedicatedEventPresentation {
  readonly eventId = 'something-under-us' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();
  private readonly geometry = new PlaneGeometry(18, 10, BODY_SEGMENTS, 32);
  private readonly arcCosines = new Float32Array(BODY_SEGMENTS + 1);
  private readonly arcSines = new Float32Array(BODY_SEGMENTS + 1);
  private readonly material = new ShaderMaterial({
    uniforms: { opacity: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec2 vWaterPosition; void main() { vUv = uv; vWaterPosition = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: UNDER_US_MONSTER_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
  private readonly shadow = new Mesh(this.geometry, this.material);
  private readonly restPositions: Float32Array;
  private readonly wave = createWaveSample();
  private readonly pose = createUnderUsPose();
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'item' | 'reaction'>(
    (kind, _time, progress) => this.sample(kind, progress),
  );
  private choice = 'sleep';
  private staged = false;
  private disposed = false;
  private elapsed = 0;

  constructor(private readonly environment: Pick<DedicatedEventEnvironment,
    'boatEffectsRoot' | 'cameraEffectsRoot' | 'readWorldWaveAmplitudeScale' | 'sampleWorldWaveInto'
  >) {
    this.worldRoot.name = 'something-under-us-world';
    this.boatRoot.name = 'something-under-us-boat';
    this.shadow.name = 'under-us-sea-shadow';
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.geometry.rotateX(-Math.PI / 2);
    this.restPositions = new Float32Array(this.geometry.attributes.position!.array);
    for (let index = 0; index <= BODY_SEGMENTS; index += 1) {
      const angle = -this.restPositions[index * 3]! / UNDER_US_RADIUS;
      this.arcCosines[index] = Math.cos(angle);
      this.arcSines[index] = Math.sin(angle);
    }
    (this.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
    this.itemAimTarget.name = 'under-us-item-aim-target';
    this.worldRoot.add(this.shadow, this.itemAimTarget);
    this.worldRoot.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.staged = true;
    this.worldRoot.visible = true;
    this.choice = 'sleep';
    this.elapsed = 0;
    sampleUnderUsReveal(0, this.pose);
    this.apply(0);
  }

  reveal(): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    return this.animation.start('reveal', UNDER_US_REVEAL_SECONDS);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (!this.staged || this.disposed
      || (choiceId !== 'baitTin' && choiceId !== 'cannedFood')) {
      return Promise.resolve(false);
    }
    this.choice = choiceId;
    const duration = eventItemUseDurationForItem('throw-target', choiceId);
    const angle = underUsHeading(this.elapsed + duration + UNDER_US_REACTION_SECONDS);
    const radius = UNDER_US_RADIUS + 14;
    this.itemAimTarget.position.set(Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius);
    return this.animation.start('item', duration, {
      complete: true, cancel: false,
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    this.choice = result.outcome.eventResult?.choiceId ?? 'sleep';
    return this.animation.start('reaction', UNDER_US_REACTION_SECONDS);
  }

  update(time: number, delta: number): void {
    if (!this.staged || this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.elapsed += step;
    this.animation.update(time, step);
    this.apply(time);
  }

  skip(): void { this.settleForVisibilityChange(); }

  settleForVisibilityChange(): void {
    if (!this.staged || this.disposed) return;
    this.animation.settle();
    this.apply(this.elapsed);
  }

  clear(): void {
    this.animation.cancel();
    this.staged = false;
    this.worldRoot.visible = false;
    this.material.uniforms.opacity!.value = 0;
    this.itemAimTarget.position.set(0, 0.1, -26);
    this.environment.boatEffectsRoot?.position.set(0, 0, 0);
    this.environment.boatEffectsRoot?.rotation.set(0, 0, 0);
    this.environment.cameraEffectsRoot?.position.set(0, 0, 0);
    this.environment.cameraEffectsRoot?.rotation.set(0, 0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.worldRoot.clear();
    this.boatRoot.clear();
    this.worldRoot.removeFromParent();
    this.boatRoot.removeFromParent();
  }

  private sample(kind: 'reveal' | 'item' | 'reaction', progress: number): void {
    if (kind === 'reveal') sampleUnderUsReveal(progress, this.pose);
    else if (kind === 'reaction') sampleUnderUsReaction(this.choice, progress, this.pose);
  }

  private apply(time: number): void {
    const positions = this.geometry.attributes.position!;
    const amplitude = this.environment.readWorldWaveAmplitudeScale();
    const angle = underUsHeading(this.elapsed);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    // Reuse one wave sample and the position buffer; no frame allocations.
    for (let index = 0; index < positions.count; index += 1) {
      const across = this.restPositions[index * 3 + 2]!;
      const column = index % (BODY_SEGMENTS + 1);
      const arcCosine = this.arcCosines[column]!;
      const arcSine = this.arcSines[column]!;
      const x = (this.pose.radius + across) * (cosine * arcCosine - sine * arcSine);
      const z = (this.pose.radius + across) * (sine * arcCosine + cosine * arcSine);
      this.environment.sampleWorldWaveInto(this.wave, time, x, z, amplitude);
      positions.setXYZ(index, x + this.wave.displacementX,
        this.wave.height + 0.065, z + this.wave.displacementZ);
    }
    positions.needsUpdate = true;
    this.material.uniforms.opacity!.value = this.pose.opacity;
    this.material.uniforms.time!.value = this.elapsed;
    const boat = this.environment.boatEffectsRoot;
    const camera = this.environment.cameraEffectsRoot;
    if (boat !== undefined) {
      boat.position.y = this.pose.lift;
      boat.rotation.z = this.pose.roll;
    }
    if (camera !== undefined) {
      camera.position.y = this.pose.lift;
      camera.rotation.z = this.pose.roll * 0.7;
    }
  }
}
