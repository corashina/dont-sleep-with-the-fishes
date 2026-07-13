import './styles/main.css';
import { Game } from './Game';
import { PropModelLibrary } from './world/PropModelLibrary';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Missing #app mount element');

async function startGame(mount: HTMLElement): Promise<void> {
  let game: Game | null = null;
  let unownedModels: PropModelLibrary | null = null;
  try {
    unownedModels = await PropModelLibrary.load();
    game = new Game(mount, unownedModels);
    unownedModels = null;
    game.start();
  } catch (error) {
    if (game !== null) game.dispose();
    else unownedModels?.dispose();
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
}

void startGame(mount);
