import type { Object3D } from 'three';
import type { EventPresentationKey } from './survivalTypes';

export type FeaturedEventId =
  | 'drifting-loot'
  | 'drifting-bottle'
  | 'check-the-back'
  | 'mystery-chest'
  | 'flowers';

export const FEATURED_EVENT_IDS: readonly FeaturedEventId[] = Object.freeze([
  'drifting-loot',
  'drifting-bottle',
  'check-the-back',
  'mystery-chest',
  'flowers',
]);

export function isFeaturedEventId(id: string): id is FeaturedEventId {
  return (FEATURED_EVENT_IDS as readonly string[]).includes(id);
}

export interface FeaturedEventPresentation {
  readonly root: Object3D;
  stage(variantSeed?: number): void;
  reveal(): Promise<void>;
  react(key: EventPresentationKey): Promise<void>;
  interactionRoot(): Object3D | null;
  resultRoot(): Object3D | null;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
