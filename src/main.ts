import './styles/main.css';
import { launchGame } from './app/launchGame';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

const launch = launchGame(mount);
window.addEventListener('pagehide', () => launch.cancel(), { once: true });
void launch.completion;
