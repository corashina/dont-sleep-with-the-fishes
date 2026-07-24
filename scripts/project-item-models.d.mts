export type AuthoredShape =
  | 'box'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'tubePath'
  | 'polygon'
  | 'torusArc';

export type Vector2 = readonly [number, number];
export type Vector3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];
export type Color = readonly [number, number, number, number];

interface AuthoredPartBase {
  readonly name: string;
  readonly translation: Vector3;
  readonly rotation: Quaternion;
  readonly color: Color;
}

export interface SolidAuthoredPart extends AuthoredPartBase {
  readonly shape: 'box' | 'cylinder' | 'cone' | 'torus';
  readonly size: Vector3;
  readonly segments?: number;
}

export interface TubePathAuthoredPart extends AuthoredPartBase {
  readonly shape: 'tubePath';
  readonly points: readonly Vector3[];
  readonly radius: number;
  readonly radialSegments?: number;
}

export interface PolygonAuthoredPart extends AuthoredPartBase {
  readonly shape: 'polygon';
  readonly points: readonly Vector2[];
  readonly height: number;
}

export interface TorusArcAuthoredPart extends AuthoredPartBase {
  readonly shape: 'torusArc';
  readonly size: Vector3;
  readonly arcStart: number;
  readonly arcLength: number;
  readonly segments?: number;
  readonly role?: 'orange-body' | 'white-band';
}

export type AuthoredPart =
  | SolidAuthoredPart
  | TubePathAuthoredPart
  | PolygonAuthoredPart
  | TorusArcAuthoredPart;

export interface AuthoredRecipe {
  readonly parts: readonly AuthoredPart[];
}

export interface AuthoredRecipeInput {
  readonly parts: readonly {
    readonly name: string;
    readonly shape: string;
    readonly size?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly color?: readonly number[];
    readonly segments?: number;
    readonly points?: readonly (readonly number[])[];
    readonly radius?: number;
    readonly radialSegments?: number;
    readonly height?: number;
    readonly arcStart?: number;
    readonly arcLength?: number;
    readonly role?: string;
  }[];
}

export interface BuildProjectItemModelsOptions {
  readonly outputRoot: string;
  readonly recipes?: Readonly<Record<string, AuthoredRecipeInput>>;
}

export const PROJECT_ITEM_IDS: readonly [
  'map', 'spyglass', 'fishingNet', 'umbrella', 'swimRing', 'harpoonGun', 'energyBar',
];
export const PROJECT_ITEM_RECIPE_VERSION: 2;
export const PROJECT_ITEM_RECIPES: Readonly<Record<typeof PROJECT_ITEM_IDS[number], AuthoredRecipe>>;
export function buildProjectItemModels(options: BuildProjectItemModelsOptions): Promise<void>;
