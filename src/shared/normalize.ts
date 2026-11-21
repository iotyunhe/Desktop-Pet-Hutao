import {
  AI_PERSONA_TEXT_LIMIT,
  DEFAULT_AI_SETTINGS,
  DEFAULT_TTS_VOICE,
  LEGACY_MINIMAX_API_HOSTS,
  MAX_AI_OBSERVE_INTERVAL_MINUTES,
  MIN_AI_OBSERVE_INTERVAL_MINUTES,
  type AiSettings,
  type TtsEngine
} from './ai';
import {
  DEFAULT_BILIBILI_INTERESTS,
  DEFAULT_BILIBILI_SETTINGS,
  MAX_BILIBILI_DAILY_SHARES,
  MAX_BILIBILI_INTEREST_LENGTH,
  MAX_BILIBILI_INTERESTS,
  MAX_BILIBILI_INTERVAL_MINUTES,
  MIN_BILIBILI_INTERVAL_MINUTES,
  parseClockToMinutes,
  type BilibiliSettings
} from './bilibili';
import {
  CARE_ITEM_IDS,
  CARE_REWARD_LEVELS,
  DEFAULT_CARE_INVENTORY,
  DEFAULT_CARE_PROFILE,
  MAX_AFFECTION,
  type CareItemId,
  type CareRewardId,
  type PetCareProfile
} from './care';
import {
  DEFAULT_QQ_SETTINGS,
  MAX_QQ_GROUPS,
  MAX_QQ_PORT,
  MIN_QQ_PORT,
  type QqSettings
} from './qq';
import {
  DEFAULT_SETTINGS,
  MAX_SCALE,
  MIN_SCALE,
  type PetSettings,
  type Point
} from './pet';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function finiteNumber(value: unknown, fallback: number): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Point;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

export function normalizeSettings(value: unknown): PetSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<PetSettings>) : {};
  const merged = { ...DEFAULT_SETTINGS, ...raw };

  return {
    alwaysOnTop: Boolean(merged.alwaysOnTop),
    launchAtLogin: Boolean(merged.launchAtLogin),
    roamEnabled: Boolean(merged.roamEnabled),
    scale: clamp(finiteNumber(merged.scale, DEFAULT_SETTINGS.scale), MIN_SCALE, MAX_SCALE),
    lastPosition: isPoint(merged.lastPosition)
      ? {
          x: Math.round(merged.lastPosition.x),
          y: Math.round(merged.lastPosition.y)
        }
      : null
  };
}

export function getCareLevel(affection: number): number {
  return Math.round(clamp(Math.floor(affection / 100) + 1, 1, 10));
}

export function getUnlockedRewards(level: number): CareRewardId[] {
  return CARE_REWARD_LEVELS.filter((reward) => level >= reward.level).map((reward) => reward.id);
}

export function normalizeInventory(value: unknown): Record<CareItemId, number> {
  const rawInventory = value && typeof value === 'object' ? (value as Partial<Record<CareItemId, unknown>>) : {};

  return CARE_ITEM_IDS.reduce<Record<CareItemId, number>>((inventory, itemId) => {
    const amount = rawInventory[itemId];
    inventory[itemId] = Number.isFinite(Number(amount))
      ? Math.max(0, Math.floor(Number(amount)))
      : DEFAULT_CARE_INVENTORY[itemId];
    return inventory;
  }, { ...DEFAULT_CARE_INVENTORY });
}

export function normalizeCareProfile(value: unknown): PetCareProfile {
  const raw = value && typeof value === 'object' ? (value as Partial<PetCareProfile>) : {};
  const affection = Math.round(clamp(finiteNumber(raw.affection, DEFAULT_CARE_PROFILE.affection), 0, MAX_AFFECTION));
  const level = getCareLevel(affection);

  return {
    affection,
    level,
    moodScore: Math.round(clamp(finiteNumber(raw.moodScore, DEFAULT_CARE_PROFILE.moodScore), 0, 100)),
    energy: Math.round(clamp(finiteNumber(raw.energy, DEFAULT_CARE_PROFILE.energy), 0, 100)),
    inventory: normalizeInventory(raw.inventory),
    lastInteractionAt: typeof raw.lastInteractionAt === 'string' ? raw.lastInteractionAt : null,
    lastDailyRefillDate: typeof raw.lastDailyRefillDate === 'string' ? raw.lastDailyRefillDate : null,
    unlockedRewards: getUnlockedRewards(level)
  };
}

