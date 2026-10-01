import { defineMessages } from './messages';

export const guideText = defineMessages({
  scavengingTitle: { en: 'Scavenging', pl: 'Zbieranie zapasów', 'es-AR': 'Recolección de suministros' },
  survivalTitle: {
    en: "Survival",
    pl: "Przetrwanie",
    'es-AR': "Supervivencia",
  },
  dayTitle: {
    en: "Day",
    pl: "Dzień",
    'es-AR': "Día",
  },
  nightTitle: {
    en: "Night",
    pl: "Noc",
    'es-AR': "Noche",
  },
  collectTitle: { en: 'Gather', pl: 'Zbieraj', 'es-AR': 'Recolectá' },
  collectBody: {
    en: "Dorothy is sinking. You have 60 seconds to gather supplies for the lifeboat. Move with WASD and look with the mouse. Hold Shift to sprint. Press Space to jump. Aim at an item and left-click to pick it up. You can carry 3 weight. Heavy items weigh 2 or 3. To drop your last item, aim at the deck and click.",
    pl: "Dorothy tonie. Masz 60 sekund na zebranie zapasów do szalupy. Poruszaj się klawiszami WASD i rozglądaj myszą. Przytrzymaj Shift, aby biec. Naciśnij Spację, aby skoczyć. Wyceluj w przedmiot i kliknij lewym przyciskiem, aby go podnieść. Możesz unieść 3 jednostki ciężaru. Ciężkie przedmioty ważą 2 lub 3. Aby upuścić ostatni przedmiot, wyceluj w pokład i kliknij.",
    'es-AR': "El Dorothy se hunde. Tenés 60 segundos para juntar suministros para el bote. Movete con WASD y mirá con el mouse. Mantené Shift para correr. Pulsá Espacio para saltar. Apuntá a un objeto y hacé clic izquierdo para recogerlo. Podés cargar 3 de peso. Los objetos pesados pesan 2 o 3. Para soltar el último objeto, apuntá a la cubierta y hacé clic.",
  },
  collectAlt: {
    en: 'Supplies on Dorothy’s deck with all three carry circles filled.',
    pl: 'Zapasy na pokładzie Dorothy i trzy zapełnione pola udźwigu.',
    'es-AR': 'Suministros en la cubierta del Dorothy y los tres círculos de carga llenos.',
  },
  evacuateTitle: { en: 'Escape', pl: 'Uciekaj', 'es-AR': 'Escapá' },
  evacuateBody: {
    en: "Aim at the lifeboat or its marked storage area and click to store your load. Then go back for more. When the timer reaches zero, stand on the footprints beside the lifeboat. If you are not there, you sink with Dorothy. Only stored supplies come with you. Carlitos the cat is on board. Store him too, and he will help you at sea.",
    pl: "Wyceluj w szalupę lub oznaczone miejsce na zapasy i kliknij, aby odłożyć ładunek. Potem wróć po więcej. Gdy licznik osiągnie zero, stań na śladach stóp przy szalupie. Jeśli cię tam nie będzie, pójdziesz na dno z Dorothy. Zabierzesz tylko odłożone zapasy. Na pokładzie jest kot Carlitos. Jego też odłóż do szalupy, a pomoże ci na morzu.",
    'es-AR': "Apuntá al bote o a su zona marcada de almacenamiento y hacé clic para guardar tu carga. Después volvé a buscar más. Cuando el contador llegue a cero, quedate sobre las huellas junto al bote. Si no estás ahí, te hundís con el Dorothy. Solo te llevás los suministros guardados. El gato Carlitos está a bordo. Guardalo también y te va a ayudar en el mar.",
  },
  evacuateAlt: {
    en: 'The lifeboat beside Dorothy and the marked deck storage area.',
    pl: 'Szalupa przy Dorothy i oznaczone miejsce odkładania zapasów na pokładzie.',
    'es-AR': 'El bote junto al Dorothy y la zona marcada para guardar suministros en la cubierta.',
  },
  needsTitle: {
    en: "Goal",
    pl: "Cel",
    'es-AR': "Objetivo",
  },
  needsBody: {
    en: "Stay alive until a ship finds you. Rescue can come at dawn after about four weeks. Click things on the lifeboat to use them. Point at a thing to see what it does. Keep health, food, and hull above zero. If one reaches zero, the game ends. Eat stored food to fill the food meter. Eating and the medkit cost no energy.",
    pl: "Przeżyj, aż odnajdzie cię statek. Ratunek może przyjść o świcie po około czterech tygodniach. Klikaj rzeczy w szalupie, aby ich użyć. Wskaż rzecz kursorem, aby zobaczyć, do czego służy. Utrzymuj zdrowie, jedzenie i kadłub powyżej zera. Gdy jeden z tych wskaźników spadnie do zera, gra się kończy. Jedz zapasy, aby napełnić wskaźnik jedzenia. Jedzenie i apteczka nie kosztują energii.",
    'es-AR': "Mantenete con vida hasta que te encuentre un barco. El rescate puede llegar al amanecer después de unas cuatro semanas. Hacé clic en las cosas del bote para usarlas. Señalá una cosa para ver qué hace. Mantené la salud, la comida y el casco por encima de cero. Si uno llega a cero, el juego termina. Comé la comida guardada para llenar el indicador de comida. Comer y usar el botiquín no gastan energía.",
  },
  needsAlt: {
    en: 'The lifeboat in daylight with supplies and the four condition meters.',
    pl: 'Szalupa za dnia z zapasami i czterema wskaźnikami stanu.',
    'es-AR': 'El bote de día, con suministros y los cuatro indicadores de estado.',
  },
  catchTitle: {
    en: "Fishing",
    pl: "Łowienie ryb",
    'es-AR': "Pesca",
  },
  catchBody: {
    en: "Click the rod, then click the water to cast. A cast costs ⚡1. When a fish bites, click the bubbles around the bobber within six seconds. Caught fish go to your stored food. Eat them from there. Bait is used automatically. Close the result to cast again.",
    pl: "Kliknij wędkę, a potem wodę, aby zarzucić. Zarzucenie kosztuje ⚡1. Gdy ryba bierze, kliknij bąbelki wokół spławika w ciągu sześciu sekund. Złowione ryby trafiają do zapasów. Zjedz je stamtąd. Przynęta zużywa się sama. Zamknij wynik połowu, aby zarzucić ponownie.",
    'es-AR': "Hacé clic en la caña y después en el agua para lanzar. Cada lanzamiento cuesta ⚡1. Cuando algo pica, hacé clic en las burbujas alrededor de la boya dentro de los seis segundos. Los peces que pescás van a tu comida guardada. Comelos desde ahí. La carnada se usa sola. Cerrá el resultado para volver a lanzar.",
  },
  catchAlt: {
    en: 'Bubbles around the fishing bobber mark the place to click during a bite.',
    pl: 'Bąbelki wokół spławika wskazują miejsce do kliknięcia podczas brania.',
    'es-AR': 'Las burbujas alrededor de la boya indican dónde hacer clic cuando algo pica.',
  },
  hullRepairTitle: {
    en: "Energy",
    pl: "Energia",
    'es-AR': "Energía",
  },
  hullRepairBody: {
    en: "Each day starts with up to ⚡3. Most actions cost energy. You lose unused energy at dawn. Eat before you sleep. Hunger reduces the energy you get at dawn. Click the toolbox to repair the hull. A repair can cost up to ⚡3, so check the cost first. Duct tape repairs broken equipment for no energy. Each repair uses one tape.",
    pl: "Każdy dzień zaczynasz z maksymalnie ⚡3. Większość czynności kosztuje energię. Niewykorzystaną energię tracisz o świcie. Jedz przed snem. Głód zmniejsza energię odzyskaną o świcie. Kliknij skrzynkę z narzędziami, aby naprawić kadłub. Naprawa może kosztować do ⚡3, więc najpierw sprawdź koszt. Taśma klejąca naprawia uszkodzony sprzęt bez energii. Każda naprawa zużywa jedną taśmę.",
    'es-AR': "Cada día empezás con hasta ⚡3. Casi todas las acciones cuestan energía. Al amanecer perdés la energía que no usaste. Comé antes de dormir. El hambre reduce la energía que recuperás al amanecer. Hacé clic en la caja de herramientas para reparar el casco. Una reparación puede costar hasta ⚡3, así que revisá el costo antes. La cinta adhesiva repara equipo roto sin gastar energía. Cada reparación usa una cinta.",
  },
  hullRepairAlt: {
    en: 'The toolbox action shows the hull repair and its energy cost.',
    pl: 'Polecenie przy skrzynce z narzędziami pokazuje naprawę kadłuba i koszt energii.',
    'es-AR': 'La acción de la caja de herramientas muestra la reparación del casco y su costo de energía.',
  },
  driftingTitle: {
    en: "Ocean",
    pl: "Ocean",
    'es-AR': "Océano",
  },
  driftingBody: {
    en: "Supplies and chests drift past during the day. Collect them before night. Pulling one in costs ⚡1, or you can send Carlitos. Opening a chest costs ⚡3. A chest that stays shut for several nights can attack. With scuba gear, you can dive for ⚡3 to find supplies. A dive can injure you, even when it succeeds. You cannot dive during a squall.",
    pl: "W dzień obok łodzi dryfują zapasy i skrzynie. Zbierz je przed nocą. Wyłowienie kosztuje ⚡1. Możesz też wysłać Carlitosa. Otwarcie skrzyni kosztuje ⚡3. Skrzynia zamknięta przez kilka nocy może zaatakować. Ze sprzętem do nurkowania możesz zanurkować za ⚡3, aby szukać zapasów. Nurkowanie może cię zranić, nawet gdy się uda. Podczas szkwału nie można nurkować.",
    'es-AR': "De día pasan suministros y cofres a la deriva. Recogelos antes de la noche. Sacar uno del agua cuesta ⚡1, o podés mandar a Carlitos. Abrir un cofre cuesta ⚡3. Un cofre que queda cerrado varias noches puede atacar. Con el equipo de buceo podés bucear por ⚡3 para buscar suministros. Bucear puede herirte, incluso si te va bien. No podés bucear durante una tormenta fuerte.",
  },
  driftingAlt: {
    en: 'A drifting barrel with choices to retrieve it, send Carlitos, or let it drift.',
    pl: 'Dryfująca beczka z opcjami zebrania, wysłania Carlitosa lub pozostawienia jej na wodzie.',
    'es-AR': 'Un barril a la deriva con opciones para recuperarlo, enviar a Carlitos o dejarlo pasar.',
  },
  nightEventTitle: {
    en: "Events",
    pl: "Zdarzenia",
    'es-AR': "Eventos",
  },
  nightEventBody: {
    en: "Click the pillow to end the day. Events happen at night, and sometimes during the day. To respond, click equipment with a white outline. Some actions start on the first click. If you sleep through an event, you can lose health, hull, or supplies. Open the journal to see what happened.",
    pl: "Kliknij poduszkę, aby zakończyć dzień. Zdarzenia przychodzą nocą, a czasem także w dzień. Aby zareagować, kliknij sprzęt z białym obrysem. Niektóre czynności zaczynają się po pierwszym kliknięciu. Jeśli prześpisz zdarzenie, możesz stracić zdrowie, kadłub lub zapasy. Otwórz dziennik, aby sprawdzić, co się stało.",
    'es-AR': "Hacé clic en la almohada para terminar el día. Los eventos pasan de noche y a veces de día. Para responder, hacé clic en el equipo con contorno blanco. Algunas acciones empiezan con el primer clic. Si dormís durante un evento, podés perder salud, casco o suministros. Abrí el diario para ver qué pasó.",
  },
  nightEventAlt: {
    en: 'A night event begins around the lifeboat.',
    pl: 'Nocne zdarzenie rozpoczyna się wokół szalupy.',
    'es-AR': 'Comienza un evento nocturno alrededor del bote.',
  },
  nightResponseTitle: {
    en: "Rescue and Carlitos",
    pl: "Ratunek i Carlitos",
    'es-AR': "Rescate y Carlitos",
  },
  nightResponseBody: {
    en: "If you have the radio, answer its calls for ⚡1. Each answer brings rescue sooner. Signal ships and aircraft when they pass. Click Carlitos to check on him, feed him, or pet him. He needs food, attention, and rest before he can help again. Feeding him uses one stored food.",
    pl: "Jeśli masz radio, odbieraj jego sygnały za ⚡1. Każda odpowiedź przyspiesza ratunek. Dawaj sygnały mijającym statkom i samolotom. Kliknij Carlitosa, aby sprawdzić jego stan, nakarmić go lub pogłaskać. Potrzebuje jedzenia, uwagi i odpoczynku, zanim znów pomoże. Karmienie zużywa jedną porcję jedzenia.",
    'es-AR': "Si tenés la radio, respondé sus llamadas por ⚡1. Cada respuesta acerca el rescate. Hacé señales a los barcos y aviones que pasan. Hacé clic en Carlitos para ver cómo está, darle de comer o acariciarlo. Necesita comida, atención y descanso antes de volver a ayudar. Alimentarlo usa una porción de comida guardada.",
  },
  nightResponseAlt: {
    en: 'White outlines mark equipment available for a night event response.',
    pl: 'Białe obrysy wskazują sprzęt dostępny do reakcji na nocne zdarzenie.',
    'es-AR': 'Los contornos blancos señalan el equipo disponible para responder al evento nocturno.',
  },
});
