export const MIDNIGHT_TOUR_AUDIO_CUES = Object.freeze([
  'dig-start',
  'run-start',
  'run-stop',
  'attack',
] as const);

export type MidnightTourAudioCue = typeof MIDNIGHT_TOUR_AUDIO_CUES[number];

export type EventPresentationCue = Readonly<{
  eventId: 'midnight-tour';
  cue: MidnightTourAudioCue;
}>;
