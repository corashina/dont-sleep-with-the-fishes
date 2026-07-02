import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';

export class EndingScene implements Scene {
  constructor(
    private state: GameState,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onRestart: () => void,
  ) {}

  enter(): void {
    this.bar.clear();
    this.hud.setDayLabel('The End');
    if (this.state.rescued) {
      this.dialogs.setText(`Rescued on Day ${this.state.day}. A ship hauls you aboard. You live.`);
    } else {
      this.dialogs.setText(`Lost at sea on Day ${this.state.day}. You sleep with the fishes.`);
    }
    this.bar.button('New Run', () => this.onRestart());
  }
  update(): void {}
  exit(): void {}
}
