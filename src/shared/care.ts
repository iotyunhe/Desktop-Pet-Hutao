export type CareActionType = 'pat' | 'feed' | 'gift' | 'rest';
export type CareItemId = 'tea' | 'plum_cake' | 'snack' | 'flower' | 'bookmark' | 'lantern';
export type CareRewardId = 'pat_lines' | 'feed_lines' | 'gift_lines' | 'proud_pose' | 'best_friend_lines';
export type CareReactionMood = 'happy' | 'curious' | 'sleepy' | 'pat' | 'eat' | 'gift' | 'proud';

export interface CareActionRequest {
  type: CareActionType;
  itemId?: CareItemId;
}

export interface PetCareProfile {
  affection: number;
  level: number;
  moodScore: number;
  energy: number;
  inventory: Record<CareItemId, number>;
  lastInteractionAt: string | null;
  lastDailyRefillDate: string | null;
  unlockedRewards: CareRewardId[];
}

export interface CareActionResult {
  ok: boolean;
  profile: PetCareProfile;
  line: string;
  mood: CareReactionMood;
  burst?: 'happy' | 'curious' | 'sleepy';
  itemId?: CareItemId;
  unlockedRewards: CareRewardId[];
}

export const CARE_ITEM_IDS: CareItemId[] = ['tea', 'plum_cake', 'snack', 'flower', 'bookmark', 'lantern'];

export const CARE_ITEM_LABELS: Record<CareItemId, string> = {
  tea: '茶',
  plum_cake: '梅花糕',
  snack: '点心',
  flower: '梅花',
  bookmark: '书签',
  lantern: '小灯'
};

export const FEED_ITEM_IDS: CareItemId[] = ['tea', 'plum_cake', 'snack'];
export const GIFT_ITEM_IDS: CareItemId[] = ['flower', 'bookmark', 'lantern'];

export const DEFAULT_CARE_INVENTORY: Record<CareItemId, number> = {
  tea: 1,
  plum_cake: 1,
  snack: 2,
  flower: 1,
  bookmark: 1,
  lantern: 0
};

export const DAILY_CARE_PACK: Record<CareItemId, number> = {
  tea: 1,
  plum_cake: 1,
  snack: 2,
  flower: 1,
  bookmark: 1,
  lantern: 0
};

export const DEFAULT_CARE_PROFILE: PetCareProfile = {
  affection: 0,
  level: 1,
  moodScore: 72,
  energy: 80,
  inventory: DEFAULT_CARE_INVENTORY,
  lastInteractionAt: null,
  lastDailyRefillDate: null,
  unlockedRewards: []
};

export const MAX_AFFECTION = 1000;

export const CARE_REWARD_LEVELS: Array<{ id: CareRewardId; level: number }> = [
  { id: 'pat_lines', level: 2 },
  { id: 'feed_lines', level: 4 },
  { id: 'gift_lines', level: 6 },
  { id: 'proud_pose', level: 8 },
  { id: 'best_friend_lines', level: 10 }
];
