import {
  BILIBILI_INITIAL_DELAY_MS,
  isWithinQuietHours,
  type BilibiliBrowsingEvent,
  type BilibiliBrowseRequest,
  type BilibiliBrowseResult,
  type BilibiliCoverResult,
  type BilibiliFeedbackRequest,
  type BilibiliSettings,
  type BilibiliSettingsPatch,
  type BilibiliShare,
  type BilibiliStatus,
  type BilibiliVideo
} from '../../../shared/bilibili';
import { DEFAULT_BILIBILI_HISTORY, type BilibiliHistory } from '../../storage/bilibili-history';
import type { BilibiliHistoryStore, BilibiliSettingsStore } from '../../storage/bilibili-store';
import type { Logger } from '../../util/logger';
import { scheduleTimer, type TimerHandle } from '../../util/misc';
import { atClockOnDate, formatDateKey, getMinutesOfDay, startOfNextDay, withTimeout } from '../../util/time';
import type { BilibiliClient } from './bilibili-client';
import { ContentCurator, type CuratorContext } from './content-curator';
import { composeBrowseFailureLine, composeShare } from './share-composer';
import { isBilibiliBvId } from './video';

export type BilibiliCommentaryWriter = (video: BilibiliVideo, reason: string) => Promise<string | null>;

export interface BilibiliServiceOptions {
  settings: BilibiliSettingsStore;
  history: BilibiliHistoryStore;
  client: BilibiliClient;
  curator: ContentCurator;
  logger: Logger;
  /** 可选的 AI 文案增强，失败时自动退回模板文案。 */
  commentary?: BilibiliCommentaryWriter;
  onBrowsing?: (event: BilibiliBrowsingEvent) => void;
  onShare?: (share: BilibiliShare) => void;
  openExternal?: (url: string) => Promise<void>;
  copyText?: (text: string) => void;
  /** 可注入的定时器，测试里用来手动推进自动逛站。 */
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  now?: () => Date;
  random?: () => number;
}

const AUTO_RETRY_MIN_MS = 10 * 60_000;
const AUTO_RETRY_MAX_MS = 25 * 60_000;
const COMMENTARY_TIMEOUT_MS = 7_000;
const COVER_CACHE_MS = 30 * 60_000;
const QUIET_WAKE_MARGIN_MS = 3 * 60_000;

/**
 * B 站漫游：定时抓热门 / 排行 / 分区新稿，筛选后生成分享，
 * 并把「看过什么 / 喜欢什么 / 不喜欢什么」持久化，避免重复骚扰。
 */
export class BilibiliService {
  private timer: TimerHandle | null = null;
  private nextRunAt: number | null = null;
  private browsingPromise: Promise<BilibiliBrowseResult> | null = null;
  private lastError: string | null = null;
  private readonly coverCache = new Map<string, { dataUrl: string; expiresAt: number }>();
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle;

  constructor(private readonly options: BilibiliServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? scheduleTimer;
  }

  start(): void {
    if (!this.options.settings.get().enabled) {
      this.stop();
      return;
    }

    const { min, max } = BILIBILI_INITIAL_DELAY_MS;
    this.scheduleNext(min + this.random() * (max - min));
  }

  stop(): void {
    this.timer?.cancel();
    this.timer = null;
    this.nextRunAt = null;
  }

  dispose(): void {
    this.stop();
    this.coverCache.clear();
  }

  getStatus(): BilibiliStatus {
    const settings = this.options.settings.get();
    const history = this.options.history.get();
    const today = formatDateKey(this.now());
    const dislikedBvids = new Set(history.dislikedBvids);

    return {
      settings,
      browsing: this.browsingPromise !== null,
      lastShareAt: history.lastShareAt,
      nextRunAt: this.nextRunAt ? new Date(this.nextRunAt).toISOString() : null,
      lastError: this.lastError,
      todayShared: history.dailyCountDate === today ? history.dailyCount : 0,
      totalShared: history.totalShared,
      seenCount: history.seenBvids.length,
      recentShares: history.shares.filter((share) => !dislikedBvids.has(share.id))
    };
  }

  updateSettings(patch: BilibiliSettingsPatch): BilibiliStatus {
    const next = this.options.settings.update(patch);

    if (next.enabled) {
      this.start();
    } else {
      this.stop();
    }

    return this.getStatus();
  }

  browse(request: BilibiliBrowseRequest = { source: 'manual' }): Promise<BilibiliBrowseResult> {
    if (this.browsingPromise) {
      return this.browsingPromise;
    }

    this.browsingPromise = this.runBrowse(request).finally(() => {
      this.browsingPromise = null;
    });

    return this.browsingPromise;
  }

