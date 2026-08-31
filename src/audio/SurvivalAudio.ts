import type { ItemId } from '../game/ItemState';
import type { SurvivalEndingId } from '../game/ending';
import type { FishingTerminalResult } from '../survival/FishingSession';
import type { DedicatedEventId } from '../survival/eventPresentationRoutes';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
} from '../survival/survivalTypes';
import type { PresentationWeatherId } from '../weather/presentationWeather';
import type {
  ChestAttackAudioCue,
  CheckBackAudioCue,
  MidnightTourAudioCue,
} from '../survival/eventPresentationCue';
import type { AudioVoice } from './AudioBackend';
import type { AudioScope } from './AudioScope';
import type { SoundId } from './audioManifest';

const WEATHER_GAINS: Readonly<Record<
  PresentationWeatherId,
  Readonly<Record<'calmOcean' | 'roughOcean' | 'lightWind' | 'strongWind' | 'rain' | 'boatCreak', number>>
>> = Object.freeze({
  calm: Object.freeze({
    calmOcean: 0.9, roughOcean: 0.03, lightWind: 0.25,
    strongWind: 0, rain: 0, boatCreak: 0.28,
  }),
  overcast: Object.freeze({
    calmOcean: 0.55, roughOcean: 0.2, lightWind: 0.45,
    strongWind: 0.05, rain: 0, boatCreak: 0.35,
  }),
  squall: Object.freeze({
    calmOcean: 0.1, roughOcean: 0.8, lightWind: 0.15,
    strongWind: 0.8, rain: 0, boatCreak: 0.72,
  }),
  rain: Object.freeze({
    calmOcean: 0.35, roughOcean: 0.35, lightWind: 0.25,
    strongWind: 0.3, rain: 1, boatCreak: 0.46,
  }),
  wind: Object.freeze({
    calmOcean: 0.2, roughOcean: 0.55, lightWind: 0.2,
    strongWind: 1, rain: 0, boatCreak: 0.68,
  }),
  thunderstorm: Object.freeze({
    calmOcean: 0.05, roughOcean: 0.9, lightWind: 0.05,
    strongWind: 0.8, rain: 1, boatCreak: 0.8,
  }),
  waves: Object.freeze({
    calmOcean: 0.05, roughOcean: 1, lightWind: 0.1,
    strongWind: 0.5, rain: 0, boatCreak: 0.85,
  }),
  fog: Object.freeze({
    calmOcean: 0.65, roughOcean: 0.05, lightWind: 0.15,
    strongWind: 0, rain: 0, boatCreak: 0.22,
  }),
});

const WEATHER_LOOPS = Object.freeze([
  'calmOcean',
  'roughOcean',
  'lightWind',
  'strongWind',
  'rain',
  'boatCreak',
] as const);

const TOOL_SOUNDS: Readonly<Partial<Record<ItemId, SoundId>>> = Object.freeze({
  bucket: 'bucketRain',
  umbrella: 'umbrella',
  anchor: 'anchorChain',
  flashlight: 'flashlight',
  flareGun: 'flareGun',
  shotgun: 'shotgun',
  scubaSet: 'diveEntry',
});

const EVENT_ITEM_SOUNDS: Readonly<Partial<Record<ItemId, SoundId>>> = Object.freeze({
  ductTape: 'ductTapePickup',
  flareGun: 'flareGun',
  shotgun: 'shotgun',
  flashlight: 'flashlight',
  anchor: 'anchorChain',
  umbrella: 'umbrella',
});

const ROUGH_WEATHER = new Set<PresentationWeatherId>([
  'squall',
  'thunderstorm',
  'waves',
]);

const THUNDER_SOUNDS = Object.freeze([
  'thunderLightning',
  'thunderLightningCrack',
  'thunderLightningDry',
] as const satisfies readonly SoundId[]);

const CAT_MEOW_SOUNDS = Object.freeze([
  'catMeow1',
  'catMeow2',
  'catMeow3',
  'catMeow4',
  'catMeow5',
  'catMeow6',
  'catMeow7',
] as const satisfies readonly SoundId[]);

const SHADOW_MEOW_DELAY_SECONDS = 0.12;

