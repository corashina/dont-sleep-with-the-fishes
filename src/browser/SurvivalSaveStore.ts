import type { SurvivalRunCheckpoint } from '../survival/SurvivalCheckpoint';
import {
  createSurvivalSaveDocument,
  parseSurvivalSaveDocument,
} from '../survival/SurvivalSaveData';

export const SURVIVAL_SAVE_ENABLED_KEY = 'dont-sleep-with-the-fishes.save.enabled';
export const SURVIVAL_SAVE_DATA_KEY = 'dont-sleep-with-the-fishes.save.v1';

export type SurvivalSaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SurvivalSaveState {
  readonly enabled: boolean;
  readonly checkpoint: SurvivalRunCheckpoint | null;
}

export class SurvivalSaveStore {
  private enabled = false;
  private checkpoint: SurvivalRunCheckpoint | null = null;

  constructor(private readonly storage: SurvivalSaveStorage | null) {
    this.load();
  }

  getState(): SurvivalSaveState {
    return Object.freeze({ enabled: this.enabled, checkpoint: this.checkpoint });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try { this.storage?.setItem(SURVIVAL_SAVE_ENABLED_KEY, String(enabled)); } catch {}
    if (!enabled) this.clearCheckpoint();
  }

  writeCheckpoint(checkpoint: SurvivalRunCheckpoint): void {
    if (!this.enabled) return;
    const document = createSurvivalSaveDocument(checkpoint);
    try {
      this.storage?.setItem(SURVIVAL_SAVE_DATA_KEY, JSON.stringify(document));
      this.checkpoint = document.checkpoint;
    } catch {
      if (this.storage === null) this.checkpoint = document.checkpoint;
    }
  }

  clearCheckpoint(): void {
    this.checkpoint = null;
    try { this.storage?.removeItem(SURVIVAL_SAVE_DATA_KEY); } catch {}
  }

  private load(): void {
    try {
      this.enabled = this.storage?.getItem(SURVIVAL_SAVE_ENABLED_KEY) === 'true';
    } catch {
      this.enabled = false;
      return;
    }
    if (!this.enabled) {
      this.clearCheckpoint();
      return;
    }
    let saved: string | null = null;
    try { saved = this.storage?.getItem(SURVIVAL_SAVE_DATA_KEY) ?? null; } catch { return; }
    if (saved === null) return;
    try {
      const document = parseSurvivalSaveDocument(JSON.parse(saved));
      if (document === null) this.clearCheckpoint();
      else this.checkpoint = document.checkpoint;
    } catch {
      this.clearCheckpoint();
    }
  }
}
