import { settingsText } from '../i18n/settingsMessages';
import {
  type ShadowQuality,
  type ShadowQualityPreference,
} from '../rendering/shadowQuality';
import { QualityControl } from './QualityControl';

export class ShadowQualityControl extends QualityControl<ShadowQuality> {
  constructor(preference: ShadowQualityPreference) {
    super(preference, {
      kind: 'shadows',
      get label() { return settingsText('shadowQuality'); },
      choices: [
        { value: 'low', get label() { return settingsText('low'); } },
        { value: 'high', get label() { return settingsText('high'); } },
      ],
    });
  }
}
