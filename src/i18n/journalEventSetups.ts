import { getLanguage } from './language';
import type { EventTextId } from './eventMessages';

const situations: Record<string, readonly [string, string, string]> = {
  'ocean-of-blood': ['The sea turned red. Drifting bodies turned their heads toward me.', 'Morze zrobiło się czerwone. Dryfujące ciała obracały głowy w moją stronę.', 'El mar se volvió rojo. Los cuerpos que flotaban giraban la cabeza hacia mí.'],
  'dangerous-waters': ['The current drew us towards jagged rocks.', 'Prąd znosił nas na ostre skały.', "La corriente nos llevaba hacia rocas filosas."],
  leak: ['Water was creeping through a split in the hull.', 'Woda wciskała się przez pęknięcie w kadłubie.', "El agua se metía por una grieta del casco."],
  'school-of-fish': ['A shoal churned the water beside us.', 'Ławica kotłowała wodę tuż obok łodzi.', "Un cardumen revolvía el agua junto al bote."],
  snatcher: ['A tentacle curled over the side, reaching for my things.', 'Macka przewiesiła się przez burtę i sięgnęła po moje rzeczy.', "Un tentáculo pasó por la borda, buscando mis cosas."],
  'death-stare': ['Something huge rose from the water and stared straight at me.', 'Coś ogromnego wynurzyło się z wody i spojrzało prosto na mnie.', "Algo enorme salió del agua y me miró fijo."],
  'swarm-of-sharks': ['Shark fins were closing around the boat.', 'Rekinie płetwy zaciskały krąg wokół łodzi.', "Las aletas de tiburón cerraban el círculo alrededor del bote."],
  tornado: ['A dark funnel was churning up the sea.', 'Ciemny lej mielił morze.', "Un embudo oscuro revolvía el mar."],
  'shower-night': ['Rain found every exposed corner of the boat.', 'Deszcz docierał w każdy odsłonięty kąt łodzi.', "La lluvia llegaba a cada rincón descubierto del bote."],
  'windy-night': ['The wind was pulling at everything I had left loose.', 'Wiatr szarpał wszystkim, czego nie przywiązałem.', "El viento tiraba de todo lo que había dejado suelto."],
  'bad-sleep': ['There was something wrong with the dark around us. I could not settle.', 'Coś było nie tak z ciemnością wokół nas. Nie mogłem się uspokoić.', "Había algo raro en la oscuridad alrededor. No podía tranquilizarme."],
  thunderstorm: ['Thunder broke overhead and the boat pitched beneath me.', 'Nad głową trzasnął piorun, a łódź zakołysała się pode mną.', "Un trueno estalló arriba y el bote se sacudió debajo de mí."],
  'restless-waves': ['The waves would not leave us alone.', 'Fale nie chciały dać nam spokoju.', "Las olas no querían dejarnos en paz."],
  'monster-in-the-fog': ['A monster moved over the water, weaving through the fog.', 'Potwór poruszał się po wodzie, klucząc we mgle.', "Un monstruo se movía sobre el agua, de un lado a otro entre la niebla."],
  ghosts: ['Pale shapes gathered around the boat.', 'Wokół łodzi zebrały się blade kształty.', "Unas formas pálidas se juntaron alrededor del bote."],
  'eerie-melody': ['A song drifted across the water. I wished I had never heard it.', 'Po wodzie niósł się śpiew. Wolałbym nigdy go nie usłyszeć.', "Un canto llegaba por el agua. Ojalá nunca lo hubiera escuchado."],
  'face-on-the-moon': ['There was a face on the moon. It seemed to be looking at us.', 'Na księżycu pojawiła się twarz. Chyba patrzyła na nas.', "Había una cara en la luna. Parecía estar mirándonos."],
  'shadow-figure': ['There was another cat-shaped shadow beyond the lantern. Carlitos was beside me.', 'Poza latarnią pojawił się obcy koci cień. Carlitos siedział przy mnie.', "Había otra sombra de gato fuera de la luz del farol. Carlitos estaba a mi lado."],
  'guarded-sleep': ['', '', ""],
  'drifting-supplies': ['', '', ""],
  'drifting-chest': ['', '', ""],
  'check-the-back': ['', '', ""],
  flowers: ['', '', ""],
  'chest-attack': ['', '', ""],
  'midnight-tour': ['', '', ""],
  'night-trader': ['', '', ""],
  handyman: ['', '', ""],
  'other-people': ['', '', ""],
  plane: ['', '', ""],
  lighthouse: ['A lighthouse shone far across the water.', 'Daleko za wodą świeciła latarnia morska.', 'Un faro brillaba a lo lejos, al otro lado del agua.'],
  'day-calm-fallback': ['', '', ""],
  'quiet-night': ['', '', ""],
};

