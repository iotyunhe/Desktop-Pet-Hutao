import { join } from 'node:path';
import type { BilibiliSettings } from '../../shared/bilibili';
import { DEFAULT_BILIBILI_SETTINGS } from '../../shared/bilibili';
import { normalizeBilibiliSettings } from '../../shared/normalize';
import { JsonStore } from './json-store';
import { DEFAULT_BILIBILI_HISTORY, normalizeBilibiliHistory, type BilibiliHistory } from './bilibili-history';

export class BilibiliSettingsStore extends JsonStore<BilibiliSettings> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'bilibili-settings.json'),
      defaults: () => ({ ...DEFAULT_BILIBILI_SETTINGS, interests: [...DEFAULT_BILIBILI_SETTINGS.interests] }),
      normalize: normalizeBilibiliSettings
    });
  }
}

export class BilibiliHistoryStore extends JsonStore<BilibiliHistory> {
  constructor(userDataDir: string) {
    super({
      filePath: () => join(userDataDir, 'bilibili-history.json'),
      defaults: () => ({ ...DEFAULT_BILIBILI_HISTORY }),
      normalize: normalizeBilibiliHistory
    });
  }
}
