import type { Phase } from './phases';

// Canonical home of ResourceKey to avoid a GameState <-> EventBus import cycle.
export type ResourceKey = 'hunger' | 'hull' | 'health' | 'morale' | 'energy';

export type GameEvent =
  | { type: 'phaseChange'; phase: Phase }
  | { type: 'resourceChange'; resource: ResourceKey }
  | { type: 'inventoryChange' }
  | { type: 'message'; text: string };

export type GameEventType = GameEvent['type'];

type Handler<E extends GameEvent> = (e: E) => void;

export class EventBus {
  private handlers: Map<GameEventType, Set<Handler<any>>> = new Map();

  on<T extends GameEvent>(type: T['type'], handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<E extends GameEvent>(e: E): void {
    this.handlers.get(e.type)?.forEach((h) => h(e));
  }
}
