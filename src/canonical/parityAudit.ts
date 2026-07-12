import type { RuntimeItemId } from './items';

export type ParityClassification =
  | 'included' | 'story-excluded' | 'unsupported-undocumented' | 'preserved';

export interface ParityAuditEntry {
  kind: 'item' | 'event';
  wikiName: string;
  classification: ParityClassification;
  reason: string;
  runtimeId?: RuntimeItemId | string;
}

const included = (wikiName: string, runtimeId: RuntimeItemId, reason: string): ParityAuditEntry => ({
  kind: 'item', wikiName, runtimeId, classification: 'included', reason,
});
const storyExcluded = (wikiName: string): ParityAuditEntry => ({
  kind: 'item', wikiName, classification: 'story-excluded',
  reason: 'Excluded because its only documented purpose belongs to the out-of-scope story path.',
});
const eventEntry = (
  wikiName: string,
  classification: Extract<ParityClassification, 'included' | 'story-excluded' | 'unsupported-undocumented'>,
  runtimeId?: string,
): ParityAuditEntry => ({
  kind: 'event', wikiName, classification, ...(runtimeId ? { runtimeId } : {}),
  reason: classification === 'included'
    ? 'Included as an in-scope ordinary survival event from the canonical Events page.'
    : classification === 'story-excluded'
      ? 'Excluded because it requires story state, an ending, or an out-of-scope crewmate.'
      : 'Not implemented because the canonical page does not document enough behavior to reproduce it.',
});

export const PARITY_AUDIT: readonly ParityAuditEntry[] = [
  included('Food', 'cannedFood', 'Included as the practical ship food supply.'),
  included('Bait', 'baitTin', 'Included as the practical fishing resource.'),
  included('Duct Tape', 'ductTape', 'Included for documented repairs and event responses.'),
  included('Compass', 'compass', 'Included for ordinary navigation event responses.'),
  included('Map', 'map', 'Included for ordinary navigation event responses.'),
  included('Medkit', 'medicalKit', 'Included for ordinary injury treatment.'),
  included('Spyglass', 'telescope', 'Included under the stable internal telescope ID.'),
  included('Fishing Net', 'fishingNet', 'Included for ordinary fishing event responses.'),
  included('Bucket', 'bucket', 'Included for ordinary fishing and boat event responses.'),
  included('Flare Gun', 'flareGun', 'Included for ordinary signaling and threat responses.'),
  included('Scuba Gear', 'scubaSet', 'Included under the stable internal scuba-set ID.'),
  included('Anchor', 'anchor', 'Included for ordinary rough-water event responses.'),
  storyExcluded('Bottled Paper'),
  included('Umbrella', 'umbrella', 'Included for ordinary weather event responses.'),
  included('Swim Ring', 'swimRing', 'Included for ordinary water-hazard responses.'),
  included('Flashlight', 'flashlight', 'Included for ordinary darkness and inspection responses.'),
  included('Harpoon Gun', 'harpoonGun', 'Included for ordinary threat responses.'),
  included('Energy Bar', 'energyBar', 'Included as a practical one-use energy supply.'),
  included('Repair Kit', 'repairKit', 'Included as equipment built into the lifeboat.'),
  included('Fishing Rod', 'fishingRod', 'Included for the ordinary fishing action.'),
  storyExcluded('Heart Piece 1'),
  storyExcluded('Heart Piece 2'),
  storyExcluded('Heart Piece 3'),
  storyExcluded('Heart of the Sea'),
  included('Chest', 'chest', 'Included as an ordinary recoverable supply cache.'),
  storyExcluded('Yellow Flower'),
  {
    kind: 'item', wikiName: 'White Flower', classification: 'unsupported-undocumented',
    reason: 'The wiki documents acquisition but no gameplay use to implement.',
  },
  {
    kind: 'item', wikiName: 'Water Jug', runtimeId: 'waterJug', classification: 'preserved',
    reason: 'Preserved for the current hunger and rest loop because the wiki has no equivalent numeric water rule.',
  },
  ...[
    ['Peaceful Night', 'peaceful-night'], ['Shower Night', 'shower-night'],
    ['Windy Night', 'windy-night'], ['Bad Sleep', 'bad-sleep'],
    ['Thunderstorm', 'thunderstorm'], ['Check the Back', 'check-the-back'],
    ['Dangerous Waters', 'dangerous-waters'], ['Needs Direction', 'needs-direction'],
    ['Restless Waves', 'restless-waves'], ['Leak', 'leak'],
    ['Man in the Fog', 'man-in-the-fog'], ['Mystery Chest', 'mystery-chest'],
    ['Seagull', 'seagull'], ['Midnight Tour', 'midnight-tour'], ['Ghosts', 'ghosts'],
    ['School of Fish', 'school-of-fish'], ['Snatcher', 'snatcher'],
    ['Chest left unopened', 'chest-attack'], ['Death Stare', 'death-stare'],
    ['Swarm of Anglerfish', 'swarm-of-anglerfish'], ['Whirlpool', 'whirlpool'],
    ['Eerie Melody', 'eerie-melody'], ['Shark Men', 'shark-men'],
    ['Face on the Moon', 'face-on-the-moon'], ['Broken Boat', 'broken-boat'],
    ['The Handyman', 'the-handyman'],
  ].map(([wikiName, runtimeId]) => eventEntry(wikiName!, 'included', runtimeId)),
  ...[
    'Sinking Ship', 'Drifting Bottle', 'Flowers', 'Distant Ship/Airplane/Hope',
    'Helicopter', 'Red', 'Ghost Ship', 'Mirror', 'Kraken/The One', 'Found Land',
    'Sick Companion', 'Guarded Sleep', 'Shadow Figure', 'Sea Watcher',
  ].map((wikiName) => eventEntry(wikiName, 'story-excluded')),
  ...['Drifting Loot', 'Night Trader', 'Sleep Killer']
    .map((wikiName) => eventEntry(wikiName, 'unsupported-undocumented')),
];
