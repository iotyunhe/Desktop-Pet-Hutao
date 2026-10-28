import { join } from 'node:path';
import type { PetCareProfile } from '../../shared/care';
import { DEFAULT_CARE_PROFILE } from '../../shared/care';
import { normalizeCareProfile } from '../../shared/normalize';
import { JsonStore } from './json-store';

export class CareProfileStore extends JsonStore<PetCareProfile> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'profile.json'),
      defaults: () => normalizeCareProfile(DEFAULT_CARE_PROFILE),
      normalize: normalizeCareProfile
    });
  }
}
