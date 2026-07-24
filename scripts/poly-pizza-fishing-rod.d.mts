export interface PolyPizzaFishingRodDescriptor {
  readonly pageUrl: string;
  readonly downloadUrl: string;
  readonly sourceAssetId: string;
  readonly creator: string;
  readonly licenseUrl: string;
  readonly sha256: string;
  readonly sourceTriangles: number;
  readonly simplifyRatio: number;
  readonly simplifyError: number;
}

export interface BuildPolyPizzaFishingRodOptions {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly descriptor?: PolyPizzaFishingRodDescriptor;
  readonly verifySource?: boolean;
}

export const POLY_PIZZA_FISHING_ROD: Readonly<PolyPizzaFishingRodDescriptor>;

export function buildPolyPizzaFishingRod(
  options: BuildPolyPizzaFishingRodOptions,
): Promise<{
  readonly sha256: string;
  readonly sourceTriangles: number;
  readonly triangles: number;
}>;
