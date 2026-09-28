import './styles/fonts.css';
import './styles/main.css';
import './styles/settings.css';
import { startApplication } from './app/startApplication';
import { initializeLanguage } from './i18n/language';

initializeLanguage();

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

void startApplication(mount);
