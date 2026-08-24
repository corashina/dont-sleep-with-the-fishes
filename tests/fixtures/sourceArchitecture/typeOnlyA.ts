import type { TypeOnlyB } from './typeOnlyB';

export interface TypeOnlyA {
  readonly dependency?: TypeOnlyB;
}
