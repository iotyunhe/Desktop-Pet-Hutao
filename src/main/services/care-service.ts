import {
  DAILY_CARE_PACK,
  FEED_ITEM_IDS,
  GIFT_ITEM_IDS,
  normalizeCareProfile,
  type CareActionRequest,
  type CareActionResult,
  type CareItemId,
  type CareReactionMood,
  type CareRewardId,
  type PetCareProfile
} from '../../shared';
import type { JsonStore } from '../storage/json-store';
import { formatDateKey } from '../util/time';

interface CareEffect {
  affection: number;
  moodScore: number;
  energy: number;
  line: string;
}

const FEED_EFFECTS: Record<'tea' | 'plum_cake' | 'snack', CareEffect> = {
  tea: { affection: 6, moodScore: 6, energy: 12, line: '茶香不错，桌面巡逻更有精神了。' },
  plum_cake: { affection: 8, moodScore: 9, energy: 16, line: '梅花糕？哼哼，你很懂嘛。' },
  snack: { affection: 5, moodScore: 7, energy: 10, line: '小零食补给到位，继续营业！' }
};

const GIFT_EFFECTS: Record<'flower' | 'bookmark' | 'lantern', CareEffect> = {
  flower: { affection: 18, moodScore: 8, energy: 0, line: '这朵花很衬本堂主的气质嘛。' },
  bookmark: { affection: 22, moodScore: 6, energy: 0, line: '书签我会好好收着，别小看这份心意。' },
  lantern: { affection: 35, moodScore: 12, energy: 4, line: '小灯一亮，桌面都热闹起来了。' }
};

type FeedItemId = keyof typeof FEED_EFFECTS;
type GiftItemId = keyof typeof GIFT_EFFECTS;

function isFeedItemId(value: CareItemId | undefined): value is FeedItemId {
  return Boolean(value && (FEED_ITEM_IDS as string[]).includes(value));
}

function isGiftItemId(value: CareItemId | undefined): value is GiftItemId {
  return Boolean(value && (GIFT_ITEM_IDS as string[]).includes(value));
}

/**
 * 温柔养成：只加亲密度、不掉惩罚，所有数值都通过 normalizeCareProfile 收口。
 */
export class CareService {
  constructor(private readonly store: JsonStore<PetCareProfile>) {}

  getProfile(): PetCareProfile {
    return this.store.get();
  }

  perform(action: CareActionRequest): CareActionResult {
    switch (action?.type) {
      case 'pat':
        return this.pat();
      case 'feed':
        return this.feed(action.itemId);
      case 'gift':
        return this.gift(action.itemId);
      case 'rest':
        return this.rest();
      default:
        return this.buildResult(false, '这个互动本堂主还没学会呢。', 'curious');
    }
  }

  claimDailyPack(): CareActionResult {
    const todayKey = formatDateKey(new Date());
    if (this.store.get().lastDailyRefillDate === todayKey) {
      return this.buildResult(false, '今日补给已经领过啦，明天再来看看。', 'curious');
    }

    this.store.update({
      inventory: this.addPack(DAILY_CARE_PACK),
      lastDailyRefillDate: todayKey,
      lastInteractionAt: new Date().toISOString()
    });

    return this.buildResult(true, '今日补给到手，茶点和小礼物都备好了。', 'happy');
  }

  private pat(): CareActionResult {
    const unlockedRewards = this.addCareStats(8, 6, -2);
    const level = this.store.get().level;
    const line = level >= 2 ? '嘿嘿，手法不错嘛，再摸一下也不是不行。' : '欸？摸头服务记账一次。';
    return this.buildResult(true, line, level >= 8 ? 'proud' : 'pat', unlockedRewards);
  }

  private rest(): CareActionResult {
    const unlockedRewards = this.addCareStats(3, 4, 18);
    return this.buildResult(true, '本堂主先小憩一会儿，醒来继续陪你。', 'sleepy', unlockedRewards, undefined, 'sleepy');
  }

  private feed(itemId: CareItemId | undefined): CareActionResult {
    const selectedItem: FeedItemId = isFeedItemId(itemId) ? itemId : 'snack';
    if (!this.consumeItem(selectedItem)) {
      return this.buildResult(false, '这份点心暂时没有啦，领个今日补给再来吧。', 'curious', [], selectedItem);
    }

    const effect = FEED_EFFECTS[selectedItem];
    const unlockedRewards = this.addCareStats(effect.affection, effect.moodScore, effect.energy);
    const line = this.store.get().level >= 4 ? `${effect.line} 这份心意我收下啦。` : effect.line;
    return this.buildResult(true, line, 'eat', unlockedRewards, selectedItem);
  }

  private gift(itemId: CareItemId | undefined): CareActionResult {
    const selectedItem: GiftItemId = isGiftItemId(itemId) ? itemId : 'flower';
    if (!this.consumeItem(selectedItem)) {
      return this.buildResult(false, '礼物匣里空空如也，明天再看看有什么新东西吧。', 'curious', [], selectedItem);
    }

    const effect = GIFT_EFFECTS[selectedItem];
    const unlockedRewards = this.addCareStats(effect.affection, effect.moodScore, effect.energy);
    const level = this.store.get().level;
    const line = level >= 6 ? `${effect.line} 你的眼光越来越像本堂主的搭档了。` : effect.line;
    return this.buildResult(true, line, level >= 8 ? 'proud' : 'gift', unlockedRewards, selectedItem);
  }

  private addCareStats(affection: number, moodScore: number, energy: number): CareRewardId[] {
    const current = this.store.get();
    const previousRewards = new Set(current.unlockedRewards);
    const next = normalizeCareProfile({
      ...current,
      affection: current.affection + affection,
      moodScore: current.moodScore + moodScore,
      energy: current.energy + energy,
      lastInteractionAt: new Date().toISOString()
    });

    this.store.replace(next);
    return next.unlockedRewards.filter((rewardId) => !previousRewards.has(rewardId));
  }

  private consumeItem(itemId: CareItemId): boolean {
    const current = this.store.get();
    if (current.inventory[itemId] <= 0) {
      return false;
    }

    this.store.update({
      inventory: {
        ...current.inventory,
        [itemId]: current.inventory[itemId] - 1
      }
    });
    return true;
  }

  private addPack(pack: Record<CareItemId, number>): Record<CareItemId, number> {
    const inventory = { ...this.store.get().inventory };
    for (const itemId of Object.keys(pack) as CareItemId[]) {
      inventory[itemId] = Math.max(0, inventory[itemId] + (pack[itemId] ?? 0));
    }

    return inventory;
  }

  private buildResult(
    ok: boolean,
    line: string,
    mood: CareReactionMood,
    unlockedRewards: CareRewardId[] = [],
    itemId?: CareItemId,
    burst: CareActionResult['burst'] = ok ? 'happy' : 'curious'
  ): CareActionResult {
    return {
      ok,
      profile: this.store.get(),
      line,
      mood,
      burst,
      itemId,
      unlockedRewards
    };
  }
}
