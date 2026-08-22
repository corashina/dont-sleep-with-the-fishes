import type { Object3D } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { EventChoicePresentation } from './FocusedEventPresentation';
import type { SurvivalEventId } from './eventCatalog';
import type {
  EventPresentationContext,
  EventPresentationReaction,
} from './eventPresentationTypes';

export type {
  EventPresentationContext,
  EventPresentationReaction,
} from './eventPresentationTypes';

export interface EventPresentationRoot {
  readonly parent: Object3D;
  readonly root: Object3D;
}

export interface EventPresentationAdapter {
  readonly eventId: SurvivalEventId;
  readonly roots: readonly EventPresentationRoot[];
  stage(context: EventPresentationContext): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  itemAimTarget(): Object3D | null;
  interactionRoot(id: string): Object3D | null;
  resultRoot(id: string): Object3D | null;
  react(reaction: EventPresentationReaction): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}
