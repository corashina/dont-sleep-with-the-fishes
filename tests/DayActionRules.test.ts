import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import {
  dayActionResourceDelta,
  dayActionUnavailableReason,
  type DayActionRuleState,
} from '../src/survival/dayActionRules';
import type { DayActionId, DayActionOption } from '../src/survival/survivalTypes';

const baseRuleState: DayActionRuleState = Object.freeze({
  state: 'day',
  activeFishing: false,
  actedToday: false,
  weather: 'calm',
  radioSignalAvailable: true,
  radioSignalsSent: 0,
  energy: 3,
  health: 50,
  hunger: 50,
  hull: 50,
  food: 1,
  bait: 1,
  chestState: 'closed',
  inventory: Object.freeze({
    'scubaSet-1': Object.freeze({ instanceId: 'scubaSet-1', type: 'scubaSet', condition: 'usable' }),
    'ductTape-1': Object.freeze({ instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' }),
    'medicalKit-1': Object.freeze({ instanceId: 'medicalKit-1', type: 'medicalKit', condition: 'usable' }),
    'radio-1': Object.freeze({ instanceId: 'radio-1', type: 'radio', condition: 'usable' }),
    'energyBar-1': Object.freeze({ instanceId: 'energyBar-1', type: 'energyBar', condition: 'usable' }),
    'compass-1': Object.freeze({ instanceId: 'compass-1', type: 'compass', condition: 'broken' }),
  }),
  carlitos: Object.freeze({
    alive: true,
    energy: 3,
    hunger: 4,
    sickness: 1,
    unhappiness: 1,
    pettedToday: false,
    deathCause: null,
  }),
});

function state(patch: Partial<DayActionRuleState> = {}): DayActionRuleState {
  return Object.freeze({ ...baseRuleState, ...patch });
}

function withoutItem(instanceId: ItemInstanceId): DayActionRuleState['inventory'] {
  return Object.freeze(Object.fromEntries(
    Object.entries(baseRuleState.inventory).filter(([id]) => id !== instanceId),
  ));
}

describe('day action availability rules', () => {
  it.each([
    ['fish', { energy: 0 }, undefined, 'Fishing requires one energy.'],
    ['dive', { inventory: withoutItem('scubaSet-1') }, undefined, 'Diving requires a recovered scuba set.'],
    ['dive', { weather: 'squall' }, undefined, 'Diving is too dangerous during a squall.'],
    ['dive', { energy: 2 }, undefined, 'Diving requires three energy.'],
    ['eat', { food: 0 }, undefined, 'No food remains.'],
    ['eat', { hunger: 0 }, undefined, 'You are not hungry.'],
    ['repair', { hull: 100 }, undefined, 'The hull needs no repair.'],
    ['repair', { energy: 0 }, undefined, 'Repairing requires one energy.'],
    ['repairItem', { inventory: withoutItem('ductTape-1') }, { kind: 'itemRepair', target: 'compass-1' }, 'No duct tape remains.'],
    ['repairItem', {}, undefined, 'That option cannot be used for this action.'],
    ['repairItem', {}, { kind: 'itemRepair', target: 'compass-2' }, 'That item cannot be repaired.'],
    ['treat', { health: 100 }, undefined, 'No treatment is needed.'],
    ['treat', { inventory: withoutItem('medicalKit-1') }, undefined, 'No medical-kit charges remain.'],
    ['answerRadio', { radioSignalAvailable: false }, undefined, 'The radio has no active signal.'],
    ['answerRadio', { inventory: withoutItem('radio-1') }, undefined, 'No working radio remains.'],
    ['answerRadio', { energy: 0 }, undefined, 'Answering the radio requires one energy.'],
    ['useEnergyBar', { inventory: withoutItem('energyBar-1') }, undefined, 'No energy bar remains.'],
    ['useEnergyBar', { energy: 3 }, undefined, 'Your energy is already full.'],
    ['openChest', { chestState: 'none' }, undefined, 'There is no closed chest to open.'],
    ['petCarlitos', { carlitos: null }, undefined, 'Carlitos is not aboard.'],
    ['petCarlitos', { carlitos: Object.freeze({ ...baseRuleState.carlitos!, alive: false }) }, undefined, 'Carlitos cannot respond.'],
    ['petCarlitos', { carlitos: Object.freeze({ ...baseRuleState.carlitos!, pettedToday: true }) }, undefined, 'Carlitos has already been petted today.'],
    ['petCarlitos', {}, undefined, 'Carlitos is already happy.'],
    ['feedCarlitos', { carlitos: Object.freeze({ ...baseRuleState.carlitos!, hunger: 5 }) }, undefined, 'Carlitos is already satiated.'],
    ['feedCarlitos', { food: 0 }, undefined, 'No food remains.'],
    ['treatCarlitos', { carlitos: Object.freeze({ ...baseRuleState.carlitos!, sickness: 0 }) }, undefined, 'Carlitos needs no treatment.'],
    ['treatCarlitos', { inventory: withoutItem('medicalKit-1') }, undefined, 'No medical kit remains.'],
  ] satisfies ReadonlyArray<readonly [DayActionId, Partial<DayActionRuleState>, DayActionOption | undefined, string]>) (
    'rejects %s with the current message',
    (action, patch, option, message) => {
      expect(dayActionUnavailableReason(state(patch), action, option)).toBe(message);
    },
  );

  it.each([
    [{ activeFishing: true }, 'Finish the active fishing attempt first.'],
    [{ state: 'dead' }, 'The survival journey has already ended.'],
    [{ state: 'nightEvent' }, 'That action is only available during the day.'],
  ] satisfies ReadonlyArray<readonly [Partial<DayActionRuleState>, string]>) (
    'rejects global action gates with the current message',
    (patch, message) => {
      expect(dayActionUnavailableReason(state(patch), 'eat')).toBe(message);
    },
  );

  it('rejects invalid options before state and resource gates', () => {
    expect(dayActionUnavailableReason(
      state({ activeFishing: true, state: 'dead', food: 0 }),
      'eat',
      { kind: 'itemRepair', target: 'compass-1' },
    )).toBe('Finish the active fishing attempt first.');
    expect(dayActionUnavailableReason(
      state({ state: 'dead', food: 0 }),
      'eat',
      { kind: 'itemRepair', target: 'compass-1' },
    )).toBe('That option cannot be used for this action.');
  });

  it('accepts every action when its current gates pass', () => {
    const cases: ReadonlyArray<readonly [DayActionId, DayActionOption | undefined, Partial<DayActionRuleState>?]> = [
      ['fish', undefined],
      ['dive', undefined],
      ['eat', undefined],
      ['repair', undefined],
      ['repairItem', { kind: 'itemRepair', target: 'compass-1' }],
      ['treat', undefined],
      ['answerRadio', undefined],
      ['useEnergyBar', undefined, { energy: 1 }],
      ['openChest', undefined, { energy: 0 }],
      ['petCarlitos', undefined, {
        carlitos: Object.freeze({ ...baseRuleState.carlitos!, unhappiness: 3 }),
      }],
      ['feedCarlitos', undefined],
      ['treatCarlitos', undefined],
      ['endDay', undefined],
    ];
    for (const [action, option, patch] of cases) {
      expect(dayActionUnavailableReason(state(patch), action, option)).toBeNull();
    }
  });

  it('allows hull repair without Duct Tape', () => {
    expect(dayActionUnavailableReason(
      state({ inventory: withoutItem('ductTape-1') }),
      'repair',
    )).toBeNull();
  });

  it('rejects every option for hull repair', () => {
    expect(dayActionUnavailableReason(
      state(),
      'repair',
      { kind: 'itemRepair', target: 'compass-1' },
    )).toBe('That option cannot be used for this action.');
  });
});

describe('day action resource rules', () => {
  it.each([
    ['eat', undefined, { hunger: -35, food: -1 }],
    ['treat', undefined, { health: 30 }],
    ['answerRadio', undefined, { energy: -1, rescueLead: 2 }],
    ['useEnergyBar', undefined, { energy: 2 }],
  ] as const)('computes the current %s resource effect', (action, option, expected) => {
    expect(dayActionResourceDelta(state({ energy: 1 }), action, option)).toEqual(expected);
  });

  it.each([
    [{ hull: 7, energy: 3 }, { energy: -3, hull: 93 }],
    [{ hull: 90, energy: 3 }, { energy: -1, hull: 10 }],
    [{ hull: 7, energy: 1 }, { energy: -1, hull: 33 }],
    [{ hull: 66, energy: 3 }, { energy: -2, hull: 34 }],
    [{ hull: 1, energy: 4 }, { energy: -3, hull: 99 }],
  ])('uses available energy for repair', (patch, expected) => {
    const current = state(patch);
    expect(dayActionUnavailableReason(current, 'repair')).toBeNull();
    expect(dayActionResourceDelta(current, 'repair')).toEqual(expected);
  });
});
