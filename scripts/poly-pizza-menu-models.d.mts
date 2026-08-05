export interface MenuModelSource {
  readonly id: string;
  readonly publicId: string;
  readonly resourceId: string;
  readonly pageUrl: string;
  readonly downloadUrl: string;
  readonly sourceAssetId: string;
  readonly title: string;
  readonly creator: string;
  readonly license: 'CC0 1.0' | 'CC-BY 3.0';
  readonly licenseUrl: string;
  readonly sha256: string;
  readonly committedSha256: string;
  readonly sourceTriangles: number;
  readonly downloadedOn: string;
  readonly maxTriangles: number;
}

export type MenuModelId =
  | 'boat'
  | 'rockA'
  | 'rockB'
  | 'rockC'
  | 'fishBone'
  | 'skull'
  | 'largeBone'
  | 'shark';

export const POLY_PIZZA_MENU_MODEL_IDS: readonly MenuModelId[];
export const POLY_PIZZA_MENU_MODEL_SOURCES:
  Readonly<Record<MenuModelId, MenuModelSource>>;
export function buildPolyPizzaMenuModels(options: {
  sourceRoot: string;
  outputRoot: string;
  verifySource?: boolean;
}): Promise<Record<string, unknown>>;
