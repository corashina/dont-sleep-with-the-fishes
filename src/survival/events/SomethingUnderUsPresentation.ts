import { BoxGeometry, BufferAttribute, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample } from '../../ocean/WaveField';
import { pulse } from '../animationMath';
import { eventItemUseDurationForItem } from '../eventItemUseChoreography';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  createUnderUsPose, sampleUnderUsReaction, sampleUnderUsReveal,
  UNDER_US_REACTION_SECONDS, UNDER_US_REVEAL_SECONDS,
} from './underUsChoreography';

// A translucent, wave-conforming silhouette preserves surface detail in both water settings.
// The animal remains indistinct; only the flashlight exposes a few pale ridges.
const FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float light;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.y += 0.09 * sin(p.x * 3.5);
    float body = 1.0 - smoothstep(0.77, 1.0, length(p / vec2(0.94, 0.82)));
    float fins = 1.0 - smoothstep(0.72, 1.0,
      abs((p.x + 0.04 + abs(p.y) * 0.22) / 0.29) + abs(p.y / 0.92));
    float tail = (1.0 - smoothstep(0.06, 0.14, abs(p.y + 0.08)))
      * smoothstep(0.25, 0.56, p.x) * (1.0 - smoothstep(0.88, 1.0, p.x));
    float shape = max(body, max(fins * 0.8, tail));
    float ridges = pow(max(0.0, sin((p.x + p.y * 0.18) * 45.0)), 12.0)
      * (1.0 - smoothstep(0.14, 0.3, abs(p.y)))
      * (1.0 - smoothstep(0.2, 0.7, abs(p.x + 0.2)));
    float alpha = shape * opacity;
    if (alpha < 0.005) discard;
    vec3 color = mix(vec3(0.0005, 0.001, 0.002), vec3(0.19, 0.36, 0.34), ridges * light);
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
  private readonly geometry = new PlaneGeometry(26, 26, 52, 52);
  private readonly material = new ShaderMaterial({
    uniforms: { opacity: { value: 0 }, light: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FRAGMENT_SHADER,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
  private readonly shadow = new Mesh(this.geometry, this.material);
  private readonly aimGeometry = new BoxGeometry(3.2, 0.15, 1.6);
  private readonly aimMaterial = new MeshBasicMaterial();
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
    (this.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
    this.itemAimTarget.name = 'under-us-item-aim-target';
    // Supply a bounded water target to the existing flashlight cone fitter.
    // This helper participates in bounds queries only, never in rendering.
    const aimBounds = new Mesh(this.aimGeometry, this.aimMaterial);
    aimBounds.layers.disableAll();
    this.itemAimTarget.add(aimBounds);
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
      || (choiceId !== 'baitTin' && choiceId !== 'cannedFood' && choiceId !== 'flashlight')) {
      return Promise.resolve(false);
    }
    this.choice = choiceId;
    // Food and bait land away from the hull; the beam points beside the bow.
    this.itemAimTarget.position.set(choiceId === 'flashlight' ? -2 : 10, 0.1, -6);
    const duration = eventItemUseDurationForItem(
      choiceId === 'flashlight' ? 'flashlight-threat-beam' : 'throw-target', choiceId,
    );
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
    this.material.uniforms.light!.value = 0;
    this.itemAimTarget.position.set(-2, 0.1, -6);
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
    this.aimGeometry.dispose();
    this.aimMaterial.dispose();
    this.worldRoot.clear();
    this.boatRoot.clear();
    this.worldRoot.removeFromParent();
    this.boatRoot.removeFromParent();
  }

  private sample(kind: 'reveal' | 'item' | 'reaction', progress: number): void {
    if (kind === 'reveal') sampleUnderUsReveal(progress, this.pose);
    else if (kind === 'reaction') sampleUnderUsReaction(this.choice, progress, this.pose);
    else {
      this.pose.light = this.choice === 'flashlight' ? pulse(progress, 0.2, 0.5, 1) : 0;
    }
  }

  private apply(time: number): void {
    const positions = this.geometry.attributes.position!;
    const amplitude = this.environment.readWorldWaveAmplitudeScale();
    // Reuse one wave sample and the position buffer; no frame allocations.
    for (let index = 0; index < positions.count; index += 1) {
      const x = this.restPositions[index * 3]! + this.pose.x;
      const z = this.restPositions[index * 3 + 2]! + this.pose.z;
      this.environment.sampleWorldWaveInto(this.wave, time, x, z, amplitude);
      positions.setXYZ(index, x + this.wave.displacementX,
        this.wave.height + 0.065, z + this.wave.displacementZ);
    }
    positions.needsUpdate = true;
    this.material.uniforms.opacity!.value = this.pose.opacity;
    this.material.uniforms.light!.value = this.pose.light;
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
