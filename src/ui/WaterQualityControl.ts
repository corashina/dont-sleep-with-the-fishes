import { settingsText } from '../i18n/settingsMessages';
import {
  type WaterQuality,
  type WaterQualityPreference,
} from '../rendering/waterQuality';
import { QualityControl } from './QualityControl';

export class WaterQualityControl extends QualityControl<WaterQuality> {
  constructor(preference: WaterQualityPreference) {
    super(preference, {
      kind: 'water',
      get label() { return settingsText('waterQuality'); },
      choices: [
        { value: 'low', get label() { return settingsText('low'); } },
        { value: 'high', get label() { return settingsText('high'); } },
        { value: 'ultra', get label() { return settingsText('ultra'); } },
      ],
    });
  }
}
