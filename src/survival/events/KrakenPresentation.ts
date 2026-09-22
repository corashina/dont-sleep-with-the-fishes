import { Group, Object3D, PointLight } from 'three';
import { createWaveSample } from '../../ocean/WaveField';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import type { DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext } from '../eventPresentationTypes';
import { KrakenGeometry } from './krakenGeometry';
import { KrakenCollection } from './KrakenCollection';
import {
  KRAKEN_COLLECTION_SECONDS, KRAKEN_EMERGE_SECONDS, KRAKEN_RELEASE_SECONDS,
  KRAKEN_REVEAL_SECONDS, krakenEase,
} from './krakenChoreography';

export class KrakenPresentation implements DedicatedEventPresentation {
  readonly eventId = 'kraken';
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Object3D();
  private readonly geometry = new KrakenGeometry();
  private readonly collection: KrakenCollection;
  private readonly light = new PointLight(0x9fb4ad, 0, 45, 1.3);
  private readonly wave = createWaveSample();
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'release'>((beat, _time, progress) => {
    if (beat === 'reveal') this.revealProgress = progress;
    else this.releaseProgress = progress;
  });
  private elapsed = 0;
  private revealProgress = 0;
  private releaseProgress = 0;
  private releaseStarted = false;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: Pick<DedicatedEventEnvironment,
    'sampleWorldWaveInto' | 'readWorldWaveAmplitudeScale' | 'heartDisplay'>) {
    this.collection = new KrakenCollection(this.geometry, environment.heartDisplay);
    this.worldRoot.name = 'kraken-world';
    this.boatRoot.name = 'kraken-boat';
    this.light.position.set(-3, 6, -9);
    this.worldRoot.add(this.geometry.root, this.collection.carrier, this.light, this.itemAimTarget);
    this.worldRoot.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed) return;
    this.clear();
    if (context.eventId !== this.eventId) return;
    this.staged = true;
    this.elapsed = 0;
    this.revealProgress = 0;
    this.releaseProgress = 0;
    this.releaseStarted = false;
    this.geometry.root.visible = true;
    this.worldRoot.visible = true;
    this.collection.begin();
    this.apply();
  }

  reveal(): Promise<void> {
    return this.staged && !this.disposed
      ? this.animation.start('reveal', KRAKEN_REVEAL_SECONDS) : Promise.resolve();
  }

  playItemUse(): Promise<boolean> { return Promise.resolve(false); }

  react(result: EventOutcomePresentation): Promise<void> {
    if (!this.staged || this.disposed || !result.outcome.accepted
      || result.outcome.eventResult?.resultId !== 'heart-returned') return Promise.resolve();
    this.releaseStarted = true;
    return this.animation.start('release', KRAKEN_RELEASE_SECONDS);
  }

  update(_time: number, delta: number): void {
    if (!this.staged || this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.elapsed += step;
    this.animation.update(this.elapsed, step);
    this.apply();
  }

  private apply(): void {
    const revealTime = this.revealProgress * KRAKEN_REVEAL_SECONDS;
    const rise = krakenEase(revealTime / KRAKEN_EMERGE_SECONDS);
    const releaseTime = this.releaseProgress * KRAKEN_RELEASE_SECONDS;
    const descentTime = Math.max(0, releaseTime - KRAKEN_COLLECTION_SECONDS);
    const retreat = krakenEase(descentTime / 5);
    this.environment.sampleWorldWaveInto(this.wave, this.elapsed, 0, -17, this.environment.readWorldWaveAmplitudeScale());
    this.geometry.root.position.set(0, this.wave.height * 0.22 - 18 + rise * 18.6 - retreat * 13.5, -17 - retreat * 2);
    this.geometry.update(this.elapsed, rise, retreat);
    this.collection.update(this.releaseStarted ? releaseTime : -1);
    this.light.intensity = rise * (1 - retreat * 0.9) * 22;
    this.itemAimTarget.position.copy(this.collection.carrier.position);
    if (this.releaseProgress === 1) {
      this.collection.end(true);
      this.geometry.root.visible = false;
      this.light.intensity = 0;
    }
  }

  skip(): void { this.settleForVisibilityChange(); }
  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle(this.elapsed);
    if (this.staged) this.apply();
  }
  clear(): void {
    this.animation.cancel();
    if (this.staged) this.collection.end(this.releaseStarted);
    this.staged = false;
    this.worldRoot.visible = false;
    this.light.intensity = 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.geometry.dispose();
    this.light.dispose();
    this.worldRoot.clear();
    this.boatRoot.clear();
  }
}