export class SurvivalAudio {
  private weather: PresentationWeatherId = 'calm';
  private waveClock = 0;
  private thunderSoundIndex = 0;
  private diveActive = false;
  private eventMelodyActive = false;
  private midnightDigVoice: AudioVoice | null = null;
  private midnightDigRemaining = 0;
  private midnightAttackPlayed = false;
  private planeFlybyVoice: AudioVoice | null = null;
  private radioSignalVoice: AudioVoice | null = null;
  private readonly meowBag: SoundId[] = [];
  private lastMeow: SoundId | null = null;
  private pendingShadowMeow: SoundId | null = null;
  private shadowMeowDelay = 0;
  private disposed = false;

  constructor(
    private readonly scope: AudioScope,
    private readonly random: () => number = Math.random,
  ) {}

  start(): void {
    if (this.disposed) return;
    for (const id of WEATHER_LOOPS) this.scope.startLoop(id);
    this.setWeather(this.weather, 0);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const elapsed = Math.max(0, deltaSeconds);
    this.waveClock += elapsed;
    if (this.midnightDigVoice !== null) {
      this.midnightDigRemaining -= elapsed;
      if (this.midnightDigRemaining <= 0) {
        this.midnightDigVoice.stop(0.05);
        this.midnightDigVoice = null;
        this.midnightDigRemaining = 0;
      }
    }
    if (this.pendingShadowMeow !== null) {
      this.shadowMeowDelay -= elapsed;
      if (this.shadowMeowDelay <= 0) {
        this.scope.play(this.pendingShadowMeow);
        this.pendingShadowMeow = null;
        this.shadowMeowDelay = 0;
      }
    }
    const rough = ROUGH_WEATHER.has(this.weather);
    const interval = rough ? 4 : 8;
    while (this.waveClock >= interval) {
      this.waveClock -= interval;
      this.scope.play(rough ? 'hardWaveImpact' : 'lightWaveImpact');
    }
  }

  setWeather(id: PresentationWeatherId, rampSeconds = 1.5): void {
    if (this.disposed) return;
    this.weather = id;
    const gains = WEATHER_GAINS[id];
    for (const loop of WEATHER_LOOPS) {
      this.scope.setLoopGain(loop, gains[loop], rampSeconds);
    }
  }

  action(action: DayActionId, option?: DayActionOption): void {
    if (this.disposed) return;
    if (action === 'eat' || action === 'useEnergyBar') {
      this.scope.play('eating');
    } else if (action === 'treat') {
      this.scope.play('medkit');
    } else if (action === 'repair') {
      this.scope.play(
        option?.kind === 'hullRepair' && option.material === 'ductTape'
          ? 'tapeRepair'
          : 'hullRepair',
      );
    } else if (action === 'repairItem') {
      this.scope.play('tapeRepair');
    } else if (action === 'openChest') {
      this.scope.play('chest');
    } else if (action === 'answerRadio') {
      this.clearRadioSignal();
      this.scope.play('radioReply');
    }
  }

  petCarlitos(): void {
    if (this.disposed) return;
    const meow = this.drawMeow();
    if (meow !== null) this.scope.play(meow);
  }

  beginRadioSignal(onEnded: () => void): boolean {
    if (this.disposed || this.radioSignalVoice !== null) return false;
    const voice = this.scope.play('radioSignal');
    if (voice === null) return false;
    this.radioSignalVoice = voice;
    voice.onEnded(() => {
      if (this.radioSignalVoice !== voice) return;
      this.radioSignalVoice = null;
      onEnded();
    });
    return true;
  }

  clearRadioSignal(): void {
    const voice = this.radioSignalVoice;
    if (voice === null) return;
    this.radioSignalVoice = null;
    voice.stop(0.03);
  }

  repairToolbox(): void {
    if (!this.disposed) this.scope.play('hullRepair');
  }

  beginDive(): void {
    if (this.disposed || this.diveActive) return;
    this.diveActive = true;
    this.scope.play('diveEntry');
    this.scope.startLoop('underwaterMovement');
  }

  finishDive(): void {
    if (this.disposed || !this.diveActive) return;
    this.cancelDive();
    this.scope.play('diveSurface');
  }

  cancelDive(): void {
    if (this.disposed || !this.diveActive) return;
    this.diveActive = false;
    this.scope.stopLoop('underwaterMovement', 0.2);
  }

