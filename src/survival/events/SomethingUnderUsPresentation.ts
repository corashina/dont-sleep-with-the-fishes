import { BufferAttribute, DoubleSide, DynamicDrawUsage, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample } from '../../ocean/WaveField';
import { eventItemUseDurationForItem } from '../eventItemUseChoreography';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  createUnderUsPose, sampleUnderUsReaction, sampleUnderUsReveal,
  UNDER_US_REACTION_SECONDS, UNDER_US_REVEAL_SECONDS,
  UNDER_US_ORBIT_RADIUS, UNDER_US_ORBIT_SPEED,
} from './underUsChoreography';

// A translucent, wave-conforming silhouette preserves surface detail in both water settings.
// Water tint and soft edges keep its eyes and teeth indistinct beneath the surface.
const BODY_SEGMENTS = 180;
const FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float time;
  varying vec2 vUv;
  varying vec2 vWaterPosition;
  void main() {
    // The water overlay must never draw inside the moving hull's clearance area.
    if (length(vWaterPosition) < 5.0) discard;
    vec2 p = vUv * 2.0 - 1.0;
    p.y += 0.09 * sin(p.x * 6.2831853);
    // A continuous coiled body keeps black water in view even when the head passes behind the boat.
    float width = 0.62 + 0.14 * cos(p.x * 6.2831853) + 0.07 * sin(p.x * 12.5663706);
    float body = 1.0 - smoothstep(0.65, 1.0, abs(p.y) / width);
    float fins = 1.0 - smoothstep(0.72, 1.0,
      abs((p.x + 0.04 + abs(p.y) * 0.22) / 0.29) + abs(p.y / 0.92));
    float tail = (1.0 - smoothstep(0.06, 0.14, abs(p.y + 0.08)))
      * smoothstep(0.25, 0.56, p.x) * (1.0 - smoothstep(0.88, 1.0, p.x));
    float shape = max(body, max(fins * 0.8, tail));
    vec2 eye = vec2((p.x + 0.48 + p.y * 0.06) / 0.064,
      (abs(p.y) - 0.22) / 0.088);
    float socket = 1.0 - smoothstep(0.8, 1.65, length(eye));
    float iris = (1.0 - smoothstep(0.55, 1.0, length(eye)))
      * smoothstep(0.12, 0.28, abs(eye.x));
    float mouthCurve = p.y / 0.32;
    float mouthEdge = -0.61 + 0.28 * mouthCurve * mouthCurve;
    float toothPoint = 1.0 - abs(fract((p.y + 0.34) * 19.0) * 2.0 - 1.0);
    float teeth = (1.0 - smoothstep(0.25, 0.34, abs(p.y)))
      * smoothstep(mouthEdge - 0.012, mouthEdge, p.x)
      * (1.0 - smoothstep(mouthEdge + 0.014, mouthEdge + 0.022 + toothPoint * 0.045, p.x));
    float murk = 0.55 + 0.45 * sin(p.x * 9.0 + p.y * 6.0 + time * 0.65);
    float alpha = shape * opacity;
    if (alpha < 0.005) discard;
    vec3 color = vec3(0.0005, 0.001, 0.002) * (1.0 - socket * 0.7);
    color = mix(color, vec3(0.13, 0.24, 0.19), iris * murk * 0.6);
    color = mix(color, vec3(0.12, 0.20, 0.19), teeth * murk * 0.32);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SomethingUnderUsPresentation implements DedicatedEventPresentation {
  readonly eventId = 'something-under-us' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();
  private readonly geometry = new PlaneGeometry(Math.PI * 2 * UNDER_US_ORBIT_RADIUS, 8, BODY_SEGMENTS, 20);
  private readonly arcCosines = new Float32Array(BODY_SEGMENTS + 1);
  private readonly arcSines = new Float32Array(BODY_SEGMENTS + 1);
  private readonly material = new ShaderMaterial({
    uniforms: { opacity: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec2 vWaterPosition; void main() { vUv = uv; vWaterPosition = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FRAGMENT_SHADER,
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
      const angle = -this.restPositions[index * 3]! / UNDER_US_ORBIT_RADIUS;
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
    const angle = -Math.PI / 2 + (this.elapsed + duration + UNDER_US_REACTION_SECONDS) * UNDER_US_ORBIT_SPEED;
    const radius = UNDER_US_ORBIT_RADIUS + 14;
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
    const angle = -Math.PI / 2 + this.elapsed * UNDER_US_ORBIT_SPEED;
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
