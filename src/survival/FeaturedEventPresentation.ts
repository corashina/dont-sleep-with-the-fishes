import type { Object3D } from 'three';
import type { EventPresentationKey } from './survivalTypes';

export interface FeaturedEventPresentation {
  readonly root: Object3D;
  stage(variantSeed?: number): void;
  reveal(): Promise<void>;
  react(key: EventPresentationKey): Promise<void>;
  itemAimTarget(): Object3D | null;
  interactionRoot(): Object3D | null;
  resultRoot(): Object3D | null;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
