import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import { CHEST_OPEN_ENERGY } from './chest';
import { isDriftingItemEventId } from './eventCatalog';
import {
  radioRescueLeadForSignal,
  repairEnergyCost,
  SURVIVAL_BALANCE,
} from './survivalBalance';
import type { CarlitosState } from './CarlitosState';
import type {
  ChestState,
  DayActionId,
  DayActionOption,
  ResourceDelta,
  SurvivalInventorySnapshot,
  SurvivalState,
  WeatherId,
} from './survivalTypes';

export interface DayActionRuleState {
  readonly state: SurvivalState;
  readonly pendingEventId?: string | null;
  readonly activeFishing: boolean;
  readonly actedToday: boolean;
  readonly weather: WeatherId;
  readonly radioSignalAvailable: boolean;
  readonly radioSignalsSent: number;
  readonly energy: number;
  readonly health: number;
  readonly hunger: number;
  readonly hull: number;
  readonly food: number;
  readonly bait: number;
  readonly repairMaterial: number;
  readonly chestState: ChestState;
  readonly inventory: SurvivalInventorySnapshot;
  readonly carlitos: Readonly<CarlitosState> | null;
}

type DeterministicDayActionId = Exclude<
  DayActionId,
  | 'fish'
  | 'dive'
  | 'openChest'
  | 'repairItem'
  | 'petCarlitos'
  | 'feedCarlitos'
  | 'treatCarlitos'
  | 'endDay'
>;

function hasUsable(inventory: SurvivalInventorySnapshot, type: ItemId): boolean {
  return Object.values(inventory).some((item) => (
    item?.type === type && item.condition === 'usable'
  ));
}

function invalidOption(action: DayActionId, option?: DayActionOption): boolean {
  if (action === 'repair') return option?.kind !== 'hullRepair';
  if (action === 'repairItem') return option?.kind !== 'itemRepair';
  return option !== undefined;
}

function carlitosCareUnavailableReason(
  state: DayActionRuleState,
  action: 'pet' | 'feed' | 'treat',
): string | null {
  const carlitos = state.carlitos;
  if (carlitos === null) return 'Carlitos is not aboard.';
  if (!carlitos.alive) return 'Carlitos cannot respond.';
  return carlitosCareRule(state, carlitos, action);
}

function carlitosCareRule(
  state: DayActionRuleState,
  carlitos: Readonly<CarlitosState>,
  action: 'pet' | 'feed' | 'treat',
): string | null {
  if (action === 'pet') {
    if (carlitos.pettedToday) return 'Carlitos has already been petted today.';
    return carlitos.unhappiness <= 2 ? 'Carlitos is already happy.' : null;
  }
  if (action === 'feed') {
    if (carlitos.hunger >= 5) return 'Carlitos is already satiated.';
    return state.food < 1 ? 'No food remains.' : null;
  }
  if (carlitos.sickness <= 0) return 'Carlitos needs no treatment.';
  return hasUsable(state.inventory, 'medicalKit') ? null : 'No medical kit remains.';
}

type DayActionRule = (
  state: DayActionRuleState,
  option?: DayActionOption,
) => string | null;

const fishUnavailable: DayActionRule = (state) => (
  state.energy < SURVIVAL_BALANCE.actions.fishEnergy
    ? 'Fishing requires one energy.'
    : null
);

const diveUnavailable: DayActionRule = (state) => {
  if (!hasUsable(state.inventory, 'scubaSet')) {
    return 'Diving requires a recovered scuba set.';
  }
  if (state.weather === 'squall') return 'Diving is too dangerous during a squall.';
  return state.energy < SURVIVAL_BALANCE.actions.diveEnergy
    ? 'Diving requires three energy.'
    : null;
};

const eatUnavailable: DayActionRule = (state) => {
  if (state.food < 1) return 'No food remains.';
  return state.hunger <= 0 ? 'You are not hungry.' : null;
};

const repairUnavailable: DayActionRule = (state, option) => {
  if (state.hull >= SURVIVAL_BALANCE.thresholds.maximum) return 'The hull needs no repair.';
  const energyCost = repairEnergyCost(state.hull);
  if (state.energy < energyCost) {
    const energyWord = ['', 'one', 'two', 'three'][energyCost];
    return `Repairing requires ${energyWord} energy.`;
  }
  if (option?.kind === 'hullRepair' && option.material === 'ductTape') {
    return hasUsable(state.inventory, 'ductTape') ? null : 'No duct tape remains.';
  }
  return state.repairMaterial < 1 ? 'No duct tape remains.' : null;
};

