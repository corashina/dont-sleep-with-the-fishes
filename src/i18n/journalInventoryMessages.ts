import type { ItemId } from '../game/ItemState';
import type { FishingCatchId } from '../survival/fishingCatalog';
import { catchLabel, itemLabel } from './itemMessages';
import { getLanguage } from './language';
import { defineMessages } from './messages';

const accusatives = {
  cannedFood: 'jedzenie', baitTin: 'przynętę', ductTape: 'taśmę klejącą', compass: 'kompas', map: 'mapę',
  medicalKit: 'apteczkę', spyglass: 'lornetkę', fishingNet: 'sieć rybacką', knife: 'nóż', bucket: 'wiadro',
  flareGun: 'rakietnicę', scubaSet: 'sprzęt do nurkowania', anchor: 'kotwicę', radio: 'radio',
  umbrella: 'parasol', swimRing: 'koło ratunkowe', flashlight: 'latarkę', shotgun: 'strzelbę',
  energyBar: 'baton energetyczny', carlitos: 'Carlitos',
} satisfies Record<ItemId, string>;

const spanishItems = {
  cannedFood: 'la comida', baitTin: 'la carnada', ductTape: 'la cinta adhesiva', compass: 'la brújula', map: 'el mapa',
  medicalKit: 'el botiquín', spyglass: 'los binoculares', fishingNet: 'la red de pesca', knife: 'el cuchillo', bucket: 'el balde',
  flareGun: 'la pistola de bengalas', scubaSet: 'el equipo de buceo', anchor: 'el ancla', radio: 'la radio',
  umbrella: 'el paraguas', swimRing: 'el salvavidas', flashlight: 'la linterna', shotgun: 'la escopeta',
  energyBar: 'la barra energética', carlitos: 'a Carlitos',
} satisfies Record<ItemId, string>;

const catches = {
  cod: 'dorsza', salmon: 'łososia', tuna: 'tuńczyka', crab: 'kraba', squid: 'kałamarnicę',
  sardine: 'sardynkę', bass: 'okonia', redSnapper: 'lucjana czerwonego', clownfish: 'błazenka',
  seaweed: 'wodorosty', boot: 'but', plasticBottle: 'plastikową butelkę', fishBones: 'rybie ości',
  bait: 'przynętę', wetDuctTape: 'mokrą taśmę klejącą', brokenCompass: 'uszkodzony kompas',
  tornFishingNet: 'podartą sieć rybacką', energyBar: 'baton energetyczny',
} satisfies Record<FishingCatchId, string>;

export function journalItemName(itemId: ItemId): string {
  if (getLanguage() === 'es-AR') return spanishItems[itemId];
  return getLanguage() === 'pl' ? accusatives[itemId] : `the ${itemLabel(itemId).toLowerCase()}`;
}

export function journalCatchName(catchId: FishingCatchId): string {
  return getLanguage() === 'pl' ? catches[catchId] : catchLabel(catchId).toLowerCase();
}

export const journalInventoryMessage = defineMessages({
  break: { en: (item: string) => `I was left with ${item} damaged. It will need repairs before I can use it again.`, pl: (item: string) => `Uszkodziłem ${item}. Nie obejdzie się bez naprawy.`, 'es-AR': (item: string) => `No pude volver a usar ${item} sin reparaciones.` },
  consume: { en: (item: string) => `I used up ${item}. There is nothing left for another try.`, pl: (item: string) => `Zużyłem ${item} do końca. Na następną próbę już nie wystarczy.`, 'es-AR': (item: string) => `Agoté ${item}. No queda nada para otro intento.` },
  gain: { en: (item: string) => `I brought ${item} aboard.`, pl: (item: string) => `Zabrałem ${item} na pokład.`, 'es-AR': (item: string) => `Subí ${item} a bordo.` },
  lose: { en: (item: string) => `I lost ${item} in the trouble.`, pl: (item: string) => `Straciłem przy tym ${item}.`, 'es-AR': (item: string) => `Perdí ${item} en medio del lío.` },
  repair: { en: (item: string) => `I got ${item} working again.`, pl: (item: string) => `Udało mi się naprawić ${item}.`, 'es-AR': (item: string) => `Logré reparar ${item}.` },
  trade: { en: (item: string) => `I handed over ${item} for the trade.`, pl: (item: string) => `Oddałem ${item} w ramach wymiany.`, 'es-AR': (item: string) => `Entregué ${item} como parte del intercambio.` },
  tradedChest: { en: 'I handed over the closed chest for the trade.', pl: 'Oddałem zamkniętą skrzynię w ramach wymiany.', 'es-AR': "Entregué el cofre cerrado como parte del intercambio." },
  emptyMedkit: { en: 'The medkit was empty afterwards. I kept the dressings on and hoped they would hold.', pl: 'W apteczce nic już nie zostało. Zostawiłem opatrunki na miejscu. Oby wytrzymały.', 'es-AR': "El botiquín quedó vacío. Dejé las vendas puestas y esperé que aguantaran." },
  emptyTape: { en: 'That used the last of the duct tape. No more patches from that roll.', pl: 'Na to poszła reszta taśmy klejącej. Z tej rolki nie będzie już żadnej łaty.', 'es-AR': "Ahí se fue lo último de la cinta adhesiva. Ese rollo ya no alcanza para otro parche." },
  emptyFlare: { en: 'That was the last flare. I have nothing left to load into the flare gun.', pl: 'To była ostatnia flara. Nie mam już czym załadować rakietnicy.', 'es-AR': "Era la última bengala. Ya no tengo con qué cargar la pistola de bengalas." },
  emptyShotgun: { en: 'That was the last shell. The shotgun has no bite left now.', pl: 'To był ostatni nabój. Strzelba już nikogo nie ugryzie.', 'es-AR': "Era el último cartucho. A la escopeta ya no le quedan dientes." },
});
