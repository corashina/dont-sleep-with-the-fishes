export const SOUND_IDS = [
  'menuAmbient',
  'calmOcean',
  'roughOcean',
  'lightWind',
  'strongWind',
  'rain',
  'thunderLightning',
  'thunderLightningCrack',
  'thunderLightningDry',
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
  'radioSignal',
  'radioReply',
  'eating',
  'catMeow1',
  'catMeow2',
  'catMeow3',
  'catMeow4',
  'catMeow5',
  'catMeow6',
  'catMeow7',
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
  'planeFlyby',
  'ghostSpiritBreath',
  'tornadoWind',
  'leak',
  'tentacleMovement',
  'eerieMelody',
  'chest',
  'rescueEnding',
  'deathEnding',
  'sinkingEnding',
  'shipCrash',
  'midnightShovel',
  'midnightMonsterAttack',
  'checkBackFish',
  'checkBackAnglerfish',
] as const;

export type SoundId = typeof SOUND_IDS[number];
export type AudioBusId = 'music' | 'ambience' | 'effects' | 'interface';

export const EVENT_ONLY_SOUND_IDS = Object.freeze([
  'bucketRain',
  'umbrella',
  'anchorChain',
  'anchorSplash',
  'flashlight',
  'flareGunShot',
  'flareGun',
  'shotgun',
  'yawn',
  'thunderLightning',
  'thunderLightningCrack',
  'thunderLightningDry',
  'planeFlyby',
  'ghostSpiritBreath',
  'tornadoWind',
  'leak',
  'tentacleMovement',
  'eerieMelody',
  'midnightShovel',
  'midnightMonsterAttack',
  'checkBackFish',
  'checkBackAnglerfish',
] as const satisfies readonly SoundId[]);

const eventOnlySounds = new Set<SoundId>(EVENT_ONLY_SOUND_IDS);

export const INTERFACE_SOUND_IDS = ['confirm', 'denied', 'pause', 'resume', 'journal'] as const satisfies readonly SoundId[];
export const MENU_SOUND_IDS = ['menuAmbient', ...INTERFACE_SOUND_IDS] as const;
export const SHIP_SOUND_IDS = [
  ...INTERFACE_SOUND_IDS, 'roomTone', 'shipAlarm', 'scavengeChase',
  'scavengeCountdown', 'woodStep', 'jump', 'itemHandling', 'sinkingEnding', 'shipCrash',
] as const satisfies readonly SoundId[];
const shipOnlySounds = new Set<SoundId>([
  'menuAmbient', 'roomTone', 'shipAlarm', 'scavengeChase', 'scavengeCountdown',
  'woodStep', 'jump', 'shipCrash',
]);
export const SURVIVAL_SOUND_IDS = Object.freeze(
  SOUND_IDS.filter(id => !eventOnlySounds.has(id) && !shipOnlySounds.has(id)),
);

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
    menuAmbient: asset('menuAmbient', 'ambience', 0.3, true, 1),
    calmOcean: asset('calmOcean', 'ambience', 0.42, true),
    roughOcean: asset('roughOcean', 'ambience', 0.5, true),
    lightWind: asset('lightWind', 'ambience', 0.24, true),
    strongWind: asset('strongWind', 'ambience', 0.42, true),
    rain: asset('rain', 'ambience', 0.34, true),
    thunderLightning: asset('thunderLightning', 'effects', 0.72, false, 2),
    thunderLightningCrack: asset('thunderLightningCrack', 'effects', 0.72, false, 2),
    thunderLightningDry: asset('thunderLightningDry', 'effects', 0.72, false, 2),
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
    radioSignal: asset('radioSignal', 'effects', 0.46, false, 1),
    radioReply: asset('radioReply', 'effects', 0.5, false, 1),
    eating: asset('eating', 'effects', 0.38, false, 2),
    catMeow1: asset('catMeow1', 'effects', 0.52, false, 1),
    catMeow2: asset('catMeow2', 'effects', 0.52, false, 1),
    catMeow3: asset('catMeow3', 'effects', 0.52, false, 1),
    catMeow4: asset('catMeow4', 'effects', 0.52, false, 1),
    catMeow5: asset('catMeow5', 'effects', 0.52, false, 1),
    catMeow6: asset('catMeow6', 'effects', 0.52, false, 1),
    catMeow7: asset('catMeow7', 'effects', 0.52, false, 1),
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
    planeFlyby: asset('planeFlyby', 'ambience', 0.42, false, 1),
    ghostSpiritBreath: asset('ghostSpiritBreath', 'effects', 0.5, false, 1),
    tornadoWind: asset('tornadoWind', 'ambience', 0.46, true, 1),
    leak: asset('leak', 'ambience', 0.34, true, 1),
    tentacleMovement: asset('tentacleMovement', 'ambience', 0.2, true, 1),
    eerieMelody: asset('eerieMelody', 'ambience', 0.38, true, 1),
    chest: asset('chest', 'effects', 0.5, false, 2),
    rescueEnding: asset('rescueEnding', 'effects', 0.55, false, 1),
    deathEnding: asset('deathEnding', 'music', 0.48, false, 1),
    sinkingEnding: asset('sinkingEnding', 'effects', 0.64, false, 1),
    shipCrash: Object.freeze({
      ...asset('sinkingEnding', 'effects', 0.68, false, 1),
      gain: 0.68,
    }),
    midnightShovel: asset('midnightShovel', 'effects', 0.55, false, 1),
    midnightMonsterAttack: asset('midnightMonsterAttack', 'effects', 0.72, false, 1),
    checkBackFish: asset('checkBackFish', 'effects', 0.5, false, 1),
    checkBackAnglerfish: asset('checkBackAnglerfish', 'effects', 0.68, false, 1),
  });
