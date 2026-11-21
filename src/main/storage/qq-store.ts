import { join } from 'node:path';
import {
  DEFAULT_QQ_SETTINGS,
  type QqSettings
} from '../../shared/qq';
import { normalizeQqSettings } from '../../shared/normalize';
import { JsonStore } from './json-store';

export class QqSettingsStore extends JsonStore<QqSettings> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'qq-settings.json'),
      defaults: () => ({ ...DEFAULT_QQ_SETTINGS }),
      normalize: (value) => normalizeQqSettings(value)
    });
  }
}
