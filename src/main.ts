import './styles/fonts.css';
import './styles/main.css';
import './styles/settings.css';
import { launchGame } from './app/launchGame';
import { initializeLanguage } from './i18n/language';

initializeLanguage();

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

const launch = launchGame(mount);
window.addEventListener('pagehide', () => launch.cancel(), { once: true });
void launch.completion;
