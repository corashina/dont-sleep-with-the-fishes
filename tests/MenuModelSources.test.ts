import { describe, expect, it } from 'vitest';
import {
  POLY_PIZZA_MENU_MODEL_IDS,
  POLY_PIZZA_MENU_MODEL_SOURCES,
} from '../scripts/poly-pizza-menu-models.mjs';

describe('underwater menu model sources', () => {
  it('pins the exact approved Poly Pizza models', () => {
    expect(POLY_PIZZA_MENU_MODEL_IDS).toEqual([
      'boat', 'rockA', 'rockB', 'rockC',
      'fishBone', 'skull', 'largeBone', 'shark',
    ]);
    expect(Object.fromEntries(POLY_PIZZA_MENU_MODEL_IDS.map((id) => [
      id,
      {
        publicId: POLY_PIZZA_MENU_MODEL_SOURCES[id].publicId,
        resourceId: POLY_PIZZA_MENU_MODEL_SOURCES[id].resourceId,
        sha256: POLY_PIZZA_MENU_MODEL_SOURCES[id].sha256,
        sourceTriangles: POLY_PIZZA_MENU_MODEL_SOURCES[id].sourceTriangles,
      },
    ]))).toEqual({
      boat: {
        publicId: 'YwdXrwbN3o',
        resourceId: '66ae3fa9-d6de-45dc-86c0-659786b865e1',
        sha256: 'FEE1EE45E5457D146857D064982922A378D909794E34A2FC89572BB946BA8464',
        sourceTriangles: 412,
      },
      rockA: {
        publicId: 'd2VWOdthtR',
        resourceId: 'd7bc2b98-2c73-4e78-b0bd-e5e24d65734a',
        sha256: '76F1F4BABFEFED5FF852C97978065AC6FF1EEC5B6930BAE9E62EA095BFAE0FB5',
        sourceTriangles: 448,
      },
      rockB: {
        publicId: '54jZKTAt5p',
        resourceId: 'c14651f6-9ef8-41e8-8aca-cafed61d9ca2',
        sha256: 'C4E9F04C04419E67E919C4533DFD6044ABC5F0640AFA9D0E174CF474285D380C',
        sourceTriangles: 222,
      },
      rockC: {
        publicId: 'li0YBlBEMz',
        resourceId: 'a50f220b-3c4c-4226-ae97-0458ed615cd2',
        sha256: 'AFF6F5DF4CB5309400C9E85790D8FBAAB5EBE281402A54E7BA4308038DEFC9F3',
        sourceTriangles: 432,
      },
      fishBone: {
        publicId: 'bU5RLZnq6v',
        resourceId: 'ed285a5f-7c35-47b0-a12d-60006f5eb74c',
        sha256: 'D15FC15F86F84BA38B3A0CF18E5B23651F7541433B59D045233793B2A54FB51E',
        sourceTriangles: 588,
      },
      skull: {
        publicId: 'VGtSTNRf2O',
        resourceId: '2a686e08-5456-405f-a6ef-03274e080b2f',
        sha256: '3A05AC7A8FE56832E988285D24F755F2D22DB51CC0E70F2BD559077F6324349B',
        sourceTriangles: 3132,
      },
      largeBone: {
        publicId: 'A67un3x9nV',
        resourceId: 'dc066333-7257-425b-bbc0-7d93403d019d',
        sha256: 'AD3442D1998FE6AAA27EFC585EBA2C651C80ED2BB9467A6082DC6507509F3AF9',
        sourceTriangles: 1680,
      },
      shark: {
        publicId: 'AyHTK3zUSG',
        resourceId: 'd2d374ea-eb1d-4659-8cc7-816a83b82470',
        sha256: '6D5CF3CD7EA749583B622A306CFCAE4DE85432EFCC74A1EC6F52E5430CF13AFF',
        sourceTriangles: 644,
      },
    });
  });
});
