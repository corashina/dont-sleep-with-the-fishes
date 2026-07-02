import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { CREWMATE_LIST } from '../content/crewmates';
import { Phase } from '../state/phases';

export class CrewSelectScene implements Scene {
  constructor(
    private state: GameState,
    private diorama: Diorama,
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onDone: () => void,
  ) {}

  enter(): void {
    this.hud.setDayLabel('Choose a shipmate');
    this.dialogs.setText('One hand to keep you company. Choose wisely.');
    this.bar.clear();
    CREWMATE_LIST.forEach((c) => {
      this.bar.button(`${c.name}\n${c.perkSummary}`, () => this.pick(c.id));
    });
  }

  private pick(id: 'frederik' | 'row'): void {
    this.state.setCrewmate(id);
    this.diorama.setCrewmate(id);
    this.state.setPhase(Phase.Day);
    this.onDone();
  }

  update(): void {}
  exit(): void {}
}
