export interface ItemDef {
  id: string;
  name: string;
  mesh: string;
  stackable?: boolean;
  flags?: string[];
}

export const ITEMS: Record<string, ItemDef> = {
  anchor:      { id: 'anchor',      name: 'Anchor',      mesh: 'anchor' },
  flareGun:    { id: 'flareGun',    name: 'Flare Gun',   mesh: 'flare',  flags: ['rescue'] },
  flashlight:  { id: 'flashlight',  name: 'Flashlight',  mesh: 'flashlight' },
  ductTape:    { id: 'ductTape',    name: 'Duct Tape',   mesh: 'tape' },
  bucket:      { id: 'bucket',      name: 'Bucket',      mesh: 'bucket' },
  bait:        { id: 'bait',        name: 'Bait',        mesh: 'bait' },
  fishingRod:  { id: 'fishingRod',  name: 'Fishing Rod', mesh: 'rod' },
  firstAidKit: { id: 'firstAidKit', name: 'First Aid Kit', mesh: 'aid' },
  harpoonGun:  { id: 'harpoonGun',  name: 'Harpoon Gun', mesh: 'harpoon' },
  spyglass:    { id: 'spyglass',    name: 'Spyglass',    mesh: 'spyglass' },
  food:        { id: 'food',        name: 'Food',        mesh: 'food', stackable: true },
};

export const SCAVENGE_POOL: string[] = [
  'anchor', 'flareGun', 'flashlight', 'ductTape', 'bucket',
  'bait', 'fishingRod', 'firstAidKit', 'harpoonGun', 'spyglass',
];
