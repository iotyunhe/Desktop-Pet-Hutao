import type { PetMood } from '../state';

export interface Reaction {
  mood: PetMood;
  line: string;
  duration?: number;
  burst?: 'happy' | 'curious' | 'sleepy';
}

export const CLICK_REACTIONS: Reaction[] = [
  { mood: 'happy', line: '嘿嘿，抓到你在摸鱼啦！', burst: 'happy' },
  { mood: 'happy', line: '堂主驾到，精神加满！', burst: 'happy' },
  { mood: 'curious', line: '嗯？你刚刚是不是戳了我一下？', burst: 'curious' },
  { mood: 'curious', line: '有什么新鲜事，快讲给我听听。', burst: 'curious' },
  { mood: 'happy', line: '啦啦啦，工作也要有点乐趣嘛。', burst: 'happy' },
  { mood: 'curious', line: '本堂主正在观察桌面风水。', burst: 'curious' },
  { mood: 'desk-tea', line: '要不要一起喝杯茶？', duration: 2400, burst: 'happy' },
  { mood: 'desk-write', line: '等我把这笔账记完。', duration: 2400, burst: 'curious' }
];

export const WAKE_LINES: string[] = [
  '唔？我醒着呢，只是在闭目养神。',
  '哎呀，被你叫醒啦。',
  '好好好，本堂主继续营业。',
  '醒啦醒啦，别偷笑。'
];

export const SLEEP_LINES: string[] = ['呼...桌面暂时交给你啦。', 'Zzz...先小睡一会儿。', '安静一下，本堂主要养精蓄锐。'];

export const IDLE_REACTIONS: Reaction[] = [
  { mood: 'curious', line: '忙归忙，也要记得喝水。', burst: 'curious' },
  { mood: 'happy', line: '今天也要精神满满哦！', burst: 'happy' },
  { mood: 'curious', line: '桌面很整洁，本堂主很满意。', burst: 'curious' },
  { mood: 'desk-read', line: '我先看会儿书，等你忙完。', duration: 3200, burst: 'curious' },
  { mood: 'desk-write', line: '灵感来了，记一笔。', duration: 3200, burst: 'curious' },
  { mood: 'desk-tea', line: '小憩一下，茶点时间。', duration: 3200, burst: 'happy' }
];

export const BEST_FRIEND_REACTIONS: Reaction[] = [
  { mood: 'proud', line: '搭档在这儿，本堂主就放心啦。', duration: 2600, burst: 'happy' },
  { mood: 'happy', line: '今天也一起把桌面打理得漂漂亮亮吧。', duration: 2400, burst: 'happy' },
  { mood: 'desk-tea', line: '给你留了茶，忙完记得歇一歇。', duration: 3200, burst: 'happy' }
];

export const BROWSING_LINES: string[] = [
  '本堂主去 B 站逛一圈，等我回来～',
  '桌面待久了，去 B 站挖点乐子。',
  '稍等，本堂主正在 B 站小巷里淘宝。'
];

export const UMBRELLA_LINES: string[] = [
  '日头正好，撑伞巡街咯。',
  '这伞可是往生堂的门面。',
  '路滑？本堂主替你撑着。'
];

export const LANTERN_LINES: string[] = [
  '灯放上去，愿望就飘到该去的地方啦。',
  '别急，堂主替你看着呢。',
  '一盏小灯，换你今晚好梦。'
];

export const TALISMAN_LINES: string[] = [
  '这张符保你今晚不加班。',
  '符纸一笔，晦气退散！',
  '贴哪儿？当然贴你心口……开玩笑的。'
];

export const NAP_LINES: string[] = ['抱着膝盖眯一会儿……', 'Zzz……账本先合上。', '就睡一小下，别告诉别人。'];

export const FLUSTERED_LINES: string[] = ['发型！本堂主的发型！', '再摸就……就记账了啊！', '帽子要掉了啦！'];

export const OFFER_TEA_LINES: string[] = ['歇会儿，茶要凉了。', '本堂主亲自端的，敢不喝？', '喝完这杯，再忙也不迟。'];

export const BOO_LINES: string[] = ['哇——！', '往生堂业务，了解一下？', '背后……有人哦。'];

export const BOO_GRIN_LINES: string[] = ['噗，被本堂主吓到了吧？', '胆子这么小，还敢戳我。', '哈哈，表情包已存。'];

export const TWIRL_LINES: string[] = ['升级啦！转个圈庆祝一下！', '搭档，本堂主今天心情很好！', '转一圈，晦气全甩掉～'];

export const ABACUS_LINES: string[] = [
  '一笔一笔，往生堂的账可不能乱。',
  '今日收支，堂主亲自过目。',
  '算盘一响，黄金万两。'
];
