export const Phase = {
  Intro: 'intro',
  Scavenge: 'scavenge',
  CrewSelect: 'crewSelect',
  Day: 'day',
  Night: 'night',
  Ending: 'ending',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

const LEGAL: Record<Phase, Phase[]> = {
  [Phase.Intro]: [Phase.Scavenge],
  [Phase.Scavenge]: [Phase.CrewSelect],
  [Phase.CrewSelect]: [Phase.Day],
  [Phase.Day]: [Phase.Night, Phase.Ending],
  [Phase.Night]: [Phase.Day, Phase.Ending],
  [Phase.Ending]: [],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return LEGAL[from]?.includes(to) ?? false;
}
