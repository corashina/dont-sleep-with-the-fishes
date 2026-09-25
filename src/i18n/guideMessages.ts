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
    en: "You have 60 seconds to gather supplies. Move with WASD, look with the mouse, hold Shift to sprint, and press Space to jump. Aim and left-click to pick up an item. You can carry three weight units. Aim at the deck and click to drop your last pickup.",
    pl: "Masz 60 sekund na zebranie zapasów. Poruszaj się klawiszami WASD i rozglądaj myszą. Przytrzymaj Shift, aby biec, i naciśnij Spację, aby skoczyć. Wyceluj w przedmiot i kliknij lewym przyciskiem, aby go podnieść. Możesz unieść trzy jednostki ciężaru. Wyceluj w pokład i kliknij, aby upuścić ostatni podniesiony przedmiot.",
    'es-AR': "Tenés 60 segundos para juntar suministros. Movete con WASD y mirá con el mouse. Mantené Shift para correr y pulsá Espacio para saltar. Apuntá y hacé clic izquierdo para recoger un objeto. Podés cargar tres unidades de peso. Apuntá a la cubierta y hacé clic para soltar el último objeto que recogiste.",
  },
  collectAlt: {
    en: 'Supplies on Dorothy’s deck with all three carry circles filled.',
    pl: 'Zapasy na pokładzie Dorothy i trzy zapełnione pola udźwigu.',
    'es-AR': 'Suministros en la cubierta del Dorothy y los tres círculos de carga llenos.',
  },
  evacuateTitle: { en: 'Escape', pl: 'Uciekaj', 'es-AR': 'Escapá' },
  evacuateBody: {
    en: "Aim at the lifeboat or its marked storage area and click to store your load. Make more trips while time remains. Stand on the footprints beside the lifeboat when the timer reaches zero to escape. Only stored supplies come with you.",
    pl: "Wyceluj w szalupę lub oznaczone miejsce odkładania zapasów i kliknij, aby odłożyć cały ładunek. Wracaj po kolejne zapasy, dopóki masz czas. Aby uciec, stój na śladach stóp przy szalupie, gdy licznik osiągnie zero. Zabierzesz ze sobą tylko odłożone zapasy.",
    'es-AR': "Apuntá al bote o a su zona marcada de almacenamiento y hacé clic para guardar toda tu carga. Hacé más viajes mientras tengas tiempo. Para escapar, quedate sobre las huellas junto al bote cuando el contador llegue a cero. Solo te llevás los suministros guardados.",
  },
  evacuateAlt: {
    en: 'The lifeboat beside Dorothy and the marked deck storage area.',
    pl: 'Szalupa przy Dorothy i oznaczone miejsce odkładania zapasów na pokładzie.',
    'es-AR': 'El bote junto al Dorothy y la zona marcada para guardar suministros en la cubierta.',
  },
  needsTitle: {
    en: "Surviving",
    pl: "Jak przetrwać",
    'es-AR': "Sobrevivir",
  },
  needsBody: {
    en: "Keep Health and Hull above zero. The Food meter shows fullness; cans show stored portions. Eat before night: hunger reduces the energy you regain at dawn, and starvation damages Health. Eating and using a medical kit cost no energy. Start each day with up to ⚡3. You lose unused energy at dawn.",
    pl: "Utrzymuj zdrowie i kadłub powyżej zera. Wskaźnik jedzenia pokazuje sytość, a puszki oznaczają zapas porcji. Jedz przed nocą: głód ogranicza energię odzyskaną o świcie, a wygłodzenie odbiera zdrowie. Jedzenie i użycie apteczki nie kosztują energii. O świcie odzyskujesz do ⚡3. Niewykorzystaną energię tracisz o świcie.",
    'es-AR': "Mantené la Salud y el Casco por encima de cero. El indicador de Comida muestra saciedad; las latas muestran las porciones guardadas. Comé antes de la noche: el hambre reduce la energía que recuperás al amanecer, y la inanición daña la Salud. Comer y usar un botiquín no gastan energía. Empezás cada día con hasta ⚡3. Al amanecer perdés la energía que no usaste.",
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
    en: "Select the rod, then click the water to cast for ⚡1. Click the bubbles around the bobber within six seconds of a bite. You must eat caught fish from your supplies. You use bait without selecting it. Close the result to cast again.",
    pl: "Wybierz wędkę i kliknij wodę, aby zarzucić żyłkę za ⚡1. Kliknij bąbelki wokół spławika w ciągu sześciu sekund od brania. Złowione ryby zjedz z zapasów. Używasz przynęty bez jej wybierania. Zamknij wynik połowu, aby zarzucić ponownie.",
    'es-AR': "Elegí la caña y hacé clic en el agua para lanzar por ⚡1. Hacé clic en las burbujas alrededor de la boya dentro de los seis segundos de la picada. Comé los peces que pescaste desde tus suministros. Usás carnada sin seleccionarla. Cerrá el resultado para volver a lanzar.",
  },
  catchAlt: {
    en: 'Bubbles around the fishing bobber mark the place to click during a bite.',
    pl: 'Bąbelki wokół spławika wskazują miejsce do kliknięcia podczas brania.',
    'es-AR': 'Las burbujas alrededor de la boya indican dónde hacer clic cuando algo pica.',
  },
  hullRepairTitle: {
    en: "Boat",
    pl: "Łódź",
    'es-AR': "Bote",
  },
  hullRepairBody: {
    en: "Repair Hull with the toolbox. A repair can spend up to ⚡3, so check its cost before clicking. You need no repair supplies. Use duct tape to fix broken equipment without spending energy; each repair consumes one tape. Between encounters, take time to plan.",
    pl: "Napraw kadłub za pomocą skrzynki z narzędziami. Naprawa może zużyć do ⚡3, więc sprawdź koszt przed kliknięciem. Nie potrzebujesz do niej zapasów. Użyj taśmy klejącej, aby naprawić uszkodzony sprzęt bez wydawania energii. Każda naprawa sprzętu zużywa jedną taśmę. Między zdarzeniami masz czas na planowanie.",
    'es-AR': "Repará el Casco con la caja de herramientas. Una reparación puede gastar hasta ⚡3, así que revisá el costo antes de hacer clic. No necesitás suministros para reparar el casco. Usá cinta adhesiva para reparar equipo roto sin gastar energía; cada reparación consume una cinta. Entre encuentros, tomate tiempo para planear.",
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
    en: "Collect drifting supplies before night. Retrieving supplies or a chest costs ⚡1. Opening a recovered chest costs ⚡3; keeping it closed for several nights risks an attack. Diving costs ⚡3 and can injure you even when you find supplies. Squalls prevent diving.",
    pl: "Zbierz dryfujące zapasy przed nocą. Wyłowienie zapasów lub skrzyni kosztuje ⚡1. Otwarcie odzyskanej skrzyni kosztuje ⚡3. Jeśli pozostawisz ją zamkniętą przez kilka nocy, ryzykujesz atak. Nurkowanie kosztuje ⚡3 i grozi obrażeniami, nawet gdy znajdziesz zapasy. Podczas szkwału nie możesz nurkować.",
    'es-AR': "Recogé los suministros a la deriva antes de la noche. Recuperar suministros o un cofre cuesta ⚡1. Abrir un cofre recuperado cuesta ⚡3; dejarlo cerrado varias noches puede provocar un ataque. Bucear cuesta ⚡3 y puede causarte heridas incluso si encontrás suministros. No podés bucear durante una tormenta fuerte.",
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
    en: "Select the pillow to end the day. Use equipment with a white outline to respond; some actions start on the first click. Sleeping through an event can cost Health, Hull, or supplies. Open the journal to review what happened and what you gained or lost.",
    pl: "Wybierz poduszkę, aby zakończyć dzień. Zareaguj za pomocą sprzętu z białym obrysem. Niektóre czynności rozpoczynają się po pierwszym kliknięciu. Przespanie zdarzenia może kosztować zdrowie, kadłub lub zapasy. Otwórz dziennik, aby sprawdzić przebieg zdarzeń oraz zdobyte i utracone zapasy.",
    'es-AR': "Elegí la almohada para terminar el día. Usá equipo con contorno blanco para responder; algunas acciones empiezan con el primer clic. Dormir durante un evento puede costarte Salud, Casco o suministros. Abrí el diario para revisar qué pasó y qué ganaste o perdiste.",
  },
  nightEventAlt: {
    en: 'A night event begins around the lifeboat.',
    pl: 'Nocne zdarzenie rozpoczyna się wokół szalupy.',
    'es-AR': 'Comienza un evento nocturno alrededor del bote.',
  },
  nightResponseTitle: {
    en: "Help",
    pl: "Pomoc",
    'es-AR': "Ayuda",
  },
  nightResponseBody: {
    en: "Answer radio calls for ⚡1 to improve your rescue chances. Signal people or aircraft during encounters. Select Carlitos to check his condition, feed him, or pet him. He needs food, attention, and rest to recover between jobs. Feeding him uses one stored portion.",
    pl: "Odbieraj sygnały radiowe za ⚡1, aby zwiększyć szanse na ratunek. Dawaj sygnały napotkanym ludziom lub samolotom. Wybierz Carlitosa, aby sprawdzić jego stan, nakarmić go lub pogłaskać. Potrzebuje jedzenia, uwagi i odpoczynku, aby odzyskać siły między zadaniami. Karmienie zużywa jedną porcję z zapasów.",
    'es-AR': "Respondé llamadas de radio por ⚡1 para mejorar tus posibilidades de rescate. Hacé señales a personas o aviones durante los encuentros. Elegí a Carlitos para revisar su estado, darle de comer o acariciarlo. Necesita comida, atención y descanso para recuperarse entre tareas. Alimentarlo consume una porción guardada.",
  },
  nightResponseAlt: {
    en: 'White outlines mark equipment available for a night event response.',
    pl: 'Białe obrysy wskazują sprzęt dostępny do reakcji na nocne zdarzenie.',
    'es-AR': 'Los contornos blancos señalan el equipo disponible para responder al evento nocturno.',
  },
});
