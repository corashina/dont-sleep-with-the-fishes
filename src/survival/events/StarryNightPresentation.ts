import { Group, Object3D, PointLight, Vector3 } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { itemLabel } from '../../i18n/itemMessages';
import { CONSTELLATION_COUNT } from '../starryNight';
import { eventMessage } from '../../i18n/eventMessages';
import { runCleanupSteps } from '../../world/SceneResources';
import { SURVIVAL_CELESTIAL_DIRECTION } from '../../world/celestialLight';
import type { FocusedEventInteractionTarget } from '../FocusedEventPresentation';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { StarryNightGeometry } from './starryNightGeometry';

type Beat = 'reveal' | 'gift' | 'sleep';
export const STARRY_NIGHT_REVEAL_SECONDS = 1;
export const STARRY_NIGHT_GIFT_SECONDS = 1.8;
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
  private readonly animation = new TimedPresentationAnimation<Beat>(
    (kind, _time, progress) => this.sample(kind, progress),
  );
  private targets: readonly FocusedEventInteractionTarget[] = [];
  private selected = -1;
  private flash = 0;
  private revealProgress = 0;
  private visibility = 1;
  private elapsed = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'starry-night-world';
    this.boatRoot.name = 'starry-night-boat';
    this.light.position.set(0, 3, 0);
    this.boatRoot.add(this.light);
    this.worldRoot.add(this.sky.root, this.itemAimTarget);
    this.worldRoot.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed) return;
    this.clear();
    if (context.eventId !== this.eventId) return;
    const items = context.constellationItems;
    if (items?.length !== CONSTELLATION_COUNT || new Set(items).size !== CONSTELLATION_COUNT) {
      throw new Error('Starry Night requires two distinct constellation items.');
    }
    this.sky.setItems(items);
    this.targets = items.map((item, index) => ({
      id: 'starry-night:' + item,
      get label() { return itemLabel(item); },
      get description() { return eventMessage('starry-night.description', 'starryNightDescription'); },
      root: this.sky.constellations[index]!,
      choiceId: item,
      tooltip: false,
      setHighlighted: (highlighted: boolean) => this.sky.setHighlighted(index, highlighted),
      minimumHitWidth: 72,
      minimumHitHeight: 72,
    }));
    this.selected = -1;
    this.flash = 0;
    this.staged = true;
    this.elapsed = 0;
    this.revealProgress = 0;
    this.visibility = 1;
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
    return this.targets.find((target) => target.id === id)?.root ?? null;
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    return Promise.resolve(false);
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    const choiceId = result.outcome.eventResult?.choiceId;
    this.selected = this.targets.findIndex((target) => target.choiceId === choiceId);
    if (this.selected >= 0) {
      return this.animation.start('gift', STARRY_NIGHT_GIFT_SECONDS);
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
    } else {
      this.visibility = 1-ease(progress);
      this.flash = beat === 'gift' ? Math.sin(progress * Math.PI) : 0;
      this.light.intensity = this.visibility*0.6;
    }
  }

  private apply(): void {
    // Follow the sky's origin, without changing the player's view.
    this.sky.root.position.set(0, 0, 0);
    this.environment.camera?.getWorldPosition(this.sky.root.position);
    this.sky.root.position.add(this.moonOffset);
    this.itemAimTarget.position.copy(this.sky.root.position);
    this.sky.update(this.elapsed, this.revealProgress, this.visibility, this.selected, this.flash,
      this.environment.camera?.aspect ?? 16/9);
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
    this.sky.clearHighlight();
    this.staged = false;
    this.worldRoot.visible = false;
    this.light.intensity = 0;
    this.light.color.setHex(0xbedcff);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    runCleanupSteps([
      () => this.sky.dispose(),
      () => this.light.dispose(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.clear(),
    ]);
  }
}