export function normalizeApiBaseUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return DEFAULT_AI_SETTINGS.apiBaseUrl;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return DEFAULT_AI_SETTINGS.apiBaseUrl;
    }

    url.hash = '';
    url.search = '';
    let nextUrl = url.toString().replace(/\/+$/, '');
    if (!/\/v\d+$/i.test(nextUrl)) {
      nextUrl = `${nextUrl}/v1`;
    }

    // 老版本写死过 MiniMax 的端点，迁移时直接回落到新的默认接口。
    if (LEGACY_MINIMAX_API_HOSTS.includes(url.hostname)) {
      return DEFAULT_AI_SETTINGS.apiBaseUrl;
    }

    return nextUrl;
  } catch {
    return DEFAULT_AI_SETTINGS.apiBaseUrl;
  }
}

export function normalizePersona(value: unknown): string {
  const persona = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (persona || DEFAULT_AI_SETTINGS.persona).slice(0, AI_PERSONA_TEXT_LIMIT);
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<AiSettings>) : {};
  const merged = { ...DEFAULT_AI_SETTINGS, ...raw };
  const observeIntervalMinutes = Math.round(
    clamp(
      finiteNumber(merged.observeIntervalMinutes, DEFAULT_AI_SETTINGS.observeIntervalMinutes),
      MIN_AI_OBSERVE_INTERVAL_MINUTES,
      MAX_AI_OBSERVE_INTERVAL_MINUTES
    )
  );

  const apiBaseUrl = normalizeApiBaseUrl(merged.apiBaseUrl);
  // 从 MiniMax 版本升级上来时，接口地址会回落到默认网关，
  // 但旧的 MiniMax 模型名在新网关上并不存在，这里一并换掉。
  const rawModel = normalizeShortText(merged.textModel, DEFAULT_AI_SETTINGS.textModel, 80);
  // 从 MiniMax 版本升级上来时，接口地址会回落到默认网关，
  // 但旧的 MiniMax 模型名在新网关上并不存在，这里一并换掉。
  // 只看「模型名像 MiniMax 而接口不是 MiniMax」，这样重复启动也能自愈。
  const endpointIsMinimax = /minimax/i.test(apiBaseUrl);
  const legacyModelName = /^(minimax|abab)/i.test(rawModel);
  const textModel = !endpointIsMinimax && legacyModelName ? DEFAULT_AI_SETTINGS.textModel : rawModel;

  return {
    enabled: Boolean(merged.enabled),
    autoObserveEnabled: Boolean(merged.autoObserveEnabled),
    observeIntervalMinutes,
    voiceEnabled: Boolean(merged.voiceEnabled),
    apiBaseUrl,
    textModel,
    ttsEngine: normalizeTtsEngine(merged.ttsEngine),
    ttsVoice: normalizeShortText(merged.ttsVoice, DEFAULT_TTS_VOICE, 80),
    persona: normalizePersona(merged.persona)
  };
}

function normalizeTtsEngine(value: unknown): TtsEngine {
  return value === 'off' ? 'off' : 'system';
}

function normalizeShortText(value: unknown, fallback: string, limit: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, limit);
}

export function normalizeBilibiliInterests(value: unknown): string[] {
  const rawList = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\s]+/) : [];
  const seen = new Set<string>();
  const interests: string[] = [];

  for (const item of rawList) {
    if (typeof item !== 'string') {
      continue;
    }

    const keyword = item.replace(/\s+/g, '').trim().slice(0, MAX_BILIBILI_INTEREST_LENGTH);
    if (!keyword || seen.has(keyword)) {
      continue;
    }

    seen.add(keyword);
    interests.push(keyword);

    if (interests.length >= MAX_BILIBILI_INTERESTS) {
      break;
    }
  }

  return interests.length > 0 ? interests : [...DEFAULT_BILIBILI_INTERESTS];
}

