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

export type EventPresentationCue =
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
    }>;
