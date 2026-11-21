import { join } from 'node:path';
import { DEFAULT_ACCESS_POLICY, type AccessPolicy } from '../../shared/access';
import { normalizeAccessPolicy } from '../../shared/normalize';
import { JsonStore } from './json-store';

export class AccessSettingsStore extends JsonStore<AccessPolicy> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'access-settings.json'),
      defaults: () => ({ ...DEFAULT_ACCESS_POLICY, readRoots: [], launchAllowlist: [] }),
      normalize: (value) => normalizeAccessPolicy(value)
    });
  }
}