// Shared outcomes need the attempted action as well as the result.
const needsAction = new Set<EventTextId>([
  'eventText112', 'eventText116', 'eventText121', 'eventText122', 'eventText123', 'eventText134',
  'eventText142', 'eventText152', 'eventText165', 'eventText171', 'eventText180', 'eventText181', 'eventText184',
]);
const attempts: Record<string, readonly [string, string, string]> = {
  'dangerous-waters.map': ['I searched the map for a safe passage.', 'Szukałem na mapie bezpiecznego przejścia.', "Busqué un paso seguro en el mapa."],
  'dangerous-waters.compass': ['I tried to keep a safe bearing with the compass.', 'Próbowałem utrzymać bezpieczny kurs według kompasu.', "Intenté mantener un rumbo seguro con la brújula."],
  'leak.bucket': ['I tried to bail the rising water with the bucket.', 'Próbowałem wybierać napływającą wodę wiadrem.', "Intenté sacar con el balde el agua que entraba."],
  'school-of-fish.fishingNet': ['I cast the fishing net into the shoal.', 'Zarzuciłem sieć rybacką w ławicę.', "Tiré la red de pesca sobre el cardumen."],
  'school-of-fish.bucket': ['I dipped the bucket into the shoal.', 'Zanurzyłem wiadro w ławicy.', "Hundí el balde en el cardumen."],
  'school-of-fish.spyglass': ['I used the binoculars to find where the fish were gathering.', 'Przez lornetkę wypatrywałem, gdzie zbierają się ryby.', "Usé los binoculares para buscar dónde se juntaban los peces."],
  'death-stare.umbrella': ['I tried to hide from its stare behind the umbrella. It was not enough.', 'Próbowałem zasłonić się parasolem przed jego wzrokiem. To nie wystarczyło.', "Intenté esconderme de esa mirada detrás del paraguas. No alcanzó."],
  'death-stare.cannedFood': ['I threw food towards it, hoping it would leave us alone. It wanted more than that.', 'Rzuciłem mu jedzenie, licząc na spokój. Chciało czegoś więcej.', "Le tiré comida, esperando que nos dejara tranquilos. Quería algo más."],
  'death-stare.fishingNet': ['I tried to hold it off with the fishing net. It pushed straight through.', 'Próbowałem zatrzymać je siecią rybacką. Przeszło przez nią bez trudu.', "Intenté frenarlo con la red de pesca. La atravesó sin esfuerzo."],
  'swarm-of-sharks.shotgun': ['I fired the shotgun into the circling sharks.', 'Wypaliłem ze strzelby w krążące rekiny.', "Disparé la escopeta contra los tiburones que daban vueltas."],
  'swarm-of-sharks.flashlight': ['I shone the flashlight at the fins. The light did not turn them away.', 'Poświeciłem latarką na płetwy. Światło ich nie zawróciło.', "Alumbré las aletas con la linterna. La luz no las hizo retroceder."],
  'tornado.anchor': ['I dropped the anchor, but it could not hold against the current.', 'Rzuciłem kotwicę, ale nie wytrzymała naporu nurtu.', "Solté el ancla, pero no aguantó la corriente."],
  'tornado.swimRing': ['I tried to use the swim ring to pull us clear. It could not take the strain.', 'Próbowałem kołem ratunkowym wyciągnąć nas z nurtu. Nie wytrzymało naporu.', "Intenté sacarnos de la corriente con el salvavidas. No aguantó la presión."],
  'thunderstorm.anchor': ['I dropped the anchor and held on through the thunder.', 'Rzuciłem kotwicę i trzymałem się mocno wśród grzmotów.', "Solté el ancla y me sujeté fuerte entre los truenos."],
  'thunderstorm.bucket': ['I bailed with the bucket, but could not keep up with the storm.', 'Wybierałem wodę wiadrem, ale nie nadążałem za burzą.', "Saqué agua con el balde, pero la tormenta me ganaba."],
  'thunderstorm.umbrella': ['I braced the umbrella against the storm. It gave way.', 'Zaparłem parasol przed burzą. Nie wytrzymał.', "Afirmé el paraguas contra la tormenta. Cedió."],
  'restless-waves.swimRing': ['I tried to steady the boat with the swim ring. The waves were too much for it.', 'Próbowałem ustabilizować łódź kołem ratunkowym. Fale okazały się zbyt silne.', "Intenté estabilizar el bote con el salvavidas. Las olas eran demasiado fuertes."],
  'ghosts.flashlight': ['I kept sweeping the pale shapes with the flashlight. They would not let me rest.', 'Przeczesywałem blade kształty latarką. Nie pozwalały mi odpocząć.', "Seguí alumbrando las formas pálidas con la linterna. No me dejaban descansar."],
  'eerie-melody.bucket': ['I tried to shut the song out with the bucket over my head. It still reached me.', 'Próbowałem odciąć śpiew wiadrem na głowie. Nadal go słyszałem.', "Intenté tapar el canto poniéndome el balde en la cabeza. Lo seguía escuchando."],
  'eerie-melody.spyglass': ['I searched for the singer through the binoculars.', 'Szukałem śpiewającego stworzenia przez lornetkę.', "Busqué con los binoculares al ser que cantaba."],
  'eerie-melody.umbrella': ['I pulled the umbrella around my head. It failed to shut the song out.', 'Przyciągnąłem parasol do głowy. Nie zdołał zagłuszyć śpiewu.', "Me acerqué el paraguas a la cabeza. No logró tapar el canto."],
  'face-on-the-moon.umbrella': ['I hid the moon behind the umbrella and tried to sleep.', 'Zasłoniłem księżyc parasolem i próbowałem zasnąć.', "Tapé la luna con el paraguas e intenté dormir."],
  'face-on-the-moon.spyglass': ['I looked at the face through the binoculars. I regretted wanting a closer look.', 'Spojrzałem na twarz przez lornetkę. Pożałowałem tej ciekawości.', "Miré la cara con los binoculares. Me arrepentí de tanta curiosidad."],
};

const languageIndex = { en: 0, pl: 1, 'es-AR': 2 } as const;

export function journalEventSetup(eventId: string, choiceId: string, textId?: EventTextId): string {
  const language = languageIndex[getLanguage()];
  const situation = situations[eventId];
  if (situation === undefined) throw new Error(`Missing journal situation: ${eventId}`);
  const action = textId !== undefined && needsAction.has(textId) ? attempts[`${eventId}.${choiceId}`] : undefined;
  return [situation[language], action?.[language]].filter(Boolean).join(' ');
}
