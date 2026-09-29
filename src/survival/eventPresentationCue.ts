export const MIDNIGHT_TOUR_AUDIO_CUES = Object.freeze([
  'dig-start',
  'attack',
] as const);

export type MidnightTourAudioCue = typeof MIDNIGHT_TOUR_AUDIO_CUES[number];

export const CHEST_ATTACK_AUDIO_CUES = Object.freeze([
  'wood',
  'attack',
] as const);

export type ChestAttackAudioCue = typeof CHEST_ATTACK_AUDIO_CUES[number];

export const CHECK_BACK_AUDIO_CUES = Object.freeze([
  'fish',
  'anglerfish',
] as const);

export type CheckBackAudioCue = typeof CHECK_BACK_AUDIO_CUES[number];

export const KRAKEN_AUDIO_CUES = Object.freeze([
  'surge',
  'roar',
  'grip',
  'sink',
] as const);

export type KrakenAudioCue = typeof KRAKEN_AUDIO_CUES[number];

export const GHOST_SHIP_AUDIO_CUES = Object.freeze([
  'cannon-fire',
  'cannon-splash',
  'cannon-impact',
] as const);

export type GhostShipAudioCue = typeof GHOST_SHIP_AUDIO_CUES[number];

export const GHOSTS_AUDIO_CUES = Object.freeze([
  'turn',
  'contact',
] as const);

export type GhostsAudioCue = typeof GHOSTS_AUDIO_CUES[number];

export const SIREN_AUDIO_CUES = Object.freeze([
  'scream',
  'contact',
] as const);

export type SirenAudioCue = typeof SIREN_AUDIO_CUES[number];

export type EventPresentationCue =
  | Readonly<{ eventId: 'swarm-of-sharks'; cue: 'bite' }>
  | Readonly<{ eventId: 'monster-in-the-fog'; cue: 'bite' }>
  | Readonly<{ eventId: 'seagull-theft'; cue: 'grab' }>
  | Readonly<{ eventId: 'ghosts'; cue: GhostsAudioCue }>
  | Readonly<{ eventId: 'eerie-melody'; cue: SirenAudioCue }>
  | Readonly<{
      eventId: 'midnight-tour';
      cue: MidnightTourAudioCue;
    }>
  | Readonly<{
      eventId: 'chest-attack';
      cue: ChestAttackAudioCue;
    }>
  | Readonly<{
      eventId: 'check-the-back';
      cue: CheckBackAudioCue;
    }>
  | Readonly<{
      eventId: 'kraken';
      cue: KrakenAudioCue;
    }>
  | Readonly<{
      eventId: 'ghost-ship';
      cue: GhostShipAudioCue;
    }>;
