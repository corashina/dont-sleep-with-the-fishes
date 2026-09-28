import { defineMessages } from './messages';

export const touchText = defineMessages({
  interact: { en: 'Interact', pl: 'Użyj', 'es-AR': 'Interactuar' },
  jump: { en: 'Jump', pl: 'Skok', 'es-AR': 'Saltar' },
  sprint: { en: 'Sprint', pl: 'Bieg', 'es-AR': 'Correr' },
  pause: { en: 'Pause', pl: 'Pauza', 'es-AR': 'Pausa' },
  skipIntro: { en: 'Skip intro', pl: 'Pomiń wstęp', 'es-AR': 'Omitir intro' },
  collectGuide: {
    en: 'You have 60 seconds to gather supplies. Move with the left stick. Drag on the right to look. Tap Sprint to run. Tap Jump. Tap Interact to pick up or drop the item at the crosshair. You can carry three weight units.',
    pl: 'Masz 60 sekund na zebranie zapasów. Ruszaj lewym drążkiem. Przesuń palec po prawej stronie, aby się rozejrzeć. Dotknij Bieg, aby biec, Skok, aby skoczyć, i Użyj, aby podnieść lub upuścić przedmiot na celowniku. Możesz unieść trzy jednostki ciężaru.',
    'es-AR': 'Tenés 60 segundos para juntar suministros. Movete con la palanca izquierda. Deslizá a la derecha para mirar. Tocá Correr para correr, Saltar para saltar e Interactuar para recoger o soltar el objeto en la mira. Podés cargar tres unidades de peso.',
  },
  evacuateGuide: {
    en: 'Aim at the lifeboat or its storage area and tap Interact to store your load. Stand on the footprints beside the lifeboat when the timer reaches zero. Only stored supplies come with you.',
    pl: 'Wyceluj w szalupę lub jej miejsce na zapasy i dotknij Użyj, aby odłożyć ładunek. Stój na śladach stóp przy szalupie, gdy licznik osiągnie zero. Zabierzesz tylko odłożone zapasy.',
    'es-AR': 'Apuntá al bote o a su zona de almacenamiento y tocá Interactuar para guardar la carga. Quedate sobre las huellas junto al bote cuando el tiempo llegue a cero. Solo te llevás los suministros guardados.',
  },
  catchGuide: {
    en: 'Select the rod, then tap the water to cast for ⚡1. Tap Reel within six seconds of a bite. Eat caught fish from your supplies. Bait is used automatically. Close the result to cast again.',
    pl: 'Wybierz wędkę i dotknij wody, aby zarzucić żyłkę za ⚡1. Dotknij Zwiń w ciągu sześciu sekund od brania. Zjedz złowioną rybę z zapasów. Przynęta zużywa się automatycznie. Zamknij wynik połowu, aby zarzucić ponownie.',
    'es-AR': 'Elegí la caña y tocá el agua para lanzar por ⚡1. Tocá Recogé dentro de los seis segundos de la picada. Comé los peces que pescaste desde tus suministros. La carnada se usa automáticamente. Cerrá el resultado para volver a lanzar.',
  },
  catchAlt: {
    en: 'The Reel button appears when a fish bites.',
    pl: 'Przycisk Zwiń pojawia się, gdy ryba bierze.',
    'es-AR': 'El botón Recogé aparece cuando pica un pez.',
  },
});
