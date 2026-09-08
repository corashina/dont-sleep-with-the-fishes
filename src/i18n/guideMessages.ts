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
    en: "Gather supplies before Dorothy sinks in 60 seconds. Move with W, A, S, D; look with the mouse. Hold Shift to sprint and press Space to jump. Aim at supplies and left-click to pick them up. Items weigh 1–3 units; the three carry circles show your 3-unit limit. Aim at the deck outside the marked storage area and left-click to drop your last pickup.",
    pl: "Zbierz zapasy, zanim Dorothy zatonie za 60 sekund. Poruszaj się klawiszami W, A, S, D; rozglądaj się myszą. Przytrzymaj Shift, aby biec, i naciśnij Spację, aby skoczyć. Wyceluj w zapasy i kliknij lewym przyciskiem, aby je podnieść. Przedmioty ważą 1–3 jednostki; trzy pola udźwigu pokazują limit 3 jednostek. Wyceluj w pokład poza oznaczonym miejscem odkładania zapasów i kliknij lewym przyciskiem, aby upuścić ostatni przedmiot.",
    'es-AR': "Juntá suministros antes de que el Dorothy se hunda en 60 segundos. Movete con W, A, S, D; mirá con el mouse. Mantené Shift para correr y pulsá Espacio para saltar. Apuntá a los suministros y hacé clic izquierdo para recogerlos. Los objetos pesan 1–3 unidades; los tres círculos muestran tu límite de 3 unidades. Apuntá a la cubierta fuera de la zona marcada y hacé clic izquierdo para soltar el último objeto.",
  },
  collectAlt: {
    en: 'Supplies on Dorothy’s deck with all three carry circles filled.',
    pl: 'Zapasy na pokładzie Dorothy i trzy zapełnione pola udźwigu.',
    'es-AR': 'Suministros en la cubierta del Dorothy y los tres círculos de carga llenos.',
  },
  evacuateTitle: { en: 'Escape', pl: 'Uciekaj', 'es-AR': 'Escapá' },
  evacuateBody: {
    en: "Approach the lifeboat, aim at it or the marked deck area, and left-click to store everything you carry. Storage has no limit; dropped items elsewhere are not stored. Make more trips while time remains. To escape, return with empty hands and left-click the lifeboat’s evacuation prompt before the countdown ends. Storing supplies alone does not evacuate you.",
    pl: "Podejdź do szalupy, wyceluj w nią lub oznaczone miejsce na pokładzie i kliknij lewym przyciskiem. Odłożysz wszystkie niesione zapasy. Magazyn nie ma limitu; przedmioty upuszczone gdzie indziej nie są zapisane. Wracaj po zapasy, dopóki masz czas. Aby uciec, wróć z pustymi rękami i kliknij polecenie ewakuacji przy szalupie przed końcem odliczania. Samo odłożenie zapasów cię nie ewakuuje.",
    'es-AR': "Acercate al bote, apuntá a él o a la zona marcada y hacé clic izquierdo para guardar toda tu carga. No hay límite de almacenamiento; los objetos soltados en otro lugar no se guardan. Hacé más viajes mientras tengas tiempo. Para escapar, volvé con las manos vacías y hacé clic en la indicación de evacuación del bote antes de terminar la cuenta regresiva. Guardar suministros no te evacúa.",
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
    en: "Keep Health and Hull above zero to survive. Hover the meters for exact values. Food measures fullness, not stored portions. Select food to consume a portion and restore up to 35 Food; a medical kit restores up to 30 Health. Neither costs energy. Food falls at dawn. Hunger reduces restored energy; an empty Food meter also damages Health. Dawn normally restores ⚡3; unused energy does not carry over. The number above ⚡ shows the amount. Consume an Energy Bar when below full to restore ⚡3.",
    pl: "Utrzymuj zdrowie i kadłub powyżej zera, aby przetrwać. Najedź na wskaźniki, aby sprawdzić wartości. Jedzenie oznacza sytość, nie zapas porcji. Wybierz jedzenie, aby zużyć porcję i odzyskać do 35 punktów jedzenia. Apteczka przywraca do 30 punktów zdrowia. Obie czynności nie zużywają energii. Jedzenie spada o świcie. Głód ogranicza odzyskaną energię; pusty wskaźnik jedzenia dodatkowo odbiera zdrowie. Świt zwykle przywraca ⚡3; niewykorzystana energia przepada. Liczba nad ⚡ oznacza jej ilość. Zjedz baton energetyczny, gdy brakuje energii, aby przywrócić ⚡3.",
    'es-AR': "Mantené la Salud y el Casco por encima de cero para sobrevivir. Pasá el cursor sobre los indicadores para ver sus valores. La Comida mide saciedad, no porciones guardadas. Elegí comida para consumir una porción y recuperar hasta 35 de Comida; un botiquín restaura hasta 30 de Salud. Ninguna acción gasta energía. La Comida baja al amanecer. El hambre reduce la energía recuperada; un indicador de Comida vacío también daña la Salud. El amanecer normalmente restaura ⚡3; la energía sin usar se pierde. El número sobre ⚡ indica la cantidad. Consumí una barra energética cuando te falte energía para restaurar ⚡3.",
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
    en: "Select the bow’s fishing rod during the day and start fishing for ⚡1. Click the water to cast. Cancel before casting to recover the energy. When bubbles appear around the bobber, click them within 6 seconds to catch fish, supplies, or junk. Fish become stored food; eat them separately. Bait improves fish catches automatically and is consumed only when you land a fish. Continue from the result to return aboard.",
    pl: "Za dnia wybierz wędkę na dziobie i rozpocznij łowienie za ⚡1. Kliknij wodę, aby zarzucić żyłkę. Anuluj przed zarzuceniem, aby odzyskać energię. Gdy wokół spławika pojawią się bąbelki, kliknij je w ciągu 6 sekund, aby wyciągnąć rybę, zapasy albo śmieci. Ryby trafiają do zapasu jedzenia; zjedz je osobno. Przynęta automatycznie poprawia połów i zużywa się tylko po wyciągnięciu ryby. Po wyniku wybierz dalszy ciąg, aby wrócić do szalupy.",
    'es-AR': "Elegí la caña de la proa durante el día y empezá a pescar por ⚡1. Hacé clic en el agua para lanzar. Cancelá antes de lanzar para recuperar la energía. Cuando aparezcan burbujas alrededor de la boya, hacé clic dentro de 6 segundos para sacar peces, suministros o basura. Los peces se guardan como comida; comelos aparte. La carnada mejora las capturas automáticamente y solo se consume al sacar un pez. Continuá desde el resultado para volver al bote.",
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
    en: "The sea and events damage Hull. Select the toolbox during the day to repair it. Repairs automatically spend ⚡1–⚡3, restoring up to 33 Hull per ⚡1, capped at 100. Check the cost; you cannot choose a smaller repair. The toolbox is reusable and needs no supplies. To fix broken equipment, select duct tape and choose an item. Each repair consumes one tape and costs no energy. Lost or consumed items cannot be repaired.",
    pl: "Morze i zdarzenia uszkadzają kadłub. Za dnia wybierz skrzynkę z narzędziami, aby go naprawić. Naprawa automatycznie zużywa ⚡1–⚡3. Każde ⚡1 przywraca do 33 punktów kadłuba, maksymalnie do 100. Sprawdź koszt; nie możesz wybrać mniejszej naprawy. Skrzynka jest wielokrotnego użytku i nie wymaga zapasów. Aby naprawić sprzęt, wybierz taśmę klejącą i przedmiot. Naprawa zużywa jedną taśmę i nie kosztuje energii. Nie naprawisz zgubionych ani zużytych przedmiotów.",
    'es-AR': "El mar y los eventos dañan el Casco. Elegí la caja de herramientas durante el día para repararlo. Las reparaciones gastan automáticamente ⚡1–⚡3 y restauran hasta 33 de Casco por ⚡1, con un máximo de 100. Revisá el costo; no podés elegir una reparación menor. La caja es reutilizable y no necesita suministros. Para reparar equipo roto, elegí cinta adhesiva y un objeto. Cada reparación consume una cinta y no gasta energía. Los objetos perdidos o consumidos no se pueden reparar.",
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
    en: "Select drifting supplies before night: ordinary supplies cost ⚡1 to collect; chests cost ⚡3. Searching wreckage costs ⚡1 and risks injury. Open each recovered chest aboard once for a reward without spending energy; leaving them closed for several nights risks an attack. Select usable scuba gear to dive for ⚡3. Dives can yield food, bait, or rescue traces, but risk losing 50 Health even with a reward. A usable flashlight improves the odds; overcast weather worsens them, and squalls block diving.",
    pl: "Wybierz dryfujące zapasy przed nocą: zebranie zwykłych zapasów kosztuje ⚡1, a skrzyni ⚡3. Przeszukanie wraku kosztuje ⚡1 i grozi obrażeniami. Każdą odzyskaną skrzynię otworzysz raz w szalupie, aby zdobyć nagrodę bez kosztu energii. Zamknięta przez kilka nocy skrzynia grozi atakiem. Wybierz sprawny sprzęt do nurkowania, aby zanurkować za ⚡3. Możesz znaleźć jedzenie, przynętę lub ślady przybliżające ratunek. Ryzykujesz utratę 50 punktów zdrowia, nawet ze zdobyczą. Sprawna latarka poprawia szanse; zachmurzenie je pogarsza, a szkwał blokuje nurkowanie.",
    'es-AR': "Elegí suministros a la deriva antes de la noche: recoger suministros comunes cuesta ⚡1; los cofres cuestan ⚡3. Revisar un naufragio cuesta ⚡1 y puede causar heridas. Abrí cada cofre recuperado una vez a bordo para obtener una recompensa sin gastar energía; dejarlos cerrados varias noches puede provocar un ataque. Elegí equipo de buceo utilizable para bucear por ⚡3. Podés encontrar comida, carnada o rastros de rescate, pero perder 50 de Salud incluso con una recompensa. Una linterna utilizable mejora las probabilidades; el cielo cubierto las empeora y las tormentas fuertes impiden bucear.",
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
    en: "Use the pillow to end the day and begin a night event. Read the event and check each response’s requirements before choosing. Choices can change your condition or supplies; outcomes may vary between encounters. Complete the response and continue from its result to reach dawn. Check your meters before starting another day.",
    pl: "Użyj poduszki, aby zakończyć dzień i rozpocząć nocne zdarzenie. Przeczytaj zdarzenie i sprawdź wymagania reakcji przed wyborem. Wybory mogą zmienić twój stan lub zapasy; wyniki mogą się różnić między spotkaniami. Zakończ reakcję i przejdź dalej po jej wyniku, aby dotrzeć do świtu. Sprawdź wskaźniki przed rozpoczęciem kolejnego dnia.",
    'es-AR': "Usá la almohada para terminar el día y comenzar un evento nocturno. Leé el evento y revisá los requisitos de cada respuesta antes de elegir. Las elecciones pueden cambiar tu estado o tus suministros; los resultados pueden variar entre encuentros. Completá la respuesta y continuá desde el resultado para llegar al amanecer. Revisá los indicadores antes de empezar otro día.",
  },
  nightEventAlt: {
    en: 'A night event begins around the lifeboat.',
    pl: 'Nocne zdarzenie rozpoczyna się wokół szalupy.',
    'es-AR': 'Comienza un evento nocturno alrededor del bote.',
  },
  nightResponseTitle: {
    en: "Items",
    pl: "Przedmioty",
    'es-AR': "Objetos",
  },
  nightResponseBody: {
    en: "Items usable in the current event glow white. Select one, read its response, then choose an action. Missing or broken items can block responses; read the unavailable reason. Using equipment may consume, break, or lose it. If sleep is offered, select the pillow to sleep through the event. Sleeping can still cause injury, Hull damage, or lost supplies.",
    pl: "Przedmioty dostępne w bieżącym zdarzeniu świecą na biało. Wybierz przedmiot, przeczytaj reakcję i wybierz czynność. Brak lub uszkodzenie przedmiotu może blokować reakcję; przeczytaj powód niedostępności. Użycie może zużyć, zepsuć lub odebrać sprzęt. Jeśli sen jest dostępny, wybierz poduszkę, aby przespać zdarzenie. Sen nadal może spowodować obrażenia, uszkodzenie kadłuba albo utratę zapasów.",
    'es-AR': "Los objetos utilizables en el evento actual brillan en blanco. Elegí uno, leé su respuesta y seleccioná una acción. Los objetos faltantes o rotos pueden bloquear respuestas; leé el motivo. Usar equipo puede consumirlo, romperlo o hacer que lo pierdas. Si se ofrece dormir, elegí la almohada para pasar el evento durmiendo. Dormir todavía puede causar heridas, daño al Casco o pérdida de suministros.",
  },
  nightResponseAlt: {
    en: 'White outlines mark equipment available for a night event response.',
    pl: 'Białe obrysy wskazują sprzęt dostępny do reakcji na nocne zdarzenie.',
    'es-AR': 'Los contornos blancos señalan el equipo disponible para responder al evento nocturno.',
  },
});
