import './styles/main.css';
import { Game } from './Game';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

try {
  const game = new Game(mount);
  game.start();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown WebGL initialization error';
  mount.innerHTML = `
    <section class="screen is-visible pause-screen">
      <p class="kicker">WEBGL UNAVAILABLE</p>
      <h1>Unable to launch</h1>
      <p class="lead">This demo needs WebGL 2 in a current desktop browser.</p>
      <p class="fine-print">${message.replace(/[<>&]/g, '')}</p>
    </section>
  `;
}
