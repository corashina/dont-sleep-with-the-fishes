import type { PhysicsVector3 } from './PhysicsRuntime';

export type PhysicsObjectCollider =
  | { readonly kind: 'sphere'; readonly radius: number }
  | { readonly kind: 'cylinder'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'cuboid'; readonly halfExtents: PhysicsVector3 };

export interface PhysicsObjectBodyProfile {
  readonly collider: PhysicsObjectCollider;
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
}