  fishingCast(): void {
    if (!this.disposed) this.scope.play('fishingCast');
  }

  fishingBite(): void {
    if (!this.disposed) this.scope.play('fishingBite');
  }

  fishingReel(): void {
    if (!this.disposed) this.scope.play('fishingReel');
  }

  fishingResult(result: FishingTerminalResult): void {
    if (this.disposed) return;
    if (result.kind === 'miss') {
      this.scope.play('fishingMiss');
    } else {
      this.scope.play(result.catch.kind === 'fish' ? 'fishCatch' : 'junkCatch');
    }
  }

  tool(item: ItemId): void {
    if (this.disposed) return;
    this.scope.play(TOOL_SOUNDS[item] ?? 'confirm');
  }

  eventItem(itemId: ItemId): void {
    if (this.disposed || itemId === 'map' || itemId === 'compass') return;
    this.scope.play(EVENT_ITEM_SOUNDS[itemId] ?? 'itemHandling');
  }

  eventItemCue(itemId: ItemId, cueIndex: number): void {
    if (this.disposed) return;
    if (itemId === 'radio') {
      this.clearRadioSignal();
      this.beginRadioSignal(() => undefined);
      return;
    }
    if (itemId === 'flareGun') {
      this.scope.play(cueIndex === 0 ? 'flareGunShot' : 'flareGun');
      return;
    }
    if (itemId === 'anchor') {
      this.scope.play('anchorSplash');
      return;
    }
    if (itemId === 'map') {
      this.scope.play('tapeRepair');
      return;
    }
    this.eventItem(itemId);
  }

  bucketHelmetRain(): void {
    if (!this.disposed) this.scope.play('bucketRain');
  }

  sleep(): void {
    if (!this.disposed) this.scope.play('goingToSleep');
  }

  nightfall(): void {
    if (!this.disposed) this.scope.play('nightfall');
  }

  dawn(): void {
    if (!this.disposed) this.scope.play('dawn');
  }

  eventReveal(eventId: string): void {
    if (this.disposed) return;
    if (
      eventId === 'drifting-supplies'
      || eventId === 'drifting-chest'
    ) return;
    if (eventId === 'bad-sleep') {
      this.scope.play('yawn');
      return;
    }
    if (eventId === 'ghosts') {
      this.scope.play('ghostSpiritBreath');
      return;
    }
    if (eventId === 'shadow-figure') {
      this.scope.play('eventReveal');
      const firstMeow = this.drawMeow();
      if (firstMeow !== null) this.scope.play(firstMeow);
      this.pendingShadowMeow = this.drawMeow();
      this.shadowMeowDelay = SHADOW_MEOW_DELAY_SECONDS;
      return;
    }
    this.scope.play('eventReveal');
  }

  beginEvent(eventId: string): void {
    this.clearEvent();
    if (this.disposed) return;
    if (eventId === 'snatcher') {
      this.scope.startLoop('tentacleMovement');
      return;
    }
    if (eventId === 'leak') {
      this.scope.startLoop('leak');
      return;
    }
    if (eventId === 'tornado') {
      this.scope.startLoop('tornadoWind');
      return;
    }
    if (eventId === 'plane') {
      const voice = this.scope.play('planeFlyby');
      this.planeFlybyVoice = voice;
      voice?.onEnded(() => {
        if (this.planeFlybyVoice === voice) this.planeFlybyVoice = null;
      });
      return;
    }
    if (eventId !== 'eerie-melody') return;
    this.eventMelodyActive = true;
    this.scope.startLoop('eerieMelody');
  }

  beginEventReaction(eventId: string, outcome: ActionOutcome): void {
    if (
      this.disposed
      || !this.eventMelodyActive
      || eventId !== 'eerie-melody'
    ) return;
    const attack = (outcome.deltas.hull ?? 0) < 0
      || (outcome.deltas.health ?? 0) < 0;
    if (!attack) this.stopEventMelody(0.02);
  }

  finishEventReaction(eventId: string): void {
    if (this.disposed) return;
    this.clearEvent();
  }

  midnightTourCue(cue: MidnightTourAudioCue): void {
    if (this.disposed) return;
    if (cue === 'dig-start' && this.midnightDigVoice === null) {
      this.midnightDigVoice = this.scope.play('midnightShovel');
      this.midnightDigRemaining = 6;
    } else if (cue === 'attack' && !this.midnightAttackPlayed) {
      this.midnightAttackPlayed = true;
      this.scope.play('midnightMonsterAttack');
    }
  }

