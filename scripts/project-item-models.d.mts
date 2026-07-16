export type AuthoredShape = 'box' | 'cylinder' | 'cone' | 'torus';

export interface AuthoredPart {
  readonly name: string;
  readonly shape: AuthoredShape;
  readonly size: readonly [number, number, number];
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly color: readonly [number, number, number, number];
  readonly segments?: number;
}

export interface AuthoredRecipe {
  readonly parts: readonly AuthoredPart[];
}

export interface BuildProjectItemModelsOptions {
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, AuthoredRecipe>>;
}

export const PROJECT_ITEM_IDS: readonly [
  'compass', 'map', 'spyglass', 'fishingNet', 'flareGun',
  'anchor', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
];
export const PROJECT_ITEM_RECIPES: Readonly<Record<typeof PROJECT_ITEM_IDS[number], AuthoredRecipe>>;
export function buildProjectItemModels(options: BuildProjectItemModelsOptions): Promise<void>;
