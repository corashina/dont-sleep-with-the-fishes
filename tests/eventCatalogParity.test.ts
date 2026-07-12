import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVENTS,
  SURVIVAL_EVENTS,
  eventDamageMultiplier,
  validateCanonicalEvents,
} from '../src/canonical/events';
import { PARITY_AUDIT } from '../src/canonical/parityAudit';
import type { CanonicalEventDefinition } from '../src/survival/survivalTypes';

const includedIds = [
  'peaceful-night', 'shower-night', 'windy-night', 'bad-sleep', 'thunderstorm',
  'check-the-back', 'dangerous-waters', 'needs-direction', 'restless-waves', 'leak',
  'man-in-the-fog', 'mystery-chest', 'seagull', 'midnight-tour', 'ghosts',
  'school-of-fish', 'snatcher', 'chest-attack', 'death-stare', 'swarm-of-anglerfish',
  'whirlpool', 'eerie-melody', 'shark-men', 'face-on-the-moon', 'broken-boat',
  'the-handyman',
] as const;

const event = (id: string) => {
  const found = CANONICAL_EVENTS.find((entry) => entry.id === id);
  expect(found, id).toBeDefined();
  return found!;
};

const choice = (eventId: string, choiceId: string) => {
  const found = event(eventId);
  if (found.automatic) throw new Error(`${eventId} is automatic`);
  const selected = found.choices.find((entry) => entry.id === choiceId);
  expect(selected, `${eventId}.${choiceId}`).toBeDefined();
  return selected!;
};

const metadata = (entry: (typeof CANONICAL_EVENTS)[number]) => ({
  id: entry.id,
  sourceId: entry.sourceId,
  weight: entry.weight,
  minDay: entry.minDay,
  maxDay: entry.maxDay,
  cooldownDays: entry.cooldownDays,
  maxAppearances: entry.maxAppearances,
  dangerMin: entry.dangerMin,
  routeWeightBonuses: entry.routeWeightBonuses,
  selectable: entry.selectable,
});