  chestAttackCue(cue: ChestAttackAudioCue): void {
    if (this.disposed) return;
    this.scope.play(cue === 'wood' ? 'chest' : 'midnightMonsterAttack');
  }

  checkBackCue(cue: CheckBackAudioCue): void {
    if (this.disposed) return;
    this.scope.play(cue === 'fish' ? 'checkBackFish' : 'checkBackAnglerfish');
  }

  clearMidnightTour(): void {
    this.midnightDigVoice?.stop(0.05);
    this.midnightDigVoice = null;
    this.midnightDigRemaining = 0;
    this.midnightAttackPlayed = false;
  }

  clearEvent(): void {
    if (this.diveActive) this.cancelDive();
    this.pendingShadowMeow = null;
    this.shadowMeowDelay = 0;
    this.planeFlybyVoice?.stop(0.08);
    this.planeFlybyVoice = null;
    this.clearMidnightTour();
    this.scope.stopLoop('leak', 0.08);
    this.scope.stopLoop('tentacleMovement', 0.08);
    this.scope.stopLoop('tornadoWind', 0.08);
    this.stopEventMelody(0.08);
  }

  eventAction(eventId: DedicatedEventId, choiceId: string): void {
    if (this.disposed) return;
    if (choiceId === 'damage') {
      this.scope.play('hardWaveImpact');
    } else if (eventId === 'leak' && choiceId === 'ductTape') {
      this.scope.play('tapeRepair');
    } else if (eventId === 'school-of-fish') {
      this.scope.play('fishCatch');
    } else if (choiceId === 'shotgun') {
      this.scope.play('shotgun');
    } else if (eventId === 'tornado' && choiceId === 'anchor') {
      this.scope.play('anchorChain');
    } else {
      this.scope.play('itemHandling');
    }
  }

  journal(): void {
    if (!this.disposed) this.scope.play('journal');
  }

  confirm(): void {
    if (!this.disposed) this.scope.play('confirm');
  }

  deny(): void {
    if (!this.disposed) this.scope.play('denied');
  }

  thunder(): void {
    if (this.disposed) return;
    this.scope.play(THUNDER_SOUNDS[this.thunderSoundIndex]!);
    this.thunderSoundIndex = (this.thunderSoundIndex + 1) % THUNDER_SOUNDS.length;
  }

  ending(id: SurvivalEndingId): void {
    if (this.disposed) return;
    const cue = id === 'rescue'
      ? 'rescueEnding'
      : id === 'sinking'
        ? 'sinkingEnding'
        : 'deathEnding';
    this.scope.play(cue);
  }

  setPaused(paused: boolean): void {
    if (!this.disposed) this.scope.setPaused(paused);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearRadioSignal();
    this.clearEvent();
    this.cancelDive();
    this.disposed = true;
    this.scope.dispose();
  }

  private stopEventMelody(fadeSeconds: number): void {
    if (!this.eventMelodyActive) return;
    this.eventMelodyActive = false;
    this.scope.stopLoop('eerieMelody', fadeSeconds);
  }

  private drawMeow(): SoundId | null {
    if (this.meowBag.length === 0) this.refillMeowBag();
    const id = this.meowBag.pop() ?? null;
    if (id !== null) this.lastMeow = id;
    return id;
  }

  private refillMeowBag(): void {
    this.meowBag.push(...CAT_MEOW_SOUNDS);
    for (let index = this.meowBag.length - 1; index > 0; index -= 1) {
      const unit = Math.min(0.999999, Math.max(0, this.random()));
      const swapIndex = Math.floor(unit * (index + 1));
      const selected = this.meowBag[index]!;
      this.meowBag[index] = this.meowBag[swapIndex]!;
      this.meowBag[swapIndex] = selected;
    }
    const nextIndex = this.meowBag.length - 1;
    if (this.lastMeow === this.meowBag[nextIndex]) {
      const replacement = this.meowBag[0]!;
      this.meowBag[0] = this.meowBag[nextIndex]!;
      this.meowBag[nextIndex] = replacement;
    }
  }
}
