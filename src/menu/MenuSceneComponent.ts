import type { Group } from 'three';

export interface MenuSceneComponent {
  readonly root: Group;
  dispose(): void;
}