export function normalizeBilibiliSettings(value: unknown): BilibiliSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<BilibiliSettings>) : {};
  const merged = { ...DEFAULT_BILIBILI_SETTINGS, ...raw };
  const quietHoursStart =
    parseClockToMinutes(String(merged.quietHoursStart)) === null
      ? DEFAULT_BILIBILI_SETTINGS.quietHoursStart
      : String(merged.quietHoursStart);
  const quietHoursEnd =
    parseClockToMinutes(String(merged.quietHoursEnd)) === null
      ? DEFAULT_BILIBILI_SETTINGS.quietHoursEnd
      : String(merged.quietHoursEnd);

  return {
    enabled: Boolean(merged.enabled),
    shareIntervalMinutes: Math.round(
      clamp(
        finiteNumber(merged.shareIntervalMinutes, DEFAULT_BILIBILI_SETTINGS.shareIntervalMinutes),
        MIN_BILIBILI_INTERVAL_MINUTES,
        MAX_BILIBILI_INTERVAL_MINUTES
      )
    ),
    quietHoursEnabled: Boolean(merged.quietHoursEnabled),
    quietHoursStart,
    quietHoursEnd,
    dailyShareLimit: Math.round(
      clamp(finiteNumber(merged.dailyShareLimit, DEFAULT_BILIBILI_SETTINGS.dailyShareLimit), 1, MAX_BILIBILI_DAILY_SHARES)
    ),
    interests: normalizeBilibiliInterests(merged.interests),
    allowLongVideos: Boolean(merged.allowLongVideos),
    aiCommentary: Boolean(merged.aiCommentary)
  };
}

function normalizePercent(value: unknown, fallback: number): number {
  return Math.round(clamp(finiteNumber(value, fallback), 0, 100));
}

export function normalizeQqGroups(value: unknown): number[] {
  const rawList = Array.isArray(value) ? value : [];
  const seen = new Set<number>();
  const groups: number[] = [];

  for (const item of rawList) {
    const groupId = Math.round(finiteNumber(item, 0));
    if (groupId <= 0 || seen.has(groupId)) {
      continue;
    }

    seen.add(groupId);
    groups.push(groupId);

    if (groups.length >= MAX_QQ_GROUPS) {
      break;
    }
  }

  return groups;
}

export function normalizeQqSettings(value: unknown): QqSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<QqSettings>) : {};
  const merged = { ...DEFAULT_QQ_SETTINGS, ...raw };
  const quietHoursStart =
    parseClockToMinutes(String(merged.quietHoursStart)) === null
      ? DEFAULT_QQ_SETTINGS.quietHoursStart
      : String(merged.quietHoursStart);
  const quietHoursEnd =
    parseClockToMinutes(String(merged.quietHoursEnd)) === null
      ? DEFAULT_QQ_SETTINGS.quietHoursEnd
      : String(merged.quietHoursEnd);
  const selfQq = typeof merged.selfQq === 'string' ? merged.selfQq.replace(/\D/g, '').slice(0, 12) : '';
  const accessToken = typeof merged.accessToken === 'string' ? merged.accessToken.trim().slice(0, 200) : '';
  const persona = typeof merged.persona === 'string' ? merged.persona.replace(/\s+/g, ' ').trim().slice(0, AI_PERSONA_TEXT_LIMIT) : '';

  return {
    enabled: Boolean(merged.enabled),
    wsPort: Math.round(clamp(finiteNumber(merged.wsPort, DEFAULT_QQ_SETTINGS.wsPort), MIN_QQ_PORT, MAX_QQ_PORT)),
    accessToken,
    selfQq,
    allowedGroups: normalizeQqGroups(merged.allowedGroups),
    replyToAt: Boolean(merged.replyToAt),
    nameReplyChance: normalizePercent(merged.nameReplyChance, DEFAULT_QQ_SETTINGS.nameReplyChance),
    interjectChance: normalizePercent(merged.interjectChance, DEFAULT_QQ_SETTINGS.interjectChance),
    interjectCooldownMinutes: Math.round(
      clamp(
        finiteNumber(merged.interjectCooldownMinutes, DEFAULT_QQ_SETTINGS.interjectCooldownMinutes),
        1,
        60
      )
    ),
    maxRepliesPer10Minutes: Math.round(
      clamp(finiteNumber(merged.maxRepliesPer10Minutes, DEFAULT_QQ_SETTINGS.maxRepliesPer10Minutes), 1, 20)
    ),
    quietHoursEnabled: Boolean(merged.quietHoursEnabled),
    quietHoursStart,
    quietHoursEnd,
    persona
  };
}
