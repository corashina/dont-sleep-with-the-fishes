export interface KenneyPack {
  readonly version: string;
  readonly pageUrl: string;
  readonly archiveUrl: string;
  readonly sha256: string;
  readonly licenseUrl: string;
  readonly requiredEntries: readonly string[];
}

export interface DirectRecipe {
  readonly kind: 'direct';
  readonly pack: string;
  readonly entry: string;
  readonly expectedTriangles: number;
  readonly scale: readonly [number, number, number];
}

export interface CompositePart {
  readonly name: string;
  readonly pack: string;
  readonly entry: string;
  readonly translation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
  readonly rotation: readonly [number, number, number, number];
}

export interface CompositeRecipe {
  readonly kind: 'composite';
  readonly expectedTriangles: number;
  readonly parts: readonly CompositePart[];
}

export type KenneyItemRecipe = DirectRecipe | CompositeRecipe;

export interface BuildOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, KenneyItemRecipe>>;
}

export const KENNEY_PACKS: Readonly<Record<string, KenneyPack>>;
export const KENNEY_ITEM_RECIPES: Readonly<Record<string, KenneyItemRecipe>>;
export function buildKenneyItemModels(options: BuildOptions): Promise<void>;