describe('canonical ordinary event catalog', () => {
  it('contains the exact included IDs in canonical order', () => {
    expect(CANONICAL_EVENTS.map(({ id }) => id)).toEqual(includedIds);
    expect(SURVIVAL_EVENTS).toBe(CANONICAL_EVENTS);
  });

  it('locks every catalog field, choice, outcome, and effect against structural drift', () => {
    expect(CANONICAL_EVENTS).toMatchInlineSnapshot(`
      [
        {
          "choices": [
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The night passes peacefully.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "none",
          "dangerMin": 0,
          "id": "peaceful-night",
          "maxAppearances": 0,
          "minDay": 0,
          "normalizationNote": "Synthetic sleep choice normalizes the source no-choice passive event to the ordinary choice schema.",
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Peaceful Night",
          "weight": 75,
        },
        {
          "choices": [
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The bucket keeps the rain under control.",
                  "weight": 90,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The bucket breaks.",
                  "weight": 10,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The umbrella shelters you.",
                  "weight": 100,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "umbrella",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The umbrella breaks.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "map",
              "itemId": "map",
              "label": "Use Map",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "map",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The map breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 20,
                },
              ],
            },
          ],
          "cooldownDays": 35,
          "cue": "storm",
          "dangerMin": 0,
          "id": "shower-night",
          "maxAppearances": 1,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Shower Night",
          "weight": 35,
        },
        {
          "choices": [
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "fishingNet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The net breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "map",
              "itemId": "map",
              "label": "Use Map",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "map",
                        "kind": "lose",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The map is lost, but you find food.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "umbrella",
                        "kind": "lose",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The umbrella is lost.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 40,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "breakRandom",
                        "quantity": 2,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 10,
                        },
                      },
                    ],
                  },
                  "message": "The wind batters the boat and breaks two items.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 10,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The wind batters the boat.",
                  "weight": 20,
                },
              ],
            },
          ],
          "cooldownDays": 40,
          "cue": "storm",
          "dangerMin": 0,
          "id": "windy-night",
          "maxAppearances": 1,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Windy Night",
          "weight": 40,
        },
        {
          "choices": [
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Use Flashlight",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "swimRing",
              "itemId": "swimRing",
              "label": "Use Swim Ring",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 100,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "umbrella",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The umbrella breaks.",
                  "weight": 5,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 40,
          "cue": "darkness",
          "dangerMin": 0,
          "id": "bad-sleep",
          "maxAppearances": 1,
          "maxDay": 10,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Bad Sleep",
          "weight": 40,
        },
        {
          "choices": [
            {
              "id": "anchor",
              "itemId": "anchor",
              "label": "Use Anchor",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 20,
                },
              ],
            },
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 25,
                          "min": 15,
                        },
                      },
                    ],
                  },
                  "message": "The boat and bucket are damaged.",
                  "weight": 40,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 20,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 30,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "A random item is lost.",
                  "weight": 20,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 1,
                      },
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "A random item is lost and the bucket breaks.",
                  "weight": 5,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "umbrella",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 20,
                          "min": 10,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged and the umbrella breaks.",
                  "weight": 65,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 20,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 35,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 48,
                          "min": 30,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "The storm damages the boat and takes an item.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 35,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "The storm damages the boat.",
                  "weight": 30,
                },
              ],
            },
          ],
          "cooldownDays": 35,
          "cue": "storm",
          "dangerMin": 0,
          "id": "thunderstorm",
          "maxAppearances": 1,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Thunderstorm",
          "weight": 40,
        },
        {
          "choices": [
            {
              "id": "yes",
              "label": "Yes",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You find a fish.",
                  "weight": 500,
                },
                {
                  "effects": {},
                  "message": "You find nothing.",
                  "weight": 50,
                },
                {
                  "effects": {},
                  "message": "A bizarre face stares back at you.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "no",
              "label": "No",
              "outcomes": [
                {
                  "effects": {},
                  "message": "You go back to sleep.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 35,
          "cue": "sighting",
          "dangerMin": 0,
          "id": "check-the-back",
          "maxAppearances": 1,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Check the Back",
          "weight": 35,
        },
        {
          "choices": [
            {
              "id": "map",
              "itemId": "map",
              "label": "Use Map",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 10,
                          "min": 5,
                        },
                      },
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The rocks damage the boat.",
                  "weight": 20,
                },
              ],
            },
            {
              "id": "compass",
              "itemId": "compass",
              "label": "Use Compass",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 8,
                          "min": 5,
                        },
                      },
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The rocks damage the boat.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 45,
                          "min": 25,
                        },
                      },
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The rocks damage the boat.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "impact",
          "dangerMin": 0,
          "id": "dangerous-waters",
          "maxAppearances": 1,
          "maxDay": 30,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "right": 25,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Dangerous Waters",
          "weight": 15,
        },
        {
          "choices": [
            {
              "id": "left",
              "label": "Left",
              "outcomes": [
                {
                  "effects": {
                    "route": "left",
                  },
                  "message": "You turn left.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "right",
              "label": "Right",
              "outcomes": [
                {
                  "effects": {
                    "route": "right",
                  },
                  "message": "You turn right.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "sighting",
          "dangerMin": 0,
          "id": "needs-direction",
          "maxAppearances": 1,
          "maxDay": 24,
          "minDay": 2,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Needs Direction",
          "weight": 33,
        },
        {
          "choices": [
            {
              "id": "anchor",
              "itemId": "anchor",
              "label": "Use Anchor",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "swimRing",
              "itemId": "swimRing",
              "label": "Use Swim Ring",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 20,
                          "min": 10,
                        },
                      },
                    ],
                  },
                  "message": "The waves damage the boat.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "swimRing",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The swim ring breaks.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The waves damage the boat.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 25,
                          "min": 15,
                        },
                      },
                    ],
                  },
                  "message": "The waves damage the boat and take an item.",
                  "weight": 50,
                },
              ],
            },
          ],
          "cooldownDays": 35,
          "cue": "impact",
          "dangerMin": 0,
          "id": "restless-waves",
          "maxAppearances": 1,
          "minDay": 3,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Restless Waves",
          "weight": 30,
        },
        {
          "choices": [
            {
              "id": "ductTape",
              "itemId": "ductTape",
              "label": "Use Duct Tape",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "ductTape",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The tape is used.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 10,
                          "min": 5,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged and the bucket breaks.",
                  "weight": 20,
                },
              ],
            },
            {
              "id": "map",
              "itemId": "map",
              "label": "Use Map",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "map",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The map breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 20,
                          "min": 15,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "The leak damages the boat.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 20,
                          "min": 5,
                        },
                      },
                    ],
                  },
                  "message": "The leak damages the boat and takes an item.",
                  "weight": 40,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "impact",
          "dangerMin": 0,
          "id": "leak",
          "maxAppearances": 1,
          "minDay": 4,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Leak",
          "weight": 10,
        },
        {
          "choices": [
            {
              "id": "compass",
              "itemId": "compass",
              "label": "Use Compass",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Use Telescope",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "Danger increases.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Use Flashlight",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 2,
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 20,
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The figure attacks.",
                  "weight": 70,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "Danger increases.",
                  "weight": 35,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 10,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 20,
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You are injured.",
                  "weight": 50,
                },
              ],
            },
          ],
          "cooldownDays": 40,
          "cue": "darkness",
          "dangerMin": 1,
          "id": "man-in-the-fog",
          "maxAppearances": 1,
          "minDay": 6,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Man in the Fog",
          "weight": 18,
        },
        {
          "choices": [
            {
              "id": "yes",
              "label": "Yes",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "chest",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "You recover the chest.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 25,
                      },
                    ],
                  },
                  "message": "The mimic attacks.",
                  "weight": 30,
                },
              ],
            },
            {
              "id": "no",
              "label": "No",
              "outcomes": [
                {
                  "effects": {},
                  "message": "You go back to sleep.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 33,
          "cue": "sighting",
          "dangerMin": 1,
          "forbiddenItems": [
            "chest",
          ],
          "id": "mystery-chest",
          "maxAppearances": 1,
          "minDay": 6,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "right": 5,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Mystery Chest",
          "weight": 45,
        },
        {
          "choices": [
            {
              "id": "shoo",
              "label": "Shoo the seagull",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The seagull is scared away.",
                  "weight": 0,
                },
              ],
            },
            {
              "id": "cannedFood",
              "itemId": "cannedFood",
              "label": "Give Food",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The seagull eats one food.",
                  "weight": 0,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "sighting",
          "dangerMin": 0,
          "id": "seagull",
          "maxAppearances": 0,
          "minDay": 0,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": false,
          "sourceId": "events",
          "sourceNote": "Chance, minimum day, cooldown, and outcome weights are undocumented on the Events page.",
          "title": "Seagull",
          "weight": 0,
        },
        {
          "choices": [
            {
              "id": "yes",
              "label": "Yes",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "chest",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You recover a chest.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "bait",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You recover bait.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 35,
                      },
                    ],
                  },
                  "message": "A creature attacks.",
                  "weight": 12,
                },
              ],
            },
            {
              "id": "no",
              "label": "No",
              "outcomes": [
                {
                  "effects": {},
                  "message": "You go back to sleep.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 30,
          "cue": "sighting",
          "dangerMin": 1,
          "forbiddenItems": [
            "chest",
          ],
          "id": "midnight-tour",
          "maxAppearances": 1,
          "maxDay": 40,
          "minDay": 7,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "right": 8,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Midnight Tour",
          "weight": 22,
        },
        {
          "choices": [
            {
              "id": "flareGun",
              "itemId": "flareGun",
              "label": "Use Flare Gun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "flareGun",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The flare is used.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Use Flashlight",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You wake with one energy.",
                  "weight": 40,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You wake with one energy.",
                  "weight": 30,
                },
              ],
            },
          ],
          "cooldownDays": 38,
          "cue": "darkness",
          "dangerMin": 1,
          "id": "ghosts",
          "maxAppearances": 1,
          "minDay": 8,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 3,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Ghosts",
          "weight": 25,
        },
        {
          "choices": [
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 3,
                      },
                    ],
                  },
                  "message": "You gain three food.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "fishingNet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You gain two food and the net breaks.",
                  "weight": 40,
                },
              ],
            },
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You gain one food.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The bucket breaks.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Use Telescope",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "You gain one food.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 39,
          "cue": "fish",
          "dangerMin": 1,
          "id": "school-of-fish",
          "maxAppearances": 1,
          "minDay": 8,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "right": 5,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "School of Fish",
          "weight": 66,
        },
        {
          "choices": [
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Use Telescope",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "telescope",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The telescope breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "swimRing",
              "itemId": "swimRing",
              "label": "Use Swim Ring",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "swimRing",
                        "kind": "lose",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The swim ring is lost.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseEventTarget",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The snatched item is lost.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "harpoonGun",
              "itemId": "harpoonGun",
              "label": "Use Harpoon Gun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "harpoonGun",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You gain two food.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseEventTarget",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The snatched item is lost.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 45,
          "cue": "impact",
          "dangerMin": 1,
          "id": "snatcher",
          "maxAppearances": 1,
          "minDay": 8,
          "phase": "night",
          "prompt": "Choose a response.",
          "requiredAnyAssets": [
            {
              "itemId": "anchor",
              "kind": "item",
            },
            {
              "itemId": "bucket",
              "kind": "item",
            },
            {
              "itemId": "medicalKit",
              "kind": "item",
            },
            {
              "itemId": "flareGun",
              "kind": "item",
            },
            {
              "itemId": "flashlight",
              "kind": "item",
            },
            {
              "itemId": "map",
              "kind": "item",
            },
            {
              "itemId": "scubaSet",
              "kind": "item",
            },
            {
              "itemId": "umbrella",
              "kind": "item",
            },
            {
              "kind": "resource",
              "min": 1,
              "resource": "food",
            },
          ],
          "routeWeightBonuses": {
            "left": 5,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Snatcher",
          "weight": 28,
        },
        {
          "choices": [
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The mimic becomes a regular chest again.",
                  "weight": 0,
                },
              ],
            },
            {
              "id": "touch",
              "label": "Touch the chest",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The mimic attacks.",
                  "weight": 0,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "The mimic attacks.",
                  "weight": 0,
                },
              ],
            },
          ],
          "cooldownDays": 0,
          "cue": "impact",
          "dangerMin": 0,
          "id": "chest-attack",
          "maxAppearances": 0,
          "minDay": 0,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": false,
          "sourceId": "events",
          "sourceNote": "Chance, minimum day, cooldown, damage, and outcome weights are undocumented on the Events page.",
          "title": "Chest left unopened",
          "trigger": {
            "itemId": "chest",
            "minAgeDays": 2,
          },
          "weight": 0,
        },
        {
          "choices": [
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Use Flashlight",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "flashlight",
                        "kind": "lose",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The flashlight is lost.",
                  "weight": 35,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 40,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "umbrella",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 66,
                          "min": 44,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 60,
                      },
                    ],
                  },
                  "message": "The creature attacks.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "cannedFood",
              "itemId": "cannedFood",
              "label": "Use Food",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "food",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You lose two food.",
                  "weight": 66,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "food",
                        "value": 1,
                      },
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 55,
                          "min": 33,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The creature attacks.",
                  "weight": 33,
                },
              ],
            },
            {
              "id": "harpoonGun",
              "itemId": "harpoonGun",
              "label": "Use Harpoon Gun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "harpoonGun",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The harpoon is used.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "fishingNet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 66,
                          "min": 55,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 70,
                      },
                    ],
                  },
                  "message": "The creature attacks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 5,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 66,
                          "min": 44,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 60,
                      },
                    ],
                  },
                  "message": "The creature attacks.",
                  "weight": 85,
                },
              ],
            },
          ],
          "cooldownDays": 32,
          "cue": "impact",
          "dangerMin": 1,
          "id": "death-stare",
          "maxAppearances": 1,
          "minDay": 9,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": true,
          "sourceId": "events",
          "title": "Death Stare",
          "weight": 160,
        },
        {
          "choices": [
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Use Fishing Net",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "fishingNet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The fishing net breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "harpoonGun",
              "itemId": "harpoonGun",
              "label": "Use Harpoon Gun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "harpoonGun",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You gain two food.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Use Flashlight",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 40,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The swarm attacks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "baitTin",
              "itemId": "baitTin",
              "label": "Use Bait",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "bait",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You lose two bait.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 40,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The swarm attacks.",
                  "weight": 65,
                },
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 25,
                },
              ],
            },
          ],
          "cooldownDays": 38,
          "cue": "fish",
          "dangerMin": 1,
          "id": "swarm-of-anglerfish",
          "maxAppearances": 1,
          "minDay": 10,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 4,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Swarm of Anglerfish",
          "weight": 12,
        },
        {
          "choices": [
            {
              "id": "anchor",
              "itemId": "anchor",
              "label": "Use Anchor",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 90,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "anchor",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 10,
                          "min": 5,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged and the anchor breaks.",
                  "weight": 10,
                },
              ],
            },
            {
              "id": "swimRing",
              "itemId": "swimRing",
              "label": "Use Swim Ring",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 40,
                          "min": 20,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 50,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "swimRing",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 40,
                          "min": 20,
                        },
                      },
                    ],
                  },
                  "message": "The boat is damaged and the swim ring breaks.",
                  "weight": 50,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 40,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 0,
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 80,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseRandom",
                        "quantity": 2,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 80,
                          "min": 60,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "The boat is badly damaged and two items are lost.",
                  "weight": 30,
                },
              ],
            },
          ],
          "cooldownDays": 30,
          "cue": "impact",
          "dangerMin": 1,
          "id": "whirlpool",
          "maxAppearances": 1,
          "minDay": 12,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 1,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Whirlpool",
          "weight": 5,
        },
        {
          "choices": [
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Use Bucket",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The bucket breaks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Use Telescope",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 90,
                          "min": 50,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The siren attacks.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 60,
                          "min": 40,
                        },
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The boat is damaged.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "ductTape",
              "itemId": "ductTape",
              "label": "Use Duct Tape",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "ductTape",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The duct tape is used.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 0,
                      },
                    ],
                  },
                  "message": "You wake exhausted.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 90,
                          "min": 50,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The siren attacks.",
                  "weight": 40,
                },
              ],
            },
          ],
          "cooldownDays": 30,
          "cue": "darkness",
          "dangerMin": 2,
          "id": "eerie-melody",
          "maxAppearances": 1,
          "minDay": 13,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "right": 7,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Eerie Melody",
          "weight": 19,
        },
        {
          "choices": [
            {
              "id": "harpoonGun",
              "itemId": "harpoonGun",
              "label": "Use Harpoon Gun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "harpoonGun",
                        "kind": "consume",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The harpoon is used.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "swimRing",
              "itemId": "swimRing",
              "label": "Use Swim Ring",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "swimRing",
                        "kind": "lose",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The swim ring is lost.",
                  "weight": 85,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "swimRing",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 70,
                          "min": 50,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The shark men attack.",
                  "weight": 35,
                },
              ],
            },
            {
              "id": "scubaSet",
              "itemId": "scubaSet",
              "label": "Use Scuba Gear",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "scubaSet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 4,
                      },
                    ],
                  },
                  "message": "You gain four food.",
                  "weight": 70,
                },
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "scubaSet",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 30,
                          "min": 20,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 80,
                      },
                    ],
                  },
                  "message": "The shark men attack.",
                  "weight": 36,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 70,
                          "min": 50,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 50,
                      },
                    ],
                  },
                  "message": "The shark men attack.",
                  "weight": 80,
                },
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 20,
                },
              ],
            },
          ],
          "cooldownDays": 30,
          "cue": "impact",
          "dangerMin": 2,
          "id": "shark-men",
          "maxAppearances": 1,
          "minDay": 15,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 5,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Shark Men",
          "weight": 15,
        },
        {
          "choices": [
            {
              "id": "umbrella",
              "itemId": "umbrella",
              "label": "Use Umbrella",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Use Telescope",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "telescope",
                        "kind": "break",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The telescope breaks.",
                  "weight": 60,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "danger",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "Danger increases.",
                  "weight": 40,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 0,
                      },
                    ],
                  },
                  "message": "You wake exhausted.",
                  "weight": 100,
                },
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "set",
                        "resource": "energy",
                        "value": 2,
                      },
                    ],
                  },
                  "message": "You wake with two energy.",
                  "weight": 20,
                },
              ],
            },
          ],
          "cooldownDays": 50,
          "cue": "darkness",
          "dangerMin": 3,
          "id": "face-on-the-moon",
          "maxAppearances": 1,
          "minDay": 17,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 1,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "Face on the Moon",
          "weight": 5,
        },
        {
          "automatic": true,
          "automaticOutcome": {
            "effects": {
              "terminal": "sunk",
            },
            "message": "The boat collapses beneath you.",
            "weight": 1,
          },
          "cooldownDays": 0,
          "cue": "sinking",
          "dangerMin": 0,
          "id": "broken-boat",
          "maxAppearances": 0,
          "minDay": 0,
          "phase": "night",
          "prompt": "Choose a response.",
          "selectable": false,
          "sourceId": "events",
          "sourceNote": "This event uses its documented hull threshold roll instead of weighted event selection.",
          "title": "Broken Boat",
          "trigger": {
            "chancePercentBase": 100,
            "max": 10,
            "resource": "hull",
          },
          "weight": 0,
        },
        {
          "choices": [
            {
              "id": "telescope",
              "itemId": "telescope",
              "label": "Trade telescope",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "telescope",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "flashlight",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "flashlight",
              },
            },
            {
              "id": "flashlight",
              "itemId": "flashlight",
              "label": "Trade flashlight",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "flashlight",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "telescope",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "telescope",
              },
            },
            {
              "id": "flareGun",
              "itemId": "flareGun",
              "label": "Trade flareGun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "flareGun",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "harpoonGun",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "harpoonGun",
              },
            },
            {
              "id": "harpoonGun",
              "itemId": "harpoonGun",
              "label": "Trade harpoonGun",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "harpoonGun",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "flareGun",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "flareGun",
              },
            },
            {
              "id": "scubaSet",
              "itemId": "scubaSet",
              "label": "Trade scubaSet",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "scubaSet",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "medicalKit",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "medicalKit",
              },
            },
            {
              "id": "medicalKit",
              "itemId": "medicalKit",
              "label": "Trade medicalKit",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "medicalKit",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "scubaSet",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "scubaSet",
              },
            },
            {
              "id": "fishingNet",
              "itemId": "fishingNet",
              "label": "Trade fishingNet",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "fishingNet",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "bucket",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "bucket",
              },
            },
            {
              "id": "bucket",
              "itemId": "bucket",
              "label": "Trade bucket",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "bucket",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "fishingNet",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "fishingNet",
              },
            },
            {
              "id": "ductTape",
              "itemId": "ductTape",
              "label": "Trade ductTape",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "ductTape",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "energyBar",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "energyBar",
              },
            },
            {
              "id": "energyBar",
              "itemId": "energyBar",
              "label": "Trade energyBar",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "energyBar",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "ductTape",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "ductTape",
              },
            },
            {
              "id": "chest",
              "itemId": "chest",
              "label": "Trade chest",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "chest",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "anchor",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "anchor",
              },
            },
            {
              "id": "anchor",
              "itemId": "anchor",
              "label": "Trade anchor",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "itemId": "anchor",
                        "kind": "lose",
                        "quantity": 1,
                      },
                      {
                        "itemId": "chest",
                        "kind": "gain",
                        "quantity": 1,
                      },
                    ],
                  },
                  "message": "The hand accepts the trade.",
                  "weight": 1,
                },
              ],
              "trade": {
                "fallbackFood": 1,
                "receive": "chest",
              },
            },
            {
              "id": "invalid-trade",
              "itemId": "any",
              "label": "Offer another item",
              "outcomes": [
                {
                  "effects": {
                    "items": [
                      {
                        "kind": "loseEventTarget",
                        "quantity": 1,
                      },
                    ],
                    "resources": [
                      {
                        "operation": "add",
                        "resource": "food",
                        "value": 1,
                      },
                    ],
                  },
                  "message": "The hand returns food.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "touch",
              "label": "Touch the Hand",
              "outcomes": [
                {
                  "effects": {
                    "resources": [
                      {
                        "operation": "subtract",
                        "resource": "hull",
                        "value": {
                          "max": 60,
                          "min": 30,
                        },
                      },
                      {
                        "operation": "subtract",
                        "resource": "health",
                        "value": 70,
                      },
                    ],
                  },
                  "message": "The hand lashes out.",
                  "weight": 1,
                },
              ],
            },
            {
              "id": "sleep",
              "label": "Sleep",
              "outcomes": [
                {
                  "effects": {},
                  "message": "Nothing happens.",
                  "weight": 1,
                },
              ],
            },
          ],
          "cooldownDays": 50,
          "cue": "sighting",
          "dangerMin": 2,
          "id": "the-handyman",
          "maxAppearances": 1,
          "minDay": 20,
          "phase": "night",
          "prompt": "Choose a response.",
          "routeWeightBonuses": {
            "left": 8,
          },
          "selectable": true,
          "sourceId": "events",
          "title": "The Handyman",
          "weight": 12,
        },
      ]
    `);
  });

  it('records every documented selection boundary and source ID', () => {
    expect(CANONICAL_EVENTS.map(metadata)).toEqual([
      { id: 'peaceful-night', sourceId: 'events', weight: 75, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'shower-night', sourceId: 'events', weight: 35, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'windy-night', sourceId: 'events', weight: 40, minDay: 2, maxDay: undefined, cooldownDays: 40, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'bad-sleep', sourceId: 'events', weight: 40, minDay: 2, maxDay: 10, cooldownDays: 40, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'thunderstorm', sourceId: 'events', weight: 40, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'check-the-back', sourceId: 'events', weight: 35, minDay: 2, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'dangerous-waters', sourceId: 'events', weight: 15, minDay: 2, maxDay: 30, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: { right: 25 }, selectable: true },
      { id: 'needs-direction', sourceId: 'events', weight: 33, minDay: 2, maxDay: 24, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'restless-waves', sourceId: 'events', weight: 30, minDay: 3, maxDay: undefined, cooldownDays: 35, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'leak', sourceId: 'events', weight: 10, minDay: 4, maxDay: undefined, cooldownDays: 0, maxAppearances: 1, dangerMin: 0, routeWeightBonuses: undefined, selectable: true },
      { id: 'man-in-the-fog', sourceId: 'events', weight: 18, minDay: 6, maxDay: undefined, cooldownDays: 40, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: undefined, selectable: true },
      { id: 'mystery-chest', sourceId: 'events', weight: 45, minDay: 6, maxDay: undefined, cooldownDays: 33, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 5 }, selectable: true },
      { id: 'seagull', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'midnight-tour', sourceId: 'events', weight: 22, minDay: 7, maxDay: 40, cooldownDays: 30, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 8 }, selectable: true },
      { id: 'ghosts', sourceId: 'events', weight: 25, minDay: 8, maxDay: undefined, cooldownDays: 38, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 3 }, selectable: true },
      { id: 'school-of-fish', sourceId: 'events', weight: 66, minDay: 8, maxDay: undefined, cooldownDays: 39, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { right: 5 }, selectable: true },
      { id: 'snatcher', sourceId: 'events', weight: 28, minDay: 8, maxDay: undefined, cooldownDays: 45, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 5 }, selectable: true },
      { id: 'chest-attack', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'death-stare', sourceId: 'events', weight: 160, minDay: 9, maxDay: undefined, cooldownDays: 32, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: undefined, selectable: true },
      { id: 'swarm-of-anglerfish', sourceId: 'events', weight: 12, minDay: 10, maxDay: undefined, cooldownDays: 38, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 4 }, selectable: true },
      { id: 'whirlpool', sourceId: 'events', weight: 5, minDay: 12, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 1, routeWeightBonuses: { left: 1 }, selectable: true },
      { id: 'eerie-melody', sourceId: 'events', weight: 19, minDay: 13, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { right: 7 }, selectable: true },
      { id: 'shark-men', sourceId: 'events', weight: 15, minDay: 15, maxDay: undefined, cooldownDays: 30, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { left: 5 }, selectable: true },
      { id: 'face-on-the-moon', sourceId: 'events', weight: 5, minDay: 17, maxDay: undefined, cooldownDays: 50, maxAppearances: 1, dangerMin: 3, routeWeightBonuses: { left: 1 }, selectable: true },
      { id: 'broken-boat', sourceId: 'events', weight: 0, minDay: 0, maxDay: undefined, cooldownDays: 0, maxAppearances: 0, dangerMin: 0, routeWeightBonuses: undefined, selectable: false },
      { id: 'the-handyman', sourceId: 'events', weight: 12, minDay: 20, maxDay: undefined, cooldownDays: 50, maxAppearances: 1, dangerMin: 2, routeWeightBonuses: { left: 8 }, selectable: true },
    ]);
  });

  it('uses the exact canonical choice IDs and stable item IDs for every event', () => {
    expect(Object.fromEntries(CANONICAL_EVENTS.map((entry) => [
      entry.id,
      entry.automatic ? [] : entry.choices.map(({ id, itemId }) => [id, itemId]),
    ]))).toEqual({
      'peaceful-night': [['sleep', undefined]],
      'shower-night': [['bucket', 'bucket'], ['umbrella', 'umbrella'], ['map', 'map'], ['sleep', undefined]],
      'windy-night': [['fishingNet', 'fishingNet'], ['map', 'map'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      'bad-sleep': [['bucket', 'bucket'], ['flashlight', 'flashlight'], ['swimRing', 'swimRing'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      thunderstorm: [['anchor', 'anchor'], ['bucket', 'bucket'], ['umbrella', 'umbrella'], ['sleep', undefined]],
      'check-the-back': [['yes', undefined], ['no', undefined]],
      'dangerous-waters': [['map', 'map'], ['compass', 'compass'], ['sleep', undefined]],
      'needs-direction': [['left', undefined], ['right', undefined]],
      'restless-waves': [['anchor', 'anchor'], ['swimRing', 'swimRing'], ['sleep', undefined]],
      leak: [['ductTape', 'ductTape'], ['bucket', 'bucket'], ['map', 'map'], ['sleep', undefined]],
      'man-in-the-fog': [['compass', 'compass'], ['telescope', 'telescope'], ['flashlight', 'flashlight'], ['sleep', undefined]],
      'mystery-chest': [['yes', undefined], ['no', undefined]],
      seagull: [['shoo', undefined], ['cannedFood', 'cannedFood']],
      'midnight-tour': [['yes', undefined], ['no', undefined]],
      ghosts: [['flareGun', 'flareGun'], ['flashlight', 'flashlight'], ['sleep', undefined]],
      'school-of-fish': [['fishingNet', 'fishingNet'], ['bucket', 'bucket'], ['telescope', 'telescope'], ['sleep', undefined]],
      snatcher: [['telescope', 'telescope'], ['swimRing', 'swimRing'], ['fishingNet', 'fishingNet'], ['harpoonGun', 'harpoonGun'], ['sleep', undefined]],
      'chest-attack': [['fishingNet', 'fishingNet'], ['touch', undefined], ['sleep', undefined]],
      'death-stare': [['flashlight', 'flashlight'], ['umbrella', 'umbrella'], ['cannedFood', 'cannedFood'], ['harpoonGun', 'harpoonGun'], ['fishingNet', 'fishingNet'], ['sleep', undefined]],
      'swarm-of-anglerfish': [['fishingNet', 'fishingNet'], ['harpoonGun', 'harpoonGun'], ['flashlight', 'flashlight'], ['baitTin', 'baitTin'], ['sleep', undefined]],
      whirlpool: [['anchor', 'anchor'], ['swimRing', 'swimRing'], ['sleep', undefined]],
      'eerie-melody': [['bucket', 'bucket'], ['telescope', 'telescope'], ['umbrella', 'umbrella'], ['ductTape', 'ductTape'], ['sleep', undefined]],
      'shark-men': [['harpoonGun', 'harpoonGun'], ['swimRing', 'swimRing'], ['scubaSet', 'scubaSet'], ['sleep', undefined]],
      'face-on-the-moon': [['umbrella', 'umbrella'], ['telescope', 'telescope'], ['sleep', undefined]],
      'broken-boat': [],
      'the-handyman': [
        ['telescope', 'telescope'], ['flashlight', 'flashlight'], ['flareGun', 'flareGun'],
        ['harpoonGun', 'harpoonGun'], ['scubaSet', 'scubaSet'], ['medicalKit', 'medicalKit'],
        ['fishingNet', 'fishingNet'], ['bucket', 'bucket'], ['ductTape', 'ductTape'],
        ['energyBar', 'energyBar'], ['chest', 'chest'], ['anchor', 'anchor'],
        ['invalid-trade', 'any'], ['touch', undefined], ['sleep', undefined],
      ],
    });
  });

  it('preserves the high-risk documented outcome values and mutations', () => {
    expect(choice('check-the-back', 'yes').outcomes).toMatchObject([
      { weight: 500, effects: { resources: [{ resource: 'food', operation: 'add', value: 1 }] } },
      { weight: 50, effects: {} }, { weight: 1, effects: {} },
    ]);
    expect(choice('dangerous-waters', 'map').outcomes).toMatchObject([{ weight: 80 }, { weight: 20 }]);
    expect(choice('dangerous-waters', 'compass').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('dangerous-waters', 'sleep').outcomes[0]?.effects.resources).toContainEqual({ resource: 'hull', operation: 'subtract', value: { min: 25, max: 45 } });
    expect(choice('mystery-chest', 'yes').outcomes).toMatchObject([
      { weight: 80, effects: { items: [{ kind: 'gain', itemId: 'chest', quantity: 1 }] } },
      { weight: 30, effects: { resources: [{ resource: 'health', operation: 'subtract', value: 25 }] } },
    ]);
    expect(choice('school-of-fish', 'fishingNet').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('school-of-fish', 'bucket').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('school-of-fish', 'telescope').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('death-stare', 'umbrella').outcomes).toMatchObject([{ weight: 40 }, { weight: 50 }]);
    expect(choice('death-stare', 'cannedFood').outcomes).toMatchObject([{ weight: 66 }, { weight: 33 }]);
    expect(choice('death-stare', 'sleep').outcomes).toMatchObject([{ weight: 5 }, { weight: 85 }]);
    expect(choice('whirlpool', 'anchor').outcomes).toMatchObject([{ weight: 90 }, { weight: 10 }]);
    expect(choice('whirlpool', 'swimRing').outcomes).toMatchObject([{ weight: 50 }, { weight: 50 }]);
    expect(choice('whirlpool', 'sleep').outcomes).toMatchObject([
      { weight: 80 },
      { weight: 30, effects: { items: [{ kind: 'loseRandom', quantity: 2 }] } },
    ]);
    expect(choice('eerie-melody', 'sleep').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('shark-men', 'swimRing').outcomes).toMatchObject([{ weight: 85 }, { weight: 35 }]);
    expect(choice('shark-men', 'scubaSet').outcomes).toMatchObject([{ weight: 70 }, { weight: 36 }]);
    expect(choice('shark-men', 'sleep').outcomes).toMatchObject([{ weight: 80 }, { weight: 20 }]);
    expect(choice('face-on-the-moon', 'telescope').outcomes).toMatchObject([{ weight: 60 }, { weight: 40 }]);
    expect(choice('face-on-the-moon', 'sleep').outcomes).toMatchObject([{ weight: 100 }, { weight: 20 }]);
  });

  it('models dormant, automatic, damage, and deterministic trade rules without invented weights', () => {
    expect(event('seagull')).toMatchObject({ selectable: false, weight: 0, sourceNote: expect.stringMatching(/undocumented/i) });
    expect(event('chest-attack')).toMatchObject({
      selectable: false,
      weight: 0,
      sourceNote: expect.stringMatching(/undocumented/i),
      trigger: { itemId: 'chest', minAgeDays: 2 },
    });
    expect(event('mystery-chest')).toMatchObject({ forbiddenItems: ['chest'] });
    expect(event('midnight-tour')).toMatchObject({ forbiddenItems: ['chest'] });
    expect(event('broken-boat')).toMatchObject({
      selectable: false,
      automatic: true,
      trigger: { resource: 'hull', max: 10, chancePercentBase: 100 },
      automaticOutcome: { effects: { terminal: 'sunk' } },
    });
    expect(event('peaceful-night')).toMatchObject({
      normalizationNote: expect.stringMatching(/synthetic.*sleep.*no-choice/i),
    });
    expect(eventDamageMultiplier('night', 49)).toBe(1);
    expect(eventDamageMultiplier('night', 50)).toBe(2);
    expect(eventDamageMultiplier('day', 99)).toBe(1);

    const handyman = event('the-handyman');
    if (handyman.automatic) throw new Error('handyman must use choices');
    expect(handyman.choices.filter(({ trade }) => trade).map(({ itemId, trade }) => [itemId, trade])).toEqual([
      ['telescope', { receive: 'flashlight', fallbackFood: 1 }],
      ['flashlight', { receive: 'telescope', fallbackFood: 1 }],
      ['flareGun', { receive: 'harpoonGun', fallbackFood: 1 }],
      ['harpoonGun', { receive: 'flareGun', fallbackFood: 1 }],
      ['scubaSet', { receive: 'medicalKit', fallbackFood: 1 }],
      ['medicalKit', { receive: 'scubaSet', fallbackFood: 1 }],
      ['fishingNet', { receive: 'bucket', fallbackFood: 1 }],
      ['bucket', { receive: 'fishingNet', fallbackFood: 1 }],
      ['ductTape', { receive: 'energyBar', fallbackFood: 1 }],
      ['energyBar', { receive: 'ductTape', fallbackFood: 1 }],
      ['chest', { receive: 'anchor', fallbackFood: 1 }],
      ['anchor', { receive: 'chest', fallbackFood: 1 }],
    ]);
    expect(handyman.choices.filter(({ trade }) => trade).every(({ outcomes }) =>
      outcomes[0]?.effects.items?.[0]?.kind === 'lose')).toBe(true);
    expect(choice('the-handyman', 'invalid-trade').outcomes[0]?.effects.items).toEqual([
      { kind: 'loseEventTarget', quantity: 1 },
    ]);
    expect(choice('the-handyman', 'invalid-trade').outcomes[0]?.effects.resources).toEqual([
      { resource: 'food', operation: 'add', value: 1 },
    ]);
  });
});

describe('canonical event validation and audit', () => {
  it('rejects unknown item IDs, empty ordinary choices, and incomplete automatic events', () => {
    const base = event('shower-night');
    expect(() => validateCanonicalEvents([{ ...base, choices: [] } as unknown as CanonicalEventDefinition]))
      .toThrow(/choices.*empty/i);
    expect(() => validateCanonicalEvents([{ ...base, choices: [{ ...choice('shower-night', 'bucket'), itemId: 'unknown' }] } as unknown as CanonicalEventDefinition]))
      .toThrow(/unknown item/i);
    expect(() => validateCanonicalEvents([{ ...event('broken-boat'), automaticOutcome: undefined } as unknown as CanonicalEventDefinition]))
      .toThrow(/terminal outcome/i);
    expect(() => validateCanonicalEvents([{
      ...event('broken-boat'), choices: [choice('shower-night', 'bucket')],
    } as unknown as CanonicalEventDefinition])).toThrow(/automatic.*no choices/i);
  });

  it('validates common references and trigger-only automatic invariants before branching', () => {
    const brokenBoat = event('broken-boat');
    expect(() => validateCanonicalEvents([{
      ...brokenBoat, requiredItems: ['unknown'],
    } as unknown as CanonicalEventDefinition])).toThrow(/unknown item/i);
    expect(() => validateCanonicalEvents([{
      ...brokenBoat,
      requiredAnyAssets: [{ kind: 'resource', resource: 'unknown', min: 1 }],
    } as unknown as CanonicalEventDefinition])).toThrow(/unknown resource/i);
    expect(() => validateCanonicalEvents([{
      ...brokenBoat, selectable: true,
    } as unknown as CanonicalEventDefinition])).toThrow(/automatic.*non-selectable/i);
    expect(() => validateCanonicalEvents([{
      ...brokenBoat, weight: 1,
    } as unknown as CanonicalEventDefinition])).toThrow(/automatic.*zero weight/i);
    const { trigger: _trigger, ...withoutTrigger } = brokenBoat;
    expect(() => validateCanonicalEvents([
      withoutTrigger as unknown as CanonicalEventDefinition,
    ])).toThrow(/automatic.*trigger/i);
    expect(() => validateCanonicalEvents([{
      ...brokenBoat, trigger: { resource: 'hull', max: 11, chancePercentBase: 100 },
    } as unknown as CanonicalEventDefinition])).toThrow(/automatic.*broken boat trigger/i);
  });

  it.each([
    ['minDay', -1],
    ['cooldownDays', -1],
    ['maxAppearances', -1],
    ['dangerMin', -1],
  ] as const)('rejects invalid %s values', (field, value) => {
    const base = event('shower-night');
    expect(() => validateCanonicalEvents([{
      ...base, [field]: value,
    } as unknown as CanonicalEventDefinition])).toThrow(new RegExp(field, 'i'));
  });

  it('rejects inverted day bounds and blank source/title/prompt text', () => {
    const base = event('shower-night');
    expect(() => validateCanonicalEvents([{
      ...base, minDay: 5, maxDay: 4,
    } as unknown as CanonicalEventDefinition])).toThrow(/day bounds/i);
    for (const field of ['sourceId', 'title', 'prompt'] as const) {
      expect(() => validateCanonicalEvents([{
        ...base, [field]: '   ',
      } as unknown as CanonicalEventDefinition])).toThrow(new RegExp(field, 'i'));
    }
  });

  it('rejects duplicate and blank choice IDs', () => {
    const base = event('shower-night');
    if (base.automatic) throw new Error('test fixture must use choices');
    expect(() => validateCanonicalEvents([{
      ...base,
      choices: [base.choices[0], { ...base.choices[1], id: base.choices[0].id }],
    } as unknown as CanonicalEventDefinition])).toThrow(/choice ID.*duplicated/i);
    expect(() => validateCanonicalEvents([{
      ...base, choices: [{ ...base.choices[0], id: '   ' }],
    } as unknown as CanonicalEventDefinition])).toThrow(/choice ID.*blank/i);
  });

  it('rejects invalid scalar resource values and inconsistent operations', () => {
    const base = event('shower-night');
    if (base.automatic) throw new Error('test fixture must use choices');
    const withResource = (resourceEffect: Record<string, unknown>) => ({
      ...base,
      choices: [{
        ...base.choices[0],
        outcomes: [{
          ...base.choices[0].outcomes[0],
          effects: { resources: [resourceEffect] },
        }],
      }],
    }) as unknown as CanonicalEventDefinition;

    for (const value of [Number.NaN, 1.5, -1]) {
      expect(() => validateCanonicalEvents([
        withResource({ resource: 'food', operation: 'add', value }),
      ])).toThrow(/resource value/i);
    }
    expect(() => validateCanonicalEvents([
      withResource({ resource: 'food', operation: 'multiply', value: 1 }),
    ])).toThrow(/resource operation/i);
    expect(() => validateCanonicalEvents([
      withResource({ resource: 'unknown', operation: 'add', value: 1 }),
    ])).toThrow(/unknown resource/i);
    expect(() => validateCanonicalEvents([
      withResource({ resource: 'food', operation: 'subtract', value: 0 }),
    ])).toThrow(/subtract.*positive/i);
  });

  it('classifies all included, story-excluded, and unsupported-undocumented events', () => {
    const eventAudit = PARITY_AUDIT.filter(({ kind }) => kind === 'event');
    expect(eventAudit.filter(({ classification }) => classification === 'included').map(({ runtimeId }) => runtimeId)).toEqual(includedIds);
    expect(eventAudit.filter(({ classification }) => classification === 'unsupported-undocumented').map(({ wikiName }) => wikiName)).toEqual([
      'Drifting Loot', 'Night Trader', 'Sleep Killer',
    ]);
    expect(eventAudit.filter(({ classification }) => classification === 'story-excluded').map(({ wikiName }) => wikiName)).toEqual([
      'Sinking Ship', 'Drifting Bottle', 'Flowers', 'Distant Ship/Airplane/Hope', 'Helicopter',
      'Red', 'Ghost Ship', 'Mirror', 'Kraken/The One', 'Found Land', 'Sick Companion',
      'Guarded Sleep', 'Shadow Figure', 'Sea Watcher',
    ]);
  });
});
