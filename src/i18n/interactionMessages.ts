import { defineMessages } from './messages';

export const interactionText = defineMessages({
  store: { en: 'LEFT CLICK — STORE CARRIED SUPPLIES', pl: 'LEWY PRZYCISK MYSZY — ODŁÓŻ ZAPASY', "es-AR": "CLIC IZQUIERDO — GUARDÁ LOS SUMINISTROS QUE LLEVÁS" },
  capacity: { en: (item: string, weight: number, free: number) => `${item} WEIGHS ${weight} — ${free} CAPACITY FREE`, pl: (item: string, weight: number, free: number) => `${item} — WAGA: ${weight} — WOLNY UDŹWIG: ${free}`, "es-AR": (item: string, weight: number, free: number) => `${item} PESA ${weight} — CAPACIDAD LIBRE: ${free}` },
  pickup: { en: (item: string) => `LEFT CLICK — PICK UP ${item}`, pl: (item: string) => `LEWY PRZYCISK MYSZY — PODNIEŚ: ${item}`, "es-AR": (item: string) => `CLIC IZQUIERDO — RECOGÉ: ${item}` },
  drop: { en: (item: string) => `LEFT CLICK — DROP ${item}`, pl: (item: string) => `LEWY PRZYCISK MYSZY — UPUŚĆ: ${item}`, "es-AR": (item: string) => `CLIC IZQUIERDO — SOLTÁ: ${item}` },
});
