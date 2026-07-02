import type { Scene } from './Scene';
import type { GameState } from '../state/GameState';
import type { Diorama } from '../world/Diorama';
import type { HUD } from '../ui/HUD';
import type { ActionBar } from '../ui/ActionBar';
import type { Dialogs } from '../ui/Dialogs';
import { Phase } from '../state/phases';
import { Rng } from '../utils/rng';
import { pickNightEvent, resolveNight, NIGHT_EVENT_BY_ID } from '../content/nightEvents';
import { ITEMS } from '../content/items';

export class NightScene implements Scene {
  private rng = new Rng((Math.random() * 1e9) | 0);
  private currentEventId = '';
  constructor(
    private state: GameState,
    _diorama: Diorama,
    private env: { setTimeOfDay: (t: 'day'|'night') => void },
    private hud: HUD,
    private bar: ActionBar,
    private dialogs: Dialogs,
    private onPhase: () => void,
  ) {}

  enter(): void {
    this.env.setTimeOfDay('night');
    this.currentEventId = pickNightEvent(this.rng, this.state.day, this.state.hopeAppeared);
    if (this.currentEventId === 'hope') this.state.hopeAppeared = true;
    const def = NIGHT_EVENT_BY_ID[this.currentEventId];
    this.hud.setDayLabel(`Night ${this.state.day}`);
    this.dialogs.setText(`${def.name}: ${def.description}`);
    this.bar.clear();
    this.bar.itemButtons(
      this.state.inventory,
      Object.fromEntries(this.state.inventory.map((id) => [id, ITEMS[id]?.name ?? id])),
      (itemId) => this.resolve(itemId),
    );
  }

  private resolve(itemId: string): void {
    const result = resolveNight(this.state, this.currentEventId, itemId);
    this.dialogs.setText(result.message);
    this.hud.render();
    this.bar.clear();
    if (this.state.rescued) {
      this.state.setPhase(Phase.Ending);
      this.onPhase();
      return;
    }
    if (this.state.isDead()) {
      this.state.setPhase(Phase.Ending);
      this.onPhase();
      return;
    }
    this.bar.button('Sleep till morning', () => {
      this.state.startNewDay();
      if (this.state.isDead()) {
        this.state.setPhase(Phase.Ending);
      } else {
        this.state.setPhase(Phase.Day);
      }
      this.onPhase();
    });
  }

  update(): void {}
  exit(): void {}
}
