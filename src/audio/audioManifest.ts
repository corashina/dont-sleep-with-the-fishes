export const SOUND_IDS = [
  'menuAmbient',
  'calmOcean',
  'roughOcean',
  'lightWind',
  'strongWind',
  'rain',
  'thunderLightning',
  'roomTone',
  'shipAlarm',
  'scavengeChase',
  'scavengeCountdown',
  'woodStep',
  'jump',
  'itemHandling',
  'boatCreak',
  'lightWaveImpact',
  'hardWaveImpact',
  'confirm',
  'denied',
  'pause',
  'resume',
  'journal',
  'eating',
  'medkit',
  'hullRepair',
  'tapeRepair',
  'ductTapePickup',
  'diveEntry',
  'underwaterMovement',
  'diveSurface',
  'fishingCast',
  'fishingBite',
  'fishingReel',
  'fishCatch',
  'junkCatch',
  'fishingMiss',
  'bucketRain',
  'umbrella',
  'anchorChain',
  'anchorSplash',
  'flashlight',
  'flareGunShot',
  'flareGun',
  'shotgun',
  'goingToSleep',
  'yawn',
  'nightfall',
  'dawn',
  'eventReveal',
  'tentacleMovement',
  'eerieMelody',
  'chest',
  'driftingCargo',
  'rescueEnding',
  'deathEnding',
  'sinkingEnding',
  'shipCrash',
] as const;

export type SoundId = typeof SOUND_IDS[number];
export type AudioBusId = 'music' | 'ambience' | 'effects' | 'interface';

export interface AudioAssetDefinition {
  readonly url: string;
  readonly bus: AudioBusId;
  readonly gain: number;
  readonly loop: boolean;
  readonly maxVoices: number;
}

const audioModules = import.meta.glob<string>(
  '../assets/audio/*.{flac,mp3,wav}',
  { eager: true, query: '?url', import: 'default' },
);

type AudioExtension = 'flac' | 'mp3' | 'wav';

function audioUrl(id: SoundId, extension: AudioExtension = 'mp3'): string {
  const path = `../assets/audio/${id}.${extension}`;
  const url = audioModules[path];
  if (url === undefined) throw new Error(`Missing audio asset: ${path}`);
  return url;
}

function asset(
  id: SoundId,
  bus: AudioBusId,
  gain: number,
  loop = false,
  maxVoices = loop ? 1 : 3,
  extension: AudioExtension = 'mp3',
): AudioAssetDefinition {
  return Object.freeze({
    url: audioUrl(id, extension),
    bus,
    gain,
    loop,
    maxVoices,
  });
}

export const AUDIO_MANIFEST: Readonly<Record<SoundId, AudioAssetDefinition>> =
  Object.freeze({
    menuAmbient: asset('menuAmbient', 'ambience', 0.3, true, 1, 'flac'),
    calmOcean: asset('calmOcean', 'ambience', 0.42, true),
    roughOcean: asset('roughOcean', 'ambience', 0.5, true),
    lightWind: asset('lightWind', 'ambience', 0.24, true),
    strongWind: asset('strongWind', 'ambience', 0.42, true),
    rain: asset('rain', 'ambience', 0.34, true),
    thunderLightning: asset('thunderLightning', 'effects', 0.72, false, 2),
    roomTone: asset('roomTone', 'ambience', 0.28, true),
    shipAlarm: asset('shipAlarm', 'effects', 0.46, true, 1),
    scavengeChase: asset('scavengeChase', 'music', 0.42, false, 1),
    scavengeCountdown: asset('scavengeCountdown', 'music', 0.52, false, 1),
    woodStep: asset('woodStep', 'effects', 0.28, false, 4),
    jump: asset('jump', 'effects', 0.3, false, 2),
    itemHandling: asset('itemHandling', 'effects', 0.38, false, 3),
    boatCreak: asset('boatCreak', 'ambience', 0.22, true),
    lightWaveImpact: asset('lightWaveImpact', 'effects', 0.28, false, 2),
    hardWaveImpact: asset('hardWaveImpact', 'effects', 0.46, false, 2),
    confirm: asset('confirm', 'interface', 0.34, false, 2),
    denied: asset('denied', 'interface', 0.34, false, 2),
    pause: asset('pause', 'interface', 0.32, false, 1),
    resume: asset('resume', 'interface', 0.32, false, 1),
    journal: asset('journal', 'interface', 0.38, false, 2),
    eating: asset('eating', 'effects', 0.38, false, 2),
    medkit: asset('medkit', 'effects', 0.4, false, 2),
    hullRepair: asset('hullRepair', 'effects', 0.48, false, 2),
    tapeRepair: asset('tapeRepair', 'effects', 0.42, false, 2),
    ductTapePickup: asset('ductTapePickup', 'effects', 0.42, false, 2),
    diveEntry: asset('diveEntry', 'effects', 0.62, false, 1),
    underwaterMovement: asset('underwaterMovement', 'ambience', 0.42, true),
    diveSurface: asset('diveSurface', 'effects', 0.5, false, 1),
    fishingCast: asset('fishingCast', 'effects', 0.44, false, 2),
    fishingBite: asset('fishingBite', 'effects', 0.45, false, 2),
    fishingReel: asset('fishingReel', 'effects', 0.42, false, 2),
    fishCatch: asset('fishCatch', 'effects', 0.5, false, 2),
    junkCatch: asset('junkCatch', 'effects', 0.46, false, 2),
    fishingMiss: asset('fishingMiss', 'effects', 0.38, false, 2),
    bucketRain: asset('bucketRain', 'effects', 0.4, false, 2),
    umbrella: asset('umbrella', 'effects', 0.44, false, 2),
    anchorChain: asset('anchorChain', 'effects', 0.54, false, 2),
    anchorSplash: asset('anchorSplash', 'effects', 0.58, false, 2),
    flashlight: asset('flashlight', 'effects', 0.42, false, 2),
    flareGunShot: asset('flareGunShot', 'effects', 0.62, false, 2),
    flareGun: asset('flareGun', 'effects', 0.62, false, 2),
    shotgun: asset('shotgun', 'effects', 0.62, false, 2),
    goingToSleep: asset('goingToSleep', 'effects', 0.4, false, 1),
    yawn: asset('yawn', 'effects', 0.48, false, 1),
    nightfall: asset('nightfall', 'effects', 0.36, false, 1),
    dawn: asset('dawn', 'music', 0.28, false, 1, 'wav'),
    eventReveal: asset('eventReveal', 'effects', 0.42, false, 1),
    tentacleMovement: asset('tentacleMovement', 'ambience', 0.2, true, 1),
    eerieMelody: asset('eerieMelody', 'ambience', 0.38, true, 1),
    chest: asset('chest', 'effects', 0.5, false, 2),
    driftingCargo: asset('driftingCargo', 'effects', 0.46, false, 2),
    rescueEnding: asset('rescueEnding', 'effects', 0.55, false, 1),
    deathEnding: asset('deathEnding', 'music', 0.48, false, 1),
    sinkingEnding: asset('sinkingEnding', 'effects', 0.64, false, 1),
    shipCrash: Object.freeze({
      ...asset('sinkingEnding', 'effects', 0.68, false, 1),
      gain: 0.68,
    }),
  });