  feedback(request: BilibiliFeedbackRequest): BilibiliStatus {
    const history = this.options.history.get();
    const share = history.shares.find((item) => item.id === request.bvid);
    const upName = share?.video.upName;
    const next: BilibiliHistory = {
      ...history,
      likedUpNames: [...history.likedUpNames],
      dislikedUpNames: [...history.dislikedUpNames],
      dislikedBvids: [...history.dislikedBvids]
    };

    if (request.action === 'like') {
      if (upName && !next.likedUpNames.includes(upName)) {
        next.likedUpNames.unshift(upName);
      }
      next.dislikedUpNames = next.dislikedUpNames.filter((name) => name !== upName);
      next.dislikedBvids = next.dislikedBvids.filter((bvid) => bvid !== request.bvid);
    } else {
      if (isBilibiliBvId(request.bvid) && !next.dislikedBvids.includes(request.bvid)) {
        next.dislikedBvids.unshift(request.bvid);
      }
      if (upName) {
        next.dislikedUpNames = [upName, ...next.dislikedUpNames.filter((name) => name !== upName)];
        next.likedUpNames = next.likedUpNames.filter((name) => name !== upName);
      }
    }

    this.options.history.replace(next);
    return this.getStatus();
  }

  async getCover(bvid: string): Promise<BilibiliCoverResult> {
    if (!isBilibiliBvId(bvid)) {
      return { ok: false, bvid, error: '稿件编号无效。' };
    }

    const cached = this.coverCache.get(bvid);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, bvid, dataUrl: cached.dataUrl };
    }

    const history = this.options.history.get();
    const knownVideo = history.shares.find((share) => share.id === bvid)?.video;
    const video = knownVideo ?? (await this.fetchVideoSafely(bvid));

    if (!video?.coverUrl) {
      return { ok: false, bvid, error: '没有找到这张封面。' };
    }

    const dataUrl = await this.options.client.fetchCoverDataUrl(video.coverUrl);
    if (!dataUrl) {
      return { ok: false, bvid, error: '封面加载失败。' };
    }

    this.coverCache.set(bvid, {
      dataUrl,
      expiresAt: Date.now() + COVER_CACHE_MS
    });

    return { ok: true, bvid, dataUrl };
  }

  async openVideo(bvid: string): Promise<boolean> {
    if (!isBilibiliBvId(bvid) || !this.options.openExternal) {
      return false;
    }

    try {
      await this.options.openExternal(`https://www.bilibili.com/video/${bvid}`);
      return true;
    } catch {
      return false;
    }
  }

  async openHome(): Promise<boolean> {
    if (!this.options.openExternal) {
      return false;
    }

    try {
      await this.options.openExternal('https://www.bilibili.com/');
      return true;
    } catch {
      return false;
    }
  }

  copyLink(bvid: string): boolean {
    if (!isBilibiliBvId(bvid) || !this.options.copyText) {
      return false;
    }

    this.options.copyText(`https://www.bilibili.com/video/${bvid}`);
    return true;
  }

  clearHistory(): BilibiliStatus {
    this.options.history.replace({ ...DEFAULT_BILIBILI_HISTORY });
    this.coverCache.clear();
    return this.getStatus();
  }

  private async runBrowse(request: BilibiliBrowseRequest): Promise<BilibiliBrowseResult> {
    const settings = this.options.settings.get();

    this.options.onBrowsing?.({ source: request.source });

    let candidates: BilibiliVideo[];
    try {
      candidates = await this.options.client.collectCandidates();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'B 站接口请求失败。';
      this.lastError = message;
      this.options.logger.warn('B 站候选抓取失败', message);
      return { ok: false, message: composeBrowseFailureLine('offline'), error: message };
    }

    if (candidates.length === 0) {
      this.lastError = 'B 站返回的候选为空。';
      return { ok: false, message: composeBrowseFailureLine('offline'), error: this.lastError };
    }

    const pick = this.options.curator.pick(candidates, this.buildCuratorContext(settings, request.excludeBvid));
    if (!pick) {
      this.lastError = null;
      return { ok: false, message: composeBrowseFailureLine('no-match') };
    }

    const composed = composeShare(pick.video, {
      matchedInterests: pick.matchedInterests,
      reason: pick.reason,
      random: this.random
    });

    let message = composed.message;
    if (settings.aiCommentary && this.options.commentary) {
      const commentary = await withTimeout(
        this.options.commentary(pick.video, pick.reason),
        COMMENTARY_TIMEOUT_MS,
        null
      );

      if (commentary) {
        message = commentary;
      }
    }

    const share: BilibiliShare = {
      id: pick.video.bvid,
      video: pick.video,
      message,
      reason: pick.reason,
      mood: composed.mood,
      source: request.source,
      sharedAt: this.now().toISOString()
    };

    this.recordShare(share);
    this.lastError = null;
    this.options.onShare?.(share);
    this.options.logger.info('分享了一条 B 站视频', {
      bvid: share.video.bvid,
      title: share.video.title,
      source: share.source
    });

    return { ok: true, message, share };
  }

  private recordShare(share: BilibiliShare): void {
    const history = this.options.history.get();
    const today = formatDateKey(this.now());
    const isAuto = share.source === 'auto';

    this.options.history.replace({
      ...history,
      seenBvids: [share.id, ...history.seenBvids.filter((bvid) => bvid !== share.id)].slice(0, 400),
      shares: [share, ...history.shares.filter((item) => item.id !== share.id)].slice(0, 30),
      lastShareAt: share.sharedAt,
      lastRunAt: share.sharedAt,
      dailyCountDate: isAuto ? today : history.dailyCountDate,
      dailyCount: isAuto ? (history.dailyCountDate === today ? history.dailyCount + 1 : 1) : history.dailyCount,
      totalShared: history.totalShared + 1
    });
  }

  private buildCuratorContext(settings: BilibiliSettings, excludeBvid?: string): CuratorContext {
    const history = this.options.history.get();
    const seenBvids = new Set(history.seenBvids);
    if (excludeBvid) {
      seenBvids.add(excludeBvid);
    }

    return {
      interests: settings.interests,
      allowLongVideos: settings.allowLongVideos,
      seenBvids,
      dislikedBvids: new Set(history.dislikedBvids),
      dislikedUpNames: history.dislikedUpNames,
      likedUpNames: history.likedUpNames,
      recentUpNames: history.shares.slice(0, 5).map((item) => item.video.upName),
      recentCategories: history.shares.slice(0, 1).map((item) => item.video.category)
    };
  }

  private scheduleNext(delayMs: number): void {
    this.timer?.cancel();
    this.timer = null;

    if (!this.options.settings.get().enabled) {
      this.nextRunAt = null;
      return;
    }

    this.nextRunAt = this.now().getTime() + Math.max(0, Math.round(delayMs));
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.runAuto();
    }, delayMs);
  }

  private async runAuto(): Promise<void> {
    try {
      await this.runAutoOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : '自动逛站失败。';
      this.lastError = message;
      this.options.logger.warn('自动逛站失败', message);
      this.scheduleNext(this.getRetryDelay());
    }
  }

  private async runAutoOnce(): Promise<void> {
    const settings = this.options.settings.get();
    if (!settings.enabled) {
      this.nextRunAt = null;
      return;
    }

    const now = this.now();

    if (this.isQuietTime(settings, now)) {
      this.scheduleNext(this.getDelayUntilQuietEnd(settings, now));
      return;
    }

    if (this.getTodayAutoShares(now) >= settings.dailyShareLimit) {
      this.scheduleNext(this.getDelayUntilNextDay(now));
      return;
    }

    const result = await this.browse({ source: 'auto' });

    if (result.ok) {
      this.scheduleNext(this.getIntervalDelay(settings));
    } else {
      this.scheduleNext(this.getRetryDelay());
    }
  }

  private getIntervalDelay(settings: BilibiliSettings): number {
    const base = settings.shareIntervalMinutes * 60_000;
    return Math.round(base * (0.75 + this.random() * 0.5));
  }

  private getRetryDelay(): number {
    return Math.round(AUTO_RETRY_MIN_MS + this.random() * (AUTO_RETRY_MAX_MS - AUTO_RETRY_MIN_MS));
  }

  private isQuietTime(settings: BilibiliSettings, date: Date): boolean {
    if (!settings.quietHoursEnabled) {
      return false;
    }

    return isWithinQuietHours(getMinutesOfDay(date), settings.quietHoursStart, settings.quietHoursEnd);
  }

  private getDelayUntilQuietEnd(settings: BilibiliSettings, date: Date): number {
    const end = atClockOnDate(date, settings.quietHoursEnd);
    if (!end) {
      return 60 * 60_000;
    }

    let wakeAt = end.getTime();
    if (wakeAt <= date.getTime()) {
      wakeAt += 24 * 60 * 60_000;
    }

    return Math.max(60_000, wakeAt - date.getTime() + QUIET_WAKE_MARGIN_MS + this.random() * 60_000);
  }

  private getDelayUntilNextDay(date: Date): number {
    return Math.max(60_000, startOfNextDay(date).getTime() - date.getTime());
  }

  private getTodayAutoShares(date: Date): number {
    const history = this.options.history.get();
    return history.dailyCountDate === formatDateKey(date) ? history.dailyCount : 0;
  }

  private async fetchVideoSafely(bvid: string): Promise<BilibiliVideo | null> {
    try {
      return await this.options.client.fetchVideo(bvid);
    } catch {
      return null;
    }
  }
}
