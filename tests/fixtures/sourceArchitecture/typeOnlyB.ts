import type { TypeOnlyA } from './typeOnlyA';

export interface TypeOnlyB {
  readonly dependency?: TypeOnlyA;
}
