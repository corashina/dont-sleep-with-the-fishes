import type { ItemId, ItemInstance } from '../game/ItemState';
import { SURVIVAL_EVENTS, drawWeightedEvent, eligibleEvents } from './events';
import { createSurvivalInventory } from './inventory';
import { mulberry32 } from './random';
import { SURVIVAL_BALANCE } from './survivalBalance';
import type {
  ActionOutcome,
  DayActionId,
  PresentationCue,
  RandomSource,
  ResourceDelta,
  SurvivalEventDefinition,
  SurvivalInventory,
  SurvivalSnapshot,
  SurvivalState,
  WeatherId,
} from './survivalTypes';

export interface SurvivalSessionOptions {
  seed: number;
  random?: RandomSource;
  weather?: WeatherId;
  initial?: Partial<Pick<SurvivalSnapshot, 'health' | 'hunger' | 'energy' | 'hull' | 'day' | 'rescueProgress'>>;
  initialEventId?: string;
}

export type DayActionOption = 'useBait' | 'repairMaterial' | 'ductTape';

interface Rejection {
  code: string;
  message: string;
}

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private day: number;
  private health: number;
  private hunger: number;
  private energy: number;
  private hull: number;
  private food = 0;
  private bait = 0;
  private repairMaterial = 0;
  private rescueProgress: number;
  private weather: WeatherId;
  private restedToday = false;
  private actedToday = false;
  private dayEventOccurred = false;
  private readonly inventory: SurvivalInventory;
  private readonly savedItems: readonly ItemInstance[];
  private pendingEventId: string | null;
  private pendingEvent: SurvivalEventDefinition | null = null;
  private lastEventId: string | null = null;
  private readonly lastSeenDay = new Map<string, number>();
  private lastOutcome: ActionOutcome | null = null;
  private readonly seed: number;
  private readonly random: RandomSource;

  constructor(savedItems: readonly ItemInstance[], options: SurvivalSessionOptions) {
    this.seed = options.seed;
    this.random = options.random ?? mulberry32(options.seed);
    this.weather = options.weather ?? 'calm';
    this.day = options.initial?.day ?? 1;
    this.health = options.initial?.health ?? SURVIVAL_BALANCE.start.health;
    this.hunger = options.initial?.hunger ?? SURVIVAL_BALANCE.start.hunger;
    this.energy = options.initial?.energy ?? SURVIVAL_BALANCE.start.energy;
    this.hull = options.initial?.hull ?? SURVIVAL_BALANCE.start.hull;
    this.rescueProgress = options.initial?.rescueProgress ?? 0;
    this.pendingEventId = null;
    this.savedItems = Object.freeze(savedItems.map((item) => Object.freeze({ ...item })));
    this.inventory = createSurvivalInventory(this.savedItems);

    if (options.initialEventId !== undefined) {
      const initialEvent = SURVIVAL_EVENTS.find((event) => event.id === options.initialEventId);
      if (initialEvent === undefined) throw new Error(`Unknown survival event: ${options.initialEventId}`);
      this.openEvent(initialEvent);
      this.dayEventOccurred = initialEvent.phase === 'day';
    }

    this.bait = this.inventory.baitTin.charges ?? 0;
    this.food = this.inventory.cannedFood.charges ?? 0;
    this.inventory.baitTin.charges = 0;
    this.inventory.cannedFood.charges = 0;

    this.clampMeters();
    this.resolveTerminal();
  }

  snapshot(): SurvivalSnapshot {
    const inventory = Object.fromEntries(
      Object.entries(this.inventory).map(([id, entry]) => [id, { ...entry }]),
    ) as SurvivalInventory;
    const lastOutcome = this.lastOutcome === null
      ? null
      : { ...this.lastOutcome, deltas: { ...this.lastOutcome.deltas } };

    return {
      state: this.state,
      day: this.day,
      health: this.health,
      hunger: this.hunger,
      energy: this.energy,
      hull: this.hull,
      food: this.food,
      bait: this.bait,
      repairMaterial: this.repairMaterial,
      rescueProgress: this.rescueProgress,
      weather: this.weather,
      restedToday: this.restedToday,
      actedToday: this.actedToday,
      inventory,
      savedItems: this.savedItems,
      pendingEventId: this.pendingEventId,
      lastOutcome,
      seed: this.seed,
    };
  }

  availableReason(action: DayActionId, option?: DayActionOption): string | null {
    return this.unavailable(action, option)?.message ?? null;
  }

  perform(action: DayActionId, option?: DayActionOption): ActionOutcome {
    const unavailable = this.unavailable(action, option);
    if (unavailable !== null) return this.reject(unavailable.code, unavailable.message);

    switch (action) {
      case 'fish': return this.fish(option === 'useBait');
      case 'dive': return this.dive();
      case 'eat': return this.eat();
      case 'repair': return this.repair(option);
      case 'treat': return this.treat();
      case 'rest': return this.rest();
      case 'endDay': return this.endDay();
    }
  }

  requestDayEvent(): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'A day event cannot begin right now.');
    if (!this.actedToday) return this.reject('act-first', 'Take a survival action before looking beyond the boat.');
    if (this.dayEventOccurred) return this.reject('day-event-used', 'Today\'s event has already passed.');

    const event = this.drawEvent('day');
    this.dayEventOccurred = true;
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, event.cue);
  }

  endDay(): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'The day cannot end while an event is unresolved.');

    const event = this.drawEvent('night');
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, 'nightfall');
  }

  resolveEvent(itemId: ItemId | null): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if ((this.state !== 'dayEvent' && this.state !== 'nightEvent') || this.pendingEvent === null) {
      return this.reject('no-event', 'There is no unresolved event.');
    }

    const event = this.pendingEvent;
    if (itemId !== null && !this.canUseEventItem(itemId)) {
      return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
    }
    const phase = event.phase;
    const matching = itemId === null ? undefined : event.responses.find((candidate) => candidate.itemId === itemId);
    const usable = matching !== undefined && this.canUseEventItem(matching.itemId);
    const response = itemId === null ? event.endure : usable ? matching! : event.unsuitable;

    if (usable && matching!.consume) this.consumeCharge(matching!.itemId);
    this.lastEventId = event.id;
    this.lastSeenDay.set(event.id, this.day);
    this.pendingEvent = null;
    this.pendingEventId = null;

    if (usable && matching!.rescue === true) this.state = 'rescued';
    const outcome = this.commit('event-resolved', response.message, { ...response.deltas }, response.cue);

    if (!this.isTerminal()) {
      if (phase === 'day') this.state = 'day';
      else this.state = 'nightEvent';
    }
    return outcome;
  }

  beginDawn(): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.pendingEvent !== null) return this.reject('event-pending', 'Resolve the pending event before dawn.');

    this.day += 1;
    this.restedToday = false;
    this.actedToday = false;
    this.dayEventOccurred = false;
    this.pendingEvent = null;
    this.pendingEventId = null;
    this.state = 'day';

    const weatherRoll = this.random.next();
    this.weather = weatherRoll < 0.60 ? 'calm' : weatherRoll < 0.85 ? 'overcast' : 'squall';

    const hungerAfterDawn = Math.min(
      SURVIVAL_BALANCE.thresholds.maximum,
      this.hunger + SURVIVAL_BALANCE.dawn.hungerIncrease,
    );
    const morningEnergy = hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.starving
      ? SURVIVAL_BALANCE.dawn.starvingEnergy
      : hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.hungry
        ? SURVIVAL_BALANCE.dawn.hungryEnergy
        : SURVIVAL_BALANCE.dawn.normalEnergy;
    const deltas: ResourceDelta = {
      hunger: SURVIVAL_BALANCE.dawn.hungerIncrease,
      energy: morningEnergy - this.energy,
    };
    if (hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.maximum) {
      deltas.health = -SURVIVAL_BALANCE.dawn.starvationDamage;
    }

    const dawn = this.commit('dawn', 'Another dawn breaks over the lifeboat.', deltas, 'dawn');
    if (this.isTerminal() || this.day < SURVIVAL_BALANCE.rescue.firstDay) return dawn;

    const baseChance = Math.min(
      SURVIVAL_BALANCE.rescue.chanceCap,
      SURVIVAL_BALANCE.rescue.initialChance
        + (this.day - SURVIVAL_BALANCE.rescue.firstDay) * SURVIVAL_BALANCE.rescue.dailyIncrease,
    );
    const progressChance = Math.min(SURVIVAL_BALANCE.rescue.progressCap, this.rescueProgress) / 100;
    if (this.random.next() >= Math.min(0.85, baseChance + progressChance)) return dawn;

    this.state = 'rescued';
    return this.commit('rescued', 'A rescue vessel finds the lifeboat at dawn.', {}, 'rescue');
  }

  private unavailable(action: DayActionId, option?: DayActionOption): Rejection | null {
    if (this.isTerminal()) return { code: 'terminal', message: 'The survival journey has already ended.' };
    if (this.state !== 'day') return { code: 'not-daytime', message: 'That action is only available during the day.' };

    switch (action) {
      case 'fish':
        if (!this.inventory.fishingRod.owned) {
          return { code: 'no-fishing-rod', message: 'Fishing requires a recovered fishing rod.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.fishEnergy) {
          return { code: 'not-enough-energy', message: 'Fishing requires two energy.' };
        }
        if (option === 'useBait' && this.bait < 1) {
          return { code: 'no-bait', message: 'No bait remains.' };
        }
        return null;
      case 'dive':
        if (!this.inventory.scubaSet.owned) {
          return { code: 'no-scuba-set', message: 'Diving requires a recovered scuba set.' };
        }
        if (this.weather === 'squall') {
          return { code: 'weather-blocked', message: 'Diving is too dangerous during a squall.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.diveEnergy) {
          return { code: 'not-enough-energy', message: 'Diving requires three energy.' };
        }
        return null;
      case 'eat':
        if (this.food < 1) return { code: 'no-food', message: 'No food remains.' };
        if (this.hunger <= 0) return { code: 'not-hungry', message: 'You are not hungry.' };
        return null;
      case 'repair':
        if (this.hull >= SURVIVAL_BALANCE.thresholds.maximum) {
          return { code: 'hull-full', message: 'The hull needs no repair.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.repairEnergy) {
          return { code: 'not-enough-energy', message: 'Repairing requires two energy.' };
        }
        if (option === 'ductTape') {
          if (!this.hasCharge('ductTape')) return { code: 'no-duct-tape', message: 'No duct tape remains.' };
          return null;
        }
        if (this.repairMaterial < 1) {
          return { code: 'no-repair-material', message: 'No repair material remains.' };
        }
        return null;
      case 'treat':
        if (this.health >= SURVIVAL_BALANCE.thresholds.maximum) {
          return { code: 'health-full', message: 'No treatment is needed.' };
        }
        if (!this.hasCharge('medicalKit')) {
          return { code: 'no-medical-kit', message: 'No medical-kit charges remain.' };
        }
        return null;
      case 'rest':
        if (this.restedToday) return { code: 'already-rested', message: 'You have already rested today.' };
        if (this.energy >= SURVIVAL_BALANCE.dawn.normalEnergy) {
          return { code: 'energy-full', message: 'Your energy is already full.' };
        }
        if (!this.hasCharge('waterJug')) return { code: 'no-water', message: 'No water remains.' };
        return null;
      case 'endDay':
        return null;
    }
  }

  private fish(useBait: boolean): ActionOutcome {
    const successChance = useBait
      ? SURVIVAL_BALANCE.fishing.rodBaitSuccess
      : SURVIVAL_BALANCE.fishing.rodSuccess;
    const caught = this.random.next() < successChance;
    let food = caught ? 1 : 0;

    if (caught) {
      const doubleChance = useBait
        ? SURVIVAL_BALANCE.fishing.rodBaitDouble
        : SURVIVAL_BALANCE.fishing.rodDouble;
      if (this.random.next() < doubleChance) food += 1;
    }

    const deltas: ResourceDelta = { energy: -SURVIVAL_BALANCE.actions.fishEnergy, food };
    if (useBait) deltas.bait = -1;
    this.actedToday = true;
    return this.commit(
      caught ? 'fish-caught' : 'fish-missed',
      caught ? `You caught ${food === 2 ? 'two fish' : 'a fish'}.` : 'The line came back empty.',
      deltas,
      'fish',
    );
  }

  private dive(): ActionOutcome {
    const hasFlashlight = this.inventory.flashlight.owned;
    const weatherSuccessDelta = this.weather === 'overcast' ? SURVIVAL_BALANCE.diving.overcastSuccessDelta : 0;
    const weatherInjuryDelta = this.weather === 'overcast' ? SURVIVAL_BALANCE.diving.overcastInjuryDelta : 0;
    const successChance = (hasFlashlight ? SURVIVAL_BALANCE.diving.flashlightSuccess : SURVIVAL_BALANCE.diving.success)
      + weatherSuccessDelta;
    const injuryChance = (hasFlashlight ? SURVIVAL_BALANCE.diving.flashlightInjury : SURVIVAL_BALANCE.diving.injury)
      + weatherInjuryDelta;
    const recovered = this.random.next() < successChance;
    const injured = this.random.next() < injuryChance;
    const deltas: ResourceDelta = { energy: -SURVIVAL_BALANCE.actions.diveEnergy };
    if (injured) deltas.health = -SURVIVAL_BALANCE.diving.injuryDamage;

    if (recovered) {
      const rewardRoll = this.random.next();
      if (rewardRoll < 0.25) deltas.food = 1;
      else if (rewardRoll < 0.5) deltas.bait = 1;
      else if (rewardRoll < 0.75) deltas.repairMaterial = 1;
      else deltas.rescueProgress = 10;
    }

    this.actedToday = true;
    return this.commit(
      recovered ? 'dive-recovered' : 'dive-empty',
      recovered ? 'You surfaced with useful salvage.' : 'You found nothing beneath the boat.',
      deltas,
      'dive',
    );
  }

  private eat(): ActionOutcome {
    return this.commit(
      'ate',
      'The food takes the edge off your hunger.',
      { hunger: SURVIVAL_BALANCE.actions.foodHunger, food: -1 },
      'none',
    );
  }

  private repair(option?: DayActionOption): ActionOutcome {
    this.actedToday = true;
    if (option === 'ductTape') {
      this.consumeCharge('ductTape');
      return this.commit(
        'repaired-with-duct-tape',
        'The emergency patch holds for now.',
        { energy: -SURVIVAL_BALANCE.actions.repairEnergy, hull: SURVIVAL_BALANCE.actions.tapeHull },
        'repair',
      );
    }

    return this.commit(
      'repaired',
      'You reinforce the damaged hull.',
      {
        energy: -SURVIVAL_BALANCE.actions.repairEnergy,
        hull: SURVIVAL_BALANCE.actions.repairHull,
        repairMaterial: -1,
      },
      'repair',
    );
  }

  private treat(): ActionOutcome {
    this.consumeCharge('medicalKit');
    return this.commit(
      'treated',
      'You clean and dress your wounds.',
      { health: SURVIVAL_BALANCE.actions.treatmentHealth },
      'treat',
    );
  }

  private rest(): ActionOutcome {
    this.consumeCharge('waterJug');
    this.restedToday = true;
    const restoredEnergy = Math.min(
      SURVIVAL_BALANCE.actions.restEnergy,
      SURVIVAL_BALANCE.dawn.normalEnergy - this.energy,
    );
    return this.commit('rested', 'Water and a brief rest restore your strength.', { energy: restoredEnergy }, 'rest');
  }

  private drawEvent(phase: 'day' | 'night'): SurvivalEventDefinition {
    const pool = eligibleEvents(SURVIVAL_EVENTS, {
      phase,
      day: this.day,
      weather: this.weather,
      lastEventId: this.lastEventId,
      lastSeenDay: this.lastSeenDay,
    });
    return drawWeightedEvent(pool, this.random, phase);
  }

  private openEvent(event: SurvivalEventDefinition): void {
    this.pendingEvent = event;
    this.pendingEventId = event.id;
    this.state = event.phase === 'day' ? 'dayEvent' : 'nightEvent';
  }

  private canUseEventItem(id: ItemId): boolean {
    const entry = this.inventory[id];
    return entry.owned && (entry.durable || (entry.charges !== null && entry.charges > 0));
  }

  private reject(code: string, message: string): ActionOutcome {
    return { accepted: false, code, message, deltas: {}, cue: 'none' };
  }

  private commit(code: string, message: string, deltas: ResourceDelta, cue: PresentationCue): ActionOutcome {
    const before = this.resourceValues();
    this.applyDeltas(deltas);
    this.resolveTerminal();
    const after = this.resourceValues();
    const applied = Object.fromEntries(Object.keys(deltas).map((key) => {
      const resource = key as keyof ResourceDelta;
      return [resource, after[resource] - before[resource]];
    })) as ResourceDelta;
    const terminalCue = this.state === 'dead' ? 'death' : this.state === 'sunk' ? 'sinking' : this.state === 'rescued' ? 'rescue' : cue;
    const outcome: ActionOutcome = { accepted: true, code, message, deltas: applied, cue: terminalCue };
    this.lastOutcome = outcome;
    return { ...outcome, deltas: { ...outcome.deltas } };
  }

  private resourceValues(): Required<ResourceDelta> {
    return {
      health: this.health, hunger: this.hunger, energy: this.energy, hull: this.hull,
      food: this.food, bait: this.bait, repairMaterial: this.repairMaterial,
      rescueProgress: this.rescueProgress,
    };
  }

  private applyDeltas(deltas: ResourceDelta): void {
    this.health += deltas.health ?? 0;
    this.hunger += deltas.hunger ?? 0;
    this.energy += deltas.energy ?? 0;
    this.hull += deltas.hull ?? 0;
    this.food += deltas.food ?? 0;
    this.bait += deltas.bait ?? 0;
    this.repairMaterial += deltas.repairMaterial ?? 0;
    this.rescueProgress += deltas.rescueProgress ?? 0;
    this.clampMeters();
  }

  private consumeCharge(id: ItemId): boolean {
    const entry = this.inventory[id];
    if (!entry.owned || entry.charges === null || entry.charges <= 0) return false;
    entry.charges -= 1;
    return true;
  }

  private hasCharge(id: ItemId): boolean {
    const entry = this.inventory[id];
    return entry.owned && entry.charges !== null && entry.charges > 0;
  }

  private resolveTerminal(): void {
    if (this.isTerminal()) return;
    if (this.health <= 0) this.state = 'dead';
    else if (this.hull <= 0) this.state = 'sunk';
  }

  private isTerminal(): boolean {
    return this.state === 'rescued' || this.state === 'dead' || this.state === 'sunk';
  }

  private clampMeters(): void {
    this.health = Math.min(100, Math.max(0, this.health));
    this.hunger = Math.min(100, Math.max(0, this.hunger));
    this.energy = Math.min(100, Math.max(0, this.energy));
    this.hull = Math.min(100, Math.max(0, this.hull));
    this.food = Math.max(0, this.food);
    this.bait = Math.max(0, this.bait);
    this.repairMaterial = Math.max(0, this.repairMaterial);
    this.rescueProgress = Math.max(0, this.rescueProgress);
  }
}
