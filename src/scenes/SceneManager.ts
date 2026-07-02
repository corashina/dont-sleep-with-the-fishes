import type { Scene } from './Scene';

export class SceneManager {
  private active: Scene | null = null;
  enter(scene: Scene): void {
    this.active?.exit();
    this.active = scene;
    scene.enter();
  }
  update(dt: number): void { this.active?.update(dt); }
  get current(): Scene | null { return this.active; }
}
