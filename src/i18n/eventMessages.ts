import { defineMessages } from './messages';
import { itemLabel } from './itemMessages';
import { nightTraderTrade } from '../survival/nightTraderTrades';
import type {
  EventResultPresentation,
  SurvivalEventDefinition,
} from '../survival/survivalTypes';

const EVENT_TEXT = {
  snatcherNetChoice: { en: 'Strike the tentacle with the Net — may tear', pl: 'Uderz mackę siecią — może się rozerwać', 'es-AR': 'Golpeá el tentáculo con la red — puede romperse' },
  snatcherNetHeld: { en: 'The net drives the tentacle away. Your supplies stay aboard.', pl: 'Sieć odpędza mackę. Zapasy zostają na pokładzie.', 'es-AR': 'La red aleja al tentáculo. Tus provisiones quedan a bordo.' },
  snatcherNetTorn: { en: 'The net tears as you strike. The tentacle retreats without your supplies.', pl: 'Sieć pęka przy uderzeniu. Macka wycofuje się bez zapasów.', 'es-AR': 'La red se rompe con el golpe. El tentáculo se retira sin tus provisiones.' },
  sharksFoodChoice: { en: 'Throw 2 Food away from the boat', pl: 'Rzuć 2 jedzenia z dala od łodzi', 'es-AR': 'Tirá 2 de comida lejos del bote' },
  sharksFoodResult: { en: 'The sharks follow the food away from the boat.', pl: 'Rekiny podążają za jedzeniem, oddalając się od łodzi.', 'es-AR': 'Los tiburones siguen la comida y se alejan del bote.' },
  underUsFoodChoice: { en: 'Throw 1 Food away from the boat', pl: 'Rzuć 1 jedzenie z dala od łodzi', 'es-AR': 'Tirá 1 de comida lejos del bote' },
  underUsFoodResult: { en: 'The shadow follows the food. The boat settles, and you can sleep.', pl: 'Cień podąża za jedzeniem. Łódź opada i możesz zasnąć.', 'es-AR': 'La sombra sigue la comida. El bote baja y podés dormir.' },
  windTapeChoice: { en: 'Tape down supplies — spend Tape; hull damage remains', pl: 'Przyklej zapasy — zużyjesz taśmę; kadłub nadal ucierpi', 'es-AR': 'Sujetá las provisiones — gastás cinta; el casco igual sufre daños' },
  windTapeResult: { en: 'The tape holds your supplies in place. The wind still batters the hull.', pl: 'Taśma utrzymuje zapasy na miejscu. Wiatr nadal niszczy kadłub.', 'es-AR': 'La cinta mantiene tus provisiones en su lugar. El viento igual golpea el casco.' },
  watersAnchorChoice: { en: 'Drop the Anchor before the rocks — may break', pl: 'Rzuć kotwicę przed skałami — może pęknąć', 'es-AR': 'Soltá el ancla antes de las rocas — puede romperse' },
  watersAnchorHeld: { en: 'The anchor catches in the shallows. The boat stops before the rocks.', pl: 'Kotwica zahacza o płytkie dno. Łódź zatrzymuje się przed skałami.', 'es-AR': 'El ancla se afirma en el fondo poco profundo. El bote frena antes de las rocas.' },
  watersAnchorBroke: { en: 'The anchor breaks under the strain. The hull scrapes a rock as the boat slips past.', pl: 'Kotwica pęka pod naporem. Kadłub ociera się o skałę, gdy łódź przepływa obok.', 'es-AR': 'El ancla se rompe por la tensión. El casco raspa una roca al pasar.' },
  watersLookoutChoice: { en: 'Find a gap with Binoculars — lose 1 Energy at dawn; may scrape rocks', pl: 'Znajdź przejście lornetką — stracisz 1 energię o świcie; możliwe otarcie o skały', 'es-AR': 'Buscá un paso con binoculares — perdés 1 de energía al amanecer; podés rozar rocas' },
  watersLookoutSafe: { en: 'You find a gap between the rocks. Keeping watch leaves you tired at dawn.', pl: 'Znajdujesz przejście między skałami. Czuwanie męczy cię do świtu.', 'es-AR': 'Encontrás un paso entre las rocas. La vigilia te deja cansado al amanecer.' },
  watersLookoutScrape: { en: 'You spot the gap late. The hull scrapes a rock, and the lookout costs you sleep.', pl: 'Za późno dostrzegasz przejście. Kadłub ociera się o skałę, a czuwanie odbiera ci sen.', 'es-AR': 'Ves el paso tarde. El casco raspa una roca y la vigilia te quita el sueño.' },
  peopleRadioChoice: { en: 'Call them on the Radio — lose 1 Energy at dawn', pl: 'Wywołaj ich przez radio — stracisz 1 energię o świcie', 'es-AR': 'Llamalos por radio — perdés 1 de energía al amanecer' },
  peopleRadioResult: { en: 'The crew answers your call and flashes a light. They will pass your location on. Talking costs you sleep.', pl: 'Załoga odpowiada na wywołanie i błyska światłem. Przekażą twoje położenie dalej. Rozmowa odbiera ci sen.', 'es-AR': 'La tripulación responde y hace una señal de luz. Van a comunicar tu ubicación. La charla te quita el sueño.' },
  traderExchange: { en: 'Exchange', pl: 'Wymiana', 'es-AR': 'Intercambio' },
  traderReceived: { en: 'Received from the trader', pl: 'Otrzymujesz od kupca', 'es-AR': 'Recibiste del comerciante' },
  ufoTitle: { en: 'Flying Saucer', pl: 'Latający spodek', 'es-AR': 'Platillo volador' },
  eventTestAbduction: { en: 'Abduction Ending', pl: 'Zakończenie: porwanie', 'es-AR': 'Final: abducción' },
  ufoReveal: { en: 'A low hum rolls across the sea. A disc crosses the stars, its cold lights searching the water.', pl: 'Niski pomruk niesie się nad morzem. Dysk przesłania gwiazdy, a jego zimne światła przeszukują wodę.', 'es-AR': 'Un zumbido grave recorre el mar. Un disco cruza las estrellas; sus luces frías registran el agua.' },
  ufoIgnore: { en: 'Let it pass', pl: 'Pozwól mu odlecieć', 'es-AR': 'Dejalo pasar' },
  ufoTaken: { en: 'The disc stops above you. A cold beam lifts you from the boat. The sea falls away.', pl: 'Dysk zatrzymuje się nad tobą. Zimny promień unosi cię z łodzi. Morze zostaje daleko w dole.', 'es-AR': 'El disco se detiene sobre vos. Un haz frío te levanta del bote. El mar queda atrás.' },
  ufoPassed: { en: 'You give no signal. The lights pass without finding you, and the hum fades over the sea.', pl: 'Nie dajesz sygnału. Światła mijają cię, niczego nie znajdując. Pomruk cichnie nad morzem.', 'es-AR': 'No das ninguna señal. Las luces pasan sin encontrarte y el zumbido se pierde sobre el mar.' },
  underUsTitle: { en: 'Something Under Us', pl: 'Coś pod nami', 'es-AR': 'Algo debajo nuestro' },
  underUsReveal: { en: 'A vast shadow stops beneath the boat. The hull rises. Something twitches toward the lantern.', pl: 'Ogromny cień zatrzymuje się pod łodzią. Kadłub się unosi. Coś drga w stronę latarni.', 'es-AR': 'Una sombra enorme se detiene debajo del bote. El casco se eleva. Algo se mueve hacia el farol.' },
  underUsStillChoice: { en: 'Stay still — lose 1 Energy at dawn', pl: 'Nie ruszaj się — strać 1 energię o świcie', 'es-AR': 'Quedate quieto — perdés 1 de energía al amanecer' },
  underUsBaitChoice: { en: 'Throw 1 Bait away from the boat', pl: 'Rzuć 1 przynętę z dala od łodzi', 'es-AR': 'Tirá 1 carnada lejos del bote' },
  underUsLightChoice: { en: 'Shine the Flashlight', pl: 'Poświeć latarką', 'es-AR': 'Alumbrá con la linterna' },
  underUsStillResult: { en: 'You stay still until it leaves. Keeping watch costs you one energy at dawn.', pl: 'Nie ruszasz się, aż odpływa. Czuwanie kosztuje cię jedną energię o świcie.', 'es-AR': 'Te quedás quieto hasta que se va. La vigilia te cuesta una energía al amanecer.' },
  underUsBaitResult: { en: 'The shadow follows the bait. The boat settles, and you can sleep.', pl: 'Cień podąża za przynętą. Łódź opada i możesz zasnąć.', 'es-AR': 'La sombra sigue la carnada. El bote baja y podés dormir.' },
  underUsLightResult: { en: 'The beam reveals pale ridges. Something strikes the hull, then sinks out of sight.', pl: 'Snop światła odsłania blade grzbiety. Coś uderza w kadłub, po czym znika w głębinie.', 'es-AR': 'El haz revela crestas pálidas. Algo golpea el casco y se hunde fuera de vista.' },
  bloodOceanTitle: { en: 'Ocean of Blood', pl: 'Ocean krwi', 'es-AR': 'Océano de sangre' },
  bloodOceanReveal: { en: 'The sea turns red. Bodies drift beneath a red sun. One stops beside the boat. Every head turns toward you.', pl: 'Morze czerwienieje. Pod czerwonym słońcem dryfują ciała. Jedno zatrzymuje się przy łodzi. Wszystkie głowy obracają się ku tobie.', 'es-AR': 'El mar se vuelve rojo. Flotan cuerpos bajo un sol rojo. Uno se detiene junto al bote. Todas las cabezas giran hacia vos.' },
  bloodOceanNetChoice: { en: 'Search a body with the net', pl: 'Przeszukaj ciało siecią', 'es-AR': 'Revisá un cuerpo con la red' },
  bloodOceanWaitChoice: { en: 'Wait for dawn', pl: 'Czekaj do świtu', 'es-AR': 'Esperá el amanecer' },
  bloodOceanNetResult: { en: 'The net catches a sealed tin inside the coat. The body rolls toward you. You keep the food. And the memory.', pl: 'Sieć wyciąga zamkniętą puszkę z płaszcza. Ciało obraca się ku tobie. Zostaje ci jedzenie. I wspomnienie.', 'es-AR': 'La red engancha una lata cerrada dentro del abrigo. El cuerpo gira hacia vos. Te quedás con la comida. Y el recuerdo.' },
  bloodOceanWaitResult: { en: 'The bodies gather around the boat. None touch it. You count them until dawn, too afraid to sleep.', pl: 'Ciała zbierają się wokół łodzi. Żadne jej nie dotyka. Liczysz je do świtu, zbyt przerażony, by zasnąć.', 'es-AR': 'Los cuerpos rodean el bote. Ninguno lo toca. Los contás hasta el amanecer, con demasiado miedo para dormir.' },
  driftingLootRetrieved: { en: 'You recover supplies from the drifting cargo.', pl: 'Odzyskujesz zapasy z dryfującego ładunku.', 'es-AR': 'Recuperás provisiones de la carga a la deriva.' },
  driftingLootDelegated: { en: 'Carlitos brings back supplies from the drifting cargo.', pl: 'Carlitos przynosi zapasy z dryfującego ładunku.', 'es-AR': 'Carlitos trae provisiones de la carga a la deriva.' },
  lighthouseTitle: { en: 'Lighthouse', pl: 'Latarnia morska', 'es-AR': 'Faro' },
  lighthouseReveal: { en: 'A distant lighthouse sweeps its beam across the dark sea.', pl: 'Odległa latarnia morska omiata światłem ciemne morze.', 'es-AR': 'Un faro lejano barre el mar oscuro con su luz.' },
  lighthouseFlare: { en: 'Your flare rises above the waves, bright enough to be seen from shore.', pl: 'Twoja flara wznosi się nad falami, wystarczająco jasna, by dostrzec ją z brzegu.', 'es-AR': 'Tu bengala sube sobre las olas, con suficiente brillo para verse desde la costa.' },
  lighthouseFlashlight: { en: 'You flash SOS toward the lighthouse.', pl: 'Nadajesz latarką sygnał SOS w stronę latarni morskiej.', 'es-AR': 'Hacés señales de SOS con la linterna hacia el faro.' },
  lighthouseShotgun: { en: 'Your shot carries across the water toward shore.', pl: 'Odgłos twojego strzału niesie się nad wodą w stronę brzegu.', 'es-AR': 'El sonido de tu disparo cruza el agua hacia la costa.' },
  lighthouseSleep: { en: 'You sleep while the distant beam keeps turning.', pl: 'Śpisz, a odległy snop światła wciąż się obraca.', 'es-AR': 'Dormís mientras el haz de luz lejano sigue girando.' },
  'eventText001': { en: 'Choose a response.', pl: 'Wybierz reakcję.', 'es-AR': 'Elegí una respuesta.' },
  'eventText002': { en: 'Jagged rocks break the surface as the current pulls the boat off course.', pl: 'Poszarpane skały wyłaniają się z wody, gdy prąd spycha łódź z kursu.', 'es-AR': 'Unas rocas filosas asoman a la superficie mientras la corriente desvía el bote.' },
  'eventText003': { en: 'Water pushes through a split in the hull.', pl: 'Woda wdziera się przez pęknięcie w kadłubie.', 'es-AR': 'El agua entra por una grieta en el casco.' },
  'eventText004': { en: 'A dense school churns the water beside the boat.', pl: 'Gęsta ławica wzburza wodę przy burcie.', 'es-AR': 'Un cardumen denso agita el agua junto al bote.' },
  'eventText005': { en: 'A tentacle curls over the gunwale and reaches for one of your supplies.', pl: 'Macka oplata burtę i sięga po jeden z twoich zapasów.', 'es-AR': 'Un tentáculo se enrosca sobre la borda y busca llevarse uno de tus suministros.' },
  'eventText006': { en: 'A huge shape rises and fixes its gaze on the boat.', pl: 'Ogromny kształt wynurza się i wbija wzrok w łódź.', 'es-AR': 'Una figura enorme emerge y fija la mirada en el bote.' },
  'eventText007': { en: 'Dark fins cut through the water and close in.', pl: 'Ciemne płetwy tną wodę i zbliżają się do łodzi.', 'es-AR': 'Unas aletas oscuras cortan el agua y se acercan.' },
  'eventText008': { en: 'A dark wind funnel spins above the sea.', pl: 'Nad morzem wiruje ciemny lej powietrzny.', 'es-AR': 'Un embudo de viento oscuro gira sobre el mar.' },
  'eventText009': { en: 'Rain starts falling over the exposed boat.', pl: 'Deszcz zaczyna padać na nieosłoniętą łódź.', 'es-AR': 'Empieza a llover sobre el bote sin techo.' },
  'eventText010': { en: 'Wind catches every loose object on the boat.', pl: 'Wiatr porywa każdy luźny przedmiot na łodzi.', 'es-AR': 'El viento arrastra todo lo que está suelto en el bote.' },
  'eventText011': { en: 'Uneasy darkness settles over the boat.', pl: 'Nad łodzią zapada niespokojna ciemność.', 'es-AR': 'Una oscuridad inquietante se instala sobre el bote.' },
  'eventText012': { en: 'Thunder rolls as the storm breaks overhead.', pl: 'Nad głową rozpętuje się burza i rozlega się grzmot.', 'es-AR': 'Resuenan los truenos mientras la tormenta estalla sobre tu cabeza.' },
  'eventText013': { en: 'Waves hammer the sides through the night.', pl: 'Fale przez całą noc uderzają w burty.', 'es-AR': 'Las olas golpean los costados toda la noche.' },
  'eventText014': { en: 'A monster moves across the water in the fog.', pl: 'Potwór porusza się po wodzie we mgle.', 'es-AR': 'Un monstruo se mueve sobre el agua entre la niebla.' },
  'eventText015': { en: 'Pale shapes gather around the drifting boat.', pl: 'Blade kształty gromadzą się wokół dryfującej łodzi.', 'es-AR': 'Unas figuras pálidas se reúnen alrededor del bote a la deriva.' },
  'eventText016': { en: 'A distant melody drifts across the water.', pl: 'Po wodzie niesie się odległa melodia.', 'es-AR': 'Una melodía lejana llega sobre el agua.' },
  'eventText017': { en: 'A face takes shape across the moon.', pl: 'Na tarczy księżyca zarysowuje się twarz.', 'es-AR': 'Un rostro toma forma en la luna.' },
  'eventText018': { en: 'A second cat-shaped shadow watches from beyond the lantern light.', pl: 'Drugi cień o kocim kształcie obserwuje łódź spoza blasku latarni.', 'es-AR': 'Una segunda sombra con forma de gato observa desde afuera del alcance del farol.' },
  'eventText019': { en: 'Carlitos sits alert while the night presses close.', pl: 'Carlitos czuwa, gdy noc zaciska się wokół łodzi.', 'es-AR': 'Carlitos permanece alerta mientras la noche se cierra alrededor.' },
  'eventText020': { en: 'Useful supplies drift within reach of the boat.', pl: 'Przydatne zapasy dryfują w zasięgu łodzi.', 'es-AR': 'Unos suministros útiles flotan al alcance del bote.' },
  'eventText021': { en: 'A small chest drifts within reach of the boat.', pl: 'Mała skrzynia dryfuje w zasięgu łodzi.', 'es-AR': 'Un cofre pequeño flota al alcance del bote.' },
  'eventText022': { en: 'Broken cargo and timber drift above a wreck resting below.', pl: 'Rozbity ładunek i deski dryfują nad wrakiem spoczywającym pod wodą.', 'es-AR': 'Restos de carga y madera flotan sobre un naufragio sumergido.' },
  'eventText023': { en: 'Something thumps against the back of the boat.', pl: 'Coś uderza o tył łodzi.', 'es-AR': 'Algo golpea la parte de atrás del bote.' },
  'eventText024': { en: 'A small patch of flowers drifts beside the boat.', pl: 'Niewielka kępa kwiatów dryfuje obok łodzi.', 'es-AR': 'Un pequeño grupo de flores flota junto al bote.' },
  'eventText025': { en: 'The chest shudders and opens a row of wet teeth.', pl: 'Skrzynia drży i odsłania rząd mokrych zębów.', 'es-AR': 'El cofre se sacude y muestra una fila de dientes mojados.' },
  'eventText026': { en: 'A low island shape rises from the midnight water.', pl: 'Z nocnej wody wyłania się niski zarys wyspy.', 'es-AR': 'La silueta baja de una isla emerge del agua a medianoche.' },
  'eventText027': { en: 'A trader waits beside the boat with an open case.', pl: 'Kupiec czeka przy łodzi z otwartą walizką.', 'es-AR': 'Un comerciante espera junto al bote con una valija abierta.' },
  'eventText028': { en: 'A handyman offers to swap whatever you have on hand.', pl: 'Majster proponuje wymianę za to, co masz pod ręką.', 'es-AR': 'Un reparador ofrece cambiar lo que tengas a mano.' },
  'eventText029': { en: 'A distant boat carries other people through the dark.', pl: 'W oddali łódź z innymi ludźmi płynie przez ciemność.', 'es-AR': 'Un bote lejano lleva a otras personas por la oscuridad.' },
  'eventText030': { en: 'A small plane crosses the dark horizon.', pl: 'Mały samolot przecina ciemny horyzont.', 'es-AR': 'Un avión pequeño cruza el horizonte oscuro.' },

  'eventText031': { en: 'Dangerous Waters', pl: 'Niebezpieczne wody', 'es-AR': 'Aguas peligrosas' },
  'eventText032': { en: 'Leak', pl: 'Przeciek', 'es-AR': 'Filtración' },
  'eventText033': { en: 'School of Fish', pl: 'Ławica ryb', 'es-AR': 'Cardumen' },
  'eventText034': { en: 'Tentacle Attack', pl: 'Atak macki', 'es-AR': 'Ataque de tentáculo' },
  'eventText035': { en: 'Death Stare', pl: 'Śmiertelne spojrzenie', 'es-AR': 'Mirada mortal' },
  'eventText036': { en: 'Swarm of Sharks', pl: 'Stado rekinów', 'es-AR': 'Grupo de tiburones' },
  'eventText037': { en: 'Tornado', pl: 'Trąba powietrzna', 'es-AR': 'Tornado' },
  'eventText038': { en: 'Shower Night', pl: 'Deszczowa noc', 'es-AR': 'Noche de lluvia' },
  'eventText039': { en: 'Windy Night', pl: 'Wietrzna noc', 'es-AR': 'Noche de viento' },
  'eventText040': { en: 'Bad Sleep', pl: 'Zły sen', 'es-AR': 'Mal sueño' },
  'eventText041': { en: 'Thunderstorm', pl: 'Burza z piorunami', 'es-AR': 'Tormenta eléctrica' },
  'eventText042': { en: 'Restless Waves', pl: 'Niespokojne fale', 'es-AR': 'Olas inquietas' },
  'eventText043': { en: 'Monster in the Fog', pl: 'Potwór we mgle', 'es-AR': 'Monstruo en la niebla' },
  'eventText044': { en: 'Ghosts', pl: 'Duchy', 'es-AR': 'Fantasmas' },
  'eventText045': { en: 'Eerie Melody', pl: 'Upiorna melodia', 'es-AR': 'Melodía inquietante' },
  'eventText046': { en: 'Face on the Moon', pl: 'Twarz na księżycu', 'es-AR': 'Rostro en la luna' },
  'eventText047': { en: 'Shadow Figure', pl: 'Postać z cienia', 'es-AR': 'Figura de sombra' },
  'eventText048': { en: 'Guarded Sleep', pl: 'Sen pod strażą', 'es-AR': 'Sueño vigilado' },
  'eventText049': { en: 'Drifting Supplies', pl: 'Dryfujące zapasy', 'es-AR': 'Suministros a la deriva' },
  'eventText050': { en: 'Drifting Chest', pl: 'Dryfująca skrzynia', 'es-AR': 'Cofre a la deriva' },
  'eventText052': { en: 'Check the Back', pl: 'Sprawdź tył łodzi', 'es-AR': 'Revisá atrás' },
  'eventText053': { en: 'Flowers', pl: 'Kwiaty', 'es-AR': 'Flores' },
  'eventText054': { en: 'Chest Attack', pl: 'Atak skrzyni', 'es-AR': 'Ataque del cofre' },
  'eventText055': { en: 'Midnight Tour', pl: 'Nocna wyprawa', 'es-AR': 'Paseo de medianoche' },
  'eventText056': { en: 'Night Trader', pl: 'Nocny kupiec', 'es-AR': 'Comerciante nocturno' },
  'eventText057': { en: 'Handyman', pl: 'Majster', 'es-AR': 'Reparador' },
  'eventText058': { en: 'Other People', pl: 'Inni ludzie', 'es-AR': 'Otras personas' },
  'eventText059': { en: 'Plane', pl: 'Samolot', 'es-AR': 'Avión' },

  'eventText060': { en: 'Use Map', pl: 'Użyj mapy', 'es-AR': 'Usá el mapa' },
  'eventText061': { en: 'Use Anchor', pl: 'Użyj kotwicy', 'es-AR': 'Usá el ancla' },
  'eventText062': { en: 'Use Compass', pl: 'Użyj kompasu', 'es-AR': 'Usá la brújula' },
  'eventText063': { en: 'Sleep', pl: 'Śpij', 'es-AR': 'Dormí' },
  'eventText064': { en: 'Use Duct Tape', pl: 'Użyj taśmy naprawczej', 'es-AR': 'Usá la cinta adhesiva' },
  'eventText065': { en: 'Use Bucket', pl: 'Użyj wiadra', 'es-AR': 'Usá el balde' },
  'eventText066': { en: 'Use Fishing Net', pl: 'Użyj sieci rybackiej', 'es-AR': 'Usá la red de pesca' },
  'eventText067': { en: 'Use Binoculars', pl: 'Użyj lornetki', 'es-AR': 'Usá los binoculares' },
  'eventText068': { en: 'Use Knife', pl: 'Użyj noża', 'es-AR': 'Usá el cuchillo' },
  'eventText069': { en: 'Use Shotgun', pl: 'Użyj strzelby', 'es-AR': 'Usá la escopeta' },
  'eventText070': { en: 'Use Flare Gun', pl: 'Użyj pistoletu sygnałowego', 'es-AR': 'Usá la pistola de bengalas' },
  'eventText071': { en: 'Use Flashlight', pl: 'Użyj latarki', 'es-AR': 'Usá la linterna' },
  'eventText072': { en: 'Use Umbrella', pl: 'Użyj parasola', 'es-AR': 'Usá el paraguas' },
  'eventText073': { en: 'Use Food', pl: 'Użyj jedzenia', 'es-AR': 'Usá comida' },
  'eventText074': { en: 'Use Bait', pl: 'Użyj przynęty', 'es-AR': 'Usá carnada' },
  'eventText075': { en: 'Use Swim Ring', pl: 'Użyj koła ratunkowego', 'es-AR': 'Usá el salvavidas' },
  'eventText076': { en: 'Let Carlitos Watch', pl: 'Pozwól Carlitosowi czuwać', 'es-AR': 'Dejá que Carlitos vigile' },
  'eventText077': { en: 'Sleep Normally', pl: 'Śpij normalnie', 'es-AR': 'Dormí como siempre' },
  'eventText078': { en: 'Retrieve Supplies', pl: 'Wyłów zapasy', 'es-AR': 'Recuperá los suministros' },
  'eventText079': { en: 'Retrieve It', pl: 'Wyłów ją', 'es-AR': 'Recuperalo' },
  'eventText080': { en: 'Send Carlitos', pl: 'Wyślij Carlitosa', 'es-AR': 'Mandá a Carlitos' },
  'eventText081': { en: 'Let It Drift', pl: 'Pozwól temu odpłynąć', 'es-AR': 'Dejalo ir' },
  'eventText082': { en: 'Search Debris', pl: 'Przeszukaj szczątki', 'es-AR': 'Buscá entre los restos' },
  'eventText083': { en: 'Search underwater', pl: 'Przeszukaj dno', 'es-AR': 'Buscá bajo el agua' },
  'eventText084': { en: 'Leave', pl: 'Odejdź', 'es-AR': 'Andate' },
  'eventText085': { en: 'Yes', pl: 'Tak', 'es-AR': 'Sí' },
  'eventText086': { en: 'No', pl: 'Nie', 'es-AR': 'No' },
  'eventText087': { en: 'Let Them Drift', pl: 'Pozwól im odpłynąć', 'es-AR': 'Dejalas ir' },
  'eventText088': { en: 'Attack', pl: 'Atakuj', 'es-AR': 'Atacá' },
  'eventText089': { en: 'Visit island', pl: 'Odwiedź wyspę', 'es-AR': 'Visitá la isla' },
  'eventText090': { en: 'Skip island', pl: 'Pomiń wyspę', 'es-AR': 'Seguí de largo' },
  'eventText091': { en: 'Offer Food', pl: 'Zaoferuj jedzenie', 'es-AR': 'Ofrecé comida' },
  'eventText092': { en: 'Offer Bait', pl: 'Zaoferuj przynętę', 'es-AR': 'Ofrecé carnada' },
  'eventText093': { en: 'Offer Map', pl: 'Zaoferuj mapę', 'es-AR': 'Ofrecé el mapa' },
  'eventText094': { en: 'Offer Umbrella', pl: 'Zaoferuj parasol', 'es-AR': 'Ofrecé el paraguas' },
  'eventText095': { en: 'Offer Swim Ring', pl: 'Zaoferuj koło ratunkowe', 'es-AR': 'Ofrecé el salvavidas' },
  'eventText096': { en: 'Refuse', pl: 'Odmów', 'es-AR': 'Rechazá' },
  'eventText097': { en: 'Spyglass for Flashlight', pl: 'Lornetka za latarkę', 'es-AR': 'Binoculares por linterna' },
  'eventText098': { en: 'Flashlight for Spyglass', pl: 'Latarka za lornetkę', 'es-AR': 'Linterna por binoculares' },
  'eventText099': { en: 'Flare Gun for Shotgun', pl: 'Pistolet sygnałowy za strzelbę', 'es-AR': 'Pistola de bengalas por escopeta' },
  'eventText100': { en: 'Shotgun for Flare Gun', pl: 'Strzelba za pistolet sygnałowy', 'es-AR': 'Escopeta por pistola de bengalas' },
  'eventText101': { en: 'Medkit for Scuba Gear', pl: 'Apteczka za sprzęt do nurkowania', 'es-AR': 'Botiquín por equipo de buceo' },
  'eventText102': { en: 'Fishing Net for Bucket', pl: 'Sieć rybacka za wiadro', 'es-AR': 'Red de pesca por balde' },
  'eventText103': { en: 'Bucket for Fishing Net', pl: 'Wiadro za sieć rybacką', 'es-AR': 'Balde por red de pesca' },
  'eventText104': { en: 'Duct Tape for Energy Bar', pl: 'Taśma naprawcza za baton energetyczny', 'es-AR': 'Cinta adhesiva por barra energética' },
  'eventText105': { en: 'Energy Bar for Duct Tape', pl: 'Baton energetyczny za taśmę naprawczą', 'es-AR': 'Barra energética por cinta adhesiva' },
  'eventText106': { en: 'Swim Ring for Radio', pl: 'Koło ratunkowe za radio', 'es-AR': 'Salvavidas por radio' },
  'eventText107': { en: 'Anchor for Chest', pl: 'Kotwica za skrzynię', 'es-AR': 'Ancla por cofre' },
  'eventText108': { en: 'Chest for Anchor', pl: 'Skrzynia za kotwicę', 'es-AR': 'Cofre por ancla' },
  'eventText109': { en: 'Touch the Hand', pl: 'Dotknij dłoni', 'es-AR': 'Tocá la mano' },
  'eventText110': { en: 'Let It Pass', pl: 'Pozwól odpłynąć', 'es-AR': 'Dejalo pasar' },

  'eventText111': { en: 'The map guides the boat through a clear channel.', pl: 'Mapa prowadzi łódź przez bezpieczny przesmyk.', 'es-AR': 'El mapa guía el bote por un canal despejado.' },
  'eventText112': { en: 'The rocks damage the boat.', pl: 'Skały uszkadzają łódź.', 'es-AR': 'Las rocas dañan el bote.' },
  'eventText113': { en: 'The compass holds a safe bearing through the rocks.', pl: 'Kompas pozwala utrzymać bezpieczny kurs między skałami.', 'es-AR': 'La brújula mantiene un rumbo seguro entre las rocas.' },
  'eventText114': { en: 'The tape is used.', pl: 'Zużywasz taśmę.', 'es-AR': 'Usás la cinta adhesiva.' },
  'eventText115': { en: 'You keep pace with the rising water until dawn.', pl: 'Do świtu nadążasz z wylewaniem napływającej wody.', 'es-AR': 'Sacás el agua a medida que entra hasta el amanecer.' },
  'eventText116': { en: 'The boat is damaged.', pl: 'Łódź zostaje uszkodzona.', 'es-AR': 'El bote sufre daños.' },
  'eventText117': { en: 'The map slows the leak.', pl: 'Mapa spowalnia przeciek.', 'es-AR': 'El mapa reduce la filtración.' },
  'eventText118': { en: 'The map tears while slowing the leak.', pl: 'Mapa rozrywa się podczas tamowania przecieku.', 'es-AR': 'El mapa se rompe mientras reduce la filtración.' },
  'eventText119': { en: 'The leak damages the boat.', pl: 'Przeciek uszkadza łódź.', 'es-AR': 'La filtración daña el bote.' },
  'eventText120': { en: 'The leak damages the boat and takes an item.', pl: 'Przeciek uszkadza łódź i porywa jeden przedmiot.', 'es-AR': 'La filtración daña el bote y arrastra un objeto.' },
  'eventText121': { en: 'You gain three food.', pl: 'Zdobywasz trzy porcje jedzenia.', 'es-AR': 'Conseguís tres porciones de comida.' },
  'eventText122': { en: 'You gain two food.', pl: 'Zdobywasz dwie porcje jedzenia.', 'es-AR': 'Conseguís dos porciones de comida.' },
  'eventText123': { en: 'You gain one food.', pl: 'Zdobywasz jedną porcję jedzenia.', 'es-AR': 'Conseguís una porción de comida.' },
  'eventText124': { en: 'The school slips beyond the bucket.', pl: 'Ławica wymyka się poza zasięg wiadra.', 'es-AR': 'El cardumen se escapa del alcance del balde.' },
  'eventText125': { en: 'The school passes beyond reach.', pl: 'Ławica przepływa poza zasięgiem.', 'es-AR': 'El cardumen pasa fuera de tu alcance.' },
  'eventText126': { en: 'The school moves on before dawn.', pl: 'Ławica odpływa przed świtem.', 'es-AR': 'El cardumen se aleja antes del amanecer.' },
  'eventText127': { en: 'You cut the tentacle. The supply stays aboard.', pl: 'Odcinasz mackę. Zapasy zostają na pokładzie.', 'es-AR': 'Cortás el tentáculo. El suministro queda a bordo.' },
  'eventText128': { en: 'The shot drives the tentacle away. The supply stays aboard.', pl: 'Strzał odpędza mackę. Zapasy zostają na pokładzie.', 'es-AR': 'El disparo ahuyenta al tentáculo. El suministro queda a bordo.' },
  'eventText129': { en: 'The flare drives the tentacle away. The supply stays aboard.', pl: 'Flara odpędza mackę. Zapasy zostają na pokładzie.', 'es-AR': 'La bengala ahuyenta al tentáculo. El suministro queda a bordo.' },
  'eventText130': { en: 'The tentacle steals a supply and wounds you.', pl: 'Macka kradnie zapasy i cię rani.', 'es-AR': 'El tentáculo roba un suministro y te hiere.' },
  'eventText131': { en: 'The creature sinks below the beam.', pl: 'Stworzenie znika pod snopem światła.', 'es-AR': 'La criatura se hunde bajo el haz de luz.' },
  'eventText132': { en: 'The flashlight is lost.', pl: 'Tracisz latarkę.', 'es-AR': 'Perdés la linterna.' },
  'eventText133': { en: "The umbrella breaks the creature's gaze.", pl: 'Parasol zasłania spojrzenie stworzenia.', 'es-AR': 'El paraguas bloquea la mirada de la criatura.' },
  'eventText134': { en: 'The creature attacks.', pl: 'Stworzenie atakuje.', 'es-AR': 'La criatura ataca.' },
  'eventText135': { en: 'You lose two food.', pl: 'Tracisz dwie porcje jedzenia.', 'es-AR': 'Perdés dos porciones de comida.' },
  'eventText136': { en: 'The shotgun is fired.', pl: 'Oddajesz strzał ze strzelby.', 'es-AR': 'Disparás la escopeta.' },
  'eventText137': { en: 'The shape loses interest and sinks away.', pl: 'Kształt traci zainteresowanie i znika pod wodą.', 'es-AR': 'La figura pierde el interés y se hunde.' },
  'eventText138': { en: 'The net holds the swarm back.', pl: 'Sieć powstrzymuje stado.', 'es-AR': 'La red mantiene a raya a los tiburones.' },
  'eventText139': { en: 'The net tears while holding the swarm back.', pl: 'Sieć rozrywa się, ale powstrzymuje stado.', 'es-AR': 'La red se rompe mientras mantiene a raya a los tiburones.' },
  'eventText140': { en: 'You drive the sharks away from the boat.', pl: 'Odpędzasz rekiny od łodzi.', 'es-AR': 'Alejás a los tiburones del bote.' },
  'eventText141': { en: 'The knife breaks as a shark bites you.', pl: 'Nóż pęka, gdy rekin cię gryzie.', 'es-AR': 'El cuchillo se rompe cuando un tiburón te muerde.' },
  'eventText142': { en: 'The swarm attacks.', pl: 'Stado atakuje.', 'es-AR': 'Los tiburones atacan.' },
  'eventText143': { en: 'You lose two bait.', pl: 'Tracisz dwie przynęty.', 'es-AR': 'Perdés dos porciones de carnada.' },
  'eventText144': { en: 'The fins scatter before reaching the hull.', pl: 'Płetwy rozpraszają się przed dotarciem do kadłuba.', 'es-AR': 'Las aletas se dispersan antes de llegar al casco.' },
  'eventText145': { en: 'The anchor holds the boat outside the current.', pl: 'Kotwica utrzymuje łódź poza nurtem.', 'es-AR': 'El ancla mantiene el bote fuera de la corriente.' },
  'eventText146': { en: 'The ring pulls the boat outside the strongest current.', pl: 'Koło wyciąga łódź z najsilniejszego nurtu.', 'es-AR': 'El salvavidas saca al bote de la corriente más fuerte.' },
  'eventText147': { en: 'The boat is badly damaged and one item is lost.', pl: 'Łódź zostaje ciężko uszkodzona. Tracisz jeden przedmiot.', 'es-AR': 'El bote sufre daños graves y perdés un objeto.' },
  'eventText148': { en: 'The bucket keeps the rain under control.', pl: 'Wiadro pozwala opanować napływ deszczu.', 'es-AR': 'El balde te permite controlar el agua de lluvia.' },
  'eventText149': { en: 'The umbrella shelters you.', pl: 'Parasol chroni cię przed deszczem.', 'es-AR': 'El paraguas te protege.' },
  'eventText150': { en: 'The map covers the exposed supplies.', pl: 'Mapa osłania wystawione na deszcz zapasy.', 'es-AR': 'El mapa cubre los suministros expuestos.' },
  'eventText151': { en: 'The rain eases before dawn.', pl: 'Deszcz słabnie przed świtem.', 'es-AR': 'La lluvia afloja antes del amanecer.' },
  'eventText152': { en: 'You wake with two energy.', pl: 'Budzisz się z dwoma punktami energii.', 'es-AR': 'Te despertás con dos puntos de energía.' },
  'eventText153': { en: 'The net secures the loose supplies.', pl: 'Sieć zabezpiecza luźne zapasy.', 'es-AR': 'La red sujeta los suministros sueltos.' },
  'eventText154': { en: 'The net tears while securing the loose supplies.', pl: 'Sieć rozrywa się podczas zabezpieczania zapasów.', 'es-AR': 'La red se rompe mientras sujeta los suministros sueltos.' },
  'eventText155': { en: 'The map is lost, but you find food.', pl: 'Tracisz mapę, ale znajdujesz jedzenie.', 'es-AR': 'Perdés el mapa, pero encontrás comida.' },
  'eventText156': { en: 'The umbrella shields the loose supplies.', pl: 'Parasol osłania luźne zapasy.', 'es-AR': 'El paraguas protege los suministros sueltos.' },
  'eventText157': { en: 'The umbrella is lost.', pl: 'Tracisz parasol.', 'es-AR': 'Perdés el paraguas.' },
  'eventText158': { en: 'The wind batters the boat.', pl: 'Wiatr smaga łódź.', 'es-AR': 'El viento azota el bote.' },
  'eventText159': { en: 'The hollow bucket knocks through the night.', pl: 'Puste wiadro stuka przez całą noc.', 'es-AR': 'El balde vacío golpea toda la noche.' },
  'eventText160': { en: 'The beam finds only empty water.', pl: 'Snop światła pada tylko na pustą wodę.', 'es-AR': 'El haz de luz solo encuentra agua vacía.' },
  'eventText161': { en: 'The ring drifts against the gunwale.', pl: 'Koło obija się o burtę.', 'es-AR': 'El salvavidas flota y golpea contra la borda.' },
  'eventText162': { en: 'The umbrella shelters a restless sleep.', pl: 'Parasol osłania twój niespokojny sen.', 'es-AR': 'El paraguas te protege durante un sueño inquieto.' },
  'eventText163': { en: 'A hard gust folds the umbrella during the night.', pl: 'Silny podmuch łamie parasol w środku nocy.', 'es-AR': 'Una ráfaga fuerte dobla el paraguas durante la noche.' },
  'eventText164': { en: 'The anchor holds through the storm.', pl: 'Kotwica wytrzymuje napór burzy.', 'es-AR': 'El ancla resiste la tormenta.' },
  'eventText165': { en: 'A random item is lost.', pl: 'Tracisz losowy przedmiot.', 'es-AR': 'Perdés un objeto al azar.' },
  'eventText166': { en: 'The umbrella sheds the worst rain.', pl: 'Parasol chroni przed najgorszą ulewą.', 'es-AR': 'El paraguas te protege de la peor lluvia.' },
  'eventText167': { en: 'The storm damages the boat and takes an item.', pl: 'Burza uszkadza łódź i porywa jeden przedmiot.', 'es-AR': 'La tormenta daña el bote y arrastra un objeto.' },
  'eventText168': { en: 'The storm damages the boat.', pl: 'Burza uszkadza łódź.', 'es-AR': 'La tormenta daña el bote.' },
  'eventText169': { en: 'The anchor steadies the boat through the waves.', pl: 'Kotwica stabilizuje łódź pośród fal.', 'es-AR': 'El ancla estabiliza el bote entre las olas.' },
  'eventText170': { en: 'The swim ring steadies the boat.', pl: 'Koło ratunkowe stabilizuje łódź.', 'es-AR': 'El salvavidas estabiliza el bote.' },
  'eventText171': { en: 'The waves damage the boat.', pl: 'Fale uszkadzają łódź.', 'es-AR': 'Las olas dañan el bote.' },
  'eventText172': { en: 'The waves damage the boat and take an item.', pl: 'Fale uszkadzają łódź i porywają jeden przedmiot.', 'es-AR': 'Las olas dañan el bote y arrastran un objeto.' },
  'eventText173': { en: 'The compass keeps the boat on a steady bearing.', pl: 'Kompas pomaga utrzymać stały kurs.', 'es-AR': 'La brújula mantiene el bote en un rumbo estable.' },
  'eventText174': { en: 'Danger increases.', pl: 'Zagrożenie rośnie.', 'es-AR': 'El peligro aumenta.' },
  'eventText175': { en: 'The beam drives the figure back into the fog.', pl: 'Snop światła odpędza postać z powrotem we mgłę.', 'es-AR': 'El haz de luz obliga a la figura a retroceder hacia la niebla.' },
  'eventText176': { en: 'The figure attacks.', pl: 'Postać atakuje.', 'es-AR': 'La figura ataca.' },
  'eventText177': { en: 'You are injured.', pl: 'Zostajesz ranny.', 'es-AR': 'Sufrís una herida.' },
  'eventText178': { en: 'The flare drives the pale shapes into the dark.', pl: 'Flara odpędza blade kształty w ciemność.', 'es-AR': 'La bengala ahuyenta a las figuras pálidas hacia la oscuridad.' },
  'eventText179': { en: 'The beam keeps the pale shapes beyond the gunwale.', pl: 'Snop światła trzyma blade kształty z dala od burty.', 'es-AR': 'El haz de luz mantiene a las figuras pálidas lejos de la borda.' },
  'eventText180': { en: 'You wake with one energy.', pl: 'Budzisz się z jednym punktem energii.', 'es-AR': 'Te despertás con un punto de energía.' },
  'eventText181': { en: 'The siren attacks.', pl: 'Syrena atakuje.', 'es-AR': 'La sirena ataca.' },
  'eventText182': { en: 'The umbrella muffles the melody until it fades.', pl: 'Parasol tłumi melodię, aż ta cichnie.', 'es-AR': 'El paraguas amortigua la melodía hasta que se apaga.' },
  'eventText183': { en: 'The tape blocks the melody until it fades.', pl: 'Taśma odcina melodię, aż ta cichnie.', 'es-AR': 'La cinta adhesiva bloquea la melodía hasta que se apaga.' },
  'eventText184': { en: 'You wake exhausted.', pl: 'Budzisz się wyczerpany.', 'es-AR': 'Te despertás sin fuerzas.' },
  'eventText185': { en: 'The false shape remains beyond the light.', pl: 'Fałszywy kształt pozostaje poza zasięgiem światła.', 'es-AR': 'La figura falsa permanece fuera del alcance de la luz.' },
  'eventText186': { en: 'The false shape claws you before retreating.', pl: 'Fałszywy kształt rani cię pazurami i wycofuje się.', 'es-AR': 'La figura falsa te araña antes de retirarse.' },
  'eventText187': { en: 'The flare drives the false shape away.', pl: 'Flara odpędza fałszywy kształt.', 'es-AR': 'La bengala ahuyenta a la figura falsa.' },
  'eventText188': { en: 'The shadow leaves before dawn.', pl: 'Cień odchodzi przed świtem.', 'es-AR': 'La sombra se va antes del amanecer.' },
  'eventText189': { en: 'Carlitos keeps the night peaceful.', pl: 'Carlitos pilnuje, aby noc minęła spokojnie.', 'es-AR': 'Carlitos mantiene la noche en calma.' },
  'eventText190': { en: 'Something slips past his watch.', pl: 'Coś wymyka się jego czujności.', 'es-AR': 'Algo se escapa de su vigilancia.' },
  'eventText191': { en: 'The normal night continues.', pl: 'Zwykła noc trwa dalej.', 'es-AR': 'La noche sigue como siempre.' },
  'eventText192': { en: 'You recover one food from the barrel.', pl: 'Wyławiasz z beczki jedną porcję jedzenia.', 'es-AR': 'Recuperás una porción de comida del barril.' },
  'eventText193': { en: 'You recover one bait from the barrel.', pl: 'Wyławiasz z beczki jedną przynętę.', 'es-AR': 'Recuperás una unidad de carnada del barril.' },
  'eventText195': { en: 'You recover two food from the cooler.', pl: 'Wyławiasz z lodówki dwie porcje jedzenia.', 'es-AR': 'Recuperás dos porciones de comida de la conservadora.' },
  'eventText196': { en: 'You recover two bait from the cooler.', pl: 'Wyławiasz z lodówki dwie przynęty.', 'es-AR': 'Recuperás dos porciones de carnada de la conservadora.' },
  'eventText198': { en: 'You recover three food from the shipping container.', pl: 'Odzyskujesz z kontenera trzy porcje jedzenia.', 'es-AR': 'Recuperás tres porciones de comida del contenedor de carga.' },
  'eventText199': { en: 'You recover three bait from the shipping container.', pl: 'Odzyskujesz z kontenera trzy przynęty.', 'es-AR': 'Recuperás tres porciones de carnada del contenedor de carga.' },
  'eventText201': { en: 'You recover an energy bar from the shipping container.', pl: 'Odzyskujesz z kontenera baton energetyczny.', 'es-AR': 'Recuperás una barra energética del contenedor de carga.' },
  'eventText202': { en: 'Carlitos recovers one food from the barrel.', pl: 'Carlitos wyławia z beczki jedną porcję jedzenia.', 'es-AR': 'Carlitos recupera una porción de comida del barril.' },
  'eventText203': { en: 'Carlitos recovers one bait from the barrel.', pl: 'Carlitos wyławia z beczki jedną przynętę.', 'es-AR': 'Carlitos recupera una unidad de carnada del barril.' },
  'eventText205': { en: 'Carlitos recovers two food from the cooler.', pl: 'Carlitos wyławia z lodówki dwie porcje jedzenia.', 'es-AR': 'Carlitos recupera dos porciones de comida de la conservadora.' },
  'eventText206': { en: 'Carlitos recovers two bait from the cooler.', pl: 'Carlitos wyławia z lodówki dwie przynęty.', 'es-AR': 'Carlitos recupera dos porciones de carnada de la conservadora.' },
  'eventText208': { en: 'Carlitos recovers three food from the shipping container.', pl: 'Carlitos odzyskuje z kontenera trzy porcje jedzenia.', 'es-AR': 'Carlitos recupera tres porciones de comida del contenedor de carga.' },
  'eventText209': { en: 'Carlitos recovers three bait from the shipping container.', pl: 'Carlitos odzyskuje z kontenera trzy przynęty.', 'es-AR': 'Carlitos recupera tres porciones de carnada del contenedor de carga.' },
  'eventText211': { en: 'Carlitos recovers an energy bar from the shipping container.', pl: 'Carlitos odzyskuje z kontenera baton energetyczny.', 'es-AR': 'Carlitos recupera una barra energética del contenedor de carga.' },
  'eventText212': { en: 'The supplies drift out of reach.', pl: 'Zapasy odpływają poza zasięg.', 'es-AR': 'Los suministros se alejan fuera de tu alcance.' },
  'eventText213': { en: 'You recover the closed chest.', pl: 'Wyławiasz zamkniętą skrzynię.', 'es-AR': 'Recuperás el cofre cerrado.' },
  'eventText214': { en: 'Carlitos recovers the closed chest.', pl: 'Carlitos wyławia zamkniętą skrzynię.', 'es-AR': 'Carlitos recupera el cofre cerrado.' },
  'eventText215': { en: 'The chest drifts out of reach.', pl: 'Skrzynia odpływa poza zasięg.', 'es-AR': 'El cofre se aleja fuera de tu alcance.' },
  'eventText232': { en: 'You cut up the fish before it flops overboard.', pl: 'Patroszysz rybę, zanim wypada za burtę.', 'es-AR': 'Cortás el pescado antes de que salte por la borda.' },
  'eventText233': { en: 'The anglerfish bites the knife instead. The blade snaps.', pl: 'Żabnica zaciska zęby na nożu. Ostrze pęka.', 'es-AR': 'El pez abisal muerde el cuchillo. La hoja se quiebra.' },
  'eventText234': { en: 'A fish has landed aboard.', pl: 'Ryba wpadła na pokład.', 'es-AR': 'Un pez cayó a bordo.' },
  'eventText235': { en: 'An anglerfish strikes from the stern.', pl: 'Żabnica atakuje od strony rufy.', 'es-AR': 'Un pez abisal ataca desde la popa.' },
  'eventText236': { en: 'You leave the sound alone.', pl: 'Ignorujesz ten dźwięk.', 'es-AR': 'Ignorás el ruido.' },
  'eventText237': { en: 'You lift the flowers aboard.', pl: 'Wyławiasz kwiaty na pokład.', 'es-AR': 'Subís las flores a bordo.' },
  'eventText238': { en: 'You gather the flowers in the bucket.', pl: 'Zbierasz kwiaty do wiadra.', 'es-AR': 'Juntás las flores en el balde.' },
  'eventText239': { en: 'The flowers drift into the dark.', pl: 'Kwiaty odpływają w ciemność.', 'es-AR': 'Las flores se alejan hacia la oscuridad.' },
  'eventText240': { en: 'The knife reduced the bite. The chest falls overboard.', pl: 'Nóż osłabia ugryzienie. Skrzynia wypada za burtę.', 'es-AR': 'El cuchillo reduce la mordida. El cofre cae por la borda.' },
  'eventText241': { en: 'The chest tears into you before it falls overboard.', pl: 'Skrzynia wbija w ciebie zęby, zanim wypada za burtę.', 'es-AR': 'El cofre te clava los dientes antes de caer por la borda.' },
  'eventText242': { en: 'You find a chest.', pl: 'Znajdujesz skrzynię.', 'es-AR': 'Encontrás un cofre.' },
  'eventText243': { en: 'Something jumps from the palms.', pl: 'Coś wyskakuje spomiędzy palm.', 'es-AR': 'Algo salta de entre las palmeras.' },
  'eventText244': { en: 'The island disappears into the dark.', pl: 'Wyspa znika w ciemności.', 'es-AR': 'La isla desaparece en la oscuridad.' },
  'eventText245': { en: 'The trader gives you duct tape.', pl: 'Kupiec daje ci taśmę naprawczą.', 'es-AR': 'El comerciante te da cinta adhesiva.' },
  'eventText246': { en: 'The trader gives you an energy bar.', pl: 'Kupiec daje ci baton energetyczny.', 'es-AR': 'El comerciante te da una barra energética.' },
  'eventText247': { en: 'The trader gives you a compass.', pl: 'Kupiec daje ci kompas.', 'es-AR': 'El comerciante te da una brújula.' },
  'eventText248': { en: 'The trader gives you a medkit.', pl: 'Kupiec daje ci apteczkę.', 'es-AR': 'El comerciante te da un botiquín.' },
  'eventText249': { en: 'The trader gives you a radio.', pl: 'Kupiec daje ci radio.', 'es-AR': 'El comerciante te da una radio.' },
  'eventText250': { en: 'The trader rows on into the night.', pl: 'Kupiec odpływa w noc.', 'es-AR': 'El comerciante se aleja remando hacia la noche.' },
  'eventText251': { en: 'The handyman gives you a flashlight.', pl: 'Majster daje ci latarkę.', 'es-AR': 'El reparador te da una linterna.' },
  'eventText252': { en: 'The handyman gives you binoculars.', pl: 'Majster daje ci lornetkę.', 'es-AR': 'El reparador te da unos binoculares.' },
  'eventText253': { en: 'The handyman gives you a shotgun.', pl: 'Majster daje ci strzelbę.', 'es-AR': 'El reparador te da una escopeta.' },
  'eventText254': { en: 'The handyman gives you a flare gun.', pl: 'Majster daje ci pistolet sygnałowy.', 'es-AR': 'El reparador te da una pistola de bengalas.' },
  'eventText255': { en: 'The handyman gives you scuba gear.', pl: 'Majster daje ci sprzęt do nurkowania.', 'es-AR': 'El reparador te da equipo de buceo.' },
  'eventText256': { en: 'The handyman gives you a bucket.', pl: 'Majster daje ci wiadro.', 'es-AR': 'El reparador te da un balde.' },
  'eventText257': { en: 'The handyman gives you a fishing net.', pl: 'Majster daje ci sieć rybacką.', 'es-AR': 'El reparador te da una red de pesca.' },
  'eventText258': { en: 'The handyman gives you an energy bar.', pl: 'Majster daje ci baton energetyczny.', 'es-AR': 'El reparador te da una barra energética.' },
  'eventText259': { en: 'The handyman gives you duct tape.', pl: 'Majster daje ci taśmę naprawczą.', 'es-AR': 'El reparador te da cinta adhesiva.' },
  'eventText260': { en: 'The handyman gives you a radio.', pl: 'Majster daje ci radio.', 'es-AR': 'El reparador te da una radio.' },
  'eventText261': { en: 'The handyman gives you a chest.', pl: 'Majster daje ci skrzynię.', 'es-AR': 'El reparador te da un cofre.' },
  'eventText262': { en: 'The handyman gives you an anchor.', pl: 'Majster daje ci kotwicę.', 'es-AR': 'El reparador te da un ancla.' },
  'eventText263': { en: 'The hand closes around you.', pl: 'Dłoń zaciska się wokół ciebie.', 'es-AR': 'La mano se cierra alrededor tuyo.' },
  'eventText264': { en: 'The handyman shrugs and drifts away.', pl: 'Majster wzrusza ramionami i odpływa.', 'es-AR': 'El reparador se encoge de hombros y se aleja.' },
  'eventText265': { en: 'The distant crew sees your flare.', pl: 'Odległa załoga dostrzega twoją flarę.', 'es-AR': 'La tripulación lejana ve tu bengala.' },
  'eventText266': { en: 'The distant crew answers your light.', pl: 'Odległa załoga odpowiada na twój sygnał świetlny.', 'es-AR': 'La tripulación lejana responde a tu luz.' },
  'eventText267': { en: 'You let the other boat pass.', pl: 'Pozwalasz drugiej łodzi odpłynąć.', 'es-AR': 'Dejás pasar al otro bote.' },
  'eventText268': { en: 'The plane banks after seeing your flare.', pl: 'Samolot skręca po dostrzeżeniu twojej flary.', 'es-AR': 'El avión gira después de ver tu bengala.' },
  'eventText269': { en: 'The plane answers your light with a wing dip.', pl: 'Samolot odpowiada na światło przechyleniem skrzydeł.', 'es-AR': 'El avión responde a tu luz inclinando un ala.' },
  'eventText270': { en: 'You let the plane pass into the dark.', pl: 'Pozwalasz samolotowi zniknąć w ciemności.', 'es-AR': 'Dejás que el avión se pierda en la oscuridad.' },
  'eventText271': { en: 'Quiet Waters', pl: 'Spokojne wody', 'es-AR': 'Aguas tranquilas' },
  'eventText272': { en: 'The sea stays calm around the boat.', pl: 'Morze wokół łodzi pozostaje spokojne.', 'es-AR': 'El mar permanece tranquilo alrededor del bote.' },
  'eventText273': { en: 'The day passes without incident.', pl: 'Dzień mija bez zdarzeń.', 'es-AR': 'El día pasa sin incidentes.' },
  'eventText274': { en: 'Continue', pl: 'Kontynuuj', 'es-AR': 'Continuá' },
  'eventText275': { en: 'The day passes quietly.', pl: 'Dzień mija spokojnie.', 'es-AR': 'El día pasa en calma.' },
  'eventText276': { en: 'Quiet Night', pl: 'Spokojna noc', 'es-AR': 'Noche tranquila' },
  'eventText277': { en: 'The dark water drifts past without disturbance.', pl: 'Ciemna woda przepływa obok bez zakłóceń.', 'es-AR': 'El agua oscura pasa sin alteraciones.' },
  'eventText278': { en: 'The night passes without incident.', pl: 'Noc mija bez zdarzeń.', 'es-AR': 'La noche pasa sin incidentes.' },
  'eventText279': { en: 'The night passes quietly.', pl: 'Noc mija spokojnie.', 'es-AR': 'La noche pasa en calma.' },
  eventTestItemAnimationLab: { en: 'Item Animation Lab', pl: 'Laboratorium animacji przedmiotów', 'es-AR': 'Laboratorio de animación de objetos' },
  eventTestCheckBackFish: { en: 'Check the Back: Fish', pl: 'Sprawdź tył łodzi: ryba', 'es-AR': 'Revisá atrás: pez' },
  eventTestCheckBackBad: { en: 'Check the Back: Anglerfish', pl: 'Sprawdź tył łodzi: żabnica', 'es-AR': 'Revisá atrás: pez abisal' },
  eventTestMidnightChest: { en: 'Midnight Tour: Chest', pl: 'Nocna wyprawa: skrzynia', 'es-AR': 'Paseo de medianoche: cofre' },
  eventTestMidnightMonster: { en: 'Midnight Tour: Monster', pl: 'Nocna wyprawa: potwór', 'es-AR': 'Paseo de medianoche: monstruo' },
  eventTestDorothy: { en: 'Dorothy', pl: 'Dorothy', 'es-AR': 'Dorothy' },
  eventTestRescue: { en: 'Rescue', pl: 'Ratunek', 'es-AR': 'Rescate' },
  eventTestDeath: { en: 'Death', pl: 'Śmierć', 'es-AR': 'Muerte' },
  eventTestSinking: { en: 'Sinking', pl: 'Zatonięcie', 'es-AR': 'Hundimiento' },
} as const;

