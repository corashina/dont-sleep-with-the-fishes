import { settingsText } from '../i18n/settingsMessages';
import type { AmbientOcclusionQuality, PostProcessingControls } from '../rendering/postProcessingControls';
import { QualityControl } from './QualityControl';

export class AmbientOcclusionQualityControl extends QualityControl<'off' | AmbientOcclusionQuality> {
  constructor(private readonly controls: PostProcessingControls) {
    super({
      get: () => {
        const state = controls.getState();
        return state.ambientOcclusionMode === 'off' ? 'off' : state.ambientOcclusionQuality;
      },
      set: (value) => {
        if (value !== 'off') controls.setAmbientOcclusionQuality(value);
        controls.setAmbientOcclusionMode(value === 'off' ? 'off' : 'composite');
      },
    }, {
      kind: 'ambient-occlusion',
      get label() { return settingsText('ao'); },
      choices: [
        { value: 'off', get label() { return settingsText('off'); } },
        { value: 'low', get label() { return settingsText('low'); } },
        { value: 'high', get label() { return settingsText('high'); } },
      ],
    });
    this.refresh();
  }

  refresh(): void {
    this.element.disabled = !this.controls.getState().ambientOcclusionAvailable;
    this.element.title = this.element.disabled ? settingsText('unavailable') : '';
    this.sync();
  }
}
