import { Group, Mesh, Object3D, PlaneGeometry, PointLight, Vector3 } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { eventMessage } from '../../i18n/eventMessages';
import { runCleanupSteps } from '../../world/SceneResources';
import { SURVIVAL_CELESTIAL_DIRECTION } from '../../world/celestialLight';
import type { FocusedEventInteractionTarget } from '../FocusedEventPresentation';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { StarryNightGeometry, starryNightMaterial } from './starryNightGeometry';

type Beat = 'reveal' | 'blessing' | 'sleep';
export const STARRY_NIGHT_REVEAL_SECONDS = 9;
export const STARRY_NIGHT_BLESSING_SECONDS = 5;
const ease = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t*t*(3-2*t);
};

export class StarryNightPresentation implements DedicatedEventPresentation {
  readonly eventId = 'starry-night';
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Object3D();
  private readonly sky = new StarryNightGeometry();
  private readonly moonOffset = new Vector3(...SURVIVAL_CELESTIAL_DIRECTION).multiplyScalar(140);
  private readonly light = new PointLight(0xbedcff, 0, 22, 1.4);
  private readonly wave = new Mesh(new PlaneGeometry(2, 2), starryNightMaterial(`
    void main() {
      float radius = length((vUv-0.5)*2.0);
      float ring = exp(-pow((radius-0.7)*22.0, 2.0));
      float veil = exp(-radius*radius*7.0)*0.09;
      gl_FragColor = vec4(vec3(0.72, 0.84, 1.0), (ring*0.35+veil)*opacity);
    }
  `));
  private readonly animation = new TimedPresentationAnimation<Beat>(
    (kind, _time, progress) => this.sample(kind, progress),
  );
  private readonly targets: readonly FocusedEventInteractionTarget[];
  private revealProgress = 0;
  private visibility = 1;
  private power = 1;
  private elapsed = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'starry-night-world';
    this.boatRoot.name = 'starry-night-boat';
    this.sky.constellation.scale.setScalar(2.2);
    this.light.position.set(0, 3, 0);
    this.boatRoot.add(this.light);
    this.worldRoot.add(this.sky.root, this.itemAimTarget, this.wave);
    this.targets = Object.freeze([{
      id: 'starry-night:constellation',
      get label() { return eventMessage('starry-night.target', 'starryNightTitle'); },
      get description() { return eventMessage('starry-night.description', 'starryNightDescription'); },
      root: this.sky.constellation,
      choiceId: 'wish',
      tooltip: false,
      minimumHitWidth: 120,
      minimumHitHeight: 72,
    }]);
    this.worldRoot.visible = false;
    this.wave.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed) return;
    this.clear();
    if (context.eventId !== this.eventId) return;
    this.staged = true;
    this.elapsed = 0;
    this.revealProgress = 0;
    this.visibility = 1;
    this.power = 1;
    this.worldRoot.visible = true;
    this.apply();
  }

  reveal(): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    return this.animation.start('reveal', STARRY_NIGHT_REVEAL_SECONDS);
  }

  interactionTargets(): readonly FocusedEventInteractionTarget[] {
    return this.targets;
  }

  interactionRoot(id: string): Object3D | null {
    return id === 'starry-night:constellation' ? this.sky.constellation : null;
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    return Promise.resolve(false);
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    const choiceId = result.outcome.eventResult?.choiceId;
    if (choiceId === 'wish') {
      this.wave.visible = true;
      return this.animation.start('blessing', STARRY_NIGHT_BLESSING_SECONDS);
    }
    return this.animation.start('sleep', 1.5);
  }

  update(_time: number, delta: number): void {
    if (!this.staged || this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.elapsed += step;
    this.animation.update(this.elapsed, step);
    this.apply();
  }

  private sample(beat: Beat, progress: number): void {
    if (beat === 'reveal') {
      this.revealProgress = progress;
      this.light.intensity = ease(progress)*0.6;
    } else if (beat === 'sleep') {
      this.visibility = 1-ease(progress);
      this.light.intensity = this.visibility*0.6;
    } else {
      this.sampleBlessing(progress);
    }
  }

  private sampleBlessing(progress: number): void {
    const swell = Math.sin(Math.PI*ease(progress));
    const travel = ease((progress-0.12)/0.68);
    this.power = 1+swell*2;
    this.wave.position.copy(this.itemAimTarget.position).multiplyScalar(1-travel);
    this.wave.position.y += 2*travel;
    this.wave.scale.setScalar(6+travel*18);
    this.wave.material.uniforms.opacity!.value = swell;
    this.visibility = 1-ease((progress-0.72)/0.28);
    this.light.color.setRGB(0.74+swell*0.26, 0.86, 1-swell*0.26);
    this.light.intensity = swell*9;
  }

  private apply(): void {
    // Follow the sky's origin, without changing the player's view.
    this.sky.root.position.set(0, 0, 0);
    this.environment.camera?.getWorldPosition(this.sky.root.position);
    this.sky.root.position.add(this.moonOffset);
    this.itemAimTarget.position.copy(this.sky.root.position);
    this.sky.update(this.elapsed, this.revealProgress, this.power, this.visibility);
    this.environment.camera?.getWorldQuaternion(this.wave.quaternion);
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle(this.elapsed);
    if (this.staged) this.apply();
  }

  clear(): void {
    this.animation.cancel();
    this.staged = false;
    this.worldRoot.visible = false;
    this.wave.visible = false;
    this.light.intensity = 0;
    this.light.color.setHex(0xbedcff);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    runCleanupSteps([
      () => this.sky.dispose(),
      () => this.wave.geometry.dispose(),
      () => this.wave.material.dispose(),
      () => this.light.dispose(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.clear(),
    ]);
  }
}
