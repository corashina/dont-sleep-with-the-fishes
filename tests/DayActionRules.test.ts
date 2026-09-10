import { describe,expect,it } from 'vitest';
import {
  dayActionUnavailableReason,
  type DayActionRuleState,
} from '../src/survival/dayActionRules';
import type { DayActionId,DayActionOption } from '../src/survival/survivalTypes';

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
    'fishingNet-1': Object.freeze({ instanceId: 'fishingNet-1', type: 'fishingNet', condition: 'usable' }),
    'ductTape-1': Object.freeze({ instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' }),
    'medicalKit-1': Object.freeze({ instanceId: 'medicalKit-1', type: 'medicalKit', condition: 'usable' }),
    'radio-1': Object.freeze({ instanceId: 'radio-1', type: 'radio', condition: 'usable' }),
    'energyBar-1': Object.freeze({ instanceId: 'energyBar-1', type: 'energyBar', condition: 'usable' }),
    'compass-1': Object.freeze({ instanceId: 'compass-1', type: 'compass', condition: 'broken' }),
  }),
  carlitos: Object.freeze({

    rest: 'rested',
    hunger: 4,
    unhappiness: 1,
    pettedToday: false,

  }),
});

function state(patch: Partial<DayActionRuleState> = {}): DayActionRuleState {
  return Object.freeze({ ...baseRuleState, ...patch });
}

describe('day action availability rules', () => {

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

  it.each([null, 'drifting-supplies', 'drifting-supplies', 'drifting-chest'])(
    'accepts every action when its current gates pass with pending loot %s', (pendingEventId) => {
    const cases: ReadonlyArray<readonly [DayActionId, DayActionOption | undefined, Partial<DayActionRuleState>?]> = [
      ['fish', undefined],
      ['netFish', undefined],
      ['dive', undefined],
      ['eat', undefined],
      ['repair', undefined],
      ['repairItem', { kind: 'itemRepair', target: 'compass-1' }],
      ['treat', undefined],
      ['answerRadio', undefined],
      ['useEnergyBar', undefined, { energy: 1 }],
      ['openChest', undefined, { energy: 3 }],
      ['petCarlitos', undefined, {
        carlitos: Object.freeze({ ...baseRuleState.carlitos!, unhappiness: 3 }),
      }],
      ['feedCarlitos', undefined],
      ['endDay', undefined],
    ];
    for (const [action, option, patch] of cases) {
      expect(dayActionUnavailableReason(state({
        ...patch,
        state: pendingEventId === null ? 'day' : 'dayEvent',
        pendingEventId,
      }), action, option)).toBeNull();
    }
  });

  it.each(['drifting-supplies', 'drifting-chest'])(
    'keeps resource and weather limits during %s', (pendingEventId) => {
      const pending = { state: 'dayEvent' as const, pendingEventId };
      expect(dayActionUnavailableReason(state({ ...pending, energy: 0 }), 'repair'))
        .toBe('Repairing requires one energy.');
      expect(dayActionUnavailableReason(state({ ...pending, weather: 'squall' }), 'dive'))
        .toBe('Diving is too dangerous during a squall.');
      expect(dayActionUnavailableReason(state({ ...pending, food: 0 }), 'eat'))
        .toBe('No food remains.');
    },
  );

  it('blocks normal actions during a required day event', () => {
    expect(dayActionUnavailableReason(state({ state: 'dayEvent', pendingEventId: 'leak' }), 'repair'))
      .toBe('That action is only available during the day.');
  });
});
