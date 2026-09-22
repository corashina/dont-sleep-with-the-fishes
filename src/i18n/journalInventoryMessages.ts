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
  trafficCone: 'pachołek drogowy', clothesHanger: 'wieszak na ubrania', toiletPlunger: 'przepychacz',
  golfBall: 'piłkę golfową', bowlingPin: 'kręgiel', tableTennisPaddle: 'rakietkę do tenisa stołowego',
  blowfish: 'rozdymkę', fish: 'rybę', goldfish: 'złotą rybkę', trout: 'pstrąga',
  kingfish: 'seriolę', piranha: 'piranię', crayfish: 'raka', halibut: 'halibuta',
  brokenCan: 'uszkodzoną puszkę', crushedCan: 'zgniecioną puszkę', backpack: 'plecak',
  cod: 'dorsza', salmon: 'łososia', tuna: 'tuńczyka', crab: 'kraba', squid: 'kałamarnicę',
  sardine: 'sardynkę', bass: 'okonia', redSnapper: 'lucjana czerwonego', clownfish: 'błazenka',
  seaweed: 'wodorosty', boot: 'but', plasticBottle: 'plastikową butelkę', fishBones: 'rybie ości',
  bait: 'przynętę', wetDuctTape: 'mokrą taśmę klejącą', brokenCompass: 'uszkodzony kompas',
  energyBar: 'baton energetyczny',
} satisfies Record<FishingCatchId, string>;

export function journalItemName(itemId: ItemId): string {
  if (getLanguage() === 'es-AR') return spanishItems[itemId];
  return getLanguage() === 'pl' ? accusatives[itemId] : `the ${itemLabel(itemId).toLowerCase()}`;
}

export function journalCatchName(catchId: FishingCatchId): string {
  return getLanguage() === 'pl' ? catches[catchId] : catchLabel(catchId).toLowerCase();
}

export const journalInventoryMessage = defineMessages({
  break: { en: (item: string) => `I need to repair ${item} before I can use it again.`, pl: (item: string) => `Muszę naprawić ${item}, zanim znów użyję tego sprzętu.`, 'es-AR': (item: string) => `Tengo que reparar ${item} antes de volver a usarlo.` },
  consume: { en: (item: string) => `I used up ${item}.`, pl: (item: string) => `Zużyłem ${item} do końca.`, 'es-AR': (item: string) => `Agoté ${item}.` },
  gain: { en: (item: string) => `I brought ${item} aboard.`, pl: (item: string) => `Zabrałem ${item} na pokład.`, 'es-AR': (item: string) => `Subí ${item} a bordo.` },
  lose: { en: (item: string) => `I lost ${item}.`, pl: (item: string) => `Straciłem ${item}.`, 'es-AR': (item: string) => `Perdí ${item}.` },
  repair: { en: (item: string) => `I repaired ${item}.`, pl: (item: string) => `Naprawiłem ${item}.`, 'es-AR': (item: string) => `Reparé ${item}.` },
  trade: { en: (item: string) => `I handed over ${item} for the trade.`, pl: (item: string) => `Oddałem ${item} w ramach wymiany.`, 'es-AR': (item: string) => `Entregué ${item} como parte del intercambio.` },
  tradedChest: { en: 'I handed over the closed chest for the trade.', pl: 'Oddałem zamkniętą skrzynię w ramach wymiany.', 'es-AR': "Entregué el cofre cerrado como parte del intercambio." },
  emptyMedkit: { en: 'I used the last of the dressings in the medkit.', pl: 'Zużyłem ostatnie opatrunki z apteczki.', 'es-AR': 'Usé las últimas vendas del botiquín.' },
  emptyTape: { en: 'I used the last of the duct tape.', pl: 'Zużyłem resztę taśmy klejącej.', 'es-AR': 'Usé lo último de la cinta adhesiva.' },
  emptyFlare: { en: 'I fired the last flare.', pl: 'Wystrzeliłem ostatnią flarę.', 'es-AR': 'Disparé la última bengala.' },
  emptyShotgun: { en: 'I fired the last shotgun shell.', pl: 'Wystrzeliłem ostatni nabój ze strzelby.', 'es-AR': 'Disparé el último cartucho de la escopeta.' },
});
