import { expect,it } from 'vitest';
import {
  clampSurvivalResources
} from '../src/survival/eventOutcomeRules';

it('clamps survival resources to standard meter and bonus energy limits', () => {
  expect(clampSurvivalResources({ health: 120, hunger: -2, energy: 5, hull: 150 }))
    .toEqual({ health: 100, hunger: 0, energy: 4, hull: 100 });
  expect(clampSurvivalResources({ health: 100, hunger: 0, energy: 4, hull: 100 }))
    .toEqual({ health: 100, hunger: 0, energy: 4, hull: 100 });
});