export type EventTextId = keyof typeof EVENT_TEXT;
const translate = defineMessages(EVENT_TEXT);
const registeredTextIds = new Map<string, EventTextId>();
const resultTextIds = new Map<string, EventTextId>();

/** Resolve one stable event text path in the active language. */
export function eventMessage(messageId: string, textId: EventTextId): string {
  if (!(textId in EVENT_TEXT)) throw new Error(`Missing event translation: ${messageId}`);
  const registered = registeredTextIds.get(messageId);
  if (registered !== undefined && registered !== textId) {
    throw new Error(`Event translation ID changed text: ${messageId}`);
  }
  registeredTextIds.set(messageId, textId);
  return translate(textId);
}

export function eventTranslationCount(): number {
  return Object.keys(EVENT_TEXT).length;
}

function localizedProperty<T extends object, K extends keyof T>(
  owner: T,
  property: K,
  messageId: string,
  suffix: () => string = () => '',
): void {
  const textId = owner[property];
  if (typeof textId !== 'string') throw new Error(`Invalid event text: ${messageId}`);
  Object.defineProperty(owner, property, {
    enumerable: true,
    configurable: false,
    get: () => eventMessage(messageId, textId as EventTextId) + suffix(),
  });
}

/** Add stable result IDs and live text getters before a definition is frozen. */
export function localizeEventDefinitionText(event: SurvivalEventDefinition): void {
  localizedProperty(event, 'title', `${event.id}.title`);
  localizedProperty(event, 'revealText', `${event.id}.reveal`);
  localizedProperty(event, 'prompt', `${event.id}.prompt`);
  for (const choice of event.choices) {
    const trade = event.id === 'night-trader' && choice.itemId !== undefined ? nightTraderTrade(choice.id) : undefined;
    localizedProperty(choice, 'label', `${event.id}.${choice.id}.label`, trade === undefined ? undefined
      : () => `: ${itemLabel(trade.payment)} → ${itemLabel(trade.reward)}`);
    choice.outcomes.forEach((outcome, index) => {
      const resultId = outcome.resultId ?? `${event.id}.${choice.id}.${index}`;
      if (outcome.resultId === undefined) {
        Object.defineProperty(outcome, 'resultId', {
          enumerable: true,
          configurable: false,
          value: resultId,
        });
      }
      const path = `${event.id}.${choice.id}.${resultId}`;
      resultTextIds.set(path, outcome.message as EventTextId);
      localizedProperty(outcome, 'message', path, outcome.message === 'traderReceived' && trade !== undefined
        ? () => `: ${itemLabel(trade.reward)}.` : undefined);
    });
  }
}

/** Resolve an event result saved with stable catalog IDs. */
export function getEventResultMessage(reference: EventResultPresentation): string {
  const event = eventDefinitionsById.get(reference.eventId);
  const choice = event?.choices.find(({ id }) => id === reference.choiceId);
  const outcome = choice?.outcomes.find(({ resultId }) => resultId === reference.resultId);
  if (outcome === undefined) {
    throw new Error(
      `Unknown event result: ${reference.eventId}/${reference.choiceId}/${reference.resultId}`,
    );
  }
  return outcome.message;
}

/** The journal uses the result identity, but supplies its own narrative text. */
export function getEventResultTextId(reference: EventResultPresentation): EventTextId {
  const path = `${reference.eventId}.${reference.choiceId}.${reference.resultId}`;
  const textId = resultTextIds.get(path);
  if (textId === undefined) throw new Error(`Unknown journal event result: ${path}`);
  return textId;
}

const eventDefinitionsById = new Map<string, SurvivalEventDefinition>();

export function registerEventDefinitionText(event: SurvivalEventDefinition): void {
  eventDefinitionsById.set(event.id, event);
}