const repairItemUnavailable: DayActionRule = (state, option) => {
  if (!hasUsable(state.inventory, 'ductTape')) return 'No duct tape remains.';
  if (option?.kind !== 'itemRepair') return 'Choose a broken item to repair.';
  const target = state.inventory[option.target];
  return target === undefined
    || target.condition !== 'broken'
    || !ITEM_DEFINITIONS[target.type].breakable
    ? 'That item cannot be repaired.'
    : null;
};

const treatUnavailable: DayActionRule = (state) => {
  if (state.health >= SURVIVAL_BALANCE.thresholds.maximum) return 'No treatment is needed.';
  return hasUsable(state.inventory, 'medicalKit') ? null : 'No medical-kit charges remain.';
};

const answerRadioUnavailable: DayActionRule = (state) => {
  if (!state.radioSignalAvailable) return 'The radio has no active signal.';
  if (!hasUsable(state.inventory, 'radio')) return 'No working radio remains.';
  return state.energy < SURVIVAL_BALANCE.radio.energy
    ? 'Answering the radio requires one energy.'
    : null;
};

const useEnergyBarUnavailable: DayActionRule = (state) => {
  if (!hasUsable(state.inventory, 'energyBar')) return 'No energy bar remains.';
  return state.energy >= SURVIVAL_BALANCE.actions.maximumEnergy
    ? 'Your energy is already full.'
    : null;
};

const openChestUnavailable: DayActionRule = (state) => {
  if (state.chestState !== 'closed') return 'There is no closed chest to open.';
  return state.energy < CHEST_OPEN_ENERGY
    ? 'Opening the chest requires three energy.'
    : null;
};

const ACTION_UNAVAILABLE_RULES: Readonly<Record<DayActionId, DayActionRule>> = {
  fish: fishUnavailable,
  dive: diveUnavailable,
  eat: eatUnavailable,
  repair: repairUnavailable,
  repairItem: repairItemUnavailable,
  treat: treatUnavailable,
  answerRadio: answerRadioUnavailable,
  useEnergyBar: useEnergyBarUnavailable,
  openChest: openChestUnavailable,
  petCarlitos: (state) => carlitosCareUnavailableReason(state, 'pet'),
  feedCarlitos: (state) => carlitosCareUnavailableReason(state, 'feed'),
  treatCarlitos: (state) => carlitosCareUnavailableReason(state, 'treat'),
  endDay: () => null,
};

export function dayActionUnavailableReason(
  state: DayActionRuleState,
  action: DayActionId,
  option?: DayActionOption,
): string | null {
  if (state.activeFishing) return 'Finish the active fishing attempt first.';
  if (invalidOption(action, option)) return 'That option cannot be used for this action.';
  if (state.state === 'rescued' || state.state === 'dead' || state.state === 'sunk') {
    return 'The survival journey has already ended.';
  }
  const optionalLootEvent = state.state === 'dayEvent'
    && isDriftingItemEventId(state.pendingEventId ?? '');
  if (state.state !== 'day' && !optionalLootEvent) {
    return 'That action is only available during the day.';
  }
  return ACTION_UNAVAILABLE_RULES[action](state, option);
}

export function dayActionResourceDelta(
  state: DayActionRuleState,
  action: DeterministicDayActionId,
  option?: DayActionOption,
): Readonly<ResourceDelta> {
  switch (action) {
    case 'eat':
      return Object.freeze({ hunger: SURVIVAL_BALANCE.actions.foodHunger, food: -1 });
    case 'repair': {
      const energy = -repairEnergyCost(state.hull);
      return option?.kind === 'hullRepair' && option.material === 'ductTape'
        ? Object.freeze({ energy, hull: SURVIVAL_BALANCE.actions.tapeHull })
        : Object.freeze({
            energy,
            hull: SURVIVAL_BALANCE.actions.repairHull,
            repairMaterial: -1,
          });
    }
    case 'treat':
      return Object.freeze({ health: SURVIVAL_BALANCE.actions.treatmentHealth });
    case 'answerRadio':
      return Object.freeze({
        energy: -SURVIVAL_BALANCE.radio.energy,
        rescueLead: radioRescueLeadForSignal(state.radioSignalsSent),
      });
    case 'useEnergyBar':
      return Object.freeze({ energy: SURVIVAL_BALANCE.actions.maximumEnergy - state.energy });
  }
}
