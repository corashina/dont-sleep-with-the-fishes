export interface QuaterniusPack {
  readonly version: string;
  readonly pageUrl: string;
  readonly sha256: string;
  readonly licenseUrl: string;
  readonly requiredEntries: readonly string[];
}

export interface QuaterniusMaterialOverride {
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
}

export interface QuaterniusItemRecipe {
  readonly pack: string;
  readonly obj: string;
  readonly mtl: string;
  readonly expectedTriangles: number;
  readonly materialOverrides?: Readonly<Record<string, QuaterniusMaterialOverride>>;
}

export interface BuildQuaterniusItemModelsOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, QuaterniusItemRecipe>>;
}

export const QUATERNIUS_PACKS: Readonly<Record<string, QuaterniusPack>>;
export const QUATERNIUS_ITEM_RECIPES: Readonly<Record<string, QuaterniusItemRecipe>>;
export function buildQuaterniusItemModels(options: BuildQuaterniusItemModelsOptions): Promise<void>;
