import { defineMessages } from './messages';
import { pluralCategory } from './language';

const ENERGY_WORDS = ['zero', 'one', 'two', 'three'] as const;
const SPANISH_ENERGY_WORDS = ['cero', 'un', 'dos', 'tres'] as const;

export const uiDynamic = defineMessages({
  day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}`, 'es-AR': (day: number) => `DÍA ${day}` },
  page: { en: (page: number, total: number) => `PAGE ${page} OF ${total}`, pl: (page: number, total: number) => `STRONA ${page} Z ${total}`, 'es-AR': (page: number, total: number) => `PÁGINA ${page} DE ${total}` },
  energyCount: { en: (count: number) => `${count} energy`, pl: (count: number) => `${count} energii`, 'es-AR': (count: number) => `${count} de energía` },
  spokenEnergy: { en: (count: number) => `${ENERGY_WORDS[count] ?? count} energy`, pl: (count: number) => `${count} energii`, 'es-AR': (count: number) => `${SPANISH_ENERGY_WORDS[count] ?? count} ${count === 1 ? 'punto' : 'puntos'} de energía` },
  bonusEnergy: { en: (standard: number, bonus: number) => `${standard} standard energy and ${bonus} bonus energy`, pl: (standard: number, bonus: number) => `${standard} zwykłej energii i ${bonus} dodatkowej energii`, 'es-AR': (standard: number, bonus: number) => `${standard} de energía normal y ${bonus} de energía extra` },
  dangerValue: { en: (value: number) => `${value}, low`, pl: (value: number) => `${value}, niski poziom`, 'es-AR': (value: number) => `${value}, bajo` },
  brokenItem: { en: (label: string) => `${label} — BROKEN`, pl: (label: string) => `${label} — USZKODZONE`, 'es-AR': (label: string) => `${label} — SIN FUNCIONAR` },
  repairItemHelp: { en: (label: string) => `Repair ${label} with one Duct Tape. It can be repaired again after later damage.`, pl: (label: string) => `Napraw przedmiot „${label}” jedną taśmą klejącą. Możesz naprawić go ponownie po kolejnym uszkodzeniu.`, 'es-AR': (label: string) => `Repará ${label} con una cinta adhesiva. Podés volver a repararlo si se rompe de nuevo.` },
  discardItemHelp: { en: (label: string) => `Discard broken ${label}. Its item type can then be found again.`, pl: (label: string) => `Wyrzuć uszkodzony przedmiot „${label}”. Potem możesz ponownie znaleźć ten typ przedmiotu.`, 'es-AR': (label: string) => `Descartá ${label} roto. Después podrás volver a encontrar ese tipo de objeto.` },
  repairUnavailable: { en: (reason: string) => `Repair unavailable: ${reason}`, pl: (reason: string) => `Naprawa niedostępna: ${reason}`, 'es-AR': (reason: string) => `Reparación no disponible: ${reason}` },
  safe: { en: 'SAFE', pl: 'BEZPIECZNE', 'es-AR': "SEGURO" },
  uncertain: { en: 'UNCERTAIN', pl: 'NIEPEWNE', 'es-AR': "INCIERTO" },
  dangerous: { en: 'DANGEROUS', pl: 'NIEBEZPIECZNE', 'es-AR': "PELIGROSO" },
  eventAnnouncement: { en: (danger: string, text: string) => `${danger[0]!.toUpperCase()}${danger.slice(1).toLowerCase()} event. ${text}`, pl: (danger: string, text: string) => `${danger[0]!.toUpperCase()}${danger.slice(1).toLowerCase()} zdarzenie. ${text}`, 'es-AR': (danger: string, text: string) => `Evento ${danger.toLowerCase()}. ${text}` },
  seconds: { en: (count: number) => `${count} SECONDS`, pl: (count: number) => `${count} ${pluralCategory(count) === 'one' ? 'SEKUNDA' : pluralCategory(count) === 'few' ? 'SEKUNDY' : 'SEKUND'}`, 'es-AR': (count: number) => `${count} ${count === 1 ? 'SEGUNDO' : 'SEGUNDOS'}` },
  graphDescription: { en: (labels: string, axis: string) => `${labels} over ${axis.toLowerCase()}`, pl: (labels: string, axis: string) => `${labels}; oś: ${axis.toLowerCase()}`, 'es-AR': (labels: string, axis: string) => `${labels}; eje: ${axis.toLowerCase()}` },
  hungerDecrease: { en: (amount: number) => `HUNGER -${amount}`, pl: (amount: number) => `GŁÓD -${amount}`, 'es-AR': (amount: number) => `HAMBRE -${amount}` },
  healthIncrease: { en: (amount: number) => `HEALTH +${amount}`, pl: (amount: number) => `ZDROWIE +${amount}`, 'es-AR': (amount: number) => `SALUD +${amount}` },
  hullIncrease: { en: (amount: number) => `HULL +${amount}`, pl: (amount: number) => `KADŁUB +${amount}`, 'es-AR': (amount: number) => `CASCO +${amount}` },
  hullRepairCost: { en: (amount: number) => `${amount} ENERGY`, pl: (amount: number) => `${amount} ENERGII`, 'es-AR': (amount: number) => `${amount} DE ENERGÍA` },
  playerEnergy: { en: (amount: number, unavailable: boolean) => `${'⚡'.repeat(amount)}${unavailable ? ' — INSUFFICIENT ENERGY' : ''}`, pl: (amount: number, unavailable: boolean) => `${'⚡'.repeat(amount)}${unavailable ? ' — ZA MAŁO ENERGII' : ''}`, 'es-AR': (amount: number, unavailable: boolean) => `${'⚡'.repeat(amount)}${unavailable ? ' — ENERGÍA INSUFICIENTE' : ''}` },
  anchorLabel: { en: (label: string, cost: string | null, unavailable: boolean) => `${label}${cost === null ? '' : `, ${cost}`}${unavailable ? ', insufficient energy' : ''}`, pl: (label: string, cost: string | null, unavailable: boolean) => `${label}${cost === null ? '' : `, ${cost}`}${unavailable ? ', za mało energii' : ''}`, 'es-AR': (label: string, cost: string | null, unavailable: boolean) => `${label}${cost === null ? '' : `, ${cost}`}${unavailable ? ', energía insuficiente' : ''}` },
  unavailableReason: { en: (reason: string) => ` — UNAVAILABLE: ${reason}`, pl: (reason: string) => ` — NIEDOSTĘPNE: ${reason}`, 'es-AR': (reason: string) => ` — NO DISPONIBLE: ${reason}` },
  diveResult: { en: 'DIVE RESULT', pl: 'WYNIK NURKOWANIA', 'es-AR': "RESULTADO DEL BUCEO" },
  chestReward: { en: 'CHEST REWARD', pl: 'ZDOBYCZ ZE SKRZYNI', 'es-AR': "RECOMPENSA DEL COFRE" },
  islandRewards: { en: 'island rewards', pl: 'nagrody z wyspy', 'es-AR': 'recompensas de la isla' },
  salvageResult: { en: 'SALVAGE', pl: 'ODZYSKANE ZAPASY', 'es-AR': "SUMINISTROS RECUPERADOS" },
});

export function rewardTitle(title: 'DIVE RESULT' | 'CHEST REWARD' | 'SALVAGE' | 'ISLAND REWARDS'): string {
  switch (title) {
    case 'DIVE RESULT': return uiDynamic('diveResult');
    case 'CHEST REWARD': return uiDynamic('chestReward');
    case 'ISLAND REWARDS': return uiDynamic('islandRewards');
    case 'SALVAGE': return uiDynamic('salvageResult');
  }
}
