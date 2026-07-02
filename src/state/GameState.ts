import { Phase, canTransition } from './phases';
import { EventBus } from './EventBus';
import type { ResourceKey } from './EventBus';
import { CREWMATES } from '../content/crewmates';
import type { CrewmateId } from '../content/crewmates';

export const MAX_SLOTS = 5;
export const STARTING_RESOURCES = { hunger: 100, hull: 100, health: 100, morale: 70, energy: 100 };
export const DAILY_HUNGER_TICK = 25;
export const BASE_REPAIR = 10;
export const FISH_FOOD_YIELD = 1;
export const EAT_HUNGER_RESTORE = 25;
export const FIRST_AID_HEAL = 70;
export const HOPE_GUARANTEE_DAY = 5;

export class GameState {
  readonly bus = new EventBus();
  phase: Phase = Phase.Intro;
  day = 1;
  resources = { ...STARTING_RESOURCES };
  inventory: string[] = [];
  food = 0;
  crewmate: CrewmateId | null = null;
  maxSlots = MAX_SLOTS;
  actionsLeftToday = 3;
  hopeAppeared = false;
  rescued = false;

  setPhase(p: Phase): void {
    if (!canTransition(this.phase, p)) {
      throw new Error(`illegal transition ${this.phase} -> ${p}`);
    }
    this.phase = p;
    this.bus.emit({ type: 'phaseChange', phase: p });
  }

  addItem(id: string): boolean {
    if (id === 'food') return false;
    if (this.inventory.includes(id)) return false;
    if (this.inventory.length >= this.maxSlots) return false;
    this.inventory.push(id);
    this.bus.emit({ type: 'inventoryChange' });
    return true;
  }

  hasItem(id: string): boolean {
    return id === 'food' ? this.food > 0 : this.inventory.includes(id);
  }

  removeItem(id: string): void {
    const i = this.inventory.indexOf(id);
    if (i >= 0) {
      this.inventory.splice(i, 1);
      this.bus.emit({ type: 'inventoryChange' });
    }
  }

  addFood(n: number): void {
    this.food += n;
    this.bus.emit({ type: 'inventoryChange' });
  }

  consumeFood(): boolean {
    if (this.food <= 0) return false;
    this.food -= 1;
    this.bus.emit({ type: 'inventoryChange' });
    return true;
  }

  setCrewmate(id: CrewmateId): void {
    this.crewmate = id;
  }

  adjustResource(key: ResourceKey, delta: number): void {
    this.resources[key] = Math.max(0, Math.min(100, this.resources[key] + delta));
    this.bus.emit({ type: 'resourceChange', resource: key });
  }

  isDead(): boolean {
    return this.resources.hunger <= 0 || this.resources.hull <= 0 || this.resources.health <= 0;
  }

  canPerformDayAction(a: DayAction): { ok: boolean; reason?: string } {
    if (this.actionsLeftToday <= 0) return { ok: false, reason: 'No actions left today.' };
    switch (a) {
      case 'fish':
        if (!this.hasItem('fishingRod')) return { ok: false, reason: 'Need a fishing rod.' };
        if (!this.hasItem('bait')) return { ok: false, reason: 'Need bait.' };
        return { ok: true };
      case 'eat':
        if (!this.hasItem('food')) return { ok: false, reason: 'No food to eat.' };
        return { ok: true };
      case 'repair':
      case 'chat':
        return { ok: true };
    }
  }

  performDayAction(a: DayAction): { ok: boolean; reason?: string; message: string } {
    const check = this.canPerformDayAction(a);
    if (!check.ok) return { ok: false, reason: check.reason, message: check.reason ?? 'Cannot.' };

    switch (a) {
      case 'fish': {
        this.removeItem('bait');
        this.addFood(FISH_FOOD_YIELD);
        if (this.crewmate && CREWMATES[this.crewmate].guaranteesBait) this.addItem('bait');
        this.actionsLeftToday--;
        return { ok: true, message: 'You reel in a fish. +1 Food.' };
      }
      case 'eat': {
        this.consumeFood();
        this.adjustResource('hunger', EAT_HUNGER_RESTORE);
        this.actionsLeftToday--;
        return { ok: true, message: 'You eat. Hunger restored.' };
      }
      case 'repair': {
        const bonus = this.crewmate ? CREWMATES[this.crewmate].repairBonus : 0;
        this.adjustResource('hull', BASE_REPAIR + bonus);
        this.actionsLeftToday--;
        return { ok: true, message: 'You patch the hull.' };
      }
      case 'chat': {
        this.adjustResource('morale', 12);
        this.actionsLeftToday--;
        return { ok: true, message: 'You share a quiet word. Morale rises.' };
      }
    }
  }

  startNewDay(): void {
    this.day += 1;
    this.actionsLeftToday = 3;
    this.adjustResource('hunger', -DAILY_HUNGER_TICK);
  }

  reset(): void {
    this.phase = Phase.Intro;
    this.day = 1;
    this.resources = { ...STARTING_RESOURCES };
    this.inventory = [];
    this.food = 0;
    this.crewmate = null;
    this.actionsLeftToday = 3;
    this.hopeAppeared = false;
    this.rescued = false;
    this.bus.emit({ type: 'inventoryChange' });
  }
}

export type DayAction = 'fish' | 'eat' | 'repair' | 'chat';
