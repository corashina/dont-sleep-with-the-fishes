import { Game } from './Game';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
const game = new Game(root);
game.start();
