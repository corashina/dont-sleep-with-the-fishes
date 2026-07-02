import type { Scene } from './Scene';
import type { GameState, DayAction } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { Phase } from '../state/phases';

export class DayScene implements Scene {
  constructor(
    private state: GameState,
    private diorama: Diorama,
    private env: { setTimeOfDay: (t: 'day'|'night') => void },
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onPhase: () => void,
  ) {}

  enter(): void {
    this.state.actionsLeftToday = this.state.day === 1 ? 3 : this.state.actionsLeftToday;
    this.env.setTimeOfDay('day');
    this.hud.setDayLabel(`Day ${this.state.day} — ${this.state.actionsLeftToday} actions`);
    this.dialogs.setText('Day breaks. What will you do?');
    this.renderActions();
  }

  private renderActions(): void {
    this.bar.clear();
    const actions: DayAction[] = ['fish', 'eat', 'repair', 'chat'];
    actions.forEach((a) => {
      const check = this.state.canPerformDayAction(a);
      this.bar.button(a, () => this.do(a), { disabled: !check.ok });
    });
    this.diorama.showInventory(this.state.inventory, this.state.food);
    this.hud.render();
    this.hud.setDayLabel(`Day ${this.state.day} — ${this.state.actionsLeftToday} actions`);
  }

  private do(a: DayAction): void {
    const r = this.state.performDayAction(a);
    this.dialogs.setText(r.message);
    this.hud.render();
    this.diorama.showInventory(this.state.inventory, this.state.food);
    if (this.state.actionsLeftToday <= 0) {
      this.state.setPhase(Phase.Night);
      this.onPhase();
    } else {
      this.renderActions();
    }
  }

  update(): void {}
  exit(): void {}
}
