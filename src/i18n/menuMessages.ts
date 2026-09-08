import { defineMessages } from './messages';

export const menuText = defineMessages({
  guideLine1: { en: 'HOW TO', pl: 'JAK' , 'es-AR': "CÓMO" },
  guideLine2: { en: 'PLAY', pl: 'GRAĆ' , 'es-AR': "JUGAR" },
  pointerLock: {"en":"Mouse look was blocked. Click the button and allow pointer lock to continue.","pl":"Nie można rozglądać się myszą. Kliknij przycisk i zezwól na przechwycenie kursora, aby kontynuować.", 'es-AR': "Se bloqueó la vista con el mouse. Hacé clic en el botón y permití capturar el cursor para continuar." },
  start: {"en":"START","pl":"START", 'es-AR': "JUGAR" },
  guide: {"en":"HOW TO PLAY","pl":"JAK GRAĆ", 'es-AR': "CÓMO JUGAR" },
  close: {"en":"Close how to play","pl":"Zamknij instrukcję", 'es-AR': "Cerrar instrucciones" },
  pages: {"en":"How to play pages","pl":"Strony instrukcji", 'es-AR': "Páginas de instrucciones" },
  previous: {"en":"Previous how to play page","pl":"Poprzednia strona instrukcji", 'es-AR': "Página anterior de instrucciones" },
  next: {"en":"Next how to play page","pl":"Następna strona instrukcji", 'es-AR': "Página siguiente de instrucciones" },
  page: { en: (page: number, total: number) => `PAGE ${page} OF ${total}`, pl: (page: number, total: number) => `STRONA ${page} Z ${total}` , 'es-AR': (page: number, total: number) => `PÁGINA ${page} DE ${total}` },
});
