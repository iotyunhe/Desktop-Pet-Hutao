import activeWindow from 'active-win';
import { OBSERVATION_TEXT_LIMIT, type DesktopObservation } from '../../../shared/ai';

function cleanObservationText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, OBSERVATION_TEXT_LIMIT);
}

function getObservationKey(observation: DesktopObservation): string {
  return `${observation.appName}\n${observation.title}`.toLowerCase();
}

/**
 * 低频率读取当前活动窗口的应用名与标题，不做截图、不做 OCR。
 */
export class DesktopObserver {
  private lastObservedAt: string | null = null;
  private lastObservedTitle: string | null = null;
  private lastObservedKey: string | null = null;
  private lastReplyAt = 0;
  private lastError: string | null = null;

  getLastObservedAt(): string | null {
    return this.lastObservedAt;
  }

  getLastObservedTitle(): string | null {
    return this.lastObservedTitle;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  clearError(): void {
    this.lastError = null;
  }

  async read(): Promise<DesktopObservation | null> {
    try {
      const result = await activeWindow({
        accessibilityPermission: false,
        screenRecordingPermission: false
      });

      if (!result) {
        this.lastError = '没有读到当前活动窗口。';
        return null;
      }

      const observation: DesktopObservation = {
        appName: cleanObservationText(result.owner?.name, '未知应用'),
        title: cleanObservationText(result.title, '无标题窗口'),
        observedAt: new Date().toISOString()
      };

      this.lastObservedAt = observation.observedAt;
      this.lastObservedTitle = `${observation.appName} - ${observation.title}`;
      this.lastError = null;
      return observation;
    } catch {
      this.lastError = '读取活动窗口失败。';
      return null;
    }
  }

  isRecentDuplicate(observation: DesktopObservation, intervalMinutes: number): boolean {
    const key = getObservationKey(observation);
    return key === this.lastObservedKey && Date.now() - this.lastReplyAt < intervalMinutes * 60_000;
  }

  markReplied(observation: DesktopObservation): void {
    this.lastObservedKey = getObservationKey(observation);
    this.lastReplyAt = Date.now();
  }

  setError(message: string | null): void {
    this.lastError = message;
  }
}
