export type CrewmateId = 'frederik' | 'row';

export interface CrewmateDef {
  id: CrewmateId;
  name: string;
  perkSummary: string;
  color: number;                       // three.js hex color for figure tint
  repairBonus: number;                 // extra hull per Repair (base 10)
  guaranteesBait: boolean;             // +1 bait each successful fish day
  monsterDamageMultiplier: number;     // applied to listed events (1 = full)
  monsterEvents: string[];             // event ids this multiplier applies to
}

export const CREWMATES: Record<CrewmateId, CrewmateDef> = {
  frederik: {
    id: 'frederik',
    name: 'Frederik',
    perkSummary: 'Better repairs (+15). Guarantees bait when fishing.',
    color: 0xc0a16b,
    repairBonus: 5,           // base 10 + 5 = 15
    guaranteesBait: true,
    monsterDamageMultiplier: 1,
    monsterEvents: [],
  },
  row: {
    id: 'row',
    name: 'Row',
    perkSummary: 'Halves damage from the Squid and the Siren. Cheaper repairs.',
    color: 0x7fa8c9,
    repairBonus: 0,           // base 10 (cheaper is flavor; repair cost not modeled in MVP)
    guaranteesBait: false,
    monsterDamageMultiplier: 0.5,
    monsterEvents: ['giantSquid', 'eerieMelody'],
  },
};

export const CREWMATE_LIST: CrewmateDef[] = [CREWMATES.frederik, CREWMATES.row];
