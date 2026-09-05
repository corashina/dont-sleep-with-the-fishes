import { settingsText } from '../i18n/settingsMessages';
import {
  type VisualQuality,
  type VisualQualityPreference,
} from '../rendering/visualQuality';
import { QualityControl } from './QualityControl';

export class VisualQualityControl extends QualityControl<VisualQuality> {
  constructor(preference: VisualQualityPreference) {
    super(preference, {
      kind: 'visual',
      get label() { return settingsText('visualQuality'); },
      choices: [
        { value: 'low', get label() { return settingsText('low'); } },
        { value: 'medium', get label() { return settingsText('medium'); } },
        { value: 'high', get label() { return settingsText('high'); } },
      ],
    });
  }
}
