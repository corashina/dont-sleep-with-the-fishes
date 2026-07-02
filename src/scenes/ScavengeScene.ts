import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { SCAVENGE_POOL } from '../content/items';
import { Phase } from '../state/phases';

export class ScavengeScene implements Scene {
  private time = 45;
  private items: string[] = [];
  private onDone: () => void;

  constructor(
    private state: GameState,
    private diorama: Diorama,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    onDone: () => void,
  ) {
    this.onDone = onDone;
  }

  enter(): void {
    this.time = 45;
    // pick 8 distinct from pool deterministically
    this.items = SCAVENGE_POOL.slice(0, 8);
    this.hud.setDayLabel('Scavenge');
    this.dialogs.setText('The ship is going down! Grab what you can — 5 slots only.');
    this.diorama.showHotspots(this.items, (id) => this.collect(id));
    this.bar.clear();
    this.bar.button('Abandon Ship', () => this.finish());
  }

  private collect(id: string): void {
    const ok = this.state.addItem(id);
    if (ok) {
      this.items = this.items.filter((x) => x !== id);
      this.diorama.showHotspots(this.items, (x) => this.collect(x));
      this.dialogs.setText(`Grabbed ${id}. Slots: ${this.state.inventory.length}/5`);
      if (this.state.inventory.length >= this.state.maxSlots) this.finish();
    } else {
      this.dialogs.setText('No room for that — or already have it.');
    }
  }

  update(dt: number): void {
    this.time -= dt;
    this.hud.setDayLabel(`Scavenge  ${Math.max(0, Math.ceil(this.time))}s`);
    if (this.time <= 0) this.finish();
  }

  private finish(): void {
    if (this.state.phase !== Phase.Scavenge) return;
    this.diorama.clearHotspots();
    this.state.setPhase(Phase.CrewSelect);
    this.onDone();
  }

  exit(): void { this.diorama.clearHotspots(); }
}
