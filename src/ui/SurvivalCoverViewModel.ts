import type { RewardSummary } from '../survival/survivalTypes';

export type SleepCoverProfile = 'solid' | 'dive' | 'midnight-tour' | 'midnight-attack';

export interface RewardResultView {
  readonly title: 'DIVE RESULT' | 'CHEST REWARD' | 'LIFEBOAT SUPPLY';
  readonly reward: RewardSummary | null;
  readonly lines: readonly string[];
}
