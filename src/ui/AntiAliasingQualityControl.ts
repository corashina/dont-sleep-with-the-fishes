import { settingsText } from '../i18n/settingsMessages';
import {
  type AntiAliasingQuality,
  type AntiAliasingQualityPreference,
} from '../rendering/antiAliasingQuality';
import { QualityControl } from './QualityControl';

export class AntiAliasingQualityControl
  extends QualityControl<AntiAliasingQuality> {
  constructor(preference: AntiAliasingQualityPreference) {
    super(preference, {
      kind: 'anti-aliasing',
      get label() { return settingsText('aa'); },
      choices: [
        { value: 'low', get label() { return settingsText('low'); } },
        { value: 'high', get label() { return settingsText('high'); } },
      ],
    });
  }
}
