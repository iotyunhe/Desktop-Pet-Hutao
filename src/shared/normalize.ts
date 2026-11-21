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
  DEFAULT_ACCESS_POLICY,
  MAX_ACCESS_OPS_PER_HOUR,
  MAX_LAUNCH_ENTRIES,
  MAX_READ_ROOTS,
  MAX_SHELL_TIMEOUT_MS,
  MAX_WORKBENCH_PORT,
  MIN_ACCESS_OPS_PER_HOUR,
  MIN_SHELL_TIMEOUT_MS,
  MIN_WORKBENCH_PORT,
  type AccessPolicy,
  type LaunchEntry
} from './access';
import {
  DEFAULT_QQ_SETTINGS,
  MAX_QQ_ADMINS,
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
    persona,
    adminQqs: normalizeQqAdmins(merged.adminQqs)
  };
}

export function normalizeQqAdmins(value: unknown): string[] {
  const rawList = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\s]+/) : [];
  const seen = new Set<string>();
  const admins: string[] = [];

  for (const item of rawList) {
    const uin = typeof item === 'string' ? item.replace(/\D/g, '') : '';
    if (uin.length < 5 || uin.length > 12 || seen.has(uin)) {
      continue;
    }

    seen.add(uin);
    admins.push(uin);

    if (admins.length >= MAX_QQ_ADMINS) {
      break;
    }
  }

  return admins;
}

/** 工作台/权限面板里能配置的「可读目录」：只接受绝对路径，拒绝系统目录和盘符根。 */
const BLOCKED_ACCESS_PREFIXES = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  'c:\\$recycle.bin',
  'c:\\system volume information',
  'c:\\perflogs',
  'c:\\recovery'
];

export function isBlockedAccessPath(value: string): boolean {
  const lower = value.toLowerCase().replace(/[\\/]+$/, '');
  if (/^[a-z]:$/.test(lower)) {
    return true;
  }

  if (BLOCKED_ACCESS_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}\\`))) {
    return true;
  }

  // 用户目录下的 AppData（浏览器存档、凭据都在里面）。
  return /^[a-z]:\\users\\[^\\]+\\appdata(\\|$)/.test(lower);
}

function normalizeAbsolutePath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const unified = value.trim().replace(/\//g, '\\').replace(/\\+/g, '\\');
  if (!unified) {
    return null;
  }

  const isDrivePath = /^[a-zA-Z]:\\/.test(unified);
  const isUncPath = /^\\\\[^\\]+\\[^\\]+/.test(unified);
  if (!isDrivePath && !isUncPath) {
    return null;
  }

  const trimmed = unified.replace(/\\+$/, '');
  // 盘符根（C:\）和盘符本身（C:）都不许当白名单目录。
  if (/^[a-zA-Z]:$/.test(trimmed) || trimmed.length < 4) {
    return null;
  }

  return isDrivePath ? trimmed : unified.replace(/\\+$/, '');
}

export function normalizeAccessRoot(value: unknown): string | null {
  const path = normalizeAbsolutePath(value);
  if (!path || isBlockedAccessPath(path)) {
    return null;
  }

  return path;
}

export function normalizeAccessRoots(value: unknown): string[] {
  const rawList = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const seen = new Set<string>();
  const roots: string[] = [];

  for (const item of rawList) {
    const root = normalizeAccessRoot(item);
    if (!root || seen.has(root.toLowerCase())) {
      continue;
    }

    seen.add(root.toLowerCase());
    roots.push(root);

    if (roots.length >= MAX_READ_ROOTS) {
      break;
    }
  }

  return roots;
}

function normalizeLaunchTarget(value: unknown, kind: LaunchEntry['kind']): string | null {
  if (kind === 'url') {
    if (typeof value !== 'string') {
      return null;
    }

    try {
      const url = new URL(value.trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  return normalizeAbsolutePath(value);
}

/** 手写配置里没写 kind 时，按 target 猜一个。 */
function inferLaunchKind(target: string): LaunchEntry['kind'] | null {
  if (!target) {
    return null;
  }

  if (/^https?:\/\//i.test(target)) {
    return 'url';
  }

  if (/\.(exe|lnk|bat|cmd)$/i.test(target)) {
    return 'app';
  }

  return /^[a-zA-Z]:\\|^\\\\/.test(target) ? 'file' : null;
}

export function normalizeLaunchEntries(value: unknown): LaunchEntry[] {
  const rawList = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const entries: LaunchEntry[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const raw = item as Partial<LaunchEntry>;
    const rawTarget = typeof raw.target === 'string' ? raw.target.trim() : '';
    const kind: LaunchEntry['kind'] | null =
      raw.kind === 'app' || raw.kind === 'file' || raw.kind === 'url'
        ? raw.kind
        : inferLaunchKind(rawTarget);
    if (!kind) {
      continue;
    }

    const target = normalizeLaunchTarget(raw.target, kind);
    if (!target || seen.has(target.toLowerCase())) {
      continue;
    }

    const label = typeof raw.label === 'string' ? raw.label.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (!label) {
      continue;
    }

    const id =
      typeof raw.id === 'string' && /^[a-z0-9-]{1,32}$/i.test(raw.id)
        ? raw.id.toLowerCase()
        : `item-${entries.length + 1}`;

    seen.add(target.toLowerCase());
    entries.push({ id, label, target, kind });

    if (entries.length >= MAX_LAUNCH_ENTRIES) {
      break;
    }
  }

  return entries;
}

export function normalizeAccessPolicy(value: unknown): AccessPolicy {
  const raw = value && typeof value === 'object' ? (value as Partial<AccessPolicy>) : {};
  const merged = { ...DEFAULT_ACCESS_POLICY, ...raw };
  const token = typeof merged.workbenchToken === 'string' ? merged.workbenchToken.trim().replace(/[^\w-]/g, '').slice(0, 64) : '';

  return {
    enabled: Boolean(merged.enabled),
    allowRead: Boolean(merged.allowRead),
    readRoots: normalizeAccessRoots(merged.readRoots),
    allowScreenshot: Boolean(merged.allowScreenshot),
    allowLaunch: Boolean(merged.allowLaunch),
    launchAllowlist: normalizeLaunchEntries(merged.launchAllowlist),
    allowShell: Boolean(merged.allowShell),
    shellTimeoutMs: Math.round(
      clamp(finiteNumber(merged.shellTimeoutMs, DEFAULT_ACCESS_POLICY.shellTimeoutMs), MIN_SHELL_TIMEOUT_MS, MAX_SHELL_TIMEOUT_MS)
    ),
    maxOpsPerHour: Math.round(
      clamp(finiteNumber(merged.maxOpsPerHour, DEFAULT_ACCESS_POLICY.maxOpsPerHour), MIN_ACCESS_OPS_PER_HOUR, MAX_ACCESS_OPS_PER_HOUR)
    ),
    workbenchPort: Math.round(
      clamp(finiteNumber(merged.workbenchPort, DEFAULT_ACCESS_POLICY.workbenchPort), MIN_WORKBENCH_PORT, MAX_WORKBENCH_PORT)
    ),
    workbenchToken: token
  };
}
