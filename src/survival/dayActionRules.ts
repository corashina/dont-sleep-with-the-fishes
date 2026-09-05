import { domainMessage as t } from '../i18n/domainMessages';
import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import { isDriftingItemEventId } from './eventCatalog';
import {
  radioRescueLeadForSignal,
  calculateHullRepair,
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
  if (action === 'repair') return option !== undefined;
  if (action === 'repairItem') return option?.kind !== 'itemRepair';
  return option !== undefined;
}

function carlitosCareUnavailableReason(
  state: DayActionRuleState,
  action: 'pet' | 'feed' | 'treat',
): string | null {
  const carlitos = state.carlitos;
  if (carlitos === null) return t('notAboard');
  if (!carlitos.alive) return t('cannotRespond');
  return carlitosCareRule(state, carlitos, action);
}

function carlitosCareRule(
  state: DayActionRuleState,
  carlitos: Readonly<CarlitosState>,
  action: 'pet' | 'feed' | 'treat',
): string | null {
  if (action === 'pet') {
    if (carlitos.pettedToday) return t('alreadyPetted');
    return carlitos.unhappiness <= 2 ? t('alreadyHappy') : null;
  }
  if (action === 'feed') {
    if (carlitos.hunger >= 5) return t('alreadySatiated');
    return state.food < 1 ? t('noFood') : null;
  }
  if (carlitos.sickness <= 0) return t('noCarlitosTreatment');
  return hasUsable(state.inventory, 'medicalKit') ? null : t('noMedicalKit');
}

type DayActionRule = (
  state: DayActionRuleState,
  option?: DayActionOption,
) => string | null;

const fishUnavailable: DayActionRule = (state) => (
  state.energy < SURVIVAL_BALANCE.actions.fishEnergy
    ? t('fishEnergy')
    : null
);

const diveUnavailable: DayActionRule = (state) => {
  if (!hasUsable(state.inventory, 'scubaSet')) {
    return t('noScuba');
  }
  if (state.weather === 'squall') return t('squallDive');
  return state.energy < SURVIVAL_BALANCE.actions.diveEnergy
    ? t('diveEnergy')
    : null;
};

const eatUnavailable: DayActionRule = (state) => {
  if (state.food < 1) return t('noFood');
  return state.hunger <= 0 ? t('notHungry') : null;
};

const repairUnavailable: DayActionRule = (state) => {
  if (state.hull >= SURVIVAL_BALANCE.thresholds.maximum) return t('hullFull');
  return state.energy < 1 ? t('repairEnergyOne') : null;
};

const repairItemUnavailable: DayActionRule = (state, option) => {
  if (!hasUsable(state.inventory, 'ductTape')) return t('noTape');
  if (option?.kind !== 'itemRepair') return t('chooseRepair');
  const target = state.inventory[option.target];
  return target === undefined
    || target.condition !== 'broken'
    || !ITEM_DEFINITIONS[target.type].breakable
    ? t('cannotRepair')
    : null;
};

const treatUnavailable: DayActionRule = (state) => {
  if (state.health >= SURVIVAL_BALANCE.thresholds.maximum) return t('healthFull');
  return hasUsable(state.inventory, 'medicalKit') ? null : t('noMedkitCharges');
};

const answerRadioUnavailable: DayActionRule = (state) => {
  if (!state.radioSignalAvailable) return t('noSignal');
  if (!hasUsable(state.inventory, 'radio')) return t('noRadio');
  return state.energy < SURVIVAL_BALANCE.radio.energy
    ? t('radioEnergy')
    : null;
};

const useEnergyBarUnavailable: DayActionRule = (state) => {
  if (!hasUsable(state.inventory, 'energyBar')) return t('noBar');
  return state.energy >= SURVIVAL_BALANCE.actions.maximumEnergy
    ? t('energyFull')
    : null;
};

const openChestUnavailable: DayActionRule = (state) => {
  return state.chestState === 'closed' ? null : t('noChest');
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
  if (state.activeFishing) return t('finishFishing');
  if (invalidOption(action, option)) return t('invalidOption');
  if (state.state === 'rescued' || state.state === 'dead' || state.state === 'sunk') {
    return t('terminal');
  }
  const optionalLootEvent = state.state === 'dayEvent'
    && isDriftingItemEventId(state.pendingEventId ?? '');
  if (state.state !== 'day' && !optionalLootEvent) {
    return t('notDaytime');
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
      const repair = calculateHullRepair(state.hull, state.energy);
      return Object.freeze({
        energy: -repair.energySpent,
        hull: repair.hullRestored,
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
