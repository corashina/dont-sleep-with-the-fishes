import { defineMessages } from './messages';
import { pluralCategory } from './language';

const ENERGY_WORDS = ['zero', 'one', 'two', 'three'] as const;

export const uiDynamic = defineMessages({
  day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}` },
  page: { en: (page: number, total: number) => `PAGE ${page} OF ${total}`, pl: (page: number, total: number) => `STRONA ${page} Z ${total}` },
  energyCount: { en: (count: number) => `${count} energy`, pl: (count: number) => `${count} energii` },
  spokenEnergy: { en: (count: number) => `${ENERGY_WORDS[count] ?? count} energy`, pl: (count: number) => `${count} energii` },
  bonusEnergy: { en: (standard: number, bonus: number) => `${standard} standard energy and ${bonus} bonus energy`, pl: (standard: number, bonus: number) => `${standard} zwykłej energii i ${bonus} dodatkowej energii` },
  dangerValue: { en: (value: number) => `${value}, low`, pl: (value: number) => `${value}, niski poziom` },
  brokenItem: { en: (label: string) => `${label} — BROKEN`, pl: (label: string) => `${label} — USZKODZONE` },
  repairItemHelp: { en: (label: string) => `Repair ${label} with Duct Tape.`, pl: (label: string) => `Napraw przedmiot „${label}” taśmą klejącą.` },
  safe: { en: 'SAFE', pl: 'BEZPIECZNE' },
  uncertain: { en: 'UNCERTAIN', pl: 'NIEPEWNE' },
  dangerous: { en: 'DANGEROUS', pl: 'NIEBEZPIECZNE' },
  eventAnnouncement: { en: (danger: string, text: string) => `${danger[0]!.toUpperCase()}${danger.slice(1).toLowerCase()} event. ${text}`, pl: (danger: string, text: string) => `${danger[0]!.toUpperCase()}${danger.slice(1).toLowerCase()} zdarzenie. ${text}` },
  seconds: { en: (count: number) => `${count} SECONDS`, pl: (count: number) => `${count} ${pluralCategory(count) === 'one' ? 'SEKUNDA' : pluralCategory(count) === 'few' ? 'SEKUNDY' : 'SEKUND'}` },
  graphDescription: { en: (labels: string, axis: string) => `${labels} over ${axis.toLowerCase()}`, pl: (labels: string, axis: string) => `${labels}; oś: ${axis.toLowerCase()}` },
  hungerDecrease: { en: (amount: number) => `HUNGER -${amount}`, pl: (amount: number) => `GŁÓD -${amount}` },
  healthIncrease: { en: (amount: number) => `HEALTH +${amount}`, pl: (amount: number) => `ZDROWIE +${amount}` },
  hullIncrease: { en: (amount: number) => `HULL +${amount}`, pl: (amount: number) => `KADŁUB +${amount}` },
  hullRepairCost: { en: (amount: number) => `${amount} ENERGY`, pl: (amount: number) => `${amount} ENERGII` },
  carlitosEnergy: { en: (amount: number, unavailable: boolean) => `CARLITOS: ${amount} ENERGY${unavailable ? ' — UNAVAILABLE' : ''}`, pl: (amount: number, unavailable: boolean) => `CARLITOS: ${amount} ENERGII${unavailable ? ' — NIEDOSTĘPNE' : ''}` },
  playerEnergy: { en: (amount: number, unavailable: boolean) => `${'⚡'.repeat(amount)}${unavailable ? ' — INSUFFICIENT ENERGY' : ''}`, pl: (amount: number, unavailable: boolean) => `${'⚡'.repeat(amount)}${unavailable ? ' — ZA MAŁO ENERGII' : ''}` },
  carlitosSpokenEnergy: { en: (amount: number) => `${amount <= 0 ? 'no energy' : `${ENERGY_WORDS[amount] ?? amount} energy`} from Carlitos`, pl: (amount: number) => `${amount} energii Carlitosa` },
  anchorLabel: { en: (label: string, cost: string | null, unavailable: boolean) => `${label}${cost === null ? '' : `, ${cost}`}${unavailable ? ', insufficient energy' : ''}`, pl: (label: string, cost: string | null, unavailable: boolean) => `${label}${cost === null ? '' : `, ${cost}`}${unavailable ? ', za mało energii' : ''}` },
  unavailableReason: { en: (reason: string) => ` — UNAVAILABLE: ${reason}`, pl: (reason: string) => ` — NIEDOSTĘPNE: ${reason}` },
  diveResult: { en: 'DIVE RESULT', pl: 'WYNIK NURKOWANIA' },
  chestReward: { en: 'CHEST REWARD', pl: 'ZDOBYCZ ZE SKRZYNI' },
  salvageResult: { en: 'SALVAGE', pl: 'ODZYSKANE ZAPASY' },
  wreckageResult: { en: 'WRECKAGE', pl: 'WRAK' },
});

export function rewardTitle(title: 'DIVE RESULT' | 'CHEST REWARD' | 'SALVAGE' | 'WRECKAGE'): string {
  switch (title) {
    case 'DIVE RESULT': return uiDynamic('diveResult');
    case 'CHEST REWARD': return uiDynamic('chestReward');
    case 'SALVAGE': return uiDynamic('salvageResult');
    case 'WRECKAGE': return uiDynamic('wreckageResult');
  }
}
