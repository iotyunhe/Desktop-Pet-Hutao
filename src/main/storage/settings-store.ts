import { join } from 'node:path';
import type { PetSettings } from '../../shared/pet';
import { DEFAULT_SETTINGS } from '../../shared/pet';
import { normalizeSettings } from '../../shared/normalize';
import { JsonStore } from './json-store';

export class SettingsStore extends JsonStore<PetSettings> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'settings.json'),
      defaults: () => ({ ...DEFAULT_SETTINGS }),
      normalize: normalizeSettings
    });
  }
}
