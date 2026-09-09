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
    en: "Approach the lifeboat and aim at it or the marked deck area. Left-click to store everything you carry. Storage has no limit; dropped items elsewhere are not stored. Make more trips while time remains. To escape, stand in the marked evacuation area beside the lifeboat when the timer reaches zero. Evacuation is automatic. You cannot leave early. Only stored supplies enter survival.",
    pl: "Podejdź do szalupy i wyceluj w nią lub oznaczone miejsce na pokładzie. Kliknij lewym przyciskiem, aby odłożyć wszystkie niesione zapasy. Magazyn nie ma limitu; przedmioty upuszczone gdzie indziej nie są zapisane. Wracaj po zapasy, dopóki masz czas. Aby uciec, stój w oznaczonym miejscu ewakuacji przy szalupie, gdy licznik osiągnie zero. Ewakuacja nastąpi automatycznie. Nie możesz odpłynąć wcześniej. Do przetrwania zabierzesz tylko odłożone zapasy.",
    'es-AR': "Acercate al bote y apuntá a él o a la zona marcada. Hacé clic izquierdo para guardar toda tu carga. No hay límite de almacenamiento; los objetos soltados en otro lugar no se guardan. Hacé más viajes mientras tengas tiempo. Para escapar, quedate en la zona de evacuación marcada junto al bote cuando el contador llegue a cero. La evacuación es automática. No podés irte antes. Solo los suministros guardados pasan a supervivencia.",
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
    en: "Keep Health and Hull above zero to survive. Hover the meters for exact values. Food measures fullness, not stored portions. Select food to consume a portion and restore 18–24 Food, capped at 100. A medical kit restores Health to 100. Neither costs energy. Food falls at dawn. If Food remains above 30 after this decrease, recover up to 5 Health. Health cannot exceed 100. Hunger reduces restored energy; an empty Food meter also damages Health. Dawn normally restores ⚡3; unused energy does not carry over. The number above ⚡ shows the amount. Consume an Energy Bar when below full to restore ⚡3.",
    pl: "Utrzymuj zdrowie i kadłub powyżej zera, aby przetrwać. Najedź na wskaźniki, aby sprawdzić wartości. Jedzenie oznacza sytość, nie zapas porcji. Wybierz jedzenie, aby zużyć porcję i odzyskać 18–24 punkty jedzenia, do limitu 100. Apteczka przywraca zdrowie do 100. Obie czynności nie zużywają energii. Jedzenie spada o świcie. Jeśli po spadku przekracza 30, odzyskujesz do 5 punktów zdrowia. Zdrowie nie może przekroczyć 100. Głód ogranicza odzyskaną energię; pusty wskaźnik jedzenia dodatkowo odbiera zdrowie. Świt zwykle przywraca ⚡3; niewykorzystana energia przepada. Liczba nad ⚡ oznacza jej ilość. Zjedz baton energetyczny, gdy brakuje energii, aby przywrócić ⚡3.",
    'es-AR': "Mantené la Salud y el Casco por encima de cero para sobrevivir. Pasá el cursor sobre los indicadores para ver sus valores. La Comida mide saciedad, no porciones guardadas. Elegí comida para consumir una porción y recuperar 18–24 de Comida, hasta un máximo de 100. Un botiquín restaura la Salud a 100. Ninguna acción gasta energía. La Comida baja al amanecer. Si queda por encima de 30 después de bajar, recuperás hasta 5 de Salud. La Salud no puede superar 100. El hambre reduce la energía recuperada; un indicador de Comida vacío también daña la Salud. El amanecer normalmente restaura ⚡3; la energía sin usar se pierde. El número sobre ⚡ indica la cantidad. Consumí una barra energética cuando te falte energía para restaurar ⚡3.",
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
    en: "Select the bow’s fishing rod once during the day. Click the water to cast for ⚡1. Entering or leaving the fishing view costs no energy. When bubbles appear around the bobber, click them within 6 seconds to catch fish, supplies, or junk. Fish become stored food; eat them separately. Bait improves fish catches automatically and is consumed only when you land a fish. Close the result to cast again. With no energy left, closing the result returns the camera to the boat.",
    pl: "Za dnia wybierz wędkę na dziobie jednym kliknięciem. Kliknij wodę, aby zarzucić żyłkę za ⚡1. Wejście do widoku łowienia i wyjście z niego nie zużywa energii. Gdy wokół spławika pojawią się bąbelki, kliknij je w ciągu 6 sekund, aby wyciągnąć rybę, zapasy albo śmieci. Ryby trafiają do zapasu jedzenia; zjedz je osobno. Przynęta automatycznie poprawia połów i zużywa się tylko po wyciągnięciu ryby. Zamknij wynik, aby zarzucić ponownie. Gdy zabraknie energii, zamknięcie wyniku przywróci widok szalupy.",
    'es-AR': "Elegí la caña de la proa una vez durante el día. Hacé clic en el agua para lanzar por ⚡1. Entrar o salir de la vista de pesca no gasta energía. Cuando aparezcan burbujas alrededor de la boya, hacé clic dentro de 6 segundos para sacar peces, suministros o basura. Los peces se guardan como comida; comelos aparte. La carnada mejora las capturas automáticamente y solo se consume al sacar un pez. Cerrá el resultado para volver a lanzar. Si no queda energía, cerrar el resultado devuelve la cámara al bote.",
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
    en: "Select drifting supplies before night: ordinary supplies cost ⚡1 to collect; chests cost ⚡3. Debris uses the same collection rules. Cargo can contain food and bait, common supplies, and at most one valuable item. Open each recovered chest aboard once for a reward without spending energy; leaving them closed for several nights risks an attack. Select usable scuba gear to dive for ⚡3. Dives can yield 1–3 food, 1–3 bait, or rescue traces. Three-unit finds are extremely rare. You risk losing 15–45 Health even with a reward. Overcast weather worsens the odds, and squalls block diving.",
    pl: "Wybierz dryfujące zapasy przed nocą: zebranie zwykłych zapasów kosztuje ⚡1, a skrzyni ⚡3. Szczątki zbierasz na tych samych zasadach. Ładunek może zawierać jedzenie i przynętę, zwykłe zapasy oraz najwyżej jeden cenny przedmiot. Każdą odzyskaną skrzynię otworzysz raz w szalupie, aby zdobyć nagrodę bez kosztu energii. Zamknięta przez kilka nocy skrzynia grozi atakiem. Wybierz sprawny sprzęt do nurkowania, aby zanurkować za ⚡3. Możesz znaleźć 1–3 porcje jedzenia, 1–3 przynęty lub ślady przybliżające ratunek. Znaleziska po trzy sztuki są niezwykle rzadkie. Ryzykujesz utratę 15–45 punktów zdrowia, nawet ze zdobyczą. Zachmurzenie pogarsza szanse, a szkwał blokuje nurkowanie.",
    'es-AR': "Elegí suministros a la deriva antes de la noche: recoger suministros comunes cuesta ⚡1; los cofres cuestan ⚡3. Los restos se recogen igual. La carga puede contener comida y carnada, suministros comunes y como máximo un objeto valioso. Abrí cada cofre recuperado una vez a bordo para obtener una recompensa sin gastar energía; dejarlos cerrados varias noches puede provocar un ataque. Elegí equipo de buceo utilizable para bucear por ⚡3. Podés encontrar 1–3 porciones de comida, 1–3 unidades de carnada o rastros de rescate. Encontrar tres unidades es extremadamente raro. Podés perder 15–45 de Salud incluso con una recompensa. El cielo cubierto empeora las probabilidades y las tormentas fuertes impiden bucear.",
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
