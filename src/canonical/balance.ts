import { WIKI_SOURCES } from './sources';
import { source, type Sourced } from './types';

export interface CanonicalStartingBalance {
  health: Sourced<number>;
  hunger: Sourced<number>;
  energy: Sourced<number>;
  hull: Sourced<number>;
}

const PRESERVED_BALANCE = 'preserved:pre-parity-survival-balance';

export const CANONICAL_SURVIVAL_BALANCE: Readonly<{ start: CanonicalStartingBalance }> = {
  start: {
    health: source(100, 'wiki', WIKI_SOURCES.home.url, 'The wiki documents exact player health.'),
    hunger: source(20, 'preserved', PRESERVED_BALANCE),
    energy: source(4, 'preserved', PRESERVED_BALANCE),
    hull: source(100, 'wiki', WIKI_SOURCES.home.url, 'The wiki documents exact boat health.'),
  },
};
