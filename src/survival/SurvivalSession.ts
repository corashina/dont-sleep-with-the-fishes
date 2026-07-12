import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import { CANONICAL_EVENTS, eventDamageMultiplier } from '../canonical/events';
import { runtimeItemDefinition } from '../canonical/items';
import { resolveFishing } from './fishing';
import { applyInventoryMutation, createSurvivalInventory, usableInstances } from './inventory';
import { drawWeightedEvent, eligibleEvents, resolveEventOutcome } from './outcomeResolver';
import { mulberry32 } from './random';
import { SURVIVAL_BALANCE } from './survivalBalance';
import { ITEM_USE_ENERGY_COST } from './survivalTypes';
import type {
  ActionOutcome,
  CanonicalEventDefinition,
  ChoiceEventDefinition,
  DayActionId,
  EventChoiceDefinition,
  EventHistory,
  EventInventoryMutation,
  EventRoute,
  InventoryMutation,
  PresentationCue,
  RandomSource,
  ResolvedEventOutcome,
  ResourceDelta,
  SurvivalInventory,
  SurvivalSnapshot,
  SurvivalState,
  WeatherId,
} from './survivalTypes';

export interface SurvivalSessionOptions {
  seed: number;
  random?: RandomSource;
  weather?: WeatherId;
  initial?: Partial<Pick<
    SurvivalSnapshot,
    'health' | 'hunger' | 'energy' | 'hull' | 'day' | 'rescueProgress' | 'danger' | 'route'
  >>;
  initialEventId?: string;
}

export type DayActionOption = 'useBait' | 'repairMaterial' | 'ductTape';

interface Rejection {
  code: string;
  message: string;
}

