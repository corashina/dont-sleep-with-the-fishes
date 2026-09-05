import { defineMessages } from './messages';

export const interactionText = defineMessages({
  store: { en: 'LEFT CLICK — STORE CARRIED SUPPLIES', pl: 'LEWY PRZYCISK MYSZY — ODŁÓŻ ZAPASY' },
  capacity: { en: (item: string, weight: number, free: number) => `${item} WEIGHS ${weight} — ${free} CAPACITY FREE`, pl: (item: string, weight: number, free: number) => `${item} — WAGA: ${weight} — WOLNY UDŹWIG: ${free}` },
  pickup: { en: (item: string) => `LEFT CLICK — PICK UP ${item}`, pl: (item: string) => `LEWY PRZYCISK MYSZY — PODNIEŚ: ${item}` },
  evacuate: { en: 'LEFT CLICK — EVACUATE NOW', pl: 'LEWY PRZYCISK MYSZY — EWAKUUJ SIĘ' },
  drop: { en: (item: string) => `LEFT CLICK — DROP ${item}`, pl: (item: string) => `LEWY PRZYCISK MYSZY — UPUŚĆ: ${item}` },
});
