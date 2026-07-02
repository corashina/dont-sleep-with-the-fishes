import * as THREE from 'three';
import { GameState } from './state/GameState';
import { Phase } from './state/phases';
import { Diorama } from './world/Diorama';
import { HUD } from './ui/HUD';
import { ActionBar } from './ui/ActionBar';
import { Dialogs } from './ui/Dialogs';
import { SceneManager } from './scenes/SceneManager';
import { ScavengeScene } from './scenes/ScavengeScene';
import { CrewSelectScene } from './scenes/CrewSelectScene';
import { DayScene } from './scenes/DayScene';
import { NightScene } from './scenes/NightScene';
import { EndingScene } from './scenes/EndingScene';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private diorama: Diorama;
  private state = new GameState();
  private manager = new SceneManager();
  private hud: HUD;
  private bar: ActionBar;
  private dialogs: Dialogs;
  private clock = new THREE.Clock();
  private overlay: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.appendChild(this.renderer.domElement);

    this.diorama = new Diorama(this.renderer, root.clientWidth / root.clientHeight);

    this.overlay = document.createElement('div');
    root.appendChild(this.overlay);

    this.hud = new HUD(this.overlay, this.state);
    this.dialogs = new Dialogs(this.overlay);
    this.bar = new ActionBar(this.overlay);

    this.bindInput(root);
    this.showTitle();
  }

  private bindInput(root: HTMLElement): void {
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.diorama.onPointerDown(e);
      this.diorama.onDrag(e, true);
    });
    root.addEventListener('pointermove', (e) => this.diorama.onDrag(e, false));
    root.addEventListener('pointerup', (e) => this.diorama.onDrag(e, false));
    window.addEventListener('resize', () => this.onResize(root));
  }

  private onResize(root: HTMLElement): void {
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    this.diorama.getCamera().aspect = root.clientWidth / root.clientHeight;
    this.diorama.getCamera().updateProjectionMatrix();
  }

  private showTitle(): void {
    this.hud.setDayLabel('Sleep with the Fishes');
    this.dialogs.setText('Your ship is sinking. Grab what you can, pick a shipmate, survive.');
    this.bar.clear();
    this.bar.button('New Run', () => this.startNewRun());
  }

  private startNewRun(): void {
    this.state.reset();
    this.state.setPhase(Phase.Scavenge);
    this.gotoPhase();
  }

  private gotoPhase(): void {
    switch (this.state.phase) {
      case Phase.Scavenge:
        this.manager.enter(new ScavengeScene(this.state, this.diorama, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.CrewSelect:
        this.manager.enter(new CrewSelectScene(this.state, this.diorama, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Day:
        this.manager.enter(new DayScene(this.state, this.diorama, this.diorama.env, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Night:
        this.manager.enter(new NightScene(this.state, this.diorama, this.diorama.env, this.hud, this.bar, this.dialogs, () => this.gotoPhase()));
        break;
      case Phase.Ending:
        this.manager.enter(new EndingScene(this.state, this.hud, this.bar, this.dialogs, () => this.startNewRun()));
        break;
    }
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      this.manager.update(dt);
      this.diorama.update(dt);
      this.renderer.render(this.diorama.scene, this.diorama.camera);
    };
    loop();
  }
}
