import { Group, Object3D, PointLight, type Vector3 } from 'three';
import { createWaveSample } from '../../ocean/WaveField';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import type { KrakenAudioCue } from '../eventPresentationCue';
import type { DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext } from '../eventPresentationTypes';
import { KrakenGeometry } from './krakenGeometry';
import { KrakenCollection } from './KrakenCollection';
import { KrakenWater } from './krakenWater';
import {
  KRAKEN_BOAT_DISTANCE, KRAKEN_COLLECTION_SECONDS, KRAKEN_DESCENT_SECONDS, KRAKEN_EMERGE_SECONDS,
  KRAKEN_EYES_OPEN_AT, KRAKEN_RELEASE_SECONDS, KRAKEN_REVEAL_SECONDS, krakenEase,
} from './krakenChoreography';

const CUES: readonly KrakenAudioCue[] = ['surge', 'roar', 'grip', 'sink'];

export class KrakenPresentation implements DedicatedEventPresentation {
  readonly eventId = 'kraken';
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Object3D();
  private readonly geometry = new KrakenGeometry();
  private readonly water = new KrakenWater();
  private readonly collection: KrakenCollection;
  private readonly light = new PointLight(0x9fb4ad, 0, 60, 1.3);
  private readonly wave = createWaveSample();
  private readonly runoff = (seed: number, target: Vector3): boolean => this.geometry.runoffPoint(seed, target);
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
  /** One bit per cue in CUES. A cue sounds once per staging. */
  private cuesPlayed = 0;

  constructor(private readonly environment: Pick<DedicatedEventEnvironment,
    'sampleWorldWaveInto' | 'readWorldWaveAmplitudeScale' | 'heartDisplay' | 'emitCue'>) {
    this.collection = new KrakenCollection(this.geometry, environment.heartDisplay);
    this.worldRoot.name = 'kraken-world';
    this.boatRoot.name = 'kraken-boat';
    this.light.position.set(-4, 10, -12);
    this.geometry.root.add(this.water.root);
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
    this.cuesPlayed = 0;
    this.water.reset();
    this.geometry.root.visible = true;
    this.worldRoot.visible = true;
    this.collection.begin();
    this.apply(0, false);
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
    this.apply(step, true);
  }

  private apply(step: number, audible: boolean): void {
    const revealTime = this.revealProgress * KRAKEN_REVEAL_SECONDS;
    const releaseTime = this.releaseProgress * KRAKEN_RELEASE_SECONDS;
    const descentTime = Math.max(0, releaseTime - KRAKEN_COLLECTION_SECONDS);
    const descent = descentTime / KRAKEN_DESCENT_SECONDS;
    this.environment.sampleWorldWaveInto(this.wave, this.elapsed, 0, -KRAKEN_BOAT_DISTANCE,
      this.environment.readWorldWaveAmplitudeScale());
    const rootY = this.wave.height * 0.22 + 0.3;
    this.geometry.root.position.set(0, rootY, -KRAKEN_BOAT_DISTANCE);
    this.geometry.update(this.elapsed, revealTime, descent);
    this.collection.update(this.releaseStarted ? releaseTime : -1);
    const presence = krakenEase(revealTime / KRAKEN_EMERGE_SECONDS) * (1 - krakenEase(descent / 0.8) * 0.9);
    this.light.intensity = presence * 30;
    // Water churns as the body breaches, pours off it, and boils again as it sinks.
    const breach = Math.min(1, revealTime / 1.2) * (1 - 0.5 * krakenEase((revealTime - 6) / 3));
    const churn = Math.sin(Math.PI * Math.min(1, descent * 1.3));
    const foam = revealTime <= 0 ? 0 : Math.max(breach, churn) * (1 - krakenEase((descent - 0.75) / 0.25)) * 0.8;
    const pour = revealTime <= 0 ? 0 : 140 + 380 * (1 - krakenEase((revealTime - 6.5) / 2.5)) + churn * 200;
    this.water.update(step, this.elapsed, pour * (1 - descent), foam, this.wave.height - rootY, this.runoff);
    this.itemAimTarget.position.copy(this.collection.carrier.position);
    this.cue(0, revealTime > 0, audible);
    this.cue(1, revealTime >= KRAKEN_EYES_OPEN_AT, audible);
    this.cue(2, this.collection.taken, audible);
    this.cue(3, descentTime > 0, audible);
    if (this.releaseProgress === 1) {
      this.collection.end(true);
      this.geometry.root.visible = false;
      this.light.intensity = 0;
    }
  }

  /** Skipped time marks a cue as played without sound. */
  private cue(index: number, reached: boolean, audible: boolean): void {
    const bit = 1 << index;
    if (!reached || (this.cuesPlayed & bit) !== 0) return;
    this.cuesPlayed |= bit;
    if (audible) this.environment.emitCue({ eventId: 'kraken', cue: CUES[index]! });
  }

  skip(): void { this.settleForVisibilityChange(); }
  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle(this.elapsed);
    if (this.staged) this.apply(0, false);
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
    this.water.dispose();
    this.light.dispose();
    this.worldRoot.clear();
    this.boatRoot.clear();
  }
}
