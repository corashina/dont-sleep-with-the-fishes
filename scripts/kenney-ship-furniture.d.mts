export interface KenneyShipFurniturePack {
  readonly version: string;
  readonly pageUrl: string;
  readonly archiveUrl: string;
  readonly sha256: string;
  readonly licenseUrl: string;
  readonly requiredEntries: readonly string[];
}

export interface KenneyShipFurnitureRecipe {
  readonly entry: string;
  readonly expectedTriangles: number;
}

export interface BuildKenneyShipFurnitureOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, KenneyShipFurnitureRecipe>>;
}

export const KENNEY_SHIP_FURNITURE_PACK: KenneyShipFurniturePack;
export const KENNEY_SHIP_FURNITURE_RECIPES: Readonly<
  Record<string, KenneyShipFurnitureRecipe>
>;
export function buildKenneyShipFurniture(
  options: BuildKenneyShipFurnitureOptions,
): Promise<void>;