type EventTarget =
  | { kind: 'item'; itemId: ItemId; instanceId: InventoryMutation['instanceId'] }
  | { kind: 'food' };

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private day: number;
  private health: number;
  private hunger: number;
  private energy: number;
  private hull: number;
  private food = 0;
  private bait = 0;
  private recoveredFood = 0;
  private recoveredBait = 0;
  private repairMaterial = 0;
  private rescueProgress: number;
  private danger: number;
  private route: EventRoute | null;
  private weather: WeatherId;
  private restedToday = false;
  private actedToday = false;
  private dayEventOccurred = false;
  private readonly inventory: SurvivalInventory;
  private readonly savedItems: readonly ItemInstance[];
  private pendingEventId: string | null;
  private pendingEvent: CanonicalEventDefinition | null = null;
  private pendingEventTarget: EventTarget | null = null;
  private pendingMorningEnergy: number | null = null;
  private readonly eventHistory = new Map<string, EventHistory>();
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
    this.danger = options.initial?.danger ?? 0;
    this.route = options.initial?.route ?? null;
    this.pendingEventId = null;
    this.savedItems = Object.freeze(savedItems.map((item) => Object.freeze({ ...item })));
    this.inventory = createSurvivalInventory(this.savedItems);

    this.recoveredBait = this.inventory.baitTin.charges ?? 0;
    this.recoveredFood = this.inventory.cannedFood.charges ?? 0;
    this.bait = this.recoveredBait;
    this.food = this.recoveredFood;
    applyInventoryMutation(this.inventory, {
      kind: 'consume', itemId: 'baitTin', quantity: this.recoveredBait,
    });
    applyInventoryMutation(this.inventory, {
      kind: 'consume', itemId: 'cannedFood', quantity: this.recoveredFood,
    });

    if (options.initialEventId !== undefined) {
      const initialEvent = CANONICAL_EVENTS.find((event) => event.id === options.initialEventId);
      if (initialEvent === undefined || initialEvent.selectable === false || initialEvent.automatic) {
        throw new Error(`Unknown or non-selectable survival event: ${options.initialEventId}`);
      }
      this.openEvent(initialEvent);
      this.dayEventOccurred = initialEvent.phase === 'day';
    }

    this.clampMeters();
    this.resolveTerminal();
  }

  snapshot(): SurvivalSnapshot {
    const inventory = Object.freeze(Object.fromEntries(
      Object.entries(this.inventory).map(([id, entry]) => [id, Object.freeze({
        ...entry,
        instances: Object.freeze(entry.instances.map((instance) => Object.freeze({ ...instance }))),
      })]),
    )) as SurvivalInventory;
    const lastOutcome = this.lastOutcome === null
      ? null
      : { ...this.lastOutcome, deltas: { ...this.lastOutcome.deltas } };
    const pendingChoices = Object.freeze(this.availablePendingChoices().map((choice) => Object.freeze({
      id: choice.id,
      label: choice.label,
      ...(choice.itemId === undefined ? {} : { itemId: choice.itemId }),
    })));
    const eventHistory = Object.freeze(Object.fromEntries(
      [...this.eventHistory].map(([id, history]) => [id, Object.freeze({ ...history })]),
    ));

    return {
      state: this.state,
      day: this.day,
      health: this.health,
      hunger: this.hunger,
      energy: this.energy,
      hull: this.hull,
      food: this.food,
      bait: this.bait,
      recoveredFood: this.recoveredFood,
      recoveredBait: this.recoveredBait,
      repairMaterial: this.repairMaterial,
      rescueProgress: this.rescueProgress,
      danger: this.danger,
      route: this.route,
      weather: this.weather,
      restedToday: this.restedToday,
      actedToday: this.actedToday,
      inventory,
      savedItems: this.savedItems,
      pendingEventId: this.pendingEventId,
      pendingChoices,
      eventHistory,
      lastOutcome,
      seed: this.seed,
    };
  }

  availableReason(action: DayActionId, option?: DayActionOption): string | null {
    return this.unavailable(action, option)?.message ?? null;
  }

  availableItemReason(itemId: ItemId, targetInstanceId?: ItemInstanceId): string | null {
    return this.unavailableItem(itemId, targetInstanceId)?.message ?? null;
  }

  useItem(itemId: ItemId, targetInstanceId?: ItemInstanceId): ActionOutcome {
    const unavailable = this.unavailableItem(itemId, targetInstanceId);
    if (unavailable !== null) return this.reject(unavailable.code, unavailable.message);

    switch (itemId) {
      case 'energyBar':
        this.consumeCharge(itemId);
        return this.commit(
          'energy-bar-used',
          'The ration restores your energy.',
          { energy: SURVIVAL_BALANCE.dawn.normalEnergy - this.energy },
          'rest',
        );
      case 'ductTape': {
        const target = this.findInventoryInstance(targetInstanceId!);
        this.consumeCharge(itemId);
        applyInventoryMutation(this.inventory, {
          kind: 'repair',
          itemId: target!.itemId,
          instanceId: targetInstanceId,
          quantity: 1,
        });
        return this.commit(
          'item-repaired',
          `The duct tape repairs the ${runtimeItemDefinition(target!.itemId).label.toLowerCase()}.`,
          {},
          'repair',
        );
      }
      case 'medicalKit': return this.treat();
      case 'repairKit': return this.repairWithKit();
      case 'fishingRod': return this.fish(false);
      case 'scubaSet': return this.dive();
      default:
        return this.reject('item-not-usable', 'That item has no direct use.');
    }
  }

  perform(action: DayActionId, option?: DayActionOption): ActionOutcome {
    const unavailable = this.unavailable(action, option);
    if (unavailable !== null) return this.reject(unavailable.code, unavailable.message);

    switch (action) {
      case 'fish': return option === 'useBait' ? this.fish(true) : this.useItem('fishingRod');
      case 'dive': return this.useItem('scubaSet');
      case 'eat': return this.eat();
      case 'repair': return option === undefined ? this.useItem('repairKit') : this.repair(option);
      case 'treat': return this.useItem('medicalKit');
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
    if (event === undefined) {
      return this.commit('no-event', 'The day passes without incident.', {}, 'none');
    }
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, event.cue);
  }

  endDay(): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'The day cannot end while an event is unresolved.');

    const brokenBoat = CANONICAL_EVENTS.find((event) => event.id === 'broken-boat');
    if (
      brokenBoat?.automatic === true
      && this.hull <= 10
      && this.random.next() < SurvivalSession.brokenBoatChance(this.hull)
    ) {
      this.recordEvent(brokenBoat.id);
      return this.applyResolvedEvent(brokenBoat, resolveEventOutcome(brokenBoat.automaticOutcome, this.random));
    }

    const event = this.drawEvent('night');
    if (event === undefined) {
      return this.commit('no-event', 'The night passes without incident.', {}, 'nightfall');
    }
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, 'nightfall');
  }

  resolveEventChoice(choiceId: string): ActionOutcome {
    return this.resolveChoice(choiceId, null);
  }

  /** @deprecated Use resolveEventChoice(choiceId) with the pending canonical choice ID. */
  resolveEvent(itemId: ItemId | null): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    const event = this.pendingChoiceEvent();
    if (event === null) return this.reject('no-event', 'There is no unresolved event.');

    if (itemId !== null && !this.canUseEventItem(itemId)) {
      return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
    }
    const choices = event.choices;
    const matching = itemId === null
      ? choices.find(({ id }) => id === 'sleep')
      : choices.find(({ itemId: choiceItemId }) => choiceItemId === itemId)
        ?? choices.find(({ itemId: choiceItemId }) => choiceItemId === 'any');
    if (matching === undefined) {
      return this.reject('choice-unavailable', 'That item is not a response to this event.');
    }
    return this.resolveChoice(matching.id, itemId === null ? null : this.targetForItem(itemId));
  }

  private resolveChoice(choiceId: string, offeredTarget: EventTarget | null): ActionOutcome {
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    const event = this.pendingChoiceEvent();
    if (event === null) return this.reject('no-event', 'There is no unresolved event.');
    const choice = event.choices.find(({ id }) => id === choiceId);
    if (choice === undefined) return this.reject('choice-unavailable', 'That response is not available.');
    if (choice.itemId === 'any' && offeredTarget === null) {
      return this.reject('item-target-required', 'Choose the recovered item offered for this response.');
    }
    if (choice.itemId === 'any' && !this.isEligibleLoseTarget(offeredTarget!)) {
      return this.reject('item-unavailable', 'That recovered item cannot be offered for this response.');
    }
    if (!this.canUseEventChoice(choice)) {
      return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
    }

    const resolved = resolveEventOutcome(choice, this.random);
    return this.applyResolvedEvent(event, resolved, offeredTarget);
  }

  private applyResolvedEvent(
    event: CanonicalEventDefinition,
    resolved: ResolvedEventOutcome,
    offeredTarget: EventTarget | null = null,
  ): ActionOutcome {
    const before = this.resourceValues();
    const affected = new Set<keyof ResourceDelta>();

    for (const mutation of resolved.itemMutations) {
      this.applyEventInventoryMutation(mutation, offeredTarget, affected);
    }

    const multiplier = eventDamageMultiplier(event.phase, this.day);
    const deltas: ResourceDelta = {};
    for (const [resource, value] of Object.entries(resolved.resourceDeltas)) {
      const key = resource as keyof typeof resolved.resourceDeltas;
      const adjusted = (key === 'health' || key === 'hull') && value! < 0
        ? value! * multiplier
        : value!;
      deltas[key] = adjusted;
      affected.add(key);
    }
    this.applyDeltas(deltas);

    for (const [resource, value] of Object.entries(resolved.resourceSets)) {
      const key = resource as keyof typeof resolved.resourceSets;
      if (key === 'energy' && event.phase === 'night') {
        this.pendingMorningEnergy = value!;
        continue;
      }
      this.setEventResource(key, value!);
      affected.add(key);
    }
    if (resolved.route !== undefined) this.route = resolved.route;

    this.pendingEvent = null;
    this.pendingEventId = null;
    this.pendingEventTarget = null;
    if (resolved.terminal === 'sunk') this.state = 'sunk';
    this.resolveTerminal();
    if (!this.isTerminal()) this.state = event.phase === 'day' ? 'day' : 'nightEvent';

    const after = this.resourceValues();
    const applied = Object.fromEntries([...affected].map((resource) => (
      [resource, after[resource] - before[resource]]
    ))) as ResourceDelta;
    const cue = this.state === 'dead'
      ? 'death'
      : this.state === 'sunk'
        ? 'sinking'
        : this.state === 'rescued'
          ? 'rescue'
          : event.cue;
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: resolved.message,
      deltas: applied,
      cue,
    };
    this.lastOutcome = outcome;
    return { ...outcome, deltas: { ...outcome.deltas } };
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
    let morningEnergy: number = hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.starving
      ? SURVIVAL_BALANCE.dawn.starvingEnergy
      : hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.hungry
        ? SURVIVAL_BALANCE.dawn.hungryEnergy
        : SURVIVAL_BALANCE.dawn.normalEnergy;
    if (this.pendingMorningEnergy !== null) {
      morningEnergy = this.pendingMorningEnergy;
      this.pendingMorningEnergy = null;
    }
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
        if (option === undefined) return null;
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
    let bonusFood = 0;

    if (caught) {
      const doubleChance = useBait
        ? SURVIVAL_BALANCE.fishing.rodBaitDouble
        : SURVIVAL_BALANCE.fishing.rodDouble;
      if (this.random.next() < doubleChance) bonusFood = 1;
    }

    const result = caught ? resolveFishing(this.day, useBait, this.random) : null;
    const food = result !== null && result.food > 0 ? result.food + bonusFood : 0;
    const deltas: ResourceDelta = { energy: -SURVIVAL_BALANCE.actions.fishEnergy, food };
    if (result?.id === 'worms') deltas.bait = 1;
    else if (result?.consumesBait === true) deltas.bait = -1;
    if (result?.itemGain !== undefined && result.id !== 'worms') {
      this.gainFishingItem(result.itemGain, result.itemCondition ?? 'usable');
    }
    this.actedToday = true;
    return this.commit(
      caught ? 'fish-caught' : 'fish-missed',
      result === null ? 'The line came back empty.' : `You caught ${result.label}.`,
      deltas,
      'fish',
    );
  }

  private unavailableItem(itemId: ItemId, targetInstanceId?: ItemInstanceId): Rejection | null {
    if (this.isTerminal()) return { code: 'terminal', message: 'The survival journey has already ended.' };
    if (this.state !== 'day') return { code: 'not-daytime', message: 'That item can only be used during the day.' };

    const directlyUsable = itemId === 'energyBar'
      || itemId === 'ductTape'
      || itemId === 'medicalKit'
      || itemId === 'repairKit'
      || itemId === 'chest'
      || itemId === 'fishingRod'
      || itemId === 'scubaSet';
    if (!directlyUsable) return { code: 'item-not-usable', message: 'That item has no direct use.' };
    switch (itemId) {
      case 'fishingRod': return this.unavailable('fish');
      case 'scubaSet': return this.unavailable('dive');
      case 'medicalKit': return this.unavailable('treat');
      case 'repairKit':
        if (this.hull >= SURVIVAL_BALANCE.thresholds.maximum) {
          return { code: 'hull-full', message: 'The hull needs no repair.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.repairEnergy) {
          return { code: 'not-enough-energy', message: 'Repairing requires two energy.' };
        }
        return null;
      case 'ductTape': {
        if (!this.canUseEventItem(itemId)) {
          return { code: 'item-unavailable', message: 'That item was not recovered or has no uses remaining.' };
        }
        if (targetInstanceId === undefined) {
          return { code: 'repair-target-required', message: 'Choose a broken item to repair.' };
        }
        const target = this.findInventoryInstance(targetInstanceId);
        if (target === null || target.instance.condition !== 'broken') {
          return { code: 'repair-target-unavailable', message: 'That broken item is not available to repair.' };
        }
        return null;
      }
      case 'energyBar':
        return this.canUseEventItem(itemId)
          ? null
          : { code: 'item-unavailable', message: 'That item was not recovered or has no uses remaining.' };
      case 'chest':
        if (!this.canUseEventItem(itemId)) {
          return { code: 'item-unavailable', message: 'That item was not recovered or has no uses remaining.' };
        }
        if (this.energy < ITEM_USE_ENERGY_COST.chest) {
          return { code: 'not-enough-energy', message: 'Opening a chest requires three energy.' };
        }
        return {
          code: 'chest-pool-undocumented',
          message: 'Chest opening is unavailable because the wiki does not document its utility pool.',
        };
      default: return { code: 'item-not-usable', message: 'That item has no direct use.' };
    }
  }

  static brokenBoatChance(hull: number): number {
    const clampedHull = Math.min(100, Math.max(0, hull));
    return (100 - clampedHull) / 100;
  }

  private gainFishingItem(itemId: ItemId, condition: 'usable' | 'broken'): void {
    const previousIds = new Set(this.inventory[itemId].instances.map(({ instanceId }) => instanceId));
    applyInventoryMutation(this.inventory, { kind: 'gain', itemId, quantity: 1 });
    if (condition !== 'broken') return;
    const gained = this.inventory[itemId].instances.find(({ instanceId }) => !previousIds.has(instanceId));
    applyInventoryMutation(this.inventory, {
      kind: 'break', itemId, quantity: 1, instanceId: gained?.instanceId,
    });
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

  private drawEvent(phase: 'day' | 'night'): CanonicalEventDefinition | undefined {
    const pool = eligibleEvents(CANONICAL_EVENTS, {
      phase,
      day: this.day,
      danger: this.danger,
      inventory: this.inventory,
      route: this.route,
      history: this.eventHistory,
      resources: {
        health: this.health,
        hull: this.hull,
        energy: this.energy,
        food: this.food,
        bait: this.bait,
        danger: this.danger,
      },
    });
    return drawWeightedEvent(pool, this.random, this.route);
  }

  private repairWithKit(): ActionOutcome {
    this.actedToday = true;
    return this.commit(
      'repaired',
      'You reinforce the damaged hull.',
      { energy: -SURVIVAL_BALANCE.actions.repairEnergy, hull: SURVIVAL_BALANCE.actions.repairHull },
      'repair',
    );
  }

  private openEvent(event: CanonicalEventDefinition): void {
    if (event.automatic || event.selectable === false) {
      throw new Error(`Cannot open non-selectable event: ${event.id}`);
    }
    this.pendingEvent = event;
    this.pendingEventId = event.id;
    this.pendingEventTarget = event.id === 'snatcher' ? this.drawSnatcherTarget(event) : null;
    this.recordEvent(event.id);
    this.state = event.phase === 'day' ? 'dayEvent' : 'nightEvent';
  }

  private recordEvent(eventId: string): void {
    const existing = this.eventHistory.get(eventId);
    this.eventHistory.set(eventId, existing === undefined
      ? { appearances: 1, firstDay: this.day, lastDay: this.day }
      : { ...existing, appearances: existing.appearances + 1, lastDay: this.day });
  }

  private hasPendingEvent(): boolean {
    return (this.state === 'dayEvent' || this.state === 'nightEvent') && this.pendingEvent !== null;
  }

  private pendingChoiceEvent(): ChoiceEventDefinition | null {
    const event = this.pendingEvent;
    return this.hasPendingEvent() && event !== null && !event.automatic ? event : null;
  }

  private availablePendingChoices(): EventChoiceDefinition[] {
    const event = this.pendingChoiceEvent();
    return event === null ? [] : event.choices.filter((choice) => this.canUseEventChoice(choice));
  }

  private canUseEventChoice(choice: EventChoiceDefinition): boolean {
    if (choice.itemId === undefined) return true;
    if (choice.itemId === 'any') return this.randomInventoryCandidates('lose').length > 0;
    return this.canUseEventItem(choice.itemId);
  }

  private drawSnatcherTarget(event: CanonicalEventDefinition): EventTarget | null {
    const candidates: EventTarget[] = [];
    for (const requirement of event.requiredAnyAssets ?? []) {
      if (requirement.kind === 'resource') {
        if (requirement.resource === 'food' && this.food >= requirement.min) candidates.push({ kind: 'food' });
        continue;
      }
      for (const instance of usableInstances(this.inventory, requirement.itemId)) {
        candidates.push({ kind: 'item', itemId: requirement.itemId, instanceId: instance.instanceId });
      }
    }
    return this.drawCandidate(candidates);
  }

  private targetForItem(itemId: ItemId): EventTarget | null {
    if (itemId === 'cannedFood' && this.food > 0) return { kind: 'food' };
    const instance = usableInstances(this.inventory, itemId)[0];
    return instance === undefined ? null : { kind: 'item', itemId, instanceId: instance.instanceId };
  }

  private applyEventInventoryMutation(
    mutation: EventInventoryMutation,
    offeredTarget: EventTarget | null,
    affected: Set<keyof ResourceDelta>,
  ): void {
    if (mutation.kind === 'loseRandom' || mutation.kind === 'breakRandom') {
      const kind = mutation.kind === 'loseRandom' ? 'lose' : 'break';
      for (let index = 0; index < mutation.quantity; index += 1) {
        const target = this.drawCandidate(this.randomInventoryCandidates(kind));
        if (target === null || target.kind !== 'item') break;
        applyInventoryMutation(this.inventory, {
          kind,
          itemId: target.itemId,
          instanceId: target.instanceId,
          quantity: 1,
        });
      }
      return;
    }

    if (mutation.kind === 'loseEventTarget') {
      const target = this.pendingEventTarget ?? offeredTarget;
      if (target?.kind === 'food') {
        this.applyDeltas({ food: -mutation.quantity });
        affected.add('food');
      } else if (target?.kind === 'item') {
        applyInventoryMutation(this.inventory, {
          kind: 'lose', itemId: target.itemId, instanceId: target.instanceId, quantity: mutation.quantity,
        });
      }
      return;
    }

    applyInventoryMutation(this.inventory, mutation);
  }

  private randomInventoryCandidates(kind: 'lose' | 'break'): EventTarget[] {
    const candidates: EventTarget[] = [];
    for (const [itemId, entry] of Object.entries(this.inventory) as [ItemId, SurvivalInventory[ItemId]][]) {
      const definition = runtimeItemDefinition(itemId);
      if (definition.builtIn) continue;
      if (kind === 'break' && !definition.breakable) continue;
      for (const instance of entry.instances) {
        if (instance.condition === 'usable') {
          candidates.push({ kind: 'item', itemId, instanceId: instance.instanceId });
        }
      }
    }
    return candidates;
  }

  private isEligibleLoseTarget(target: EventTarget): boolean {
    return target.kind === 'item' && this.randomInventoryCandidates('lose').some((candidate) => (
      candidate.kind === 'item'
      && candidate.itemId === target.itemId
      && candidate.instanceId === target.instanceId
    ));
  }

  private drawCandidate<T>(candidates: readonly T[]): T | null {
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.random.next() * candidates.length)] ?? candidates[candidates.length - 1]!;
  }

  private canUseEventItem(id: ItemId): boolean {
    if (id === 'cannedFood') return this.food > 0;
    if (id === 'baitTin') return this.bait > 0;
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
      danger: this.danger,
    };
  }

  private findInventoryInstance(instanceId: ItemInstanceId): {
    itemId: ItemId;
    instance: SurvivalInventory[ItemId]['instances'][number];
  } | null {
    for (const [itemId, entry] of Object.entries(this.inventory) as [ItemId, SurvivalInventory[ItemId]][]) {
      const instance = entry.instances.find((candidate) => candidate.instanceId === instanceId);
      if (instance !== undefined) return { itemId, instance };
    }
    return null;
  }

  private setEventResource(resource: keyof ResolvedEventOutcome['resourceSets'], value: number): void {
    switch (resource) {
      case 'health': this.health = value; break;
      case 'hull': this.hull = value; break;
      case 'energy': this.energy = value; break;
      case 'food': this.food = value; break;
      case 'bait': this.bait = value; break;
      case 'danger': this.danger = value; break;
    }
    this.clampMeters();
  }

  private applyDeltas(deltas: ResourceDelta): void {
    this.recoveredFood = this.remainingRecoveredUses(
      this.recoveredFood,
      this.food,
      deltas.food,
    );
    this.recoveredBait = this.remainingRecoveredUses(
      this.recoveredBait,
      this.bait,
      deltas.bait,
    );
    this.health += deltas.health ?? 0;
    this.hunger += deltas.hunger ?? 0;
    this.energy += deltas.energy ?? 0;
    this.hull += deltas.hull ?? 0;
    this.food += deltas.food ?? 0;
    this.bait += deltas.bait ?? 0;
    this.repairMaterial += deltas.repairMaterial ?? 0;
    this.rescueProgress += deltas.rescueProgress ?? 0;
    this.danger += deltas.danger ?? 0;
    this.clampMeters();
  }

  private remainingRecoveredUses(recovered: number, aggregate: number, delta?: number): number {
    if (delta === undefined || delta >= 0) return recovered;
    const consumed = Math.min(aggregate, -delta);
    return Math.max(0, recovered - consumed);
  }

  private consumeCharge(id: ItemId): boolean {
    const entry = this.inventory[id];
    if (!entry.owned || entry.charges === null || entry.charges <= 0) return false;
    applyInventoryMutation(this.inventory, { kind: 'consume', itemId: id, quantity: 1 });
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
    this.danger = Math.max(0, this.danger);
  }
}
