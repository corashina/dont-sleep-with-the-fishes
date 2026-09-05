import { defineMessages } from './messages';

export const settingsCatalog = {
  simulation: {"en":"SIMULATION","pl":"SYMULACJA"},
  barrels: {"en":"Barrel simulation","pl":"Symulacja beczek"},
  physics: {"en":"PHYSICS VIEW","pl":"WIDOK FIZYKI"},
  collisions: {"en":"Collision meshes","pl":"Siatki kolizji"},
  tools: {"en":"TOOLS","pl":"NARZĘDZIA"},
  time: {"en":"TIME OF DAY","pl":"PORA DNIA"},
  night: {"en":"Night","pl":"Noc"},
  day: {"en":"Day","pl":"Dzień"},
  developer: {"en":"Developer menu","pl":"Menu programisty"},
  closeDeveloper: {"en":"Close developer menu","pl":"Zamknij menu programisty"},
  developerTitle: {"en":"DEVELOPER TOOLS","pl":"NARZĘDZIA PROGRAMISTY"},
  graphicsUpper: {"en":"GRAPHICS","pl":"GRAFIKA"},
  ao: {"en":"AMBIENT OCCLUSION","pl":"OKLUZJA OTOCZENIA"},
  display: {"en":"Display","pl":"Widok"},
  composite: {"en":"COMPOSITE","pl":"OBRAZ KOŃCOWY"},
  debug: {"en":"DEBUG BUFFER","pl":"BUFOR DIAGNOSTYCZNY"},
  off: {"en":"OFF","pl":"WYŁ."},
  on: {"en":"ON","pl":"WŁ."},
  unavailable: {"en":"UNAVAILABLE","pl":"NIEDOSTĘPNE"},
  gameplay: {"en":"GAMEPLAY","pl":"ROZGRYWKA"},
  weather: {"en":"WEATHER","pl":"POGODA"},
  presentation: {"en":"Presentation","pl":"Wygląd"},
  eventTest: {"en":"EVENT TEST","pl":"TEST ZDARZENIA"},
  eventScene: {"en":"Event test scene","pl":"Scena testowa zdarzenia"},
  enterEvent: {"en":"ENTER EVENT","pl":"URUCHOM ZDARZENIE"},
  endings: {"en":"ENDINGS","pl":"ZAKOŃCZENIA"},
  lab: {"en":"LAB","pl":"LABORATORIUM"},
  nightUpper: {"en":"NIGHT","pl":"NOC"},
  dayUpper: {"en":"DAY","pl":"DZIEŃ"},
  normal: {"en":"NORMAL","pl":"ZWYKŁA"},
  event: {"en":"EVENT","pl":"ZDARZENIE"},
  forced: {"en":"FORCED","pl":"WYMUSZONA"},
  performance: {"en":"PERFORMANCE","pl":"WYDAJNOŚĆ"},
  fps: {"en":"Frame rate","pl":"Liczba klatek na sekundę"},
  volume: {"en":"Master volume","pl":"Głośność główna"},
  volumeAria: {"en":"Master audio volume","pl":"Główna głośność dźwięku"},
  camera: {"en":"CAMERA","pl":"KAMERA"},
  fov: {"en":"Field of view","pl":"Pole widzenia"},
  fovAria: {"en":"Vertical field of view","pl":"Pionowe pole widzenia"},
  general: {"en":"General","pl":"Ogólne"},
  autoSave: {"en":"Auto-save","pl":"Zapis automatyczny"},
  autoSaveAria: {"en":"Enable survival auto-save","pl":"Włącz automatyczny zapis przetrwania"},
  continueSave: {"en":"CONTINUE SAVED RUN","pl":"KONTYNUUJ ZAPISANĄ GRĘ"},
  noSave: {"en":"NO SAVE","pl":"BRAK ZAPISU"},
  clouds: {"en":"Volumetric clouds","pl":"Chmury przestrzenne"},
  settings: {"en":"Settings","pl":"Ustawienia"},
  sound: {"en":"Sound","pl":"Dźwięk"},
  graphics: {"en":"Graphics","pl":"Grafika"},
  back: {"en":"BACK","pl":"WRÓĆ"},
  visualQuality: {"en":"VISUAL QUALITY","pl":"JAKOŚĆ OBRAZU"},
  low: {"en":"LOW","pl":"NISKA"},
  medium: {"en":"MEDIUM","pl":"ŚREDNIA"},
  high: {"en":"HIGH","pl":"WYSOKA"},
  ultra: {"en":"ULTRA","pl":"ULTRA"},
  waterQuality: {"en":"WATER QUALITY","pl":"JAKOŚĆ WODY"},
  aa: {"en":"ANTI-ALIASING","pl":"WYGŁADZANIE KRAWĘDZI"},
  shadowQuality: {"en":"SHADOW QUALITY","pl":"JAKOŚĆ CIENI"},
  aoIntensity: {"en":"AO intensity","pl":"Siła okluzji"},
  aoRadius: {"en":"AO radius","pl":"Promień okluzji"},
  calm: {"en":"Calm","pl":"Spokojnie"},
  overcast: {"en":"Overcast","pl":"Zachmurzenie"},
  squall: {"en":"Squall","pl":"Szkwał"},
  rain: {"en":"Rain","pl":"Deszcz"},
  wind: {"en":"Wind","pl":"Wiatr"},
  storm: {"en":"Thunderstorm","pl":"Burza"},
  waves: {"en":"Waves","pl":"Fale"},
  fog: {"en":"Fog","pl":"Mgła"},
} as const;
export const settingsText = defineMessages(settingsCatalog);
export const settingsDynamic = defineMessages({ day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}` } });

export function refreshSettingsText(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-settings-copy]')) {
    const key = element.dataset.settingsCopy as keyof typeof settingsCatalog;
    element.textContent = settingsText(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-settings-aria]')) {
    const key = element.dataset.settingsAria as keyof typeof settingsCatalog;
    element.setAttribute('aria-label', settingsText(key));
  }
}
